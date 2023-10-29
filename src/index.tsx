import express from "express";
import usersRouter from "./routes/users";
import connectionsRouter from "./routes/connections";
import Html from "@kitajs/html";
import { Children } from "@kitajs/html";
const path = require("path");

const app = express();
const port = 3000;

const BaseHTML = ({ children }: { children?: Children }) => (
  <>
    {"<!doctype html>"}
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Experiment</title>
        <script
          src="https://unpkg.com/htmx.org@1.9.6"
          integrity="sha384-FhXw7b6AlE/jyjlZH5iHa/tTe9EpJ1Y55RjcgPbjeWMskSxZt1v9qkxLJWNJaGni"
          crossorigin="anonymous"
        ></script>
        <script
          src="https://unpkg.com/htmx-serverless@0.1.7"
          integrity="sha384-Ildyot+Nr+qIy9JnM+AOt4meXxl3ep0TmkqNOSvdUzA5GlgIALOx+RtVJT6Oq//H"
          crossorigin="anonymous"
        ></script>
        <link href="./styles.css" rel="stylesheet" />
        <script src="./dist/bundle.js" />
        <script>app = window.Bundle.app; console.log(app.addDiv());</script>
      </head>
      <body>{children}</body>
    </html>
  </>
);

app.get("/", (req, res) => {
  res.send(
    <BaseHTML>
      <button
        class="mdc-button"
        hx-get="/connections"
        hx-target="this"
        hx-swap="outerHTML"
      >
        <div class="mdc-button__ripple"></div>
        <span class="mdc-button__label">Connect</span>
      </button>
      <button
        class="btn"
        hx-get="js:app.addDiv"
        hx-target="this"
        hx-ext="serverless"
        hx-swap="outerHTML"
      >
        Connect
      </button>
    </BaseHTML>,
  );
});

app.use("/users", usersRouter);
app.use("/connections", connectionsRouter);

app.use("/", express.static(path.join(__dirname, "..", "wwwroot")));

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
