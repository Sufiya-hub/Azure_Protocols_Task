import { Component, computed, inject, signal } from '@angular/core';
import { DemoStore } from '../core/demo.store';
import { Icon } from './icon';

type Side = 'request' | 'response';

@Component({
  selector: 'app-payload-viewer',
  imports: [Icon],
  template: `
    <div class="grid gap-4 md:grid-cols-2">
      @for (p of panels(); track p.id) {
        <section class="card flex min-w-0 flex-col">
          <div class="card-header">
            <span class="grid size-6 place-items-center rounded text-xs font-bold text-white" [class]="p.badge">{{ p.from }}</span>
            <h2 class="card-title">{{ p.title }}</h2>
            <span class="text-xs text-slate-500">{{ p.subtitle }}</span>
            @if (p.json) {
              <button type="button" class="ml-auto rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-slate-800"
                      [title]="copied() === p.id ? 'Copied' : 'Copy JSON'" (click)="copy(p.id, p.json)">
                <app-icon [name]="copied() === p.id ? 'check' : 'copy'" cls="size-4" />
                <span class="sr-only">Copy JSON</span>
              </button>
            }
          </div>
          <div class="flex-1 p-4">
            @if (p.json) {
              <pre class="h-full max-h-72 overflow-auto rounded-lg p-3 font-mono text-xs leading-relaxed text-slate-800" [class]="p.pre">{{ p.json }}</pre>
            } @else {
              <p class="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">{{ p.empty }}</p>
            }
          </div>
        </section>
      }
    </div>
  `,
})
export class PayloadViewer {
  protected readonly store = inject(DemoStore);
  protected readonly copied = signal<Side | null>(null);

  protected readonly panels = computed(() => {
    const fmt = (o: object | null) => (o ? JSON.stringify(o, null, 2) : null);
    return [
      {
        id: 'request' as Side,
        from: 'A',
        title: 'A → B request',
        subtitle: 'sent by Function A',
        badge: 'bg-blue-600',
        pre: 'bg-blue-50/60',
        json: fmt(this.store.requestPayload()),
        empty: 'Function A has not sent anything yet.',
      },
      {
        id: 'response' as Side,
        from: 'B',
        title: 'B → A response',
        subtitle: 'returned by Function B',
        badge: 'bg-violet-600',
        pre: 'bg-violet-50/60',
        json: fmt(this.store.responsePayload()),
        empty: 'No reply from Function B yet.',
      },
    ];
  });

  protected async copy(side: Side, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(side);
      setTimeout(() => this.copied.set(null), 1500);
    } catch {
      /* clipboard unavailable (e.g. insecure context) */
    }
  }
}
