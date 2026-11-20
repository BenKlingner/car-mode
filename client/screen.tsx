import { type PluginScreenProps, useRpc, useSettings } from "@getpaseo/plugin/client";
import { clearAttention } from "../shared/attention";
import { carPreferences } from "../shared/preferences";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { agentTitle, backgroundCount, buildCards, type Card, useAgentDirectory } from "./agents";
import { AgentView } from "./agent-view";
import {
  NewAgentComposer,
  type ProjectChoice,
  ProjectPicker,
  templateAgent,
  useProjectList,
} from "./new-workspace";
import { canToggleSidebar, toggleLeftSidebar } from "./web";
import {
  barButtonSizes,
  BigButton,
  IconButton,
  scaleSizes,
  sizesFor,
  StatusRow,
  statusColor,
  timeAgo,
} from "./ui";

const ALL = "__all__";

export function CarModeScreen(props: PluginScreenProps) {
  const { theme, layout } = props;
  const sizes = useMemo(() => sizesFor(layout.compact), [layout.compact]);
  // The dashboard is denser than the agent view: cards and lists at two thirds size.
  const dense = useMemo(() => scaleSizes(sizes, 2 / 3), [sizes]);
  const directory = useAgentDirectory();
  const prefs = useSettings(carPreferences);
  const [project, setProject] = useState(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const [editingProjects, setEditingProjects] = useState(false);
  // New workspace flow: pick a project, then write the first message.
  const [creating, setCreating] = useState<null | "pick" | ProjectChoice>(null);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const projectList = useProjectList();
  const now = useNow(30_000);
  const c = theme.colors;

  const hidden = useMemo(
    () => new Set(prefs.status === "ready" ? prefs.values.hiddenProjects : []),
    [prefs],
  );
  const showHelpers = prefs.status === "ready" && prefs.values.showHelpers;
  const readAt = prefs.status === "ready" ? prefs.values.readAt : EMPTY_READ;
  const clearPaseoAttention = useRpc(clearAttention);

  /**
   * Remember that you've seen these agents, so finished ones drop back into place, and clear
   * Paseo's own attention flag the way opening them in Paseo would.
   */
  function markRead(agentIds: string[]) {
    if (agentIds.length === 0) return;
    void clearPaseoAttention({ agentIds }).catch(() => {});
    if (prefs.status !== "ready") return;
    const stamp = new Date().toISOString();
    const cutoff = Date.now() - READ_KEEP_MS;
    const next: Record<string, string> = {};
    for (const [id, at] of Object.entries(prefs.values.readAt)) {
      if (Date.parse(at) > cutoff) next[id] = at;
    }
    for (const id of agentIds) next[id] = stamp;
    void prefs.save({ ...prefs.values, readAt: next }, prefs.revision);
  }

  function openAgent(agentId: string) {
    markRead([agentId]);
    setSelectedId(agentId);
  }

  function closeAgent() {
    // Mark again on the way out, in case the agent posted while you were reading.
    if (selectedId) markRead([selectedId]);
    setSelectedId(null);
  }

  const allCards = useMemo(
    () => buildCards(directory.agents, showHelpers, now, readAt),
    [directory.agents, showHelpers, now, readAt],
  );
  const allProjects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { entry } of allCards) {
      counts.set(entry.projectName, (counts.get(entry.projectName) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [allCards]);
  const activeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const card of allCards) {
      if (card.entry.agent.status === "closed") continue;
      counts.set(card.entry.projectName, (counts.get(card.entry.projectName) ?? 0) + 1);
    }
    return counts;
  }, [allCards]);
  // The picker offers exactly the projects in the dashboard's filter row: ones with agents that
  // aren't turned off. Paseo also keeps old or temporary projects that never had agents.
  const shownNames = new Set(allProjects.map(([name]) => name).filter((name) => !hidden.has(name)));
  const pickerProjects = projectList.projects?.filter((p) => shownNames.has(p.name)) ?? null;
  const projects = allProjects.filter(([name]) => !hidden.has(name));
  const visibleCards = allCards.filter((card) => !hidden.has(card.entry.projectName));

  // A project hidden while selected falls back to All.
  const activeProject = project !== ALL && hidden.has(project) ? ALL : project;
  const inProject =
    activeProject === ALL
      ? visibleCards
      : visibleCards.filter((card) => card.entry.projectName === activeProject);
  const recent = inProject.filter((card) => !isStale(card, now));
  const olderCount = inProject.length - recent.length;
  const shown = showOlder ? inProject : recent;

  const selected = selectedId
    ? directory.agents.find((a) => a.agent.id === selectedId) ?? null
    : null;

  if (creating && creating !== "pick") {
    return (
      <NewAgentComposer
        project={creating}
        template={templateAgent(directory.agents, creating)}
        theme={theme}
        sizes={sizes}
        onBack={() => setCreating("pick")}
        onCreated={(agentId) => {
          setCreating(null);
          setWaitingFor(agentId);
          setSelectedId(agentId);
        }}
      />
    );
  }

  if (selectedId && !selected && waitingFor === selectedId) {
    return (
      <View style={{ flex: 1, padding: sizes.pad, gap: sizes.gap, backgroundColor: c.surface0 }}>
        <Text style={{ color: c.foreground, fontSize: sizes.title, fontWeight: "700" }}>
          Starting your agent…
        </Text>
        <BigButton label="‹  All agents" onPress={() => setSelectedId(null)} theme={theme} sizes={barButtonSizes(sizes)} />
      </View>
    );
  }

  if (selected) {
    const selectedCard = allCards.find((card) => card.entry.agent.id === selected.agent.id);
    return (
      <AgentView
        entry={selected}
        helpers={selectedCard?.helpers ?? []}
        onOpenAgent={openAgent}
        theme={theme}
        sizes={sizes}
        navigation={props.navigation}
        onBack={closeAgent}
      />
    );
  }

  function setProjectHidden(name: string, hide: boolean) {
    if (prefs.status !== "ready") return;
    const next = new Set(prefs.values.hiddenProjects);
    if (hide) next.add(name);
    else next.delete(name);
    void prefs.save({ ...prefs.values, hiddenProjects: [...next].sort() }, prefs.revision);
  }

  function setShowHelpers(value: boolean) {
    if (prefs.status !== "ready") return;
    void prefs.save({ ...prefs.values, showHelpers: value }, prefs.revision);
  }

  const finishedIds = visibleCards
    .filter((card) => card.ownStatus === "finished")
    .map((card) => card.entry.agent.id);
  const needsYou = visibleCards.filter((card) => card.status === "needs-you").length;
  const working = visibleCards.filter((card) => card.status === "working").length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface0 }}
      contentContainerStyle={{ padding: sizes.pad, gap: sizes.gap * 1.5 }}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: sizes.gap }}>
        {canToggleSidebar ? (
          <IconButton
            icon="PanelLeft"
            label="Show or hide the sidebar"
            onPress={toggleLeftSidebar}
            theme={theme}
            sizes={sizes}
          />
        ) : null}
        <BigButton
          label={editingProjects ? "Done" : hidden.size > 0 ? `Projects (${hidden.size} hidden)` : "Projects"}
          tone={editingProjects ? "accent" : "neutral"}
          onPress={() => {
            setCreating(null);
            setEditingProjects((value) => !value);
          }}
          theme={theme}
          sizes={barButtonSizes(sizes)}
          accessibilityLabel="Choose which projects car mode shows"
        />
        <BigButton
          label="+  New workspace"
          tone={creating === "pick" ? "accent" : "neutral"}
          onPress={() => {
            setEditingProjects(false);
            if (creating) {
              setCreating(null);
            } else {
              projectList.reload();
              setCreating("pick");
            }
          }}
          theme={theme}
          sizes={barButtonSizes(sizes)}
        />
        {finishedIds.length > 0 && !creating && !editingProjects ? (
          <BigButton
            label={`✓  Mark all read (${finishedIds.length})`}
            onPress={() => markRead(finishedIds)}
            theme={theme}
            sizes={barButtonSizes(sizes)}
          />
        ) : null}
      </View>

      {creating === "pick" ? (
        <ProjectPicker
          projects={pickerProjects}
          error={projectList.error}
          activeCounts={activeCounts}
          wide={!props.layout.compact}
          theme={theme}
          sizes={sizes}
          onPick={setCreating}
          onCancel={() => setCreating(null)}
        />
      ) : editingProjects ? (
        <ProjectFilter
          projects={allProjects}
          hidden={hidden}
          ready={prefs.status === "ready"}
          showHelpers={showHelpers}
          onShowHelpers={setShowHelpers}
          saveError={prefs.saveError ? String(prefs.saveError) : null}
          onToggle={setProjectHidden}
          theme={theme}
          sizes={dense}
        />
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <Text
              style={{ color: c.foreground, fontSize: Math.round(sizes.heading * 0.8), fontWeight: "800" }}
            >
              {needsYou > 0
                ? `${needsYou} ${needsYou === 1 ? "agent needs" : "agents need"} you`
                : working > 0
                  ? `${working} ${working === 1 ? "agent" : "agents"} working`
                  : "All quiet"}
            </Text>
            <Text style={{ color: c.foregroundMuted, fontSize: Math.round(sizes.small * 0.7) }}>
              {props.host.label}
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: dense.gap }}>
              <Chip
                label={`All (${visibleCards.length})`}
                active={activeProject === ALL}
                onPress={() => setProject(ALL)}
                theme={theme}
                sizes={sizes}
              />
              {projects.map(([name, count]) => (
                <Chip
                  key={name}
                  label={`${name} (${count})`}
                  active={activeProject === name}
                  onPress={() => setProject(name)}
                  theme={theme}
                  sizes={sizes}
                />
              ))}
            </View>
          </ScrollView>

          {directory.status === "loading" ? (
            <Text style={{ color: c.foregroundMuted, fontSize: dense.body }}>Loading agents…</Text>
          ) : directory.status === "error" ? (
            <Text style={{ color: c.statusDanger, fontSize: dense.body }}>
              Could not load agents: {directory.error}
            </Text>
          ) : shown.length === 0 ? (
            <Text style={{ color: c.foregroundMuted, fontSize: dense.body }}>No agents here.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: dense.gap }}>
              {shown.map((card) => (
                <AgentCard
                  key={card.entry.agent.id}
                  card={card}
                  now={now}
                  wide={!props.layout.compact}
                  theme={theme}
                  sizes={dense}
                  onPress={() => openAgent(card.entry.agent.id)}
                  onMarkRead={() => markRead([card.entry.agent.id])}
                />
              ))}
            </View>
          )}

          {olderCount > 0 ? (
            <BigButton
              label={showOlder ? "Hide older agents" : `Show older agents (${olderCount})`}
              onPress={() => setShowOlder((value) => !value)}
              theme={theme}
              sizes={dense}
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function ProjectFilter({
  projects,
  hidden,
  ready,
  showHelpers,
  onShowHelpers,
  saveError,
  onToggle,
  theme,
  sizes,
}: {
  projects: [string, number][];
  hidden: Set<string>;
  ready: boolean;
  showHelpers: boolean;
  onShowHelpers: (value: boolean) => void;
  saveError: string | null;
  onToggle: (name: string, hide: boolean) => void;
  theme: PluginScreenProps["theme"];
  sizes: ReturnType<typeof sizesFor>;
}) {
  const c = theme.colors;
  return (
    <View style={{ gap: sizes.gap }}>
      <Text style={{ color: c.foreground, fontSize: sizes.heading, fontWeight: "800" }}>
        Projects to show
      </Text>
      <Text style={{ color: c.foregroundMuted, fontSize: sizes.body }}>
        Turn off projects you don't want in car mode. This only changes this device.
      </Text>
      {!ready ? (
        <Text style={{ color: c.foregroundMuted, fontSize: sizes.body }}>Loading…</Text>
      ) : projects.length === 0 ? (
        <Text style={{ color: c.foregroundMuted, fontSize: sizes.body }}>No projects yet.</Text>
      ) : (
        projects.map(([name, count]) => {
          const on = !hidden.has(name);
          return (
            <Pressable
              key={name}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${name}, ${on ? "shown" : "hidden"}`}
              onPress={() => onToggle(name, on)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: sizes.gap,
                minHeight: sizes.buttonHeight,
                paddingHorizontal: sizes.pad,
                borderRadius: sizes.radius,
                borderWidth: 2,
                borderColor: on ? c.accent : c.border,
                backgroundColor: c.surface1,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: on ? c.foreground : c.foregroundMuted, fontSize: sizes.title, fontWeight: "700" }}
                >
                  {name}
                </Text>
                <Text style={{ color: c.foregroundMuted, fontSize: sizes.small }}>
                  {count} {count === 1 ? "agent" : "agents"}
                </Text>
              </View>
              <View
                style={{
                  minWidth: sizes.buttonHeight * 1.3,
                  paddingVertical: 10,
                  borderRadius: 999,
                  alignItems: "center",
                  backgroundColor: on ? c.accent : c.surface2,
                }}
              >
                <Text
                  style={{
                    color: on ? c.accentForeground : c.foregroundMuted,
                    fontSize: sizes.button,
                    fontWeight: "800",
                  }}
                >
                  {on ? "On" : "Off"}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
      {ready ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: showHelpers }}
          accessibilityLabel="Give helper agents their own cards"
          onPress={() => onShowHelpers(!showHelpers)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: sizes.gap,
            minHeight: sizes.buttonHeight,
            paddingHorizontal: sizes.pad,
            marginTop: sizes.gap,
            borderRadius: sizes.radius,
            borderWidth: 2,
            borderColor: showHelpers ? c.accent : c.border,
            backgroundColor: c.surface1,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.foreground, fontSize: sizes.title, fontWeight: "700" }}>
              Helper agents as cards
            </Text>
            <Text style={{ color: c.foregroundMuted, fontSize: sizes.small }}>
              Off: helpers are listed inside the agent that started them.
            </Text>
          </View>
          <Text
            style={{
              color: showHelpers ? c.accent : c.foregroundMuted,
              fontSize: sizes.button,
              fontWeight: "800",
            }}
          >
            {showHelpers ? "On" : "Off"}
          </Text>
        </Pressable>
      ) : null}
      {saveError ? (
        <Text style={{ color: c.statusDanger, fontSize: sizes.body }}>Could not save: {saveError}</Text>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  theme,
  sizes,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: PluginScreenProps["theme"];
  sizes: ReturnType<typeof sizesFor>;
}) {
  return (
    <BigButton
      label={label}
      onPress={onPress}
      theme={theme}
      // Half the size of the earlier filter buttons.
      sizes={{
        ...sizes,
        buttonHeight: Math.round(sizes.buttonHeight * 0.45),
        button: Math.round(sizes.body * 0.65),
        pad: Math.round(sizes.pad * 0.55),
        radius: Math.round(sizes.radius * 0.6),
      }}
      tone={active ? "accent" : "neutral"}
      accessibilityLabel={`Show ${label}${active ? ", selected" : ""}`}
    />
  );
}

function AgentCard({
  card,
  now,
  wide,
  theme,
  sizes,
  onPress,
  onMarkRead,
}: {
  card: Card;
  now: number;
  wide: boolean;
  theme: PluginScreenProps["theme"];
  sizes: ReturnType<typeof sizesFor>;
  onPress: () => void;
  onMarkRead: () => void;
}) {
  const { agent, projectName } = card.entry;
  const { status, helpers } = card;
  const c = theme.colors;
  // Match Paseo's sidebar, which names the workspace rather than the agent.
  const title = card.entry.workspaceName ?? agentTitle(agent);
  const subtitle = card.entry.workspaceName ? agentTitle(agent) : null;
  const background = [card.entry, ...helpers].reduce((sum, a) => sum + backgroundCount(a.agent), 0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${projectName}, ${status}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexBasis: wide ? "48%" : "100%",
        flexGrow: 1,
        minHeight: sizes.buttonHeight * 2,
        padding: sizes.pad,
        gap: sizes.gap * 0.75,
        borderRadius: sizes.radius,
        backgroundColor: c.surface1,
        borderWidth: 2,
        borderColor: status === "needs-you" ? statusColor(status, theme) : c.border,
        borderLeftWidth: 10,
        borderLeftColor: statusColor(status, theme),
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text
        numberOfLines={2}
        style={{ color: c.foreground, fontSize: sizes.title, fontWeight: "700" }}
      >
        {title}
      </Text>
      {subtitle && subtitle !== title ? (
        <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: sizes.small }}>
          {subtitle}
        </Text>
      ) : null}
      <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: sizes.body }}>
        {projectName} · {timeAgo(card.lastActivity, now)}
      </Text>
      {helpers.length > 0 ? (
        <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: sizes.small }}>
          {helpers.length} {helpers.length === 1 ? "helper" : "helpers"}
        </Text>
      ) : null}
      {background > 0 ? (
        <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: sizes.small }}>
          {background} background {background === 1 ? "task" : "tasks"} running
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: sizes.gap }}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <StatusRow
            status={card.ownStatus}
            helpersWorking={card.helpersWorking}
            helpersNeedYou={card.helpersNeedYou}
            theme={theme}
            sizes={sizes}
          />
        </View>
        {card.ownStatus === "finished" ? (
          <BigButton
            label="✓  Mark read"
            onPress={onMarkRead}
            theme={theme}
            sizes={sizes}
            accessibilityLabel={`Mark ${title} as read`}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const STALE_MS = 3 * 24 * 60 * 60 * 1000;
/** Read times older than this are dropped; agents that old have long left the finished group. */
const READ_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
const EMPTY_READ: Record<string, string> = {};

/** Closed agents untouched for a few days stay behind the "Show older" button. */
function isStale(card: Card, now: number): boolean {
  if (card.entry.agent.status !== "closed" || card.status === "needs-you" || card.status === "working") {
    return false;
  }
  return now - Date.parse(card.lastActivity) > STALE_MS;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
