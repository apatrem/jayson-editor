import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReviewPanel } from "../../src/comments/ReviewPanel";
import type { Comment } from "../../src/schema/comment";
import type { DocModel } from "../../src/schema/docmodel";

const doc: DocModel = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme",
    project: "Review test",
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
            content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
          },
          align: "left",
        },
        {
          id: "block-b",
          type: "prose",
          content: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }],
          },
          align: "left",
        },
      ],
    },
  ],
  comments: [],
};

function comment(id: string, blockId: string, instruction: string): Comment {
  return {
    id,
    blockId,
    range: { from: 0, to: 1 },
    quotedText: blockId,
    status: "open",
    thread: [
      {
        kind: "instruction",
        author: "Jane Consultant",
        authorEmail: "jane@example.com",
        authorRole: "consultant",
        text: instruction,
        createdAt: "2026-05-25T12:00:00Z",
      },
      {
        kind: "ai-proposal",
        patch: {
          op: "replace",
          blockId,
          block: {
            id: blockId,
            type: "prose",
            content: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: `${blockId} updated` }],
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
}

describe("ReviewPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("orders proposals by block position and exposes accept/reject actions", () => {
    const accepted: string[] = [];
    const rejected: string[] = [];

    render(
      <ReviewPanel
        doc={doc}
        comments={[
          comment("comment-b", "block-b", "Second block instruction"),
          comment("comment-a", "block-a", "First block instruction"),
        ]}
        onAccept={(proposal) => {
          accepted.push(proposal.comment.id);
        }}
        onReject={(proposal) => {
          rejected.push(proposal.comment.id);
        }}
      />,
    );

    const cards = screen.getAllByRole("article");
    expect(cards[0]?.textContent).toContain("First block instruction");
    expect(cards[1]?.textContent).toContain("Second block instruction");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Accept proposal for comment-a in Section 1 > Block 1",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Reject proposal for comment-b in Section 1 > Block 2",
      }),
    );

    expect(accepted).toEqual(["comment-a"]);
    expect(rejected).toEqual(["comment-b"]);
  });

  it("queues follow-ups and sends them as a batch payload", () => {
    const queued: Record<string, string>[] = [];
    const queueChanges: Record<string, string>[] = [];

    render(
      <ReviewPanel
        doc={doc}
        comments={[comment("comment-a", "block-a", "First block instruction")]}
        initialFollowUps={{ "comment-a": "Existing queued text." }}
        onFollowUpQueueChange={(followUps) => {
          queueChanges.push(followUps);
        }}
        onSendFollowUps={(followUps) => {
          queued.push(followUps);
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Follow up on comment-a" }));
    const followUpInput = screen.getByLabelText("Follow-up for comment-a");
    if (!(followUpInput instanceof HTMLTextAreaElement)) {
      throw new Error("Expected follow-up input to be a textarea.");
    }
    expect(followUpInput.value).toBe("Existing queued text.");
    fireEvent.change(screen.getByLabelText("Follow-up for comment-a"), {
      target: { value: "Use a less urgent tone." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Queue follow-up" }));
    fireEvent.click(screen.getByRole("button", { name: "Send 1 follow-up" }));

    expect(queued).toEqual([{ "comment-a": "Use a less urgent tone." }]);
    expect(queueChanges).toEqual([{ "comment-a": "Use a less urgent tone." }, {}]);
  });

  it("applies accept through DocModel update when requested", () => {
    let updatedDoc: DocModel | undefined;
    let undoSteps = 0;

    render(
      <ReviewPanel
        doc={doc}
        comments={[comment("comment-a", "block-a", "First block instruction")]}
        now={() => "2026-05-25T12:05:00Z"}
        runAsSeparateUndoStep={(operation) => {
          undoSteps += 1;
          operation();
        }}
        onDocChange={(nextDoc) => {
          updatedDoc = nextDoc;
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Accept proposal for comment-a in Section 1 > Block 1",
      }),
    );

    expect(undoSteps).toBe(1);
    expect(updatedDoc?.comments[0]?.status).toBe("applied");
    expect(JSON.stringify(updatedDoc)).toContain("block-a updated");
  });

  it("marks overlapping proposals as conflicts and blocks accept", () => {
    render(
      <ReviewPanel
        doc={doc}
        comments={[
          comment("comment-a", "block-a", "First block instruction"),
          comment("comment-b", "block-a", "Second block instruction"),
        ]}
      />,
    );

    expect(screen.getByText("conflict with comment-b")).toBeTruthy();
    expect(
      screen
        .getByRole("button", {
        name: "Accept proposal for comment-a in Section 1 > Block 1",
        })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});
