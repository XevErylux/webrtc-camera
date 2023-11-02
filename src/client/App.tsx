import Html from "@kitajs/html";
import { Button } from "../components/Button";
import { SodiumPlus, X25519PublicKey, X25519SecretKey } from "sodium-plus";
import { syncified, syncify } from "./syncify";

interface Settings {
  secretKey: string;
  test: number;
}

function setConfig<T extends keyof Settings>(
  key: T,
  value: Settings[typeof key],
) {
  localStorage.setItem(key, JSON.stringify(value));
}
function getConfig<T extends keyof Settings>(
  key: T,
): Settings[typeof key] | null {
  const stringified = localStorage.getItem(key);
  if (typeof stringified !== "string") return null;
  return JSON.parse(stringified) as Settings[typeof key] | null;
}

function getFromHash(key: string): string | undefined {
  const hash = location.hash.split("#")[1];
  if (!hash) return;

  const ampersandSplit = hash.split("&");
  for (const item of ampersandSplit) {
    const equalsSplit = item.split("=");
    const itemKey = equalsSplit[0];
    const itemValue = equalsSplit[1];
    if (key === itemKey) {
      return itemValue;
    }
  }
}

interface KeyPair {
  secretKey: X25519SecretKey;
  publicKey: X25519PublicKey;
}

async function generateKeyPair(): Promise<KeyPair> {
  const sodium = await SodiumPlus.auto();
  const keypair = await sodium.crypto_box_keypair();
  const secretKey = await sodium.crypto_box_secretkey(keypair); // X25519SecretKey
  const publicKey = await sodium.crypto_box_publickey(keypair); // X25519PublicKey
  return { secretKey, publicKey };
}

async function loadKeyPairFromLocalStorage(): Promise<KeyPair | undefined> {
  const secretKeyText = getConfig("secretKey");
  if (!secretKeyText) return;

  const secretKey = X25519SecretKey.from(secretKeyText, "hex");

  const sodium = await SodiumPlus.auto();
  const publicKey = await sodium.crypto_box_publickey_from_secretkey(secretKey);
  return { publicKey, secretKey };
}

function storeKeyPairToLocalStorage(keyPair: KeyPair) {
  const secretKeyText = keyPair.secretKey.toString("hex");
  setConfig("secretKey", secretKeyText);
}

export const App = function () {
  function call(name: keyof ReturnType<typeof App>): string {
    return `js:app.${name}`;
  }

  let keyPair: KeyPair | undefined;

  function initReceiver(): string | undefined {
    const key = getFromHash("key");
    if (!key) return;

    // TODO: If we have a secret key, we must construct
    // the public key, fetch the offer and answer it.
    return String(
      <div>TODO: Here should have been the code for the receiver!</div>,
    );
  }

  async function initSender(): Promise<string> {
    if (!keyPair) {
      keyPair = await loadKeyPairFromLocalStorage();
    }

    if (!keyPair) {
      keyPair = await generateKeyPair();
      storeKeyPairToLocalStorage(keyPair);
    }

    return String(
      <>
        <h1>WebRTC Camera</h1>
        PublicKey: {keyPair.publicKey.toString("hex")}
        <br />
        SecretKey: {keyPair.secretKey.toString("hex")}
        <br />
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
      </>,
    );
  }

  return {
    call: call,
    init: syncify(async () => {
      return initReceiver() ?? (await initSender());
    }),
    addDiv: () => <div>Inserted by {call("addDiv")}</div>,
  };
};
