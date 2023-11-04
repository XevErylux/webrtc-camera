import Html, { Children } from "@kitajs/html";

export type SyncifiedHandler<T extends (...a: any) => JSX.Element> = (
  ...a: Parameters<T>
) => string;

type SyncifiedHandlerEnd = {
  readonly refresh: () => string;
  completed: (() => string) | string;
};

export type SyncifiedHandlerEnds = Record<number, SyncifiedHandlerEnd>;
export const syncified: SyncifiedHandlerEnds = {};
const notifies: Record<number, HTMLDivElement | (() => void)> = {};

let idCounter = 1;

declare const htmx: {
  on: (eventName: string, handler: (evt: Event) => void) => void;
};

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
    let idMaybe: number | undefined;

    function refresh() {
      if (!idMaybe) return;

      const event = "refresh";
      const div = notifies[idMaybe];
      if (div instanceof HTMLDivElement) {
        const innerDiv = div.querySelector(
          `div > div[hx-trigger='syncify:${event}']`,
        );
        if (innerDiv) {
          innerDiv.dispatchEvent(new Event(`syncify:${event}`));
        }
      } else {
        notifies[idMaybe] = refresh;
      }
    }

    const customWait = function (content?: Children) {
      customRetryContent = content;
      refresh();
    };

    const handlerResult = handler(customWait, args);
    if (typeof handlerResult === "string") {
      return handlerResult;
    }

    const id = idCounter++;
    idMaybe = id;

    const end: SyncifiedHandlerEnd = {
      refresh: () => String(<>{customRetryContent}</>),
      completed: "Error: Completed was not filled in time!",
    };
    syncified[id] = end;

    function completed() {
      const event = "completed";
      const div = notifies[id];
      if (div instanceof HTMLDivElement) {
        div.dispatchEvent(new Event(`syncify:${event}`));
      } else {
        notifies[id] = completed;
      }
    }

    handlerResult.then(
      (value) => {
        end.completed = function () {
          delete syncified[id];
          delete notifies[id];
          return value;
        };
        completed();
      },
      (err) => {
        console.error(err);
        end.completed = function () {
          delete syncified[id];
          delete notifies[id];
          return String(<div safe>{err}</div>);
        };
        completed();
      },
    );

    if (typeof end.completed === "function") {
      return end.completed();
    }

    return String(
      <div
        id={`syncify${id}`}
        hx-get={`js:syncified[${id}].completed`}
        hx-target="this"
        hx-ext="serverless"
        hx-swap="outerHTML"
        hx-trigger="syncify:completed"
      >
        <div
          hx-get={`js:syncified[${id}].refresh`}
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
