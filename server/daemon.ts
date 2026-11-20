import { readFile } from "node:fs/promises";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { homedir } from "node:os";
import { join } from "node:path";

/** The daemon's WebSocket address from its config, defaulting to Paseo's standard port. */
export async function daemonUrl(): Promise<string> {
  const home = process.env.PASEO_HOME || join(homedir(), ".paseo");
  let listen = "127.0.0.1:6767";
  try {
    const config = JSON.parse(await readFile(join(home, "config.json"), "utf8")) as {
      daemon?: { listen?: unknown };
    };
    if (typeof config.daemon?.listen === "string" && /:\d+$/.test(config.daemon.listen)) {
      listen = config.daemon.listen;
    }
  } catch {
    // No readable config: use the default address.
  }
  const [host, port] = [listen.slice(0, listen.lastIndexOf(":")), listen.slice(listen.lastIndexOf(":") + 1)];
  const reachable = host === "0.0.0.0" || host === "::" || host === "" ? "127.0.0.1" : host;
  return `ws://${reachable}:${port}/ws`;
}

/**
 * One lazily opened connection to the local daemon, for the few things plugins get no API for
 * (dictation, clearing attention). Reconnects on next use after a drop.
 */
export class DaemonConnection {
  private client: DaemonClient | null = null;
  private connecting: Promise<DaemonClient> | null = null;

  get current(): DaemonClient | null {
    return this.client;
  }

  async get(): Promise<DaemonClient> {
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
          clientId: `car-mode-${process.pid}`,
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

  async close() {
    const client = this.client;
    this.client = null;
    this.connecting = null;
    await client?.close().catch(() => {});
  }
}
