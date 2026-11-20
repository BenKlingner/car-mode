import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Turns one short piece of text into a WAV file with the Kokoro voice Paseo uses. */
export const speechRender = defineRpc({
  name: "speech.render",
  input: z.object({ text: z.string().min(1).max(1000) }),
  output: z.instanceof(Uint8Array),
});

const MAX_CHUNK = 220;

/**
 * Reads naturally aloud: drops Markdown syntax and code, then splits into short pieces
 * so playback can start quickly and the next piece renders while one plays.
 */
export function speechChunks(markdown: string): string[] {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " (code block) ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*\|?\s*:?-{2,}.*$/gm, "")
    .replace(/\|/g, ", ")
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2")
    .replace(/[ \t]+/g, " ");

  const sentences = text
    .split(/\n{1,}/)
    .flatMap((line) => line.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => /[a-z0-9]/i.test(s));

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    for (const piece of splitLong(sentence)) {
      if (current && current.length + piece.length + 1 > MAX_CHUNK) {
        chunks.push(current);
        current = piece;
      } else {
        current = current ? `${current} ${piece}` : piece;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitLong(sentence: string): string[] {
  if (sentence.length <= MAX_CHUNK) return [sentence];
  const words = sentence.split(" ");
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + word.length + 1 > MAX_CHUNK) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) out.push(current);
  return out;
}
