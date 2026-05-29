import { z } from "zod";
import { BlockPatchSchema } from "./block-patch";
import { StableIdSchema } from "./stable-id";

export const ThreadEntrySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("instruction"),
      author: z.string().min(1),
      authorEmail: z.string().email(),
      authorRole: z.enum(["consultant", "reviewer"]),
      text: z.string().min(1).max(2000),
      createdAt: z.string().datetime(),
    })
    .strict(),

  z
    .object({
      // ADR-0019: no model/usage is persisted in documents — an ai-proposal
      // keeps only its proposed patch (the substantive content) + timestamp.
      kind: z.literal("ai-proposal"),
      patch: BlockPatchSchema,
      createdAt: z.string().datetime(),
    })
    .strict(),

  z
    .object({
      kind: z.literal("follow-up"),
      author: z.string().min(1),
      authorEmail: z.string().email(),
      text: z.string().min(1).max(2000),
      createdAt: z.string().datetime(),
    })
    .strict(),
]);

export type ThreadEntry = z.infer<typeof ThreadEntrySchema>;

export const CommentSchema = z
  .object({
    id: StableIdSchema,
    blockId: StableIdSchema,
    range: z
      .object({
        from: z.number().int().nonnegative(),
        to: z.number().int().nonnegative(),
      })
      .optional(),
    quotedText: z.string().max(1000),
    status: z.enum(["open", "applied", "rejected"]),
    thread: z.array(ThreadEntrySchema).min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((comment, ctx) => {
    if (comment.thread[0]?.kind !== "instruction") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Thread must start with an instruction entry.",
        path: ["thread", 0, "kind"],
      });
    }
  });

export type Comment = z.infer<typeof CommentSchema>;
