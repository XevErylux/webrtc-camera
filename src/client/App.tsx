import Html from "@kitajs/html";
import { Button } from "../components/Button";

export const App = function () {
  function call(name: keyof ReturnType<typeof App>): string {
    return `js:app.${name}`;
  }

  function initSender() {
    return (
      <main class="container">
        <h1>WebRTC Camera</h1>
        <Button hx-get="/connections" hx-target="this" hx-swap="outerHTML">
          From Server
        </Button>
        <Button
          hx-get={call("addDiv")}
          hx-target="this"
          hx-ext="serverless"
          hx-swap="outerHTML"
        >
          From Client
        </Button>
        Some text below buttons
      </main>
    );
  }

  return {
    call: call,
    init: () => {
      // TODO: If we have a secret key, we must construct
      // the public key, fetch the offer and answer it.
      return initSender();
    },
    addDiv: () => <div>Inserted by {call("addDiv")}</div>,
  };
};
