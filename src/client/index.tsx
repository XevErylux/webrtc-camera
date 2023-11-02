import { App } from "./App";
import { syncified as s } from "./syncify";

export const app = App();
window.app = app;

export const syncified = s;
window.syncified = syncified;
