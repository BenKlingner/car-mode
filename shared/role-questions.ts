import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** An open question from the Agent Roles plugin's board in a project. */
export const RoleQuestionSchema = z.object({
  projectRoot: z.string(),
  projectName: z.string(),
  id: z.string(),
  text: z.string(),
  options: z.array(z.string()),
  urgency: z.enum(["now", "later"]),
  /** `tool` questions are answered through Agent Roles; `box` ones in the agent's question box. */
  source: z.enum(["tool", "box"]),
  agentId: z.string(),
  askedBy: z.string().optional(),
  createdAt: z.string(),
});
export type RoleQuestion = z.infer<typeof RoleQuestionSchema>;

const project = z.object({ root: z.string().min(1), name: z.string() });

export const listRoleQuestions = defineRpc({
  name: "roles-questions.list",
  input: z.object({ projects: z.array(project).max(100) }),
  output: z.object({ questions: z.array(RoleQuestionSchema) }),
});

export const answerRoleQuestion = defineRpc({
  name: "roles-questions.answer",
  input: z.object({ projectRoot: z.string().min(1), questionId: z.string().min(1), answer: z.string().min(1).max(4000) }),
  output: z.object({}),
});

export const dismissRoleQuestion = defineRpc({
  name: "roles-questions.dismiss",
  input: z.object({ projectRoot: z.string().min(1), questionId: z.string().min(1) }),
  output: z.object({}),
});
