import type { PluginClientContext } from "@getpaseo/plugin/client";

type PlayAudio = PluginClientContext["playAudio"];

let player: PlayAudio | null = null;

/** Screens can't reach the client context, so the entry hands its player over here. */
export function setAudioPlayer(play: PlayAudio | null): void {
  player = play;
}

export function audioPlayer(): PlayAudio | null {
  return player;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 without btoa, so it works the same in the browser and the native apps. */
export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let line = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    line +=
      ALPHABET[(n >> 18) & 63] +
      ALPHABET[(n >> 12) & 63] +
      (i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : "=") +
      (i + 2 < bytes.length ? ALPHABET[n & 63] : "=");
    if (line.length >= 8192) {
      parts.push(line);
      line = "";
    }
  }
  parts.push(line);
  return parts.join("");
}
