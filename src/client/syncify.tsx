import Html, { Children } from "@kitajs/html";

export type SyncifiedHandler<T extends (...a: any) => JSX.Element> = (
  ...a: Parameters<T>
) => string;

export type SyncifiedHandlerEnds = Record<number, string | (() => string)>;
export const syncified: SyncifiedHandlerEnds = {};
const notifies: Record<number, HTMLDivElement | (() => void)> = {};

let idCounter = 1;

/// @ts-ignore
htmx.on("htmx:load", function (evt: Event) {
  if ("detail" in evt) {
    const detail = evt.detail;
    if (typeof detail === "object" && detail && "elt" in detail) {
      const elt = detail.elt;
      if (elt instanceof HTMLDivElement && elt.id.startsWith("syncify")) {
        const id = parseInt(elt.id.substring("syncify".length));
        const c = notifies[id];
        notifies[id] = elt;
        if (typeof c === "function") {
          c();
        }
      }
    }
  }
});

export type CustomWait = (customWait?: Children) => void;
type Tail<T extends unknown[]> = T extends [infer Head, ...infer Tail]
  ? Tail
  : never;

export function syncify<
  T extends (customWait: CustomWait, ...a: any) => JSX.Element,
>(handler: T): (...a: Tail<Parameters<T>>) => string {
  const begin = function (...args: Tail<Parameters<T>>): string {
    let customRetryContent: Children | undefined;
    let memoizedRetryText: string | undefined;
    const retry = (id: number) => {
      debugger;
      if (memoizedRetryText) return memoizedRetryText;
      return (memoizedRetryText = String(
        <div
          aria-busy={customRetryContent === undefined}
          id={`syncify${id}`}
          hx-get={`js:syncified[${id}]`}
          hx-target="this"
          hx-ext="serverless"
          hx-swap="outerHTML"
          hx-trigger="refresh"
        >
          {customRetryContent}
        </div>,
      ));
    };

    let idMaybe: number | undefined;

    function completed() {
      if (!idMaybe) return;

      const div = notifies[idMaybe];
      if (div instanceof HTMLDivElement) {
        delete notifies[idMaybe];
        div.dispatchEvent(new Event("syncify:completed"));
      } else {
        notifies[idMaybe] = completed;
      }
    }

    function refresh() {
      if (!idMaybe) return;

      const div = notifies[idMaybe];
      if (div instanceof HTMLDivElement) {
        const innerDiv = div.querySelector(
          "div > div[hx-trigger='syncify:refresh']",
        );
        if (innerDiv) {
          innerDiv.dispatchEvent(new Event("syncify:refresh"));
        }
      } else {
        notifies[idMaybe] = refresh;
      }
    }

    const customWait = function (content?: Children) {
      memoizedRetryText = undefined;
      customRetryContent = content;
      refresh();
    };

    const handlerResult = handler(customWait, args);
    if (typeof handlerResult === "string") {
      return handlerResult;
    }

    const id = idCounter++;
    idMaybe = id;

    handlerResult.then(
      (value) => {
        syncified[id] = function () {
          delete syncified[id];
          return value;
        };
        completed();
      },
      (err) => {
        console.error(err);
        syncified[id] = function () {
          delete syncified[id];
          return String(<div safe>{err}</div>);
        };
        completed();
      },
    );

    const alreadyCompleted = syncified[id];
    if (alreadyCompleted) {
      return typeof alreadyCompleted === "string"
        ? alreadyCompleted
        : alreadyCompleted();
    }

    syncified[id] = () => String(<>{customRetryContent}</>);

    return String(
      <div
        aria-busy={customRetryContent === undefined}
        id={`syncify${id}`}
        hx-get={`js:syncified[${id}]`}
        hx-target="this"
        hx-ext="serverless"
        hx-swap="outerHTML"
        hx-trigger="syncify:completed"
      >
        <div
          hx-get={`js:syncified[${id}]`}
          hx-target="this"
          hx-ext="serverless"
          hx-swap="outerHTML"
          hx-trigger="syncify:refresh"
        >
          {customRetryContent}
        </div>
      </div>,
    );
  };

  return begin;
}
