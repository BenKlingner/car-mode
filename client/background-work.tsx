import type { PaseoAgentBackgroundWorkItem } from "@getpaseo/client";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { BigButton, type Sizes, timeAgo } from "./ui";

/** Shells and tasks an agent left running, with a Stop button for each one that can stop. */
export function BackgroundWork({
  agentId,
  count,
  theme,
  sizes,
}: {
  agentId: string;
  count: number;
  theme: PluginScreenProps["theme"];
  sizes: Sizes;
}) {
  const paseo = usePaseo();
  const c = theme.colors;
  const [items, setItems] = useState<PaseoAgentBackgroundWorkItem[]>([]);
  const [stopping, setStopping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (count === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    paseo.agents
      .ref(agentId)
      .backgroundWork.list({ timeout: 10_000 })
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(message(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [paseo, agentId, count]);

  if (count === 0 && items.length === 0) return null;

  async function stop(item: PaseoAgentBackgroundWorkItem) {
    setStopping(item.id);
    setError(null);
    try {
      const handle = paseo.agents.ref(agentId);
      await handle.backgroundWork.stop(item, { timeout: 15_000 });
      setItems(await handle.backgroundWork.list({ timeout: 10_000 }));
    } catch (reason) {
      setError(`Could not stop it: ${message(reason)}`);
    } finally {
      setStopping(null);
    }
  }

  const now = Date.now();
  return (
    <View style={{ gap: sizes.gap * 0.6 }}>
      <Text style={{ color: c.foregroundMuted, fontSize: sizes.small, fontWeight: "800" }}>
        BACKGROUND WORK
      </Text>
      {items.length === 0 ? (
        <Text style={{ color: c.foregroundMuted, fontSize: sizes.body }}>
          {count} running. Loading details…
        </Text>
      ) : null}
      {items.map((item) => (
        <View
          key={item.id}
          style={{
            gap: sizes.gap * 0.6,
            padding: sizes.pad * 0.75,
            borderRadius: sizes.radius,
            borderWidth: 2,
            borderColor: c.border,
            backgroundColor: c.surface1,
          }}
        >
          <Text numberOfLines={3} style={{ color: c.foreground, fontSize: sizes.body, fontFamily: "monospace" }}>
            {item.description?.trim() || item.command?.trim() || item.kind}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sizes.gap }}>
            <Text style={{ flex: 1, minWidth: 140, color: c.foregroundMuted, fontSize: sizes.small }}>
              {item.kind}
              {item.startedAt ? ` · started ${timeAgo(item.startedAt, now)}` : ""}
            </Text>
            {item.canStop ? (
              <BigButton
                label={stopping === item.id ? "Stopping…" : "Stop"}
                tone="danger"
                disabled={stopping !== null}
                onPress={() => void stop(item)}
                theme={theme}
                sizes={sizes}
              />
            ) : null}
          </View>
        </View>
      ))}
      {error ? <Text style={{ color: c.statusDanger, fontSize: sizes.body }}>{error}</Text> : null}
    </View>
  );
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
