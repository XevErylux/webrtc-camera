import Html from "@kitajs/html";

import { Request, Router } from "express";
import { Response } from "express-serve-static-core";
var router = Router();

/* GET users listing. */
router.get("/", function (req, res, next) {
  const element = (
    <div style={{ fontWeight: "bold" }}>respond with a resource</div>
  );
  res.send(element);
});

type ListenerType = "sender" | "receiver";

class State {
  private static activeStates: Record<string, State> = {};

  private readonly listeners: Events[] = [];
  private encryptedOffer?: string;

  private constructor(public readonly publicKey: string) {}

  static get(publicKey: string): State {
    return (
      State.activeStates[publicKey] ??
      (State.activeStates[publicKey] = new State(publicKey))
    );
  }

  openListener(
    type: ListenerType,
    response: Response<any, Record<string, any>, number>,
  ): Events {
    const listener = new Events(this, type, response);
    this.listeners.push(listener);
    if (this.encryptedOffer) {
      listener.send("receiver", this.renderOffer(this.encryptedOffer), "offer");
    }
    listener.send("sender", this.renderConnected(), "connected");

    return listener;
  }

  closeListener(listener: Events): boolean {
    const listeners = this.listeners;
    const index = listeners.indexOf(listener, 0);
    if (index > -1) {
      listeners.splice(index, 1);
      return true;
    }
    return false;
  }

  private renderConnected() {
    return String(<div hx-on="htmx:load: app.senderEventsConnected()" />);
  }

  private renderOffer(encryptedOffer: string) {
    return String(
      <form
        hx-get="js:app.acceptOffer"
        hx-target="this"
        hx-ext="serverless"
        hx-swap="outerHTML"
        hx-trigger="load"
      >
        <input type="hidden" name="offer" value={encryptedOffer} />
      </form>,
    );
  }

  setEncryptedOffer(data: string) {
    this.encryptedOffer = data;
    this.send("receiver", this.renderOffer(data), "offer");
  }

  private renderAnswer(encryptedAnswer: string) {
    return String(
      <form
        hx-get="js:app.acceptAnswer"
        hx-target="this"
        hx-ext="serverless"
        hx-swap="outerHTML"
        hx-trigger="load"
      >
        <input type="hidden" name="answer" value={encryptedAnswer} />
      </form>,
    );
  }

  setEncryptedAnswer(data: string) {
    // Do not store the answer, because it could be already invalid,
    // when the sender is reconnecting. The sender issues another
    // offer which must be answered in realtime.
    this.send("sender", this.renderAnswer(data), "answer");
  }

  private send(type: ListenerType, data: string, event?: string) {
    for (const listener of this.listeners) {
      listener.send(type, data, event);
    }
  }
}

class Events {
  constructor(
    private readonly state: State,
    private readonly type: ListenerType,
    private readonly response: Response<any, Record<string, any>, number>,
  ) {}

  send(type: ListenerType, data: string, event?: string) {
    if (this.type !== type) return;

    const response = this.response;
    if (event) {
      response.write(`event: ${event}\ndata: ${data}\n\n`);
      console.log(
        `send event to ${type} client:${
          response.socket?.remotePort ?? 0
        } ${event} with ${data.length} bytes`,
      );
    } else {
      response.write(`data: ${data}\n\n`);
      console.log(
        `send event to ${type} client:${
          response.socket?.remotePort ?? 0
        } with ${data.length} bytes`,
      );
    }
  }

  end() {
    this.response.end();
  }

  free() {
    this.state.closeListener(this);
  }
}

router.get("/:publicKey/:type-events", function (req, res, next) {
  const type = req.params.type;
  if (type !== "sender" && type !== "receiver") {
    res.sendStatus(400);
    return;
  }

  const publicKey = req.params.publicKey;
  console.log(
    `${type} client ${publicKey}:${
      req.socket?.remotePort ?? 0
    } established connection`,
  );

  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(":\n\n");

  const senderState = State.get(publicKey);
  const senderEvents = senderState.openListener(type, res);

  let keepAliveTimeout: NodeJS.Timeout;

  // If client closes connection, stop sending events
  res.on("close", () => {
    console.log(
      `${type} client ${publicKey}:${req.socket.remotePort} dropped connection`,
    );
    res.end();
    senderEvents.free();
    clearTimeout(keepAliveTimeout);
  });

  let keepAliveMS = 60 * 1000;

  function keepAlive() {
    // SSE comment for keep alive. Chrome times out after two minutes.
    if (!res.closed) {
      res.write(":\n\n");
      keepAliveTimeout = setTimeout(keepAlive, keepAliveMS);
    }
  }

  keepAliveTimeout = setTimeout(keepAlive, keepAliveMS);
});

interface SignalRequest {
  publicKey: string;
  signalData: string;
}

router.post("/:type", function (req, res, next) {
  const type = req.params.type;
  if (type !== "offer" && type !== "answer") {
    res.sendStatus(400);
    return;
  }

  const body = req.body as Partial<SignalRequest>;
  if (!body.publicKey || !body.signalData) {
    res.sendStatus(400);
    return;
  }

  const state = State.get(body.publicKey);
  if (type === "offer") {
    state.setEncryptedOffer(body.signalData);
  } else if (type === "answer") {
    state.setEncryptedAnswer(body.signalData);
  }
  res.setHeader("Content-Type", "text/html");
  res.status(200).send("");
});

export default router;
