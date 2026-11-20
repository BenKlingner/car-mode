import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { RpcInput } from "@getpaseo/plugin";
import {
  DICTATION_FORMAT,
  type dictationCancel,
  type dictationChunk,
  type dictationFinish,
  type dictationStart,
} from "../shared/dictation";
import { daemonUrl } from "./daemon";

/**
 * Plugins get no dictation API, so this connects to the local daemon the way the Paseo app does
 * and uses its dictation stream. Speech is transcribed by whatever engine Paseo is set up with.
 */
export class DictationBridge {
  private client: DaemonClient | null = null;
  private connecting: Promise<DaemonClient> | null = null;

  async start({ dictationId }: RpcInput<typeof dictationStart>) {
    const client = await this.connected();
    await client.startDictationStream(dictationId, DICTATION_FORMAT);
    return {};
  }

  async chunk({ dictationId, seq, audio }: RpcInput<typeof dictationChunk>) {
    const client = await this.connected();
    client.sendDictationStreamChunk(dictationId, seq, audio, DICTATION_FORMAT);
    return {};
  }

  async finish({ dictationId, finalSeq }: RpcInput<typeof dictationFinish>) {
    const client = await this.connected();
    if (finalSeq < 0) {
      client.cancelDictationStream(dictationId);
      return { text: "" };
    }
    const result = await client.finishDictationStream(dictationId, finalSeq);
    return { text: result.text };
  }

  async cancel({ dictationId }: RpcInput<typeof dictationCancel>) {
    this.client?.cancelDictationStream(dictationId);
    return {};
  }

  async close() {
    const client = this.client;
    this.client = null;
    this.connecting = null;
    await client?.close().catch(() => {});
  }

  private async connected(): Promise<DaemonClient> {
    if (this.client?.isConnected) return this.client;
    if (this.client) {
      const stale = this.client;
      this.client = null;
      void stale.close().catch(() => {});
    }
    this.connecting ??= (async () => {
      try {
        const client = new DaemonClient({
          url: await daemonUrl(),
          clientId: `car-mode-dictation-${process.pid}`,
          clientType: "browser",
          reconnect: { enabled: false },
        });
        await client.connect();
        this.client = client;
        return client;
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }
}

