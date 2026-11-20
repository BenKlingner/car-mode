import type { PaseoAgent, PaseoAgentListResult } from "@getpaseo/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";

type Entry = PaseoAgentListResult["entries"][number];

export interface CarAgent {
  agent: PaseoAgent;
  projectName: string;
  /** The workspace name Paseo's sidebar shows, when the agent has one. */
  workspaceName: string | null;
}

export function agentTitle(agent: PaseoAgent): string {
  return agent.title?.trim() || "Untitled agent";
}

export type CarStatus = "needs-you" | "working" | "error" | "finished" | "idle" | "closed";

export interface Directory {
  status: "loading" | "ready" | "error";
  agents: CarAgent[];
  error: string | null;
}

/** One dashboard card: a top-level agent with the helper agents it spawned folded in. */
export interface Card {
  entry: CarAgent;
  helpers: CarAgent[];
  /** The lead agent's own status. */
  ownStatus: CarStatus;
  /** Helpers currently working, including ones with background work. */
  helpersWorking: number;
  /** Helpers waiting on a permission answer. */
  helpersNeedYou: number;
  /** Combined status, used for ordering and the card's edge color. */
  status: CarStatus;
  /** Latest update across the agent and its helpers. */
  lastActivity: string;
}

const PARENT_LABEL = "paseo.parent-agent-id";

/**
 * How long an agent that stopped after your last message stays "finished" until you read it.
 * Mark read clears it sooner.
 */
const RECENT_FINISH_MS = 12 * 60 * 60 * 1000;

/**
 * `readAt` is when you last looked at this agent in car mode. A finished agent you've looked at
 * since it last changed no longer counts as finished.
 */
export function carStatus(agent: PaseoAgent, now: number = Date.now(), readAt?: string): CarStatus {
  if ((agent.pendingPermissions?.length ?? 0) > 0) return "needs-you";
  if (agent.status === "error") return "error";
  if (agent.status === "running" || agent.status === "initializing") return "working";
  if (agent.status === "closed") {
    // Agents often close minutes after finishing, which also clears Paseo's attention flag.
    // Closing bumps updatedAt, so a closed agent counts as read once you've looked at it any
    // time after your last message; otherwise every close would make it unread again.
    const read = !!readAt && !!agent.lastUserMessageAt && Date.parse(readAt) >= Date.parse(agent.lastUserMessageAt);
    return !read && justFinished(agent, now) ? "finished" : "closed";
  }
  // Paseo's sidebar counts background shells and tasks as running, so car mode does too.
  if (backgroundCount(agent) > 0) return "working";
  if (agent.requiresAttention && agent.attentionReason === "error") return "error";
  const unread = !readAt || Date.parse(readAt) < Date.parse(agent.updatedAt);
  if (unread && agent.requiresAttention && agent.attentionReason === "finished") return "finished";
  if (unread && justFinished(agent, now)) return "finished";
  return "idle";
}

/**
 * Stopped (idle or closed) after doing something since your last message, within the window.
 * Paseo doesn't always flag these for attention, but they are usually waiting on your next step.
 */
function justFinished(agent: PaseoAgent, now: number): boolean {
  if ((agent.status !== "idle" && agent.status !== "closed") || !agent.lastUserMessageAt) return false;
  const updated = Date.parse(agent.updatedAt);
  return updated > Date.parse(agent.lastUserMessageAt) && now - updated < RECENT_FINISH_MS;
}

export function backgroundCount(agent: PaseoAgent): number {
  return agent.backgroundWork?.count ?? 0;
}

export function parentIdOf(agent: PaseoAgent): string | null {
  return agent.labels?.[PARENT_LABEL] ?? null;
}

/** Needs you, then finished or failed (waiting on your next step), then working, open, closed. */
function rank(status: CarStatus): number {
  if (status === "needs-you") return 0;
  if (status === "finished" || status === "error") return 1;
  if (status === "working") return 2;
  return status === "closed" ? 4 : 3;
}

/**
 * Groups helpers under the agent that spawned them. A helper whose parent is missing stands on
 * its own. With `flat`, every agent gets its own card. Ordered by `rank`, then latest activity.
 */
export function buildCards(
  agents: CarAgent[],
  flat: boolean,
  now: number = Date.now(),
  readAt: Record<string, string> = {},
): Card[] {
  const byId = new Map(agents.map((a) => [a.agent.id, a]));
  const helpersOf = new Map<string, CarAgent[]>();
  const tops: CarAgent[] = [];
  for (const entry of agents) {
    const parentId = flat ? null : parentIdOf(entry.agent);
    if (parentId && byId.has(parentId)) {
      const list = helpersOf.get(parentId) ?? [];
      list.push(entry);
      helpersOf.set(parentId, list);
    } else {
      tops.push(entry);
    }
  }
  // Helpers of helpers belong to the top card too.
  const collect = (id: string, seen = new Set<string>([id])): CarAgent[] =>
    (helpersOf.get(id) ?? []).flatMap((child) => {
      if (seen.has(child.agent.id)) return [];
      seen.add(child.agent.id);
      return [child, ...collect(child.agent.id, seen)];
    });

  const cards = tops.map((entry): Card => {
    const helpers = collect(entry.agent.id);
    const own = carStatus(entry.agent, now, readAt[entry.agent.id]);
    const helperStatuses = helpers.map((h) => carStatus(h.agent, now, readAt[h.agent.id]));
    let status = own;
    if (own !== "needs-you" && helperStatuses.includes("needs-you")) status = "needs-you";
    // A lead that stopped while its helpers work is waiting on them, not on you.
    else if (own !== "working" && helperStatuses.includes("working")) status = "working";
    let lastActivity = entry.agent.updatedAt;
    for (const h of helpers) if (h.agent.updatedAt > lastActivity) lastActivity = h.agent.updatedAt;
    return {
      entry,
      helpers,
      ownStatus: own,
      helpersWorking: helperStatuses.filter((h) => h === "working").length,
      helpersNeedYou: helperStatuses.filter((h) => h === "needs-you").length,
      status,
      lastActivity,
    };
  });
  return cards.sort((a, b) => {
    const order = rank(a.status) - rank(b.status);
    if (order !== 0) return order;
    return b.lastActivity.localeCompare(a.lastActivity);
  });
}

function projectNameOf(entry: Entry): string {
  return entry.project?.projectName?.trim() || lastSegment(entry.agent.cwd) || "Other";
}

function lastSegment(path: string | null | undefined): string {
  if (!path) return "";
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function visible(agent: PaseoAgent): boolean {
  return !agent.archivedAt && !agent.background;
}

/** A live list of the selected host's agents, kept current by an owned subscription. */
export function useAgentDirectory(): Directory {
  const paseo = usePaseo();
  const [state, setState] = useState<Directory>({ status: "loading", agents: [], error: null });

  useEffect(() => {
    const lifetime = new AbortController();
    const byId = new Map<string, CarAgent>();
    let release: (() => void) | null = null;

    const publish = () => {
      if (lifetime.signal.aborted) return;
      setState({ status: "ready", agents: [...byId.values()], error: null });
    };
    const put = (entry: Entry) => {
      if (visible(entry.agent)) {
        byId.set(entry.agent.id, {
          agent: entry.agent,
          projectName: projectNameOf(entry),
          workspaceName: entry.project?.workspaceName?.trim() || null,
        });
      } else {
        byId.delete(entry.agent.id);
      }
    };

    paseo.agents
      .list({
        filter: { includeArchived: false },
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: 200 },
        subscribe: {},
      })
      .then(({ entries, subscription }) => {
        if (lifetime.signal.aborted) {
          void subscription.release();
          return;
        }
        for (const entry of entries) put(entry);
        publish();
        // The subscription delivers a fresh snapshot after a reconnect, then live updates.
        const stop = subscription.subscribe({
          snapshot: (snapshot) => {
            byId.clear();
            for (const entry of snapshot.entries) put(entry);
            publish();
          },
          update: (message) => {
            if (message.type !== "agent_update") return;
            const update = message.payload;
            if (update.kind === "remove") byId.delete(update.agentId);
            else put({ agent: update.agent, project: update.project } as Entry);
            publish();
          },
        });
        release = () => {
          stop();
          void subscription.release();
        };
      })
      .catch((error: unknown) => {
        if (lifetime.signal.aborted) return;
        setState({
          status: "error",
          agents: [],
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      lifetime.abort();
      release?.();
    };
  }, [paseo]);

  return state;
}
