import { Injectable } from '@angular/core';
import { ExchangeRequest, ExchangeResult, FlowSink, Protocol, RunStats, StepKind } from './models';
import { FUNCTION_A_API, ProtocolClient } from './protocol-client';

interface BackendStep {
  n: number;
  from: 'A' | 'B';
  kind: StepKind;
  title: string;
  detail: string | null;
  payload: unknown;
  time: string;
  atMs: number;
}

interface BackendRun {
  protocol: string;
  closed: boolean;
  exchanges: { exchangeNo: number; request: object; reply: (object & { message?: string }) | null }[];
  steps: BackendStep[];
  stats: Omit<RunStats, 'replyMs'> & { elapsedMs: number };
  error: string | null;
}

const ENDPOINTS: Record<Protocol, { path: string; mode?: 'short' | 'long' }> = {
  'short-polling': { path: 'polling/run', mode: 'short' },
  'long-polling': { path: 'polling/run', mode: 'long' },
  sse: { path: 'sse/run' },
  websocket: { path: 'websocket/run' },
};

/** Pause between replayed steps so the flow diagram builds up visibly. */
const REPLAY_STEP_MS = 140;

/**
 * Live mode: calls the real Function A, which reads Azurite A and talks to Function B.
 * Function A returns every step it saw on the wire; the UI replays them into the diagram.
 */
@Injectable({ providedIn: 'root' })
export class LiveProtocolClient implements ProtocolClient {
  readonly mode = 'live' as const;

  disconnect(): void {
    // Function A opens and closes its SSE stream / WebSocket within each run.
  }

  async exchange(req: ExchangeRequest, sink: FlowSink, signal: AbortSignal): Promise<ExchangeResult> {
    const endpoint = ENDPOINTS[req.protocol];
    const body = {
      processId: req.processId,
      exchangeNo: req.exchangeNo,
      count: 1,
      message: req.message,
      ...(endpoint.mode ? { mode: endpoint.mode } : {}),
    };

    sink.state('waiting');
    let res: Response;
    try {
      res = await fetch(`${FUNCTION_A_API}/${endpoint.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new Error('Function A is not reachable. Is `func start --port 7071` running in backend/function_a?');
    }

    const run = await this.parse(res);
    const persistent = req.protocol === 'sse' || req.protocol === 'websocket';
    if (persistent && run.steps.length) sink.state('connected');

    for (const step of run.steps) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const at = step.time ? new Date(step.time) : new Date(); // real time recorded by Function A
      sink.step({ from: step.from, kind: step.kind, title: step.title, detail: step.detail ?? undefined }, at);
      const conversational = step.kind === 'request' || step.kind === 'response' || step.kind === 'push';
      const text = conversational && step.detail ? step.detail : `${step.title}${step.detail ? ': ' + step.detail : ''}`;
      sink.log(step.from, text, conversational, at);
      await new Promise((r) => setTimeout(r, REPLAY_STEP_MS));
    }

    const exchange = run.exchanges[0];
    if (exchange) sink.request(exchange.request);
    sink.state(run.closed ? 'closed' : 'idle');

    if (run.error || !exchange?.reply) {
      throw new Error(run.error ?? 'Function A returned no reply from Function B');
    }
    return {
      reply: exchange.reply.message ?? '',
      replyPayload: exchange.reply,
      closed: run.closed,
      stats: { ...run.stats, replyMs: run.stats.elapsedMs },
    };
  }

  private async parse(res: Response): Promise<BackendRun> {
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      // The dev proxy answers 500/502/504 with plain text when Function A is down.
      throw new Error(`Function A is not reachable (HTTP ${res.status}). Start it with \`func start --port 7071\` in backend/function_a.`);
    }
    const run = data as Partial<BackendRun> & { error?: string };
    if (!Array.isArray(run.steps)) {
      // 400 / 404 / 503 responses only carry { error }
      throw new Error(`Function A: ${run.error ?? `HTTP ${res.status}`}`);
    }
    return run as BackendRun;
  }
}
