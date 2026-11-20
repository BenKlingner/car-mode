import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import {
  answerRoleQuestion,
  dismissRoleQuestion,
  listRoleQuestions,
  type RoleQuestion,
} from "../shared/role-questions";
import { useDictation } from "./dictation";
import { BigButton, type Sizes, timeAgo } from "./ui";

const POLL_MS = 15_000;

/** Open Agent Roles questions in these projects, refreshed every few seconds. */
export function useRoleQuestions(projects: { root: string; name: string }[] | null) {
  const list = useRpc(listRoleQuestions);
  const [questions, setQuestions] = useState<RoleQuestion[]>([]);
  const [tick, setTick] = useState(0);
  const key = projects ? projects.map((p) => p.root).join("\n") : null;
  const latest = useRef(projects);
  latest.current = projects;

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const load = () => {
      const current = latest.current;
      if (!current?.length) {
        setQuestions([]);
        return;
      }
      list({ projects: current })
        .then(({ questions: found }) => {
          if (!cancelled) setQuestions(found);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [list, key, tick]);

  return { questions, refresh: () => setTick((t) => t + 1) };
}

/** The dashboard's list of team questions. */
export function RoleQuestionList({
  questions,
  theme,
  sizes,
  onChanged,
  onOpenAgent,
}: {
  questions: RoleQuestion[];
  theme: PluginScreenProps["theme"];
  sizes: Sizes;
  onChanged: () => void;
  onOpenAgent: (agentId: string) => void;
}) {
  const c = theme.colors;
  if (questions.length === 0) return null;
  return (
    <View style={{ gap: sizes.gap }}>
      <Text style={{ color: c.statusWarning, fontSize: sizes.small, fontWeight: "800" }}>
        {questions.length === 1 ? "QUESTION FROM YOUR TEAM" : `${questions.length} QUESTIONS FROM YOUR TEAM`}
      </Text>
      {questions.map((question) => (
        <RoleQuestionCard
          key={`${question.projectRoot}:${question.id}`}
          question={question}
          theme={theme}
          sizes={sizes}
          onChanged={onChanged}
          onOpenAgent={onOpenAgent}
        />
      ))}
    </View>
  );
}

function RoleQuestionCard({
  question,
  theme,
  sizes,
  onChanged,
  onOpenAgent,
}: {
  question: RoleQuestion;
  theme: PluginScreenProps["theme"];
  sizes: Sizes;
  onChanged: () => void;
  onOpenAgent: (agentId: string) => void;
}) {
  const answer = useRpc(answerRoleQuestion);
  const dismiss = useRpc(dismissRoleQuestion);
  const c = theme.colors;
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dictation = useDictation({
    onText: (text) => {
      setPicked(null);
      setTyped((current) => (current.trim() ? `${current.trim()} ${text}` : text));
    },
    onError: setError,
  });
  const reply = typed.trim() || picked || "";

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  }

  const ref = { projectRoot: question.projectRoot, questionId: question.id };
  return (
    <View
      style={{
        padding: sizes.pad,
        gap: sizes.gap * 0.75,
        borderRadius: sizes.radius,
        borderWidth: 3,
        borderColor: question.urgency === "now" ? c.statusWarning : c.border,
        backgroundColor: c.surface1,
      }}
    >
      <Text style={{ color: c.foregroundMuted, fontSize: sizes.small }}>
        {question.askedBy ? `${question.askedBy} · ` : ""}
        {question.projectName} · {timeAgo(question.createdAt, Date.now())}
        {question.urgency === "now" ? " · blocking work" : ""}
      </Text>
      <Text style={{ color: c.foreground, fontSize: sizes.title, fontWeight: "700" }}>{question.text}</Text>

      {question.source === "box" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sizes.gap }}>
          <BigButton
            label="Open agent to answer"
            tone="accent"
            onPress={() => onOpenAgent(question.agentId)}
            theme={theme}
            sizes={sizes}
          />
        </View>
      ) : (
        <>
          {question.options.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sizes.gap * 0.75 }}>
              {question.options.map((option) => (
                <BigButton
                  key={option}
                  label={picked === option ? `●  ${option}` : option}
                  tone={picked === option ? "accent" : "neutral"}
                  disabled={busy}
                  onPress={() => {
                    setPicked(option);
                    setTyped("");
                  }}
                  theme={theme}
                  sizes={sizes}
                />
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: sizes.gap * 0.75 }}>
            <BigButton
              label={dictation.phase === "listening" ? "■" : dictation.phase === "idle" ? "🎤" : "…"}
              tone={dictation.phase === "listening" ? "danger" : "neutral"}
              disabled={busy || dictation.phase === "starting" || dictation.phase === "transcribing"}
              onPress={dictation.toggle}
              theme={theme}
              sizes={{ ...sizes, buttonHeight: Math.round(sizes.buttonHeight * 0.8) }}
              accessibilityLabel={dictation.phase === "listening" ? "Stop voice typing" : "Speak your answer"}
            />
            <TextInput
              value={typed}
              onChangeText={(text) => {
                setTyped(text);
                if (text) setPicked(null);
              }}
              placeholder={
                dictation.phase === "listening"
                  ? "Listening…"
                  : question.options.length
                    ? "Or type your own answer"
                    : "Type your answer"
              }
              placeholderTextColor={c.foregroundMuted}
              accessibilityLabel={`Your answer to: ${question.text}`}
              style={{
                flex: 1,
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
          <View style={{ flexDirection: "row", gap: sizes.gap }}>
            <BigButton
              label={busy ? "Sending…" : "Send answer"}
              tone="accent"
              grow
              disabled={busy || !reply || dictation.phase !== "idle"}
              onPress={() => void run(() => answer({ ...ref, answer: reply }))}
              theme={theme}
              sizes={sizes}
            />
            <BigButton
              label="Dismiss"
              tone="danger"
              disabled={busy}
              onPress={() => void run(() => dismiss(ref))}
              theme={theme}
              sizes={sizes}
            />
          </View>
        </>
      )}
      {error ? <Text style={{ color: c.statusDanger, fontSize: sizes.body }}>{error}</Text> : null}
    </View>
  );
}
