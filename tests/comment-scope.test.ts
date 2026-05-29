import { describe, expect, it } from "vitest";
import { acceptCommentProposal } from "../src/comments/ApplyComment";
import type { Comment } from "../src/schema/comment";
import type { DocModel } from "../src/schema/docmodel";

function makeDoc(count: number): DocModel {
  return {
    kind: "document",
    schemaVersion: "1.0.0",
    meta: {
      client: "Acme",
      project: "Scope test",
      docKind: "proposal",
      tags: [],
      language: "en",
      status: "in-review",
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
        blocks: Array.from({ length: count }, (_, index) =>
          block(`block-${index}`, `Original ${index}`),
        ),
      },
    ],
    comments: [],
  };
}

function block(id: string, text: string) {
  return {
    id,
    type: "prose" as const,
    content: {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
    align: "left" as const,
  };
}

function commentFor(blockId: string, patchBlockId = blockId): Comment {
  return {
    id: `comment-${blockId}`,
    blockId,
    range: { from: 0, to: 8 },
    quotedText: "Original",
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
          blockId: patchBlockId,
          block: block(patchBlockId, `Updated ${blockId}`),
        },
        createdAt: "2026-05-25T12:01:00Z",
      },
    ],
    createdAt: "2026-05-25T12:00:00Z",
    updatedAt: "2026-05-25T12:01:00Z",
  };
}

function blocksById(doc: DocModel): Record<string, string> {
  if (doc.kind !== "document") {
    return {};
  }
  return Object.fromEntries(
    doc.sections.flatMap((section) =>
      section.blocks.map((candidate) => [candidate.id, JSON.stringify(candidate)]),
    ),
  );
}

describe("AI comment patch scope", () => {
  it("keeps all non-target blocks byte-identical across a 20-comment batch", () => {
    const doc = makeDoc(20);
    const originalBlocks = blocksById(doc);

    for (let index = 0; index < 20; index += 1) {
      const blockId = `block-${index}`;
      const updated = acceptCommentProposal(doc, commentFor(blockId), {
        now: () => "2026-05-25T12:05:00Z",
      });
      const updatedBlocks = blocksById(updated);

      for (const [candidateId, originalJson] of Object.entries(originalBlocks)) {
        if (candidateId === blockId) {
          expect(updatedBlocks[candidateId]).not.toBe(originalJson);
        } else {
          expect(updatedBlocks[candidateId]).toBe(originalJson);
        }
      }
    }
  });

  it("rejects AI proposals that target a different block than the comment anchor", () => {
    expect(() =>
      acceptCommentProposal(makeDoc(2), commentFor("block-0", "block-1")),
    ).toThrow("targets block 'block-1' outside comment anchor 'block-0'");
  });
});
