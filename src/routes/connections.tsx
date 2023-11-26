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

class SenderState {
  private static activeStates: Record<string, SenderState> = {};

  private readonly listeners: SenderEvents[] = [];
  private encryptedOffer?: string;

  private constructor(public readonly publicKey: string) {}

  static get(publicKey: string): SenderState {
    return (
      SenderState.activeStates[publicKey] ??
      (SenderState.activeStates[publicKey] = new SenderState(publicKey))
    );
  }

  openListener(
    type: ListenerType,
    response: Response<any, Record<string, any>, number>,
  ): SenderEvents {
    const listener = new SenderEvents(this, type, response);
    this.listeners.push(listener);
    if (this.encryptedOffer) {
      listener.send("receiver", this.encryptedOffer, "offer");
    }
    return listener;
  }

  closeListener(listener: SenderEvents): boolean {
    const listeners = this.listeners;
    const index = listeners.indexOf(listener, 0);
    if (index > -1) {
      listeners.splice(index, 1);
      return true;
    }
    return false;
  }

  setEncryptedOffer(data: string) {
    this.encryptedOffer = data;
    this.send("receiver", data, "offer");
  }

  private send(type: ListenerType, data: string, event?: string) {
    for (const listener of this.listeners) {
      listener.send(type, data, event);
    }
  }
}

class SenderEvents {
  constructor(
    private readonly state: SenderState,
    private readonly type: ListenerType,
    private readonly response: Response<any, Record<string, any>, number>,
  ) {}

  send(type: ListenerType, data: string, event?: string) {
    if (this.type !== type)
    return;

    const response = this.response;
    if (event) {
      response.write(`event: ${event}\ndata: ${data}\n\n`);
    } else {
      response.write(`data: ${data}\n\n`);
    }
  }

  end() {
    this.response.end();
  }

  free() {
    this.state.closeListener(this);
  }
}

router.get("/sender-events/:publicKey", function (req, res, next) {
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(":\n\n");

  const publicKey = req.params.publicKey;
  console.log(
    `sender client ${publicKey}:${req.socket.remotePort} established connection`,
  );

  const senderState = SenderState.get(publicKey);
  const senderEvents = senderState.openListener("sender", res);

  let keepAliveTimeout: NodeJS.Timeout;

  // If client closes connection, stop sending events
  res.on("close", () => {
    console.log(
      `sender client ${publicKey}:${req.socket.remotePort} dropped connection`,
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

interface OfferRequest {
  publicKey: string;
  signalData: string;
}

router.post("/offer", function (req, res, next) {
  const body = req.body as Partial<OfferRequest>;
  if (!body.publicKey || !body.signalData) {
    res.sendStatus(400);
    return;
  }

  const state = SenderState.get(body.publicKey);
  state.setEncryptedOffer(body.signalData);
  res.setHeader("Content-Type", "text/html");
  res.status(200).send("");
});

export default router;
