import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DiffReview } from "../../src/comments/DiffReview";
import type { Comment } from "../../src/schema/comment";
import type { DocModel } from "../../src/schema/docmodel";

const doc: DocModel = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme",
    project: "Diff test",
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
        block("block-a", "Old A"),
        block("block-b", "Old B"),
      ],
    },
  ],
  comments: [],
};

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

function comment(id: string, blockId: string, before: string, after: string): Comment {
  return {
    id,
    blockId,
    range: { from: 0, to: before.length },
    quotedText: before,
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
          blockId,
          block: block(blockId, after),
        },
        createdAt: "2026-05-25T12:01:00Z",
      },
    ],
    createdAt: "2026-05-25T12:00:00Z",
    updatedAt: "2026-05-25T12:01:00Z",
  };
}

describe("DiffReview", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows current/proposed panes and supports j/k/y/n keyboard actions", () => {
    const accepted: string[] = [];
    const rejected: string[] = [];

    render(
      <DiffReview
        doc={doc}
        comments={[
          comment("comment-a", "block-a", "Old A", "New A"),
          comment("comment-b", "block-b", "Old B", "New B"),
        ]}
        onAccept={(proposal) => {
          accepted.push(proposal.comment.id);
        }}
        onReject={(proposal) => {
          rejected.push(proposal.comment.id);
        }}
      />,
    );

    const review = screen.getByRole("region", { name: "Two-pane diff review" });
    expect(screen.getByText("Proposal 1 of 2")).toBeTruthy();
    expect(screen.getByLabelText("Current block").textContent).toContain("Old A");
    expect(screen.getByLabelText("Proposed block").textContent).toContain("New A");

    fireEvent.keyDown(review, { key: "j" });
    expect(screen.getByText("Proposal 2 of 2")).toBeTruthy();
    expect(screen.getByLabelText("Proposed block").textContent).toContain("New B");

    fireEvent.keyDown(review, { key: "y" });
    fireEvent.keyDown(review, { key: "n" });

    expect(accepted).toEqual(["comment-b"]);
    expect(rejected).toEqual(["comment-b"]);
  });
});
