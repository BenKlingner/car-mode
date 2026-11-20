import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { dictationCancel, dictationChunk, dictationFinish, dictationStart } from "../shared/dictation";
import { canRecord, type Recorder, startRecorder } from "./web";

export type DictationPhase = "idle" | "starting" | "listening" | "transcribing";

interface Session {
  id: string;
  recorder: Recorder | null;
  seq: number;
  /** Chunks go out one after another, in order. */
  queue: Promise<unknown>;
  cancelled: boolean;
}

/**
 * Voice typing through Paseo's own speech engine on the daemon machine: the browser records,
 * the plugin server streams the audio to the daemon, and the transcript comes back on stop.
 */
export function useDictation(handlers: {
  onText: (text: string) => void;
  onError: (message: string) => void;
}) {
  const start = useRpc(dictationStart);
  const chunk = useRpc(dictationChunk);
  const finish = useRpc(dictationFinish);
  const cancelRpc = useRpc(dictationCancel);
  const [phase, setPhase] = useState<DictationPhase>("idle");
  const session = useRef<Session | null>(null);
  const latest = useRef(handlers);
  latest.current = handlers;

  async function begin() {
    if (!canRecord) {
      latest.current.onError("This browser can't record from the microphone.");
      return;
    }
    const current: Session = {
      id: `car-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      recorder: null,
      seq: 0,
      queue: Promise.resolve(),
      cancelled: false,
    };
    session.current = current;
    setPhase("starting");
    try {
      await start({ dictationId: current.id });
      const recorder = await startRecorder((audio) => {
        if (current.cancelled) return;
        const seq = current.seq++;
        current.queue = current.queue.then(() => chunk({ dictationId: current.id, seq, audio }));
      });
      if (current.cancelled) {
        await recorder.stop();
        return;
      }
      current.recorder = recorder;
      setPhase("listening");
    } catch (error) {
      abandon(current);
      latest.current.onError(describe(error));
    }
  }

  async function end() {
    const current = session.current;
    if (!current?.recorder) return;
    setPhase("transcribing");
    try {
      await current.recorder.stop();
      await current.queue;
      const { text } = await finish({ dictationId: current.id, finalSeq: current.seq - 1 });
      if (current.cancelled) return;
      session.current = null;
      setPhase("idle");
      if (text.trim()) latest.current.onText(text.trim());
      else latest.current.onError("Didn't catch anything. Try again a little closer to the mic.");
    } catch (error) {
      abandon(current);
      latest.current.onError(describe(error));
    }
  }

  function abandon(current: Session) {
    current.cancelled = true;
    void current.recorder?.stop();
    void cancelRpc({ dictationId: current.id }).catch(() => {});
    if (session.current === current) {
      session.current = null;
      setPhase("idle");
    }
  }

  function toggle() {
    if (phase === "idle") void begin();
    else if (phase === "listening") void end();
  }

  function cancel() {
    if (session.current) abandon(session.current);
  }

  // Release the microphone when the screen goes away.
  useEffect(
    () => () => {
      if (session.current) abandon(session.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { phase, toggle, cancel };
}

function describe(error: unknown): string {
  const name = (error as { name?: unknown })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was blocked. Allow it for this site and try again.";
  }
  if (name === "NotFoundError") return "No microphone was found.";
  const message = error instanceof Error ? error.message : String(error);
  return `Voice typing failed: ${message}`;
}
