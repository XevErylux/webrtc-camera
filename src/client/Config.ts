import { KeyPair } from "../types/KeyPair";

export interface VideoInputDeviceSelection {
  label: string;
  autoSelected: boolean;
}

export interface Settings {
  secretKey: string;
  videoInputDevice: VideoInputDeviceSelection[];
  videoBitrate: number;
}

export const minVideoBitrateValue = 1;
export const maxVideoBitrateValue = 16;

export function setConfig<T extends keyof Settings>(
  key: T,
  value: Settings[typeof key],
) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function getConfig<T extends keyof Settings>(
  key: T,
  defaultValue: Settings[typeof key],
): Settings[typeof key];
export function getConfig<T extends keyof Settings>(
  key: T,
): Settings[typeof key] | null;
export function getConfig<T extends keyof Settings>(
  key: T,
  defaultValue: Settings[typeof key] | null = null,
): Settings[typeof key] | null {
  const stringified = localStorage.getItem(key);
  if (typeof stringified !== "string") return defaultValue;
  return JSON.parse(stringified) as Settings[typeof key];
}

