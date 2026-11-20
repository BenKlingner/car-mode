import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Clears Paseo's "needs attention" flag, as opening the agent in Paseo does. */
export const clearAttention = defineRpc({
  name: "attention.clear",
  input: z.object({ agentIds: z.array(z.string().min(1)).min(1).max(200) }),
  output: z.object({}),
});
