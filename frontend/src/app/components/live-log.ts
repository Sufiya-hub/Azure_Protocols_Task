import { DatePipe } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { DemoStore } from '../core/demo.store';
import { Icon } from './icon';

@Component({
  selector: 'app-live-log',
  imports: [Icon, DatePipe],
  template: `
    <section class="card flex h-full flex-col">
      <div class="card-header">
        <app-icon name="signal" cls="size-5 text-blue-600" />
        <h2 class="card-title">Live communication</h2>
        <span class="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
              [class]="badge().cls">
          <span class="size-1.5 rounded-full" [class]="badge().dot"></span>{{ badge().label }}
        </span>
      </div>

      <ol #list class="max-h-80 min-h-40 flex-1 space-y-2.5 overflow-y-auto px-5 py-4 xl:max-h-[640px]">
        @for (e of store.log(); track e.id) {
          <li class="flex items-start gap-2.5">
            <span class="mt-1.5 size-2 shrink-0 rounded-full" [class]="e.bubble ? 'bg-emerald-500' : 'bg-slate-300'"></span>
            <span class="mt-0.5 w-14 shrink-0 text-xs tabular-nums text-slate-500">{{ e.time | date: 'HH:mm:ss' }}</span>
            <span class="grid size-5 shrink-0 place-items-center rounded text-[11px] font-bold text-white"
                  [class]="e.actor === 'A' ? 'bg-blue-600' : 'bg-violet-600'">{{ e.actor }}</span>
            <span class="min-w-0 break-words"
                  [class]="e.bubble
                    ? (e.actor === 'A'
                        ? 'rounded-lg bg-blue-50 px-2.5 py-1 text-sm text-blue-950'
                        : 'rounded-lg bg-violet-50 px-2.5 py-1 text-sm text-violet-950')
                    : 'pt-0.5 text-xs text-slate-500'">{{ e.text }}</span>
          </li>
        } @empty {
          <li class="py-8 text-center text-sm text-slate-500">No messages yet.</li>
        }
      </ol>
    </section>
  `,
})
export class LiveLog {
  protected readonly store = inject(DemoStore);
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  protected readonly badge = computed(() => {
    switch (this.store.connState()) {
      case 'connecting':
        return { label: 'Connecting', cls: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' };
      case 'connected':
        return { label: 'Connected', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' };
      case 'waiting':
        return { label: 'Waiting for B', cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' };
      case 'closed':
        return { label: 'Closed', cls: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' };
      default:
        return { label: 'No open connection', cls: 'bg-slate-50 text-slate-600 ring-slate-200', dot: 'bg-slate-400' };
    }
  });

  constructor() {
    effect(() => {
      this.store.log();
      const el = this.list()?.nativeElement;
      if (el) setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
    });
  }
}
