import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';

export const appConfig: ApplicationConfig = {
  // Simulation and live (Function A) clients are both providedIn: 'root'; the header switch picks one.
  providers: [provideBrowserGlobalErrorListeners()],
};
