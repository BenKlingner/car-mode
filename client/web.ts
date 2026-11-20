import { Platform } from "react-native";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface KeyInit {
  key: string;
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  bubbles: boolean;
  cancelable: boolean;
}
interface AudioProcessEvent {
  readonly inputBuffer: { getChannelData(channel: number): Float32Array };
}
interface AudioNodeLike {
  connect(node: AudioNodeLike): void;
  disconnect(): void;
}
interface ProcessorNode extends AudioNodeLike {
  onaudioprocess: ((event: AudioProcessEvent) => void) | null;
}
interface AudioContextLike {
  readonly sampleRate: number;
  readonly destination: AudioNodeLike;
  createMediaStreamSource(stream: MediaStreamLike): AudioNodeLike;
  createScriptProcessor(bufferSize: number, inputs: number, outputs: number): ProcessorNode;
  resume(): Promise<void>;
  close(): Promise<void>;
}
interface MediaStreamLike {
  getTracks(): { stop(): void }[];
}
declare const window: {
  AudioContext?: new () => AudioContextLike;
  webkitAudioContext?: new () => AudioContextLike;
};
declare const navigator: {
  mediaDevices?: { getUserMedia(constraints: unknown): Promise<MediaStreamLike> };
};
declare function btoa(data: string): string;
declare const document: { body: { dispatchEvent(event: unknown): boolean } };
declare const KeyboardEvent: new (type: string, init: KeyInit) => unknown;

export const canToggleSidebar = Platform.OS === "web";

/**
 * Paseo has no plugin API for the sidebar, so press its own shortcut: Ctrl+B, or Cmd+B on a Mac.
 * Each binding only applies on its own platform, so sending both toggles exactly once.
 */
export function toggleLeftSidebar(): void {
  if (!canToggleSidebar) return;
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "b", code: "KeyB", bubbles: true, cancelable: true, ...modifier }),
    );
  }
}

const TARGET_RATE = 16000;
/** Send audio about four times a second. */
const CHUNK_SAMPLES = TARGET_RATE / 4;

export const canRecord =
  Platform.OS === "web" &&
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof window !== "undefined" &&
  !!(window.AudioContext ?? window.webkitAudioContext);

export interface Recorder {
  /** Stops the microphone and delivers any audio still buffered. */
  stop(): Promise<void>;
}

/**
 * Records the microphone as 16 kHz 16-bit mono PCM, the format Paseo's dictation expects,
 * and hands base64 chunks to `onChunk`.
 */
export async function startRecorder(onChunk: (base64: string) => void): Promise<Recorder> {
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!canRecord || !Ctx || !navigator.mediaDevices) throw new Error("unsupported");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const context = new Ctx();
  await context.resume().catch(() => {});
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const ratio = context.sampleRate / TARGET_RATE;
  let pending: number[] = [];
  let carry = 0;

  const flush = (all: boolean) => {
    while (pending.length >= CHUNK_SAMPLES || (all && pending.length > 0)) {
      const take = pending.splice(0, CHUNK_SAMPLES);
      onChunk(pcmToBase64(take));
    }
  };

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    // Average each window of input samples down to one 16 kHz sample.
    let position = carry;
    while (position + ratio <= input.length) {
      const from = Math.floor(position);
      const to = Math.min(input.length, Math.floor(position + ratio));
      let sum = 0;
      for (let i = from; i < to; i++) sum += input[i];
      pending.push(to > from ? sum / (to - from) : input[from]);
      position += ratio;
    }
    carry = position - input.length;
    if (carry < 0) carry = 0;
    flush(false);
  };
  source.connect(processor);
  processor.connect(context.destination);

  let stopped = false;
  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      for (const track of stream.getTracks()) track.stop();
      await context.close().catch(() => {});
      flush(true);
      pending = [];
    },
  };
}

function pcmToBase64(samples: number[]): string {
  let binary = "";
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    const value = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    const unsigned = value & 0xffff;
    binary += String.fromCharCode(unsigned & 0xff, unsigned >> 8);
  }
  return btoa(binary);
}

/**
 * Paseo's Markdown component has no size option, so on web scale its container with CSS zoom,
 * which reflows text instead of just stretching it. Native apps keep the normal size.
 */
export function zoomElement(node: unknown, zoom: number): void {
  if (Platform.OS !== "web" || !node) return;
  const style = (node as { style?: { zoom?: string } }).style;
  if (style) style.zoom = String(zoom);
}
