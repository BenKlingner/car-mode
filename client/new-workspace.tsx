import type { PaseoAgent, PaseoProject } from "@getpaseo/client";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { type CarAgent, parentIdOf } from "./agents";
import { useDictation } from "./dictation";
import { barButtonSizes, BigButton, IconButton, type Sizes } from "./ui";
import { canToggleSidebar, toggleLeftSidebar } from "./web";

type Theme = PluginScreenProps["theme"];

export interface ProjectChoice {
  id: string;
  name: string;
  path: string;
}

export function projectName(project: PaseoProject): string {
  return project.projectCustomName?.trim() || project.projectDisplayName;
}

/** Every project registered on the host, including ones with no agents yet. */
export function useProjectList() {
  const paseo = usePaseo();
  const [projects, setProjects] = useState<ProjectChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    paseo.projects
      .list()
      .then(({ projects: list }) => {
        if (cancelled) return;
        setProjects(
          list
            .filter((p) => !!p.projectRootPath)
            .map((p) => ({ id: p.projectId, name: projectName(p), path: p.projectRootPath }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [paseo, version]);

  return { projects, error, reload: () => setVersion((v) => v + 1) };
}

/** Large tiles, one per visible project. */
export function ProjectPicker({
  projects,
  error,
  activeCounts,
  wide,
  theme,
  sizes,
  onPick,
  onCancel,
}: {
  projects: ProjectChoice[] | null;
  error: string | null;
  activeCounts: Map<string, number>;
  wide: boolean;
  theme: Theme;
  sizes: Sizes;
  onPick: (project: ProjectChoice) => void;
  onCancel: () => void;
}) {
  const c = theme.colors;
  return (
    <View style={{ gap: sizes.gap }}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: sizes.gap }}>
        <Text style={{ flex: 1, color: c.foreground, fontSize: sizes.heading, fontWeight: "800" }}>
          New workspace
        </Text>
        <BigButton label="Cancel" onPress={onCancel} theme={theme} sizes={barButtonSizes(sizes)} />
      </View>
      <Text style={{ color: c.foregroundMuted, fontSize: sizes.body }}>Pick a project.</Text>
      {error ? (
        <Text style={{ color: c.statusDanger, fontSize: sizes.body }}>Could not load projects: {error}</Text>
      ) : projects === null ? (
        <Text style={{ color: c.foregroundMuted, fontSize: sizes.body }}>Loading projects…</Text>
      ) : projects.length === 0 ? (
        <Text style={{ color: c.foregroundMuted, fontSize: sizes.body }}>
          No projects to show. Turn some on under Projects.
        </Text>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sizes.gap }}>
          {projects.map((project) => {
            const active = activeCounts.get(project.name) ?? 0;
            return (
              <Pressable
                key={project.id}
                accessibilityRole="button"
                accessibilityLabel={`New workspace in ${project.name}`}
                onPress={() => onPick(project)}
                style={({ pressed }) => ({
                  flexBasis: wide ? "31%" : "100%",
                  flexGrow: 1,
                  minHeight: sizes.buttonHeight * 1.8,
                  padding: sizes.pad,
                  gap: sizes.gap * 0.5,
                  justifyContent: "center",
                  borderRadius: sizes.radius,
                  borderWidth: 2,
                  borderColor: c.border,
                  backgroundColor: c.surface1,
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text numberOfLines={2} style={{ color: c.foreground, fontSize: sizes.title, fontWeight: "700" }}>
                  {project.name}
                </Text>
                <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: sizes.small }}>
                  {active > 0 ? `${active} active ${active === 1 ? "agent" : "agents"}` : "No active agents"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * The agent setup a new workspace copies: the newest main agent in the project, else the
 * newest main agent anywhere. Helpers are skipped; they often run cheaper models.
 */
export function templateAgent(agents: CarAgent[], project: ProjectChoice): PaseoAgent | null {
  const mains = agents
    .filter((a) => !parentIdOf(a.agent) && a.agent.provider && a.agent.model)
    .sort((a, b) => b.agent.updatedAt.localeCompare(a.agent.updatedAt));
  return (mains.find((a) => a.projectName === project.name) ?? mains[0])?.agent ?? null;
}

function modelLabel(agent: PaseoAgent | null): string {
  if (!agent?.model) return "Paseo's default";
  return agent.model.replace(/^claude-/, "Claude ").replace(/-(\d+)-(\d+)$/, " $1.$2").replace(/-/g, " ");
}

/** First message for the new workspace's agent, with Speak and Start. */
export function NewAgentComposer({
  project,
  template,
  theme,
  sizes,
  onBack,
  onCreated,
}: {
  project: ProjectChoice;
  template: PaseoAgent | null;
  theme: Theme;
  sizes: Sizes;
  onBack: () => void;
  onCreated: (agentId: string) => void;
}) {
  const paseo = usePaseo();
  const c = theme.colors;
  const [draft, setDraft] = useState("");
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dictation = useDictation({
    onText: (text) => {
      setNotice(null);
      setDraft((current) => (current.trim() ? `${current.trim()} ${text}` : text));
    },
    onError: (message) => setNotice(message),
  });

  async function start() {
    const prompt = draft.trim();
    if (!prompt || starting) return;
    dictation.cancel();
    setStarting(true);
    setNotice(null);
    try {
      const config = template
        ? {
            provider: `${template.provider}/${template.model}`,
            ...(template.currentModeId ? { modeId: template.currentModeId } : {}),
            ...(template.thinkingOptionId ? { thinkingOptionId: template.thinkingOptionId } : {}),
          }
        : null;
      if (!config) throw new Error("No earlier agent to copy a model from. Start this one in Paseo.");
      const workspace = await paseo.workspaces.create({
        source: { kind: "directory", path: project.path, projectId: project.id },
        agent: { config, prompt, cwd: project.path },
      });
      const list = await paseo.agents.list({
        filter: { includeArchived: false },
        sort: [{ key: "created_at", direction: "desc" }],
        page: { limit: 20 },
      });
      const created = list.entries.find((e) => e.agent.workspaceId === workspace.id);
      if (!created) throw new Error("The workspace was created, but its agent didn't show up yet.");
      onCreated(created.agent.id);
    } catch (reason) {
      setNotice(`Could not start it: ${reason instanceof Error ? reason.message : String(reason)}`);
      setStarting(false);
    }
  }

  const bar = barButtonSizes(sizes);
  return (
    <View style={{ flex: 1, backgroundColor: c.surface0 }}>
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
        }}
      >
        {canToggleSidebar ? (
          <IconButton icon="PanelLeft" label="Show or hide the sidebar" onPress={toggleLeftSidebar} theme={theme} sizes={sizes} />
        ) : null}
        <BigButton label="‹  Projects" onPress={onBack} theme={theme} sizes={bar} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: sizes.pad, gap: sizes.gap * 1.2 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ color: c.foreground, fontSize: sizes.heading, fontWeight: "800" }}>
          New agent in {project.name}
        </Text>
        <Text style={{ color: c.foregroundMuted, fontSize: sizes.body }}>
          Model: {modelLabel(template)}
          {template?.thinkingOptionId ? ` · ${template.thinkingOptionId} reasoning` : ""}
          {template ? ", copied from your latest agent" : ""}
        </Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={
            dictation.phase === "listening"
              ? "Listening… tap Stop when done"
              : dictation.phase === "transcribing"
                ? "Turning speech into text…"
                : "What should the agent do?"
          }
          placeholderTextColor={c.foregroundMuted}
          multiline
          accessibilityLabel="First message for the new agent"
          style={{
            minHeight: sizes.buttonHeight * 2.4,
            padding: sizes.gap,
            borderRadius: sizes.radius,
            borderWidth: 2,
            borderColor: c.border,
            backgroundColor: c.surface2,
            color: c.foreground,
            fontSize: sizes.body,
            textAlignVertical: "top",
          }}
        />
        <View style={{ flexDirection: "row", gap: sizes.gap }}>
          <BigButton
            label={
              dictation.phase === "listening"
                ? "■  Stop"
                : dictation.phase === "idle"
                  ? "🎤  Speak"
                  : "…"
            }
            tone={dictation.phase === "listening" ? "danger" : "neutral"}
            grow
            disabled={dictation.phase === "starting" || dictation.phase === "transcribing" || starting}
            onPress={dictation.toggle}
            theme={theme}
            sizes={sizes}
          />
          <BigButton
            label={starting ? "Starting…" : "Start"}
            tone="accent"
            grow
            disabled={starting || !draft.trim() || dictation.phase !== "idle"}
            onPress={() => void start()}
            theme={theme}
            sizes={sizes}
          />
        </View>
        {notice ? <Text style={{ color: c.statusDanger, fontSize: sizes.body }}>{notice}</Text> : null}
      </ScrollView>
    </View>
  );
}
