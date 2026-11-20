import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Paseo's own dictation format: 16 kHz, 16-bit mono PCM, base64 encoded. */
export const DICTATION_FORMAT = "audio/pcm;rate=16000;bits=16";

const id = z.string().min(1).max(100);

export const dictationStart = defineRpc({
  name: "dictation.start",
  input: z.object({ dictationId: id }),
  output: z.object({}),
});

export const dictationChunk = defineRpc({
  name: "dictation.chunk",
  input: z.object({ dictationId: id, seq: z.number().int().min(0), audio: z.string().max(200_000) }),
  output: z.object({}),
});

export const dictationFinish = defineRpc({
  name: "dictation.finish",
  input: z.object({ dictationId: id, finalSeq: z.number().int().min(-1) }),
  output: z.object({ text: z.string() }),
});

export const dictationCancel = defineRpc({
  name: "dictation.cancel",
  input: z.object({ dictationId: id }),
  output: z.object({}),
});
