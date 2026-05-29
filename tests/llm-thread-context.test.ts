import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assembleThreadContext,
  commentToBatchedComment,
} from "../src/llm/thread-context";
import { CommentSchema } from "../src/schema/comment";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const comment = CommentSchema.parse(
  stripMetadata(
    JSON.parse(
      readFileSync(join(repoRoot, "examples/sample-comment-thread.json"), "utf8"),
    ) as unknown,
  ),
);

describe("threaded comment context assembly (T-66)", () => {
  it("preserves thread order and maps roles for LLM context", () => {
    const thread = assembleThreadContext(comment);

    expect(thread.map((entry) => entry.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(thread[0]?.content).toContain("Comment from Jane Smith");
    expect(thread[1]?.content).toContain("Proposed patch at");
    expect(thread[2]?.content).toContain("Follow-up from Jane Smith");
    expect(thread[3]?.content).toContain(
      "Decide by Q1 2027 to secure significant first-mover tax credits",
    );
  });

  it("builds the BatchedComment shape consumed by the batch request", () => {
    const batched = commentToBatchedComment(comment);

    expect(batched).toMatchObject({
      commentId: "c-001-uuid-aaaa-bbbb-cccc-dddddddddddd",
      blockId: "b1-callout-01",
      quotedText:
        "EU industrial-decarbonization tax credits for SMR offtake expire Q4 2027.",
    });
    expect(batched.thread).toEqual(assembleThreadContext(comment));
  });
});

function stripMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripMetadata(entry));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.startsWith("_"))
      .map(([key, entry]) => [key, stripMetadata(entry)]),
  );
}
