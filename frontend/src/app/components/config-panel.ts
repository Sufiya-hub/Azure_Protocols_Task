import { Component, inject } from '@angular/core';
import { DemoStore } from '../core/demo.store';
import { EXCHANGES, PROCESS_IDS, processLabel, PROTOCOLS } from '../core/protocols';
import { Icon } from './icon';

@Component({
  selector: 'app-config-panel',
  imports: [Icon],
  template: `
    <section class="card h-full">
      <div class="card-header">
        <app-icon name="sliders" cls="size-5 text-blue-600" />
        <h2 class="card-title">Configuration</h2>
      </div>

      <div class="space-y-5 p-5">
        <!-- Protocol -->
        <fieldset>
          <legend class="field-label">Communication protocol</legend>
          <div class="space-y-2" role="radiogroup" aria-label="Communication protocol">
            @for (p of protocols; track p.id) {
              @let selected = store.protocol() === p.id;
              <button type="button" role="radio" [attr.aria-checked]="selected"
                      [disabled]="store.running()"
                      (click)="store.selectProtocol(p.id)"
                      class="flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition disabled:cursor-not-allowed"
                      [class]="selected
                        ? 'border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-500'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'">
                <span class="grid size-4 place-items-center rounded-full border-2"
                      [class]="selected ? 'border-blue-600' : 'border-slate-300'">
                  @if (selected) { <span class="size-2 rounded-full bg-blue-600"></span> }
                </span>
                <app-icon [name]="p.icon" [cls]="selected ? 'size-5 text-blue-600' : 'size-5 text-slate-500'" />
                {{ p.label }}
              </button>
            }
          </div>
        </fieldset>

        <!-- Process + exchange -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label" for="process">Process ID</label>
            <select id="process" class="input" [disabled]="store.running()"
                    (change)="onProcess($any($event.target).value)">
              <option value="random" [selected]="store.processId() === 'random'">Random · rand(0–15)</option>
              @for (id of processIds; track id) {
                <option [value]="id" [selected]="id === store.processId()">{{ label(id) }}</option>
              }
            </select>
          </div>
          <div>
            <label class="field-label" for="exchange">Exchange (1–{{ exchanges }})</label>
            <input id="exchange" type="number" min="1" [max]="exchanges" class="input"
                   [value]="store.exchangeNo()" [disabled]="store.running()"
                   (change)="store.setExchange(+$any($event.target).value)" />
          </div>
        </div>
        @if (store.processId() === 'random') {
          <p class="-mt-3 rounded-lg px-3 py-2 text-xs"
             [class]="store.activeProcessId() === null ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'">
            @if (store.activeProcessId() === null) {
              Function A will pick the ProcessId with <b>rand(0,15)</b> when you press Run.
            } @else {
              Function A picked <b>{{ label(store.activeProcessId()!) }}</b> with rand(0,15). Retries and the next
              exchanges stay on this process. Press <b>Reset</b> to let Function A pick again.
            }
          </p>
        }
        <p class="-mt-3 text-xs text-slate-500">
          A sends message #{{ (store.exchangeNo() - 1) * 2 }}, B replies with #{{ (store.exchangeNo() - 1) * 2 + 1 }}
          from the <span class="font-medium text-slate-700">{{ store.info().table }}</span> table.
          Exchange {{ exchanges }} closes the conversation.
        </p>

        <!-- Message -->
        <div>
          <label class="field-label" for="message">Function A message</label>
          <textarea id="message" rows="3" class="input resize-y"
                    [value]="store.message()" [disabled]="store.running() || store.awaitingRandomPick()"
                    [placeholder]="store.awaitingRandomPick() ? 'Function A picks the process first, then sends message #0 of that process.' : ''"
                    (input)="store.setMessage($any($event.target).value)"></textarea>
        </div>

        <!-- Actions -->
        <div class="flex gap-2">
          <button type="button" class="btn btn-primary flex-1 whitespace-nowrap px-3" [disabled]="!store.canRun()" (click)="store.run()">
            @if (store.running()) {
              <span class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
              Running…
            } @else if (store.connectionOpen()) {
              <app-icon name="send" cls="size-4" /> Send message
            } @else {
              <app-icon name="play" cls="size-4" /> Run communication
            }
          </button>
          <button type="button" class="btn btn-secondary px-3" (click)="store.reset()">
            <app-icon name="reset" cls="size-4" /> Reset
          </button>
        </div>

        @if (store.connectionOpen() && !store.running()) {
          <p class="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Connection is still open. The next message reuses it, with no new handshake.
          </p>
        }
        @if (store.closed()) {
          <p class="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
            Conversation closed (messages 14 and 15). Press <b>Reset</b> or choose another exchange.
          </p>
        }
        @if (store.error(); as err) {
          <p class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{{ err }}</p>
        }
      </div>
    </section>
  `,
})
export class ConfigPanel {
  protected readonly store = inject(DemoStore);
  protected readonly protocols = PROTOCOLS;
  protected readonly processIds = PROCESS_IDS;
  protected readonly exchanges = EXCHANGES;
  protected readonly label = processLabel;

  protected onProcess(value: string) {
    this.store.selectProcess(value === 'random' ? 'random' : Number(value));
  }
}
