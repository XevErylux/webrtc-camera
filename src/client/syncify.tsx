import Html from "@kitajs/html";

export type SyncifiedHandler<T extends (...a: any) => JSX.Element> = (
  ...a: Parameters<T>
) => string;

export type SyncifiedHandlerEnds = Record<number, string | (() => string)>;
export const syncified: SyncifiedHandlerEnds = {};

let idCounter = 1;

export function syncify<T extends (...a: any) => JSX.Element>(
  handler: T,
): (...a: Parameters<T>) => string {
  const begin = function (...args: Parameters<T>): string {
    const handlerResult = handler(args);
    if (typeof handlerResult === "string") {
      return handlerResult;
    }

    const id = idCounter++;
    const retry = String(
      <div
        aria-busy="true"
        hx-get={`js:syncified[${id}]`}
        hx-target="this"
        hx-ext="serverless"
        hx-swap="outerHTML"
        hx-trigger="load"
      />,
    );
    syncified[id] = retry;

    handlerResult.then(
      (value) => {
        syncified[id] = function () {
          delete syncified[id];
          return value;
        };
      },
      (err) => {
        console.error(err);
        syncified[id] = function () {
          delete syncified[id];
          return String(<div safe>{err}</div>);
        };
      },
    );

    return retry;
  };

  return begin;
}
