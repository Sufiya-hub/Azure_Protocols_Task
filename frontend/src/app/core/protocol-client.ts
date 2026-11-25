import { DemoMode, ExchangeRequest, ExchangeResult, FlowSink, Protocol } from './models';

/**
 * Contract between the UI and whatever talks to Function A / Function B.
 * - SimulationProtocolClient: in-browser simulation, no backend.
 * - LiveProtocolClient: calls the real Function A (which talks to Function B).
 * Both report the same steps through the FlowSink, so the UI does not change.
 */
export interface ProtocolClient {
  readonly mode: DemoMode;
  exchange(req: ExchangeRequest, sink: FlowSink, signal: AbortSignal): Promise<ExchangeResult>;
  disconnect(protocol: Protocol): void;
}

/** Function A's HTTP API, reached through the Angular dev proxy (proxy.conf.json -> localhost:7071). */
export const FUNCTION_A_API = '/api';
