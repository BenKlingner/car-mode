import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { speechChunks, speechRender } from "../shared/speech";
import { audioPlayer, toBase64 } from "./audio";

export type ReadAloudPhase = "idle" | "preparing" | "playing";

/**
 * Reads text aloud with Paseo's Kokoro voice. Each sentence group renders on the daemon
 * machine while the previous one plays. Stop takes effect after the current piece.
 */
export function useReadAloud(onError: (message: string) => void) {
  const render = useRpc(speechRender);
  const [phase, setPhase] = useState<ReadAloudPhase>("idle");
  const run = useRef(0);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  async function start(markdown: string) {
    const play = audioPlayer();
    if (!play) {
      errorRef.current("Audio playback isn't available here.");
      return;
    }
    const chunks = speechChunks(markdown);
    if (chunks.length === 0) return;
    const id = ++run.current;
    setPhase("preparing");
    try {
      let next = render({ text: chunks[0] });
      for (let i = 0; i < chunks.length; i++) {
        const audio = await next;
        if (run.current !== id) return;
        // Render the following piece while this one plays.
        if (i + 1 < chunks.length) {
          next = render({ text: chunks[i + 1] });
          next.catch(() => {});
        }
        setPhase("playing");
        await play({ base64: toBase64(audio), mimeType: "audio/wav" });
        if (run.current !== id) return;
      }
    } catch (error) {
      if (run.current === id) {
        errorRef.current(`Couldn't read it aloud: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      if (run.current === id) setPhase("idle");
    }
  }

  function stop() {
    run.current++;
    setPhase("idle");
  }

  // Stop when leaving the screen.
  useEffect(
    () => () => {
      run.current++;
    },
    [],
  );

  return { phase, start, stop };
}
