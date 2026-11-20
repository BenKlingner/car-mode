import type { PluginServerContext } from "@getpaseo/plugin/server";
import { daemonUrl } from "./server/daemon";
import { DictationBridge } from "./server/dictation";
import { SpeechRenderer } from "./server/speech";
import {
  dictationCancel,
  dictationChunk,
  dictationFinish,
  dictationStart,
} from "./shared/dictation";
import { speechRender } from "./shared/speech";

export default function contribute(server: PluginServerContext) {
  const bridge = new DictationBridge();
  const speech = new SpeechRenderer(daemonUrl);
  server.handle(dictationStart, (input) => bridge.start(input));
  server.handle(dictationChunk, (input) => bridge.chunk(input));
  server.handle(dictationFinish, (input) => bridge.finish(input));
  server.handle(dictationCancel, (input) => bridge.cancel(input));
  server.handle(speechRender, ({ text }) => speech.render(text));
  return async () => {
    speech.close();
    await bridge.close();
  };
}
