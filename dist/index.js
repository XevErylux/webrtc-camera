"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const users_1 = __importDefault(require("./routes/users"));
const connections_1 = __importDefault(require("./routes/connections"));
const html_1 = __importDefault(require("@kitajs/html"));
const path = require("path");
const app = (0, express_1.default)();
const port = 3000;
const BaseHTML = ({ children }) => (html_1.default.createElement(html_1.default.Fragment, null,
    "<!doctype html>",
    html_1.default.createElement("html", { lang: "en" },
        html_1.default.createElement("head", null,
            html_1.default.createElement("meta", { charset: "UTF-8" }),
            html_1.default.createElement("meta", { name: "viewport", content: "width=device-width, initial-scale=1.0" }),
            html_1.default.createElement("title", null, "Experiment"),
            html_1.default.createElement("script", { src: "https://unpkg.com/htmx.org@1.9.6", integrity: "sha384-FhXw7b6AlE/jyjlZH5iHa/tTe9EpJ1Y55RjcgPbjeWMskSxZt1v9qkxLJWNJaGni", crossorigin: "anonymous" }),
            html_1.default.createElement("script", { src: "https://unpkg.com/htmx-serverless@0.1.7", integrity: "sha384-Ildyot+Nr+qIy9JnM+AOt4meXxl3ep0TmkqNOSvdUzA5GlgIALOx+RtVJT6Oq//H", crossorigin: "anonymous" }),
            html_1.default.createElement("script", { src: "./dist/bundle.js" }),
            html_1.default.createElement("script", null, "app = window.Bundle.app; console.log(app.addDiv());")),
        html_1.default.createElement("body", null, children))));
app.get("/", (req, res) => {
    res.send(html_1.default.createElement(BaseHTML, null,
        html_1.default.createElement("button", { class: "btn", "hx-get": "/connections", "hx-target": "this", "hx-swap": "outerHTML" }, "Connect"),
        html_1.default.createElement("button", { class: "btn", "hx-get": "js:app.addDiv", "hx-target": "this", "hx-ext": "serverless", "hx-swap": "outerHTML" }, "Connect")));
});
app.use("/users", users_1.default);
app.use("/connections", connections_1.default);
app.use("/", express_1.default.static(path.join(__dirname, "..", "wwwroot")));
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
