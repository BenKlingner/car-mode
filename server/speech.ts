import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";

interface OfflineTts {
  generateAsync(args: {
    text: string;
    sid: number;
    speed: number;
    enableExternalBuffer: boolean;
  }): Promise<{ samples: Float32Array | number[]; sampleRate: number }>;
}

const SHERPA_PACKAGE = "sherpa-onnx-node";
const IDLE_UNLOAD_MS = 5 * 60 * 1000;
const KOKORO_FILES = ["model.onnx", "voices.bin", "tokens.txt", "espeak-ng-data"];

/**
 * Text to speech with the Kokoro model Paseo already downloaded for voice mode. The model
 * takes a few hundred MB, so it loads on first use and unloads after a few idle minutes.
 */
export class SpeechRenderer {
  private tts: OfflineTts | null = null;
  private loading: Promise<OfflineTts> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly daemonUrl: () => Promise<string>) {}

  render(text: string): Promise<Uint8Array> {
    // The native engine is not reentrant: one generation at a time.
    const result = this.queue.then(() => this.generate(text));
    this.queue = result.catch(() => undefined);
    return result;
  }

  close() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.tts = null;
    this.loading = null;
  }

  private async generate(text: string): Promise<Uint8Array> {
    const tts = await this.engine();
    const audio = await tts.generateAsync({ text, sid: 0, speed: 1.0, enableExternalBuffer: false });
    this.scheduleUnload();
    const samples = audio.samples instanceof Float32Array ? audio.samples : Float32Array.from(audio.samples);
    return wav(samples, audio.sampleRate);
  }

  private scheduleUnload() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.tts = null;
    }, IDLE_UNLOAD_MS);
  }

  private async engine(): Promise<OfflineTts> {
    if (this.tts) return this.tts;
    this.loading ??= (async () => {
      try {
        const { modelDir: dir, pluginDir } = await this.locate();
        // Paseo bundles plugin server code and can't bundle this native module, so load it
        // at runtime from this plugin's own node_modules.
        const sherpa = createRequire(join(pluginDir, "package.json"))(SHERPA_PACKAGE) as {
          OfflineTts?: new (config: unknown) => OfflineTts;
        };
        const OfflineTtsCtor = sherpa.OfflineTts;
        if (!OfflineTtsCtor) throw new Error("The speech engine could not be loaded.");
        const tts = new OfflineTtsCtor({
          model: {
            numThreads: 4,
            provider: "cpu",
            kokoro: {
              model: join(dir, "model.onnx"),
              voices: join(dir, "voices.bin"),
              tokens: join(dir, "tokens.txt"),
              dataDir: join(dir, "espeak-ng-data"),
              lengthScale: 1.0,
            },
          },
          maxNumSentences: 1,
        });
        this.tts = tts;
        return tts;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /**
   * Finds this plugin's folder (the daemon knows it; the bundled code doesn't) and Paseo's
   * selected voice model when it is a Kokoro one, else any installed Kokoro model.
   */
  private async locate(): Promise<{ modelDir: string; pluginDir: string }> {
    const root = join(process.env.PASEO_HOME || join(homedir(), ".paseo"), "models", "local-speech");
    const usable = (id: string) => KOKORO_FILES.every((name) => existsSync(join(root, id, name)));
    let candidates: string[] = [];
    let pluginDir: string | null = null;
    try {
      const client = new DaemonClient({
        url: await this.daemonUrl(),
        clientId: `car-mode-speech-${process.pid}`,
        clientType: "browser",
        reconnect: { enabled: false },
      });
      await client.connect();
      try {
        const plugins = await client.listPlugins();
        const mine = (path: string) => existsSync(join(path, "node_modules", SHERPA_PACKAGE, "package.json"));
        pluginDir =
          plugins.find((p) => p.id === "car-mode" && p.path && mine(p.path))?.path ??
          plugins.find((p) => p.path && mine(p.path))?.path ??
          null;
        const models = await client.listLocalSpeechModels();
        candidates = models
          .filter((m) => m.kind === "tts" && m.status === "installed" && m.id.startsWith("kokoro"))
          .sort((a, b) => Number(b.inUse) - Number(a.inUse))
          .map((m) => m.id);
      } finally {
        await client.close().catch(() => {});
      }
    } catch {
      // The daemon could not be asked; fall back to the standard model.
    }
    if (!pluginDir) throw new Error("Couldn't find car mode's install folder to load the voice engine.");
    candidates.push("kokoro-en-v0_19");
    const found = candidates.find(usable);
    if (!found) {
      throw new Error("No Kokoro voice is installed. Download Kokoro in Paseo's voice settings.");
    }
    return { modelDir: join(root, found), pluginDir };
  }
}

/** 16-bit mono PCM WAV. */
function wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}
