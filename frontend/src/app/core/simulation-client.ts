import { inject, Injectable } from '@angular/core';
import { ConversationService } from './conversation.service';
import { ExchangeRequest, ExchangeResult, FlowSink, Protocol } from './models';
import { ProtocolClient } from './protocol-client';
import { EXCHANGES, protocolInfo } from './protocols';

const POLL_INTERVAL_MS = 1000;
const MAX_POLLS = 10;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

const between = (min: number, max: number) => min + Math.random() * (max - min);
const quote = (text: string) => `"${text}"`;

/**
 * In-browser simulation of Function A <-> Function B. Nothing here talks to Azure
 * or Azurite: it reproduces each protocol's message pattern with realistic timing,
 * using the same conversation data that is seeded into the Azurite tables.
 */
@Injectable({ providedIn: 'root' })
export class SimulationProtocolClient implements ProtocolClient {
  readonly mode = 'simulation' as const;
  private conversations = inject(ConversationService);
  private open = new Set<Protocol>();

  disconnect(protocol: Protocol): void {
    this.open.delete(protocol);
  }

  async exchange(input: ExchangeRequest, sink: FlowSink, signal: AbortSignal): Promise<ExchangeResult> {
    const info = protocolInfo(input.protocol);
    // Same rule as Function A: no ProcessId -> pick rand(0, 15)
    const processId = input.processId ?? Math.floor(Math.random() * 16);
    const conversation = await this.conversations.get(info.table, processId);
    const req = { ...input, processId, message: input.message || conversation[(input.exchangeNo - 1) * 2] };
    const aIndex = (req.exchangeNo - 1) * 2;
    const bIndex = aIndex + 1;
    const reply = conversation[bIndex];
    const closed = req.exchangeNo === EXCHANGES;

    const requestPayload = {
      processId: req.processId,
      exchangeNo: req.exchangeNo,
      messageIndex: aIndex,
      message: req.message,
      type: 'message',
    };
    const replyPayload = {
      processId: req.processId,
      exchangeNo: req.exchangeNo,
      messageIndex: bIndex,
      message: reply,
      type: closed ? 'close' : 'reply',
      table: info.table,
    };

    const wait = (ms: number) => sleep(ms, signal);
    if (input.processId === null) sink.log('A', `Picked ProcessId ${processId} with rand(0,15)`);
    sink.picked(processId, req.message);
    const ctx: Ctx = { req, sink, wait, reply, closed, requestPayload };

    switch (req.protocol) {
      case 'short-polling':
        await this.shortPolling(ctx);
        break;
      case 'long-polling':
        await this.longPolling(ctx);
        break;
      case 'sse':
        await this.sse(ctx);
        break;
      case 'websocket':
        await this.websocket(ctx);
        break;
    }
    return { processId, reply, replyPayload, closed };
  }

  /** Short/long polling and SSE: A delivers its message with a plain HTTP POST. */
  private async postMessage({ req, sink, wait, requestPayload }: Ctx, ackDetail: string) {
    sink.step({ from: 'A', kind: 'request', title: 'A → B (POST /api/messages)', detail: quote(req.message) });
    sink.request(requestPayload);
    sink.count('httpRequests');
    sink.log('A', req.message, true);
    await wait(350);
    sink.step({ from: 'B', kind: 'control', title: 'B → A (202 Accepted)', detail: ackDetail });
    sink.log('B', '202 Accepted: message stored, reply pending');
  }

  private async shortPolling(ctx: Ctx) {
    const { sink, wait, reply } = ctx;
    sink.state('waiting');
    await this.postMessage(ctx, '"Stored. Ask me later for the reply."');
    const readyAt = Date.now() + between(2200, 3600);

    for (let poll = 1; ; poll++) {
      await wait(POLL_INTERVAL_MS);
      sink.step({ from: 'A', kind: 'request', title: `A → B (GET /api/messages/poll · #${poll})`, detail: '"Is my reply ready?"' });
      sink.count('httpRequests');
      sink.log('A', `Poll #${poll}: is the reply ready?`);
      await wait(180);
      if (Date.now() >= readyAt || poll >= MAX_POLLS) {
        sink.step({ from: 'B', kind: 'response', title: 'B → A (200 OK)', detail: quote(reply) });
        sink.log('B', reply, true);
        break;
      }
      sink.step({ from: 'B', kind: 'empty', title: 'B → A (204 No Content)', detail: '"Not yet. Ask again later."' });
      sink.count('emptyResponses');
      sink.log('B', '204 No Content: reply not ready yet');
    }
    sink.state('idle');
  }

  private async longPolling(ctx: Ctx) {
    const { sink, wait, reply } = ctx;
    sink.state('waiting');
    await this.postMessage(ctx, '"Stored. Your poll will be answered when the reply is ready."');
    await wait(250);
    sink.step({
      from: 'A',
      kind: 'request',
      title: 'A → B (GET /api/messages/poll?timeout=30)',
      detail: '"Hold this request until my reply is ready."',
    });
    sink.count('httpRequests');
    sink.log('A', 'Long-poll sent: B holds the request open');
    await wait(between(2200, 3600));
    sink.step({ from: 'B', kind: 'response', title: 'B → A (200 OK · held request answered)', detail: quote(reply) });
    sink.log('B', reply, true);
    sink.state('idle');
  }

  private async sse(ctx: Ctx) {
    const { sink, wait, reply, closed } = ctx;
    if (!this.open.has('sse')) {
      sink.state('connecting');
      sink.step({ from: 'A', kind: 'control', title: 'A → B (GET /api/stream)', detail: '"Accept: text/event-stream"' });
      sink.count('httpRequests');
      sink.count('connectionsOpened');
      sink.log('A', 'Opening event stream');
      await wait(400);
      sink.step({
        from: 'B',
        kind: 'control',
        title: 'B → A (200 OK · text/event-stream)',
        detail: '"Stream open. Replies will be pushed here."',
      });
      sink.log('B', 'Stream accepted: B can now push events');
      this.open.add('sse');
    }
    sink.state('connected');
    await this.postMessage(ctx, '"Stored. The reply will arrive on the event stream."');
    await wait(between(1200, 2200));
    sink.step({ from: 'B', kind: 'push', title: 'B → A (SSE event: message)', detail: quote(reply) });
    sink.count('framesOrEvents');
    sink.log('B', reply, true);

    if (closed) {
      await wait(300);
      sink.step({ from: 'B', kind: 'control', title: 'B → A (SSE event: close)', detail: '"Conversation complete. Stream closed."' });
      sink.log('B', 'Conversation complete: stream closed');
      this.open.delete('sse');
      sink.state('closed');
    }
  }

  private async websocket(ctx: Ctx) {
    const { req, sink, wait, reply, closed, requestPayload } = ctx;
    if (!this.open.has('websocket')) {
      sink.state('connecting');
      sink.step({ from: 'A', kind: 'control', title: 'A → B (WebSocket handshake)', detail: '"GET /api/ws · Upgrade: websocket"' });
      sink.count('httpRequests');
      sink.count('connectionsOpened');
      sink.log('A', 'Connecting to WebSocket');
      await wait(400);
      sink.step({
        from: 'B',
        kind: 'control',
        title: 'B → A (101 Switching Protocols)',
        detail: '"Connection accepted. Full-duplex channel open."',
      });
      sink.log('B', 'Connection accepted');
      this.open.add('websocket');
    }
    sink.state('connected');
    sink.step({ from: 'A', kind: 'request', title: 'A → B (Message frame)', detail: quote(req.message) });
    sink.request(requestPayload);
    sink.count('framesOrEvents');
    sink.log('A', req.message, true);
    await wait(between(600, 1100));
    sink.step({ from: 'B', kind: 'response', title: 'B → A (Response frame)', detail: quote(reply) });
    sink.count('framesOrEvents');
    sink.log('B', reply, true);

    if (closed) {
      await wait(300);
      sink.step({ from: 'A', kind: 'control', title: 'A → B (Close frame)', detail: '"Conversation complete. Closing socket."' });
      await wait(200);
      sink.step({ from: 'B', kind: 'control', title: 'B → A (Close frame)', detail: '"Socket closed."' });
      sink.log('B', 'WebSocket closed');
      this.open.delete('websocket');
      sink.state('closed');
    }
  }
}

interface Ctx {
  req: ExchangeRequest & { processId: number };
  sink: FlowSink;
  wait: (ms: number) => Promise<void>;
  reply: string;
  closed: boolean;
  requestPayload: object;
}
