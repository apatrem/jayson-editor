import { describe, expect, it } from "vitest";
import {
  acceptCommentProposal,
  rejectCommentProposal,
} from "../../src/comments/ApplyComment";
import type { Comment } from "../../src/schema/comment";
import type { DocModel } from "../../src/schema/docmodel";

const doc: DocModel = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme",
    project: "Apply test",
    docKind: "proposal",
    tags: [],
    language: "en",
    status: "draft",
    archived: false,
    confidentialityLevel: "medium",
    owner: "jane@example.com",
    reviewers: [],
    createdAt: "2026-05-25T12:00:00Z",
    updatedAt: "2026-05-25T12:00:00Z",
    brandRef: "$brand:default",
  },
  sections: [
    {
      id: "section-1",
      title: "Executive summary",
      blocks: [
        {
          id: "block-a",
          type: "prose",
          content: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Old" }] }],
          },
          align: "left",
        },
      ],
    },
  ],
  comments: [],
};

const comment: Comment = {
  id: "comment-a",
  blockId: "block-a",
  range: { from: 0, to: 3 },
  quotedText: "Old",
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
        op: "replace",
        blockId: "block-a",
        block: {
          id: "block-a",
          type: "prose",
          content: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "New" }] }],
          },
          align: "left",
        },
      },
      createdAt: "2026-05-25T12:01:00Z",
    },
  ],
  createdAt: "2026-05-25T12:00:00Z",
  updatedAt: "2026-05-25T12:01:00Z",
};

describe("ApplyComment", () => {
  it("accepts the latest proposal as one undo-bounded operation", () => {
    let undoSteps = 0;
    const updated = acceptCommentProposal(doc, comment, {
      now: () => "2026-05-25T12:05:00Z",
      runAsSeparateUndoStep: (operation) => {
        undoSteps += 1;
        operation();
      },
    });

    expect(undoSteps).toBe(1);
    expect(updated.comments[0]?.status).toBe("applied");
    expect(updated.comments[0]?.updatedAt).toBe("2026-05-25T12:05:00Z");
    expect(
      updated.kind === "document"
        ? updated.sections[0]?.blocks[0]?.type
        : undefined,
    ).toBe("prose");
    expect(JSON.stringify(updated)).toContain("New");
    expect(JSON.stringify(doc)).toContain("Old");
  });

  it("rejects without changing the target block", () => {
    const updated = rejectCommentProposal(doc, comment, {
      now: () => "2026-05-25T12:05:00Z",
    });

    expect(updated.comments[0]?.status).toBe("rejected");
    expect(
      updated.kind === "document"
        ? JSON.stringify(updated.sections[0]?.blocks[0])
        : "",
    ).toContain("Old");
    expect(
      updated.kind === "document"
        ? JSON.stringify(updated.sections[0]?.blocks[0])
        : "",
    ).not.toContain("New");
  });
});
