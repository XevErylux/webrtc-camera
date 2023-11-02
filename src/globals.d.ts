import { App } from "./client/App"
import { SyncifiedHandlerEnds } from "./client/syncify";

declare global {
  var app: App;
  var syncified: SyncifiedHandlerEnds;
}
