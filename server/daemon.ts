import { readFile } from "node:fs/promises";
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
