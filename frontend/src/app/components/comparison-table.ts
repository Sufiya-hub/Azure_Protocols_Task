import { Component, inject } from '@angular/core';
import { DemoStore } from '../core/demo.store';
import { PROTOCOLS } from '../core/protocols';
import { Icon } from './icon';

@Component({
  selector: 'app-comparison-table',
  imports: [Icon],
  template: `
    <section class="card">
      <div class="card-header">
        <app-icon name="table" cls="size-5 text-blue-600" />
        <h2 class="card-title">Protocol comparison</h2>
        <span class="ml-auto text-xs text-slate-500">"Last exchange" columns fill in as you run each protocol</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full min-w-[860px] text-left text-sm">
          <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-5 py-2.5 font-semibold">Protocol</th>
              <th class="px-3 py-2.5 font-semibold">Connection</th>
              <th class="px-3 py-2.5 font-semibold">Who can send</th>
              <th class="px-3 py-2.5 text-right font-semibold">HTTP requests</th>
              <th class="px-3 py-2.5 text-right font-semibold">Empty polls</th>
              <th class="px-3 py-2.5 text-right font-semibold">New connections</th>
              <th class="px-3 py-2.5 text-right font-semibold">Frames / events</th>
              <th class="px-5 py-2.5 text-right font-semibold">Time to reply</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (p of protocols; track p.id) {
              @let s = store.comparison()[p.id];
              <tr [class]="store.protocol() === p.id ? 'bg-blue-50/60' : ''">
                <td class="px-5 py-3 font-medium text-slate-900">
                  <span class="flex items-center gap-2"><app-icon [name]="p.icon" cls="size-4 text-slate-500" />{{ p.label }}</span>
                </td>
                <td class="px-3 py-3 text-slate-600">{{ p.connection }}</td>
                <td class="px-3 py-3 text-slate-600">{{ p.whoSends }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ s ? s.httpRequests : '–' }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ s ? s.emptyResponses : '–' }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ s ? s.connectionsOpened : '–' }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ s ? s.framesOrEvents : '–' }}</td>
                <td class="px-5 py-3 text-right tabular-nums">{{ s?.replyMs != null ? (s!.replyMs! / 1000).toFixed(1) + ' s' : '–' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
        @if (store.mode() === 'live') {
          Live mode: numbers are measured by Function A on real traffic to Function B.
        } @else {
          Simulation mode: numbers come from the in-browser simulation and use simulated timing.
        }
      </p>
    </section>
  `,
})
export class ComparisonTable {
  protected readonly store = inject(DemoStore);
  protected readonly protocols = PROTOCOLS;
}
