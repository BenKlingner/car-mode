import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { agentTitle, backgroundCount, type CarAgent, carStatus } from "./agents";
import { BackgroundWork } from "./background-work";
import { PermissionCard } from "./permission-card";
import { Markdown } from "@getpaseo/plugin/client/ui";
import { barButtonSizes, BigButton, IconButton, type Sizes, StatusBadge, StatusRow } from "./ui";
import { useReadAloud } from "./read-aloud";
import { useDictation } from "./dictation";
import { canToggleSidebar, toggleLeftSidebar, zoomElement } from "./web";

const QUICK_REPLIES = ["Continue", "Yes, go ahead", "No, stop", "Summarize where you are"];

interface Props {
  entry: CarAgent;
  helpers: CarAgent[];
  onOpenAgent: (agentId: string) => void;
  theme: PluginScreenProps["theme"];
  sizes: Sizes;
  navigation: PluginScreenProps["navigation"];
  onBack: () => void;
}

export function AgentView({ entry, helpers, onOpenAgent, theme, sizes, navigation, onBack }: Props) {
  const paseo = usePaseo();
  const { agent, projectName } = entry;
  const status = carStatus(agent);
  const c = theme.colors;
  const [draft, setDraft] = useState("");
  const [inputWidth, setInputWidth] = useState(400);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const latest = useLatestReplies(agent.id, agent.updatedAt);
  const [showAllReplies, setShowAllReplies] = useState(false);
  const hiddenReplies = showAllReplies ? 0 : Math.max(0, latest.replies.length - SHOWN_REPLIES);
  const visibleReplies = latest.replies.slice(hiddenReplies);
  const permissions = agent.pendingPermissions ?? [];
  const dictation = useDictation({
    onText: (text) => {
      setNotice(null);
      setDraft((current) => (current.trim() ? `${current.trim()} ${text}` : text));
    },
    onError: (message) => setNotice({ text: message, error: true }),
  });

  const reading = useReadAloud((message) => setNotice({ text: message, error: true }));

  useEffect(() => setShowAllReplies(false), [agent.id]);
  // Stop reading aloud when switching to another agent.
  useEffect(() => reading.stop, [agent.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop listening when switching to another agent.
  useEffect(() => dictation.cancel, [agent.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text: string) {
    dictation.cancel();
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setNotice(null);
    try {
      await paseo.agents.ref(agent.id).send(message);
      setDraft("");
      setNotice({ text: "Sent", error: false });
    } catch (error) {
      setNotice({ text: `Could not send: ${errorText(error)}`, error: true });
    } finally {
      setSending(false);
    }
  }

  const bar = barButtonSizes(sizes);
  // Listen reads only the newest reply; a whole turn can be long.
  const readable = latest.replies[latest.replies.length - 1] ?? "";

  // The message box hugs its text: one line when empty, up to about four lines.
  const inputLine = Math.round(sizes.body * 1.3);
  const inputPadV = Math.max(6, Math.round((sizes.buttonHeight - inputLine - 4) / 2));
  const inputMin = sizes.buttonHeight;
  const inputMax = inputLine * 4 + inputPadV * 2 + 4;
  // Sized from the text alone. Feeding the browser's measured height back into the height
  // can loop render after render and crash the screen, so the measurement isn't used.
  const charsPerLine = Math.max(10, Math.floor((inputWidth - sizes.gap * 2) / (sizes.body * 0.55)));
  const estimatedLines = draft
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  const estimated = estimatedLines * inputLine + inputPadV * 2 + 4;
  const inputHeight = draft
    ? Math.min(inputMax, Math.max(inputMin, estimated))
    : inputMin;

  return (
    <View style={{ flex: 1, backgroundColor: c.surface0 }}>
      {/* Pinned top bar: always reachable without scrolling. */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: sizes.gap * 0.75,
          paddingHorizontal: sizes.pad,
          paddingVertical: sizes.gap * 0.6,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
          backgroundColor: c.surface0,
        }}
      >
        {canToggleSidebar ? (
          <IconButton
            icon="PanelLeft"
            label="Show or hide the sidebar"
            onPress={toggleLeftSidebar}
            theme={theme}
            sizes={sizes}
          />
        ) : null}
        <BigButton label="‹  All agents" onPress={onBack} theme={theme} sizes={bar} />
        <BigButton
          label={
            reading.phase === "preparing"
              ? "Preparing…"
              : reading.phase === "playing"
                ? "■  Stop reading"
                : "🔊  Listen"
          }
          tone={reading.phase === "idle" ? "neutral" : "accent"}
          disabled={reading.phase === "idle" && !readable}
          onPress={() => (reading.phase === "idle" ? void reading.start(readable) : reading.stop())}
          theme={theme}
          sizes={bar}
          accessibilityLabel={
            reading.phase === "idle" ? "Read the newest reply aloud" : "Stop reading aloud"
          }
        />
        <View style={{ flex: 1 }} />
        {navigation ? (
          <BigButton
            label="Open full view"
            onPress={() => navigation.openAgent({ agentId: agent.id })}
            theme={theme}
            sizes={bar}
          />
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: sizes.pad, gap: sizes.gap * 1.5 }}
        keyboardShouldPersistTaps="handled"
      >
      <View style={{ gap: sizes.gap * 0.6 }}>
        <Text style={{ color: c.foreground, fontSize: sizes.heading, fontWeight: "800" }}>
          {entry.workspaceName ?? agentTitle(agent)}
        </Text>
        {entry.workspaceName && entry.workspaceName !== agentTitle(agent) ? (
          <Text numberOfLines={2} style={{ color: c.foregroundMuted, fontSize: sizes.body }}>
            {agentTitle(agent)}
          </Text>
        ) : null}
        <Text style={{ color: c.foregroundMuted, fontSize: sizes.body }}>{projectName}</Text>
        <StatusRow
          status={status}
          helpersWorking={helpers.filter((h) => carStatus(h.agent) === "working").length}
          helpersNeedYou={helpers.filter((h) => carStatus(h.agent) === "needs-you").length}
          theme={theme}
          sizes={sizes}
        />
        {agent.lastError && status === "error" ? (
          <Text style={{ color: c.statusDanger, fontSize: sizes.body }}>{agent.lastError}</Text>
        ) : null}
      </View>

      {permissions.map((request) => (
        <PermissionCard
          key={request.id}
          agentId={agent.id}
          request={request}
          theme={theme}
          sizes={sizes}
          onResult={(text, error) => setNotice({ text, error })}
        />
      ))}

      <View
        style={{
          padding: sizes.pad,
          gap: sizes.gap * 0.6,
          borderRadius: sizes.radius,
          backgroundColor: c.surface1,
          borderWidth: 2,
          borderColor: c.border,
        }}
      >
        <Text style={{ color: c.foregroundMuted, fontSize: sizes.small, fontWeight: "800" }}>
          LATEST FROM THE AGENT
        </Text>
        {latest.status === "loading" ? (
          <Text style={{ color: c.foregroundMuted, fontSize: sizes.body }}>Loading…</Text>
        ) : latest.replies.length === 0 ? (
          <Text style={{ color: c.foregroundMuted, fontSize: sizes.body }}>
            No reply yet since your last message.
          </Text>
        ) : (
          <>
            {hiddenReplies > 0 ? (
              <BigButton
                label={`Show ${hiddenReplies} earlier ${hiddenReplies === 1 ? "reply" : "replies"}`}
                onPress={() => setShowAllReplies(true)}
                theme={theme}
                sizes={sizes}
              />
            ) : null}
            {visibleReplies.map((reply, index) => (
              <View
                key={`${hiddenReplies + index}`}
                style={
                  index > 0
                    ? { borderTopWidth: 1, borderTopColor: c.border, paddingTop: sizes.gap }
                    : undefined
                }
              >
                {/* Paseo's Markdown is 15px; 1.3x makes it about 20px. */}
                <View ref={(node) => zoomElement(node, REPLY_ZOOM)}>
                  <Markdown>{reply}</Markdown>
                </View>
              </View>
            ))}
          </>
        )}
      </View>

      <BackgroundWork
        agentId={agent.id}
        count={backgroundCount(agent)}
        theme={theme}
        sizes={sizes}
      />

      {helpers.length > 0 ? (
        <View style={{ gap: sizes.gap * 0.6 }}>
          <Text style={{ color: c.foregroundMuted, fontSize: sizes.small, fontWeight: "800" }}>
            HELPER AGENTS
          </Text>
          {helpers.map((helper) => (
            <Pressable
              key={helper.agent.id}
              accessibilityRole="button"
              accessibilityLabel={`Open helper ${helper.agent.title ?? "Untitled agent"}`}
              onPress={() => onOpenAgent(helper.agent.id)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: sizes.gap,
                minHeight: sizes.buttonHeight,
                paddingHorizontal: sizes.pad,
                paddingVertical: sizes.gap * 0.6,
                borderRadius: sizes.radius,
                borderWidth: 2,
                borderColor: c.border,
                backgroundColor: c.surface1,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Text
                numberOfLines={1}
                style={{ flex: 1, minWidth: 160, color: c.foreground, fontSize: sizes.body, fontWeight: "700" }}
              >
                {helper.agent.title?.trim() || "Untitled agent"}
              </Text>
              <StatusBadge status={carStatus(helper.agent)} theme={theme} sizes={sizes} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ gap: sizes.gap * 0.6 }}>
        <Text style={{ color: c.foregroundMuted, fontSize: sizes.small, fontWeight: "800" }}>
          QUICK REPLIES
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sizes.gap }}>
          {QUICK_REPLIES.map((reply) => (
            <BigButton
              key={reply}
              label={reply}
              disabled={sending}
              onPress={() => void send(reply)}
              theme={theme}
              sizes={sizes}
              accessibilityLabel={`Send "${reply}"`}
            />
          ))}
        </View>
      </View>
      </ScrollView>

      {/* Pinned bottom bar: type, speak and send from anywhere in the conversation. */}
      <View
        style={{
          gap: sizes.gap * 0.6,
          paddingHorizontal: sizes.pad,
          paddingVertical: sizes.gap * 0.75,
          borderTopWidth: 1,
          borderTopColor: c.border,
          backgroundColor: c.surface0,
        }}
      >
        {/* One row: Speak, the message box, Send. The box is one line tall when empty and
            grows with its text up to about four lines, then scrolls inside itself. */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: sizes.gap * 0.75 }}>
          <BigButton
            label={
              dictation.phase === "listening"
                ? "■  Stop"
                : dictation.phase === "starting" || dictation.phase === "transcribing"
                  ? "…"
                  : "🎤  Speak"
            }
            tone={dictation.phase === "listening" ? "danger" : "neutral"}
            disabled={dictation.phase === "starting" || dictation.phase === "transcribing"}
            onPress={dictation.toggle}
            theme={theme}
            sizes={sizes}
            accessibilityLabel={
              dictation.phase === "listening" ? "Stop voice typing" : "Start voice typing"
            }
          />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onLayout={(event) => {
              const width = Math.round(event.nativeEvent.layout.width);
              // Ignore sub-pixel jitter so layout can never feed back into itself.
              setInputWidth((current) => (Math.abs(current - width) > 8 ? width : current));
            }}
            placeholder={
              dictation.phase === "listening"
                ? "Listening… tap Stop when done"
                : dictation.phase === "transcribing"
                  ? "Turning speech into text…"
                  : "Message this agent"
            }
            placeholderTextColor={c.foregroundMuted}
            multiline
            scrollEnabled
            accessibilityLabel="Message this agent"
            style={{
              flex: 1,
              height: inputHeight,
              paddingHorizontal: sizes.gap,
              paddingVertical: inputPadV,
              borderRadius: sizes.radius,
              borderWidth: 2,
              borderColor: c.border,
              backgroundColor: c.surface2,
              color: c.foreground,
              fontSize: sizes.body,
              lineHeight: inputLine,
              textAlignVertical: "top",
            }}
          />
          <BigButton
            label={sending ? "…" : "Send"}
            tone="accent"
            disabled={sending || !draft.trim() || dictation.phase !== "idle"}
            onPress={() => void send(draft)}
            theme={theme}
            sizes={sizes}
          />
        </View>
        {notice ? (
          <Text
            style={{
              color: notice.error ? c.statusDanger : c.statusSuccess,
              fontSize: sizes.body,
              fontWeight: "700",
            }}
          >
            {notice.text}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const SHOWN_REPLIES = 3;
const REPLY_ZOOM = 1.3;

/**
 * Everything the agent wrote since your last message, oldest first. Agents often write,
 * run tools, then write again, so one turn can hold several replies.
 */
function useLatestReplies(agentId: string, updatedAt: string) {
  const paseo = usePaseo();
  const [state, setState] = useState<{ status: "loading" | "ready"; replies: string[] }>({
    status: "loading",
    replies: [],
  });

  useEffect(() => {
    setState({ status: "loading", replies: [] });
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      paseo.agents
        .ref(agentId)
        .timeline.refetch({ direction: "tail", limit: 60 })
        .then((page) => {
          if (cancelled) return;
          const replies: string[] = [];
          for (let i = page.entries.length - 1; i >= 0; i--) {
            const item = page.entries[i].item;
            if (item.type === "user_message") break;
            if (item.type === "assistant_message" && item.text?.trim()) replies.unshift(item.text.trim());
          }
          setState({ status: "ready", replies });
        })
        .catch(() => {
          if (!cancelled) setState((prev) => ({ status: "ready", replies: prev.replies }));
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [paseo, agentId, updatedAt]);

  return state;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
