import type { PluginServerContext } from "@getpaseo/plugin/server";
import { clearAttention } from "./shared/attention";
import { DaemonConnection, daemonUrl } from "./server/daemon";
import { DictationBridge } from "./server/dictation";
import { RoleQuestions } from "./server/role-questions";
import { SpeechRenderer } from "./server/speech";
import {
  dictationCancel,
  dictationChunk,
  dictationFinish,
  dictationStart,
} from "./shared/dictation";
import { answerRoleQuestion, dismissRoleQuestion, listRoleQuestions } from "./shared/role-questions";
import { speechRender } from "./shared/speech";

export default function contribute(server: PluginServerContext) {
  const daemon = new DaemonConnection();
  const bridge = new DictationBridge(daemon);
  const speech = new SpeechRenderer(daemonUrl);
  const roleQuestions = new RoleQuestions(daemon);
  server.handle(dictationStart, (input) => bridge.start(input));
  server.handle(dictationChunk, (input) => bridge.chunk(input));
  server.handle(dictationFinish, (input) => bridge.finish(input));
  server.handle(dictationCancel, (input) => bridge.cancel(input));
  server.handle(speechRender, ({ text }) => speech.render(text));
  server.handle(clearAttention, async ({ agentIds }) => {
    await (await daemon.get()).clearAgentAttention(agentIds);
    return {};
  });
  server.handle(listRoleQuestions, (input) => roleQuestions.list(input));
  server.handle(answerRoleQuestion, (input) => roleQuestions.answer(input));
  server.handle(dismissRoleQuestion, (input) => roleQuestions.dismiss(input));
  return async () => {
    speech.close();
    await daemon.close();
  };
}
