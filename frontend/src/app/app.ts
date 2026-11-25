import { Component, inject } from '@angular/core';
import { ComparisonTable } from './components/comparison-table';
import { ConfigPanel } from './components/config-panel';
import { FlowDiagram } from './components/flow-diagram';
import { Icon } from './components/icon';
import { LiveLog } from './components/live-log';
import { PayloadViewer } from './components/payload-viewer';
import { DemoStore } from './core/demo.store';
import { DemoMode } from './core/models';

@Component({
  selector: 'app-root',
  imports: [ConfigPanel, FlowDiagram, LiveLog, PayloadViewer, ComparisonTable, Icon],
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(DemoStore);
  protected readonly modes: { id: DemoMode; label: string }[] = [
    { id: 'simulation', label: 'Simulation' },
    { id: 'live', label: 'Live (Function A)' },
  ];
}
