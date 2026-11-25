export type Protocol = 'short-polling' | 'long-polling' | 'sse' | 'websocket';
export type Actor = 'A' | 'B';
export type TableName = 'Polling' | 'SSE' | 'WebSocket';

/** request = A sends data, response = B returns data, empty = poll with no data,
 *  push = B pushes unprompted (SSE), control = handshakes / acks / close frames. */
export type StepKind = 'request' | 'response' | 'empty' | 'push' | 'control';

export interface FlowStep {
  n: number;
  from: Actor;
  kind: StepKind;
  title: string;
  detail?: string;
  time: Date;
}

export interface LogEntry {
  id: number;
  time: Date;
  actor: Actor;
  text: string;
  /** true for actual conversation messages, false for protocol chatter */
  bubble: boolean;
}

export type ConnState = 'idle' | 'connecting' | 'connected' | 'waiting' | 'closed';

export type CountField = 'httpRequests' | 'connectionsOpened' | 'emptyResponses' | 'framesOrEvents';

export interface RunStats extends Record<CountField, number> {
  replyMs: number | null;
}

export const emptyStats = (): RunStats => ({
  httpRequests: 0,
  connectionsOpened: 0,
  emptyResponses: 0,
  framesOrEvents: 0,
  replyMs: null,
});

export interface ExchangeRequest {
  protocol: Protocol;
  processId: number;
  exchangeNo: number;
  message: string;
}

export interface ExchangeResult {
  reply: string;
  replyPayload: object;
  /** true when the closing exchange (messages 14 and 15) has completed */
  closed: boolean;
  /** measured by the backend (live mode); when present it replaces the UI's own counting */
  stats?: RunStats;
}

export type DemoMode = 'simulation' | 'live';

export interface BackendHealth {
  checking: boolean;
  functionA: boolean;
  azuriteA: boolean;
  message: string;
}

/** Callbacks a protocol client uses to report what is happening on the wire. */
export interface FlowSink {
  /** time: when it really happened (live mode); defaults to now */
  step(step: Omit<FlowStep, 'n' | 'time'>, time?: Date): void;
  log(actor: Actor, text: string, bubble?: boolean, time?: Date): void;
  request(payload: object): void;
  response(payload: object): void;
  state(state: ConnState): void;
  count(field: CountField): void;
}
