import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  BatchSubmit,
  buildProcessAllBatch,
  isCommentEligibleForBatchSubmit,
} from "../../src/comments/BatchSubmit";
import type { Comment } from "../../src/schema/comment";

function comment(id: string): Comment {
  return {
    id,
    blockId: `block-${id}`,
    range: { from: 0, to: 4 },
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
    ],
    createdAt: "2026-05-25T12:00:00Z",
    updatedAt: "2026-05-25T12:00:00Z",
  };
}

describe("isCommentEligibleForBatchSubmit", () => {
  it("includes open comments with no ai-proposal", () => {
    expect(isCommentEligibleForBatchSubmit(comment("comment-a"), undefined)).toBe(true);
  });

  it("excludes open comments that already have a proposal unless a follow-up is queued", () => {
    const withProposal: Comment = {
      ...comment("comment-a"),
      thread: [
        ...comment("comment-a").thread,
        {
          kind: "ai-proposal",
          patch: { op: "remove", blockId: "block-comment-a" },
          createdAt: "2026-05-25T12:01:00Z",
        },
      ],
    };
    expect(isCommentEligibleForBatchSubmit(withProposal, undefined)).toBe(false);
    expect(
      isCommentEligibleForBatchSubmit(withProposal, { "comment-a": "Try again." }),
    ).toBe(true);
  });
});

describe("buildProcessAllBatch", () => {
  it("includes queued follow-ups in the batched thread context", () => {
    const batch = buildProcessAllBatch({
      comments: [comment("comment-a")],
      followUps: { "comment-a": "Make it shorter." },
      followUpAuthor: {
        name: "Jane Consultant",
        email: "jane@example.com",
        role: "consultant",
      },
      createdAt: "2026-05-25T12:05:00Z",
    });

    expect(batch[0]?.thread.at(-1)).toEqual({
      role: "user",
      content: "Follow-up from Jane Consultant at 2026-05-25T12:05:00Z:\nMake it shorter.",
    });
  });
});

describe("BatchSubmit", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits all open comments and shows per-comment status", async () => {
    const submittedIds: string[][] = [];

    render(
      <BatchSubmit
        comments={[comment("comment-a"), comment("comment-b")]}
        onSubmit={(batch) => {
          submittedIds.push(batch.map((entry) => entry.commentId));
          return Promise.resolve({
            results: [
              {
                status: "ok",
                commentId: "comment-a",
                patch: {
                  op: "remove",
                  blockId: "block-comment-a",
                },
              },
              {
                status: "failed",
                commentId: "comment-b",
                error: "No valid patch",
              },
            ],
          });
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Process all" }));

    await waitFor(() => {
      expect(screen.getByText("comment-a: done")).toBeTruthy();
      expect(screen.getByText("comment-b: failed")).toBeTruthy();
    });
    expect(submittedIds).toEqual([["comment-a", "comment-b"]]);
  });
});
