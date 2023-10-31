import Html from "@kitajs/html";
import { Button } from "../components/Button";

export const app = (function () {
  return {
    init: () => {
      // TODO: If we have a secret key, we must construct
      // the public key, fetch the offer and answer it.
      return (
        <main class="container">
          <h1>WebRTC Camera</h1>
          <Button hx-get="/connections" hx-target="this" hx-swap="outerHTML">
            Connect
          </Button>
          <Button
            hx-get="js:app.addDiv"
            hx-target="this"
            hx-ext="serverless"
            hx-swap="outerHTML"
          >
            Connect
          </Button>
          Some text below buttons
        </main>
      );
    },
    addDiv: () => <div>Inserted by app.addDiv()</div>,
  };
})();
