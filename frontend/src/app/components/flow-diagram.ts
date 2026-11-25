import { Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { DemoStore } from '../core/demo.store';
import { FlowStep } from '../core/models';
import { Icon } from './icon';

@Component({
  selector: 'app-flow-diagram',
  imports: [Icon],
  template: `
    <section class="card flex h-full flex-col">
      <div class="card-header flex-wrap">
        <app-icon name="flow" cls="size-5 text-blue-600" />
        <h2 class="card-title">Communication flow: {{ store.info().label }}</h2>
        <span class="ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ring-1" [class]="store.info().tagClass">
          {{ store.info().tag }}
        </span>
      </div>

      <div class="flex flex-1 flex-col px-3 pb-4 sm:px-5">
        <!-- Lifeline headers -->
        <div class="flex justify-between gap-2 pt-4">
          <div class="flex w-[30%] min-w-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-2 py-2.5 text-center">
            <app-icon name="bolt" cls="hidden size-6 text-amber-500 sm:block" />
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-slate-900">Function A</div>
              <div class="truncate text-[11px] text-slate-600">Initiator / Client</div>
            </div>
          </div>
          <div class="flex w-[30%] min-w-0 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-2 py-2.5 text-center">
            <app-icon name="bolt" cls="hidden size-6 text-amber-500 sm:block" />
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-slate-900">Function B</div>
              <div class="truncate text-[11px] text-slate-600">Receiver / Server</div>
            </div>
          </div>
        </div>

        <!-- Sequence -->
        <div #scroller class="relative mt-1 max-h-[560px] min-h-[420px] flex-1 overflow-y-auto">
          <div class="relative min-h-full py-3">
            <div class="pointer-events-none absolute inset-y-0 left-[15%] w-0.5 -translate-x-1/2 bg-slate-300"></div>
            <div class="pointer-events-none absolute inset-y-0 right-[15%] w-0.5 translate-x-1/2 bg-slate-300"></div>

            @for (s of store.steps(); track s.n) {
              <div class="relative mx-[15%] py-1.5">
                <div class="flex items-start justify-center gap-2 px-2">
                  <span class="mt-1 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold"
                        [class]="numClass(s)">{{ s.n }}</span>
                  <div class="max-w-[90%] rounded-lg border px-3 py-1.5 text-xs shadow-xs" [class]="cardClass(s)">
                    <div class="font-semibold">{{ s.title }}</div>
                    @if (s.detail) { <div class="mt-0.5 break-words opacity-90">{{ s.detail }}</div> }
                  </div>
                </div>
                <div class="relative mt-1.5 h-2.5">
                  <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2" [class]="lineClass(s)"></div>
                  @if (s.from === 'A') {
                    <svg viewBox="0 0 10 10" class="absolute -right-0.5 top-0 size-2.5" [class]="headClass(s)" aria-hidden="true">
                      <path d="M0 0 L10 5 L0 10 Z" fill="currentColor" />
                    </svg>
                  } @else {
                    <svg viewBox="0 0 10 10" class="absolute -left-0.5 top-0 size-2.5" [class]="headClass(s)" aria-hidden="true">
                      <path d="M10 0 L0 5 L10 10 Z" fill="currentColor" />
                    </svg>
                  }
                </div>
              </div>
            } @empty {
              <div class="relative mx-[15%] flex h-72 items-center justify-center px-4 text-center text-sm text-slate-500">
                <span class="rounded-lg bg-white/90 px-3 py-2">
                  Choose a protocol and press <b>Run communication</b> to see the messages flow between Function A and Function B.
                </span>
              </div>
            }

            @if (store.running()) {
              <div class="relative mx-[15%] flex items-center justify-center gap-2 py-2 text-xs text-slate-500">
                <span class="size-2 animate-ping rounded-full bg-blue-500"></span> in progress…
              </div>
            }
          </div>
        </div>

        <!-- Legend -->
        <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          <span class="flex items-center gap-1.5"><span class="w-5 border-t-2 border-blue-500"></span>A → B</span>
          <span class="flex items-center gap-1.5"><span class="w-5 border-t-2 border-dashed border-violet-500"></span>B → A</span>
          <span class="flex items-center gap-1.5"><span class="w-5 border-t-2 border-dashed border-slate-300"></span>Empty poll</span>
          <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm border border-emerald-300 bg-emerald-50"></span>Reply data</span>
        </div>
      </div>
    </section>
  `,
})
export class FlowDiagram {
  protected readonly store = inject(DemoStore);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
    effect(() => {
      this.store.steps();
      this.store.running();
      const el = this.scroller()?.nativeElement;
      if (el) setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
    });
  }

  protected numClass(s: FlowStep): string {
    if (s.kind === 'empty') return 'border-slate-300 bg-slate-50 text-slate-500';
    return s.from === 'A' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700';
  }

  protected cardClass(s: FlowStep): string {
    switch (s.kind) {
      case 'request':
        return 'border-blue-200 bg-blue-50 text-blue-950';
      case 'response':
      case 'push':
        return 'border-emerald-200 bg-emerald-50 text-emerald-950';
      case 'empty':
        return 'border-slate-200 bg-slate-50 text-slate-500';
      default:
        return 'border-slate-200 bg-white text-slate-700';
    }
  }

  protected lineClass(s: FlowStep): string {
    if (s.from === 'A') return s.kind === 'control' ? 'border-blue-300' : 'border-blue-500';
    if (s.kind === 'empty') return 'border-dashed border-slate-300';
    return s.kind === 'control' ? 'border-dashed border-violet-300' : 'border-dashed border-violet-500';
  }

  protected headClass(s: FlowStep): string {
    if (s.from === 'A') return s.kind === 'control' ? 'text-blue-300' : 'text-blue-500';
    if (s.kind === 'empty') return 'text-slate-300';
    return s.kind === 'control' ? 'text-violet-300' : 'text-violet-500';
  }
}
