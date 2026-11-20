import type { PaseoAgent } from "@getpaseo/client";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { BigButton, type Sizes } from "./ui";

type Request = NonNullable<PaseoAgent["pendingPermissions"]>[number];
type Response = Parameters<ReturnType<ReturnType<typeof usePaseo>["agents"]["ref"]>["respondToPermission"]>[0]["response"];

interface Question {
  header: string;
  question: string;
  multiSelect: boolean;
  options: string[];
}

/** The questions in an ask-the-user request, or null when the input isn't that shape. */
function parseQuestions(input: unknown): Question[] | null {
  const raw = (input as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(raw)) return null;
  const out: Question[] = [];
  for (const item of raw) {
    const q = item as Record<string, unknown>;
    if (typeof q?.question !== "string" || typeof q?.header !== "string" || !Array.isArray(q.options)) {
      return null;
    }
    out.push({
      header: q.header,
      question: q.question,
      multiSelect: q.multiSelect === true,
      options: (q.options as Record<string, unknown>[])
        .map((o) => (typeof o?.label === "string" ? o.label : null))
        .filter((label): label is string => label !== null),
    });
  }
  return out;
}

/**
 * A pending permission or question. Questions need answers attached, the way Paseo's own
 * question card sends them; a bare "allow" leaves them waiting. Requests that name their own
 * actions (such as plan approval) get those buttons instead of a generic Allow and Deny.
 */
export function PermissionCard({
  agentId,
  request,
  theme,
  sizes,
  onResult,
}: {
  agentId: string;
  request: Request;
  theme: PluginScreenProps["theme"];
  sizes: Sizes;
  onResult: (text: string, error: boolean) => void;
}) {
  const paseo = usePaseo();
  const c = theme.colors;
  const questions = request.kind === "question" ? parseQuestions(request.input) : null;
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  async function respond(response: Response, done: string) {
    setBusy(true);
    try {
      await paseo.agents.ref(agentId).respondToPermission({ requestId: request.id, response });
      onResult(done, false);
    } catch (error) {
      onResult(`Could not answer: ${error instanceof Error ? error.message : String(error)}`, true);
      setBusy(false);
    }
  }

  function answerFor(index: number, q: Question): string {
    const other = typed[index]?.trim() ?? "";
    const labels = picked[index] ?? [];
    if (other) return q.multiSelect ? [...labels, other].join(", ") : other;
    return labels.join(", ");
  }

  function toggle(index: number, q: Question, label: string) {
    setPicked((current) => {
      const now = current[index] ?? [];
      const next = q.multiSelect
        ? now.includes(label)
          ? now.filter((l) => l !== label)
          : [...now, label]
        : [label];
      return { ...current, [index]: next };
    });
    if (!q.multiSelect) setTyped((current) => ({ ...current, [index]: "" }));
  }

  const card = {
    padding: sizes.pad,
    gap: sizes.gap,
    borderRadius: sizes.radius,
    borderWidth: 3,
    borderColor: c.statusWarning,
    backgroundColor: c.surface1,
  } as const;

  if (questions) {
    const allAnswered = questions.every((q, i) => answerFor(i, q).length > 0);
    return (
      <View style={card}>
        <Text style={{ color: c.statusWarning, fontSize: sizes.small, fontWeight: "800" }}>
          {questions.length === 1 ? "QUESTION" : `${questions.length} QUESTIONS`}
        </Text>
        {questions.map((q, i) => (
          <View key={`${i}-${q.header}`} style={{ gap: sizes.gap * 0.6 }}>
            <Text style={{ color: c.foreground, fontSize: sizes.title, fontWeight: "700" }}>{q.question}</Text>
            {q.multiSelect ? (
              <Text style={{ color: c.foregroundMuted, fontSize: sizes.small }}>Pick any that apply.</Text>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sizes.gap * 0.75 }}>
              {q.options.map((label) => {
                const on = (picked[i] ?? []).includes(label);
                return (
                  <BigButton
                    key={label}
                    label={`${on ? (q.multiSelect ? "☑  " : "●  ") : ""}${label}`}
                    tone={on ? "accent" : "neutral"}
                    disabled={busy}
                    onPress={() => toggle(i, q, label)}
                    theme={theme}
                    sizes={sizes}
                  />
                );
              })}
            </View>
            <TextInput
              value={typed[i] ?? ""}
              onChangeText={(text) => {
                setTyped((current) => ({ ...current, [i]: text }));
                if (!q.multiSelect && text) setPicked((current) => ({ ...current, [i]: [] }));
              }}
              placeholder="Or type your own answer"
              placeholderTextColor={c.foregroundMuted}
              accessibilityLabel={`Your own answer to: ${q.question}`}
              style={{
                minHeight: Math.round(sizes.buttonHeight * 0.8),
                paddingHorizontal: sizes.gap,
                borderRadius: sizes.radius,
                borderWidth: 2,
                borderColor: c.border,
                backgroundColor: c.surface2,
                color: c.foreground,
                fontSize: sizes.body,
              }}
            />
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: sizes.gap }}>
          <BigButton
            label={busy ? "Sending…" : "Send answer"}
            tone="accent"
            grow
            disabled={busy || !allAnswered}
            onPress={() => {
              const answers: Record<string, string> = {};
              questions.forEach((q, i) => {
                answers[q.header] = answerFor(i, q);
              });
              const input = (request.input ?? {}) as Record<string, unknown>;
              void respond({ behavior: "allow", updatedInput: { ...input, answers } }, "Answer sent");
            }}
            theme={theme}
            sizes={sizes}
          />
          <BigButton
            label="Dismiss"
            tone="danger"
            disabled={busy}
            onPress={() => void respond({ behavior: "deny", message: "Dismissed by user" }, "Dismissed")}
            theme={theme}
            sizes={sizes}
          />
        </View>
      </View>
    );
  }

  const actions = request.actions?.length ? request.actions : null;
  return (
    <View style={card}>
      <Text style={{ color: c.statusWarning, fontSize: sizes.small, fontWeight: "800" }}>
        {request.kind === "plan" ? "PLAN APPROVAL" : "PERMISSION REQUEST"}
      </Text>
      <Text style={{ color: c.foreground, fontSize: sizes.title, fontWeight: "700" }}>
        {request.title?.trim() || request.name}
      </Text>
      {request.description ? (
        <Text numberOfLines={8} style={{ color: c.foregroundMuted, fontSize: sizes.body }}>
          {request.description}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sizes.gap }}>
        {actions ? (
          actions.map((action) => (
            <BigButton
              key={action.id}
              label={action.label}
              tone={action.behavior === "deny" || action.variant === "danger" ? "danger" : action.variant === "primary" ? "success" : "neutral"}
              grow
              disabled={busy}
              onPress={() =>
                void respond(
                  action.behavior === "allow"
                    ? { behavior: "allow", selectedActionId: action.id }
                    : { behavior: "deny", selectedActionId: action.id, message: "Denied from car mode" },
                  action.label,
                )
              }
              theme={theme}
              sizes={sizes}
            />
          ))
        ) : (
          <>
            <BigButton
              label="Allow"
              tone="success"
              grow
              disabled={busy}
              onPress={() => void respond({ behavior: "allow" }, "Allowed")}
              theme={theme}
              sizes={sizes}
            />
            <BigButton
              label="Deny"
              tone="danger"
              grow
              disabled={busy}
              onPress={() => void respond({ behavior: "deny", message: "Denied from car mode" }, "Denied")}
              theme={theme}
              sizes={sizes}
            />
          </>
        )}
      </View>
    </View>
  );
}
