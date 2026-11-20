import type { RpcInput } from "@getpaseo/plugin";
import {
  DICTATION_FORMAT,
  type dictationCancel,
  type dictationChunk,
  type dictationFinish,
  type dictationStart,
} from "../shared/dictation";
import type { DaemonConnection } from "./daemon";

/**
 * Plugins get no dictation API, so this connects to the local daemon the way the Paseo app does
 * and uses its dictation stream. Speech is transcribed by whatever engine Paseo is set up with.
 */
export class DictationBridge {
  constructor(private readonly daemon: DaemonConnection) {}

  async start({ dictationId }: RpcInput<typeof dictationStart>) {
    const client = await this.daemon.get();
    await client.startDictationStream(dictationId, DICTATION_FORMAT);
    return {};
  }

  async chunk({ dictationId, seq, audio }: RpcInput<typeof dictationChunk>) {
    const client = await this.daemon.get();
    client.sendDictationStreamChunk(dictationId, seq, audio, DICTATION_FORMAT);
    return {};
  }

  async finish({ dictationId, finalSeq }: RpcInput<typeof dictationFinish>) {
    const client = await this.daemon.get();
    if (finalSeq < 0) {
      client.cancelDictationStream(dictationId);
      return { text: "" };
    }
    const result = await client.finishDictationStream(dictationId, finalSeq);
    return { text: result.text };
  }

  async cancel({ dictationId }: RpcInput<typeof dictationCancel>) {
    this.daemon.current?.cancelDictationStream(dictationId);
    return {};
  }
}
