import { computed, inject, Injectable, signal } from '@angular/core';
import { ConversationService } from './conversation.service';
import { LiveProtocolClient } from './live-client';
import { BackendHealth, ConnState, DemoMode, emptyStats, FlowSink, FlowStep, LogEntry, Protocol, RunStats } from './models';
import { FUNCTION_A_API, ProtocolClient } from './protocol-client';
import { EXCHANGES, protocolInfo } from './protocols';
import { SimulationProtocolClient } from './simulation-client';

const MODE_KEY = 'protocol-demo.mode';

/** Central UI state for the demo page (signals). */
@Injectable({ providedIn: 'root' })
export class DemoStore {
  private clients: Record<DemoMode, ProtocolClient> = {
    simulation: inject(SimulationProtocolClient),
    live: inject(LiveProtocolClient),
  };
  private conversations = inject(ConversationService);
  private abort?: AbortController;
  private stepNo = 0;
  private logId = 0;
  private prefillError: string | null = null;

  readonly mode = signal<DemoMode>(this.savedMode());
  readonly health = signal<BackendHealth>({ checking: false, functionA: false, azuriteA: false, message: '' });
  private get client(): ProtocolClient {
    return this.clients[this.mode()];
  }

  readonly protocol = signal<Protocol>('websocket');
  /** 'random' = Function A picks rand(0,15) when the conversation starts */
  readonly processId = signal<number | 'random'>('random');
  /** ProcessId actually in use for the current conversation (set after Function A picks it) */
  readonly activeProcessId = signal<number | null>(null);
  readonly exchangeNo = signal(1);
  readonly message = signal('');

  readonly steps = signal<FlowStep[]>([]);
  readonly log = signal<LogEntry[]>([]);
  readonly requestPayload = signal<object | null>(null);
  readonly responsePayload = signal<object | null>(null);
  readonly connState = signal<ConnState>('idle');
  readonly running = signal(false);
  readonly closed = signal(false);
  readonly stats = signal<RunStats>(emptyStats());
  readonly comparison = signal<Partial<Record<Protocol, RunStats>>>({});
  readonly error = signal<string | null>(null);

  readonly info = computed(() => protocolInfo(this.protocol()));
  readonly connectionOpen = computed(() => this.info().persistent && this.connState() === 'connected');
  /** Random mode before the first run: the process (and so the message) is not known yet. */
  readonly awaitingRandomPick = computed(() => this.processId() === 'random' && this.activeProcessId() === null);
  readonly canRun = computed(
    () => !this.running() && !this.closed() && (this.awaitingRandomPick() || this.message().trim().length > 0),
  );

  constructor() {
    if (this.mode() === 'live') void this.checkHealth();
    void this.prefill();
  }

  setMode(mode: DemoMode) {
    if (mode === this.mode() || this.running()) return;
    this.reset();
    this.mode.set(mode);
    this.comparison.set({}); // never mix simulated and measured numbers
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* storage unavailable */
    }
    if (mode === 'live') void this.checkHealth();
    void this.prefill();
  }

  /** Ask Function A whether it is up and can reach Azurite A. */
  async checkHealth() {
    this.health.set({ checking: true, functionA: false, azuriteA: false, message: 'Checking Function A…' });
    try {
      const res = await fetch(`${FUNCTION_A_API}/health`);
      const body = await res.json().catch(() => null);
      if (!body || body.function !== 'A') throw new Error();
      const azuriteA = body.azuriteA === 'reachable';
      this.health.set({
        checking: false,
        functionA: true,
        azuriteA,
        message: azuriteA ? 'Function A connected · Azurite A reachable' : 'Function A connected · Azurite A NOT reachable',
      });
    } catch {
      this.health.set({ checking: false, functionA: false, azuriteA: false, message: 'Function A not reachable (port 7071)' });
    }
  }

  private savedMode(): DemoMode {
    try {
      return localStorage.getItem(MODE_KEY) === 'live' ? 'live' : 'simulation';
    } catch {
      return 'simulation';
    }
  }

  selectProtocol(protocol: Protocol) {
    if (protocol === this.protocol() || this.running()) return;
    this.reset();
    this.protocol.set(protocol);
    void this.prefill();
  }

  selectProcess(id: number | 'random') {
    if (this.running()) return;
    this.processId.set(id);
    this.reset();
  }

  setExchange(n: number) {
    if (this.running() || !Number.isFinite(n)) return;
    this.exchangeNo.set(Math.min(EXCHANGES, Math.max(1, Math.round(n))));
    this.closed.set(false);
    void this.prefill();
  }

  setMessage(text: string) {
    this.message.set(text);
  }

  reset() {
    this.abort?.abort();
    this.abort = undefined;
    this.client.disconnect(this.protocol());
    this.steps.set([]);
    this.log.set([]);
    this.requestPayload.set(null);
    this.responsePayload.set(null);
    this.connState.set('idle');
    this.running.set(false);
    this.closed.set(false);
    this.stats.set(emptyStats());
    this.error.set(null);
    this.stepNo = 0;
    this.exchangeNo.set(1);
    const fixed = this.processId();
    this.activeProcessId.set(fixed === 'random' ? null : fixed); // random: a new rand(0,15) on the next run
    void this.prefill();
  }

  async run() {
    if (!this.canRun()) return;
    const ctrl = new AbortController();
    this.abort = ctrl;
    this.running.set(true);
    this.error.set(null);
    this.stats.set(emptyStats());
    const protocol = this.protocol();
    const started = performance.now();

    const live = () => !ctrl.signal.aborted;
    const sink: FlowSink = {
      step: (s, time = new Date()) => live() && this.steps.update((list) => [...list, { ...s, n: ++this.stepNo, time }]),
      log: (actor, text, bubble = false, time = new Date()) =>
        live() && this.log.update((list) => [...list, { id: ++this.logId, time, actor, text, bubble }]),
      request: (p) => live() && this.requestPayload.set(p),
      response: (p) => live() && this.responsePayload.set(p),
      state: (s) => live() && this.connState.set(s),
      count: (f) => live() && this.stats.update((st) => ({ ...st, [f]: st[f] + 1 })),
      picked: (pid, text) => {
        if (!live()) return;
        this.activeProcessId.set(pid); // retries and later exchanges stay on this process until Reset
        this.message.set(text);
      },
    };

    try {
      const result = await this.client.exchange(
        {
          protocol,
          processId: this.activeProcessId(), // null -> Function A picks rand(0,15)
          exchangeNo: this.exchangeNo(),
          message: this.awaitingRandomPick() ? '' : this.message().trim(),
        },
        sink,
        ctrl.signal,
      );
      if (!live()) return;
      this.activeProcessId.set(result.processId); // keep this process for the rest of the conversation
      this.responsePayload.set(result.replyPayload);
      if (result.stats) this.stats.set(result.stats);
      else this.stats.update((st) => ({ ...st, replyMs: Math.round(performance.now() - started) }));
      this.comparison.update((c) => ({ ...c, [protocol]: this.stats() }));
      if (result.closed) {
        this.closed.set(true);
      } else {
        this.exchangeNo.update((n) => n + 1);
        await this.prefill();
      }
    } catch (e) {
      if (live() && !(e instanceof DOMException && e.name === 'AbortError')) {
        this.error.set(e instanceof Error ? e.message : String(e));
        this.connState.set('idle');
        if (this.mode() === 'live') void this.checkHealth();
      }
    } finally {
      if (this.abort === ctrl) this.running.set(false);
    }
  }

  /** Put Function A's scripted line for the current exchange into the message box. */
  private async prefill() {
    const table = this.info().table;
    const id = this.activeProcessId();
    const n = this.exchangeNo();
    const mode = this.mode();
    if (id === null) {
      this.message.set(''); // random mode: unknown until Function A picks the process
      return;
    }
    try {
      const conversation =
        mode === 'live'
          ? await this.conversations.getFromFunctionA(table, id)
          : await this.conversations.get(table, id);
      if (table === this.info().table && id === this.activeProcessId() && n === this.exchangeNo() && mode === this.mode()) {
        this.message.set(conversation[(n - 1) * 2]);
        if (this.prefillError && this.error() === this.prefillError) this.error.set(null);
        this.prefillError = null;
      }
    } catch (e) {
      this.prefillError = e instanceof Error ? e.message : String(e);
      this.error.set(this.prefillError);
    }
  }
}
