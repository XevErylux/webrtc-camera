import Html from "@kitajs/html";
import { Children } from "@kitajs/html";

export const BaseHTML = ({ children }: { children?: Children }) => (
  <>
    {"<!doctype html>"}
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>WebRTC Camera</title>
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
        {/*<link href="./dist/output.css" rel="stylesheet" />*/}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css"
        />
        <link href="./styles.css" rel="stylesheet" />
        <script src="./dist/bundle.js" />
        <script>app = window.Bundle.app; console.log(app.addDiv());</script>
      </head>
      <body>{children}</body>
    </html>
  </>
);
