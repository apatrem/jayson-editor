import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommentReviewSurface } from "../../src/comments/CommentReviewSurface";
import type { DocumentModel } from "../../src/renderer/DocumentRenderer";
import type { BatchedCommentClient } from "../../src/llm/batch-comments";
import type { Comment } from "../../src/schema/comment";

afterEach(() => {
  cleanup();
});

function docWithTwoOpenComments(): DocumentModel {
  const instruction = (text: string) => ({
    kind: "instruction" as const,
    author: "Jane",
    authorEmail: "jane@example.com",
    authorRole: "consultant" as const,
    text,
    createdAt: "2026-05-27T00:00:00Z",
  });
  const comment = (id: string, text: string) => ({
    id,
    blockId: "b1",
    quotedText: "Hello",
    status: "open" as const,
    thread: [instruction(text)],
    createdAt: "2026-05-27T00:00:00Z",
    updatedAt: "2026-05-27T00:00:00Z",
  });
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
    comments: [comment("c1", "Punchier."), comment("c2", "Shorter.")],
  };
}

function commentWithProposal(id: string, instruction: string): Comment {
  return {
    id,
    blockId: "b1",
    quotedText: "Hello",
    status: "open",
    thread: [
      {
        kind: "instruction",
        author: "Jane",
        authorEmail: "jane@example.com",
        authorRole: "consultant",
        text: instruction,
        createdAt: "2026-05-27T00:00:00Z",
      },
      {
        kind: "ai-proposal",
        patch: { op: "remove", blockId: "b1" },
        createdAt: "2026-05-27T01:00:00Z",
      },
    ],
    createdAt: "2026-05-27T00:00:00Z",
    updatedAt: "2026-05-27T01:00:00Z",
  };
}

/** Mock client that echoes an ok `remove` patch for every comment in the request. */
function echoClient() {
  const call = vi.fn<BatchedCommentClient["call"]>((_modelKind, request) => {
    const parsed = JSON.parse(request.messages[0]!.content) as {
      comments: Array<{ commentId: string; thread: Array<{ content: string }> }>;
    };
    const results = parsed.comments.map((c) => ({
      status: "ok" as const,
      commentId: c.commentId,
      patch: { op: "remove" as const, blockId: "b1" },
    }));
    return Promise.resolve({ content: JSON.stringify({ results }), raw: {} });
  });
  return { client: { call }, call };
}

describe("CommentReviewSurface", () => {
  it("sends open comments to the fast model and writes proposals back", async () => {
    const { client, call } = echoClient();
    const onDocChange = vi.fn();
    render(
      <CommentReviewSurface
        doc={docWithTwoOpenComments()}
        commentClient={client}
        onDocChange={onDocChange}
        now={() => "2026-05-29T12:00:00Z"}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /process all/i }));

    await waitFor(() => expect(onDocChange).toHaveBeenCalled());
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0]?.[0]).toBe("fast");
    const updated = onDocChange.mock.calls[0]?.[0] as DocumentModel;
    expect(updated.comments.every((c) => c.thread.at(-1)?.kind === "ai-proposal")).toBe(
      true,
    );
  });

  it("does not show Accept for open comments without an ai-proposal", () => {
    render(
      <CommentReviewSurface
        doc={docWithTwoOpenComments()}
        commentClient={echoClient().client}
        onDocChange={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /accept proposal/i }),
    ).toBeNull();
  });

  it("shows Accept for comments that have an ai-proposal", () => {
    const doc = docWithTwoOpenComments();
    doc.comments = [commentWithProposal("c1", "Punchier.")];
    render(
      <CommentReviewSurface
        doc={doc}
        commentClient={echoClient().client}
        onDocChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /accept proposal for c1/i }),
    ).toBeTruthy();
  });

  it("routes thinking-toggled comments as a separate thinking batch (≤2 batches)", async () => {
    const { client, call } = echoClient();
    render(
      <CommentReviewSurface
        doc={docWithTwoOpenComments()}
        commentClient={client}
        onDocChange={vi.fn()}
        now={() => "2026-05-29T12:00:00Z"}
      />,
    );

    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.click(screen.getByRole("button", { name: /process all/i }));

    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    const modelKinds = call.mock.calls.map((c) => c[0]).sort();
    expect(modelKinds).toEqual(["fast", "thinking"]);
  });

  it("includes queued follow-ups in the batched request thread", async () => {
    const { client, call } = echoClient();
    const doc = docWithTwoOpenComments();
    doc.comments = [commentWithProposal("c1", "Punchier.")];

    render(
      <CommentReviewSurface
        doc={doc}
        commentClient={client}
        onDocChange={vi.fn()}
        now={() => "2026-05-29T12:00:00Z"}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /follow up on c1/i }));
    fireEvent.change(screen.getByLabelText(/follow-up for c1/i), {
      target: { value: "Make it shorter." },
    });
    fireEvent.click(screen.getByRole("button", { name: /queue follow-up/i }));

    fireEvent.click(screen.getByRole("button", { name: /process all/i }));

    await waitFor(() => expect(call).toHaveBeenCalled());
    const request = call.mock.calls[0]?.[1];
    const parsed = JSON.parse(request!.messages[0]!.content) as {
      comments: Array<{ thread: Array<{ content: string }> }>;
    };
    expect(parsed.comments[0]?.thread.at(-1)?.content).toContain("Make it shorter.");
  });

  it("does not re-send comments that already have a proposal without a queued follow-up", async () => {
    const { client, call } = echoClient();
    const doc = docWithTwoOpenComments();
    doc.comments = [
      commentWithProposal("c1", "Done."),
      ...docWithTwoOpenComments().comments.filter((c) => c.id === "c2"),
    ];

    render(
      <CommentReviewSurface
        doc={doc}
        commentClient={client}
        onDocChange={vi.fn()}
        now={() => "2026-05-29T12:00:00Z"}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /process all/i }));

    await waitFor(() => expect(call).toHaveBeenCalled());
    const request = call.mock.calls[0]?.[1];
    const parsed = JSON.parse(request!.messages[0]!.content) as {
      comments: Array<{ commentId: string }>;
    };
    expect(parsed.comments.map((c) => c.commentId)).toEqual(["c2"]);
  });

  it("shows a finish-setup hint and no Process-all button when no client is supplied", () => {
    render(
      <CommentReviewSurface doc={docWithTwoOpenComments()} onDocChange={vi.fn()} />,
    );
    expect(screen.getByText(/finish llm setup/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /process all/i })).toBeNull();
  });
});
