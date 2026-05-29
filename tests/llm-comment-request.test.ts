import { describe, expect, it } from "vitest";
import {
  buildCommentBatchRequest,
  COMMENT_SYSTEM_PROMPT,
} from "../src/llm/comment-request";
import type { BatchedComment } from "../src/llm/batch-comments";
import type { DocumentModel } from "../src/renderer/DocumentRenderer";

const doc: DocumentModel = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme Industrial",
    project: "SMR Heat Strategy",
    docKind: "proposal",
    tags: [],
    language: "en",
    status: "draft",
    archived: false,
    confidentialityLevel: "high",
    owner: "owner@example.com",
    reviewers: [],
    createdAt: "2026-05-27T00:00:00Z",
    updatedAt: "2026-05-27T00:00:00Z",
    brandRef: "$brand:default",
  },
  sections: [
    {
      id: "s1",
      title: "Overview",
      blocks: [
        { id: "b1", type: "heading", level: 1, text: "Title", numbered: false },
      ],
    },
  ],
  comments: [],
};

const comments: BatchedComment[] = [
  {
    commentId: "c1",
    blockId: "b1",
    quotedText: "Title",
    thread: [{ role: "user", content: "Make this title punchier." }],
  },
];

describe("buildCommentBatchRequest", () => {
  it("assembles a request for the given model kind with the comment system prompt", () => {
    const req = buildCommentBatchRequest(doc, comments, "fast");
    expect(req.model).toBe("fast");
    expect(req.systemPrompt).toBe(COMMENT_SYSTEM_PROMPT);
    expect(req.comments).toEqual(comments);
  });

  it("includes doc + brand + schema contexts (no usage/cost)", () => {
    const req = buildCommentBatchRequest(doc, comments, "thinking");
    expect(req.model).toBe("thinking");
    expect(req.docContext).toContain("Acme Industrial");
    expect(req.brandTokensContext).toContain("$brand:default");
    expect(req.schemaContext).toContain("BlockPatch");
  });
});
