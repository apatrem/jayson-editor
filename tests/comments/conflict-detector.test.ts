import { describe, expect, it } from "vitest";
import { detectCommentConflicts } from "../../src/comments/ConflictDetector";
import type { Comment } from "../../src/schema/comment";

function comment(
  id: string,
  blockId: string,
  range: { from: number; to: number } | undefined,
): Comment {
  return {
    id,
    blockId,
    ...(range === undefined ? {} : { range }),
    quotedText: "text",
    status: "open",
    thread: [
      {
        kind: "instruction",
        author: "Jane Consultant",
        authorEmail: "jane@example.com",
        authorRole: "consultant",
        text: "Improve this.",
        createdAt: "2026-05-25T12:00:00Z",
      },
      {
        kind: "ai-proposal",
        patch: {
          op: "remove",
          blockId,
        },
        createdAt: "2026-05-25T12:01:00Z",
      },
    ],
    createdAt: "2026-05-25T12:00:00Z",
    updatedAt: "2026-05-25T12:01:00Z",
  };
}

describe("detectCommentConflicts", () => {
  it("flags overlapping open proposals on the same block", () => {
    expect(
      detectCommentConflicts([
        comment("comment-a", "block-a", { from: 0, to: 5 }),
        comment("comment-b", "block-a", { from: 4, to: 8 }),
        comment("comment-c", "block-a", { from: 8, to: 10 }),
        comment("comment-d", "block-b", { from: 0, to: 5 }),
      ]),
    ).toEqual({
      "comment-a": ["comment-b"],
      "comment-b": ["comment-a"],
    });
  });

  it("treats whole-block proposals as conflicting with ranged proposals", () => {
    expect(
      detectCommentConflicts([
        comment("comment-a", "block-a", undefined),
        comment("comment-b", "block-a", { from: 4, to: 8 }),
      ]),
    ).toEqual({
      "comment-a": ["comment-b"],
      "comment-b": ["comment-a"],
    });
  });
});
