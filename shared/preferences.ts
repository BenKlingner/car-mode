import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Kept on each device, so the car can hide projects the desktop still shows. */
export const carPreferences = defineSettings({
  id: "car-preferences",
  scope: "device",
  version: 1,
  schema: z.object({
    hiddenProjects: z.array(z.string()).default([]),
    /** Give helper agents their own cards instead of folding them into their lead's card. */
    showHelpers: z.boolean().default(false),
  }),
});
