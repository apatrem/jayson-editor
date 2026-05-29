import { describe, expect, it } from "vitest";
import { appendAiProposals } from "../../src/comments/append-proposals";
import type { DocumentModel } from "../../src/renderer/DocumentRenderer";
import type { BatchedCommentResponse } from "../../src/llm/batch-comments";

function docWithComments(): DocumentModel {
  return {
    kind: "document",
    schemaVersion: "1.0.0",
    meta: {
      client: "Acme",
      project: "Test",
      docKind: "proposal",
      tags: [],
      language: "en",
      status: "draft",
      archived: false,
      confidentialityLevel: "medium",
      owner: "owner@example.com",
      reviewers: [],
      createdAt: "2026-05-27T00:00:00Z",
      updatedAt: "2026-05-27T00:00:00Z",
      brandRef: "$brand:default",
    },
    sections: [
      {
        id: "s1",
        title: "Intro",
        blocks: [
          { id: "b1", type: "heading", level: 1, text: "Hello", numbered: false },
        ],
      },
    ],
    comments: [
      {
        id: "c1",
        blockId: "b1",
        quotedText: "Hello",
        status: "open",
        thread: [
          {
            kind: "instruction",
            author: "Jane",
            authorEmail: "jane@example.com",
            authorRole: "consultant",
            text: "Make it punchier.",
            createdAt: "2026-05-27T00:00:00Z",
          },
        ],
        createdAt: "2026-05-27T00:00:00Z",
        updatedAt: "2026-05-27T00:00:00Z",
      },
      {
        id: "c2",
        blockId: "b1",
        quotedText: "Hello",
        status: "open",
        thread: [
          {
            kind: "instruction",
            author: "Jane",
            authorEmail: "jane@example.com",
            authorRole: "consultant",
            text: "Shorten it.",
            createdAt: "2026-05-27T00:00:00Z",
          },
        ],
        createdAt: "2026-05-27T00:00:00Z",
        updatedAt: "2026-05-27T00:00:00Z",
      },
    ],
  };
}

const NOW = "2026-05-29T12:00:00Z";

describe("appendAiProposals", () => {
  it("appends a patch-only ai-proposal for each ok result and bumps updatedAt", () => {
    const response: BatchedCommentResponse = {
      results: [
        { status: "ok", commentId: "c1", patch: { op: "remove", blockId: "b1" } },
      ],
    };
    const updated = appendAiProposals(docWithComments(), response, NOW);
    const c1 = updated.comments.find((c) => c.id === "c1")!;
    expect(c1.thread).toHaveLength(2);
    expect(c1.thread[1]).toEqual({
      kind: "ai-proposal",
      patch: { op: "remove", blockId: "b1" },
      createdAt: NOW,
    });
    expect(c1.updatedAt).toBe(NOW);
  });

  it("leaves comments with no ok result untouched (failed / absent)", () => {
    const response: BatchedCommentResponse = {
      results: [
        { status: "ok", commentId: "c1", patch: { op: "remove", blockId: "b1" } },
        { status: "failed", commentId: "c2", error: "bad patch" },
      ],
    };
    const before = docWithComments();
    const updated = appendAiProposals(before, response, NOW);
    const c2 = updated.comments.find((c) => c.id === "c2")!;
    expect(c2.thread).toHaveLength(1);
    expect(c2.updatedAt).toBe("2026-05-27T00:00:00Z");
  });

  it("returns the same doc when there are no ok results", () => {
    const response: BatchedCommentResponse = {
      results: [{ status: "failed", commentId: "c1", error: "x" }],
    };
    const before = docWithComments();
    expect(appendAiProposals(before, response, NOW)).toBe(before);
  });

  it("persists no model or token fields on the proposal", () => {
    const response: BatchedCommentResponse = {
      results: [
        { status: "ok", commentId: "c1", patch: { op: "remove", blockId: "b1" } },
      ],
    };
    const updated = appendAiProposals(docWithComments(), response, NOW);
    const proposal = updated.comments[0]!.thread[1]!;
    expect(Object.keys(proposal).sort()).toEqual(["createdAt", "kind", "patch"]);
  });
});
