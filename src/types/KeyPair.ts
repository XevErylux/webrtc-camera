import { SodiumPlus, X25519PublicKey, X25519SecretKey } from "sodium-plus";
import { getConfig, setConfig } from "../client/Config";

export interface KeyPair {
  secretKey: X25519SecretKey;
  publicKey: X25519PublicKey;
}

export async function generateKeyPair(): Promise<KeyPair> {
  const sodium = await SodiumPlus.auto();
  const keypair = await sodium.crypto_box_keypair();
  const secretKey = await sodium.crypto_box_secretkey(keypair); // X25519SecretKey
  const publicKey = await sodium.crypto_box_publickey(keypair); // X25519PublicKey
  return { secretKey, publicKey };
}

export async function reconstructKeyPairFromSecret(secretKey: X25519SecretKey) {
  const sodium = await SodiumPlus.auto();
  const publicKey = await sodium.crypto_box_publickey_from_secretkey(secretKey);
  return { publicKey, secretKey };
}

export async function loadKeyPairFromLocalStorage(): Promise<
  KeyPair | undefined
> {
  const secretKeyText = getConfig("secretKey");
  if (!secretKeyText) return;

  return await reconstructKeyPairFromSecret(
    X25519SecretKey.from(secretKeyText, "hex"),
  );
}

export function storeKeyPairToLocalStorage(keyPair: KeyPair) {
  const secretKeyText = keyPair.secretKey.toString("hex");
  setConfig("secretKey", secretKeyText);
}
