import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InlineReview } from "../../src/comments/InlineReview";
import type { Comment } from "../../src/schema/comment";
import type { DocModel } from "../../src/schema/docmodel";

const doc: DocModel = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme",
    project: "Inline test",
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
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Old sentence" }],
              },
            ],
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
  range: { from: 0, to: 12 },
  quotedText: "Old sentence",
  status: "open",
  thread: [
    {
      kind: "instruction",
      author: "Jane Consultant",
      authorEmail: "jane@example.com",
      authorRole: "consultant",
      text: "Make it punchier.",
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
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Sharper sentence" }],
              },
            ],
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

describe("InlineReview", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows redline-style replacements with floating accept/reject controls", () => {
    const accepted: string[] = [];
    const rejected: string[] = [];

    render(
      <InlineReview
        doc={doc}
        comments={[comment]}
        onAccept={(proposal) => {
          accepted.push(proposal.comment.id);
        }}
        onReject={(proposal) => {
          rejected.push(proposal.comment.id);
        }}
      />,
    );

    expect(screen.getByText("Old sentence").getAttribute("data-diff")).toBe(
      "removed",
    );
    expect(screen.getByText("Sharper sentence").getAttribute("data-diff")).toBe(
      "added",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Accept inline proposal for comment-a",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Reject inline proposal for comment-a",
      }),
    );

    expect(accepted).toEqual(["comment-a"]);
    expect(rejected).toEqual(["comment-a"]);
  });
});
