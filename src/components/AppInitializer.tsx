import Html from "@kitajs/html";

export const AppInitializer = () =>
  String(
    <div
      aria-busy="true"
      hx-get="js:app.init"
      hx-target="this"
      hx-ext="serverless"
      hx-swap="outerHTML"
      hx-trigger="load"
    />,
  );
