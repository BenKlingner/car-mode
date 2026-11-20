import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import type {
  answerRoleQuestion,
  dismissRoleQuestion,
  listRoleQuestions,
  RoleQuestion,
} from "../shared/role-questions";
import type { DaemonConnection } from "./daemon";

const ROLES_PLUGIN = "agent-roles";
/** Where Agent Roles keeps each project's tasks and questions. */
const BOARD = join(".paseo", "roles", "tasks.json");

/**
 * Reads open questions straight from Agent Roles' board files, which works whether or not that
 * plugin is busy. Answers and dismissals go through Agent Roles itself, which serializes its own
 * writes and delivers the answer to the asking agent, so this plugin never writes the file.
 */
export class RoleQuestions {
  constructor(private readonly daemon: DaemonConnection) {}

  async list({ projects }: RpcInput<typeof listRoleQuestions>): Promise<{ questions: RoleQuestion[] }> {
    const all = await Promise.all(
      projects.map(async ({ root, name }) => {
        try {
          const board = JSON.parse(await readFile(join(root, BOARD), "utf8")) as { questions?: unknown };
          return Array.isArray(board.questions) ? board.questions.flatMap((q) => toQuestion(q, root, name)) : [];
        } catch {
          return [];
        }
      }),
    );
    const questions = all.flat().sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency === "now" ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
    return { questions };
  }

  async answer({ projectRoot, questionId, answer }: RpcInput<typeof answerRoleQuestion>) {
    await this.call("roles.question.answer", { projectRoot, questionId, answer });
    return {};
  }

  async dismiss({ projectRoot, questionId }: RpcInput<typeof dismissRoleQuestion>) {
    await this.call("roles.question.dismiss", { projectRoot, questionId });
    return {};
  }

  private async call(method: string, input: unknown) {
    try {
      await (await this.daemon.get()).invokePluginRpc(ROLES_PLUGIN, method, input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(/not found|unknown plugin|not running/i.test(message) ? "Agent Roles isn't running." : message);
    }
  }
}

function toQuestion(raw: unknown, projectRoot: string, projectName: string): RoleQuestion[] {
  const q = raw as Record<string, unknown>;
  if (q?.status !== "open" || typeof q.id !== "string" || typeof q.text !== "string") return [];
  if (typeof q.agentId !== "string") return [];
  return [
    {
      projectRoot,
      projectName,
      id: q.id,
      text: q.text,
      options: Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === "string") : [],
      urgency: q.urgency === "later" ? "later" : "now",
      source: q.source === "box" ? "box" : "tool",
      agentId: q.agentId,
      ...(typeof q.askedBy === "string" ? { askedBy: q.askedBy } : {}),
      createdAt: typeof q.createdAt === "string" ? q.createdAt : new Date(0).toISOString(),
    },
  ];
}
