import express from "express";
import usersRouter from "./routes/users";
import connectionsRouter from "./routes/connections";
import Html from "@kitajs/html";
import { BaseHTML } from "./components/BaseHTML";
import { AppInitializer } from "./components/AppInitializer";
const path = require("path");

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true })); // support encoded bodies

app.get("/", (req, res) => {
  res.send(
    <BaseHTML>
      <main class="container">
        <AppInitializer />
      </main>
    </BaseHTML>,
  );
});

app.use("/users", usersRouter);
app.use("/connections", connectionsRouter);

app.use("/", express.static(path.join(__dirname, "..", "wwwroot")));

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
