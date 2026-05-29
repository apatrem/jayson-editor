import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommentReviewSurface } from "../../src/comments/CommentReviewSurface";
import type { DocumentModel } from "../../src/renderer/DocumentRenderer";
import type { BatchedCommentClient } from "../../src/llm/batch-comments";

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

/** Mock client that echoes an ok `remove` patch for every comment in the request. */
function echoClient() {
  const call = vi.fn<BatchedCommentClient["call"]>((_modelKind, request) => {
    const parsed = JSON.parse(request.messages[0]!.content) as {
      comments: Array<{ commentId: string }>;
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
    // One batch on the fast model (nothing toggled to thinking).
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0]?.[0]).toBe("fast");
    const updated = onDocChange.mock.calls[0]?.[0] as DocumentModel;
    expect(updated.comments.every((c) => c.thread.at(-1)?.kind === "ai-proposal")).toBe(
      true,
    );
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

    // Toggle the second comment to use the thinking model.
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    fireEvent.click(screen.getByRole("button", { name: /process all/i }));

    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    const modelKinds = call.mock.calls.map((c) => c[0]).sort();
    expect(modelKinds).toEqual(["fast", "thinking"]);
  });

  it("shows a finish-setup hint and no Process-all button when no client is supplied", () => {
    render(
      <CommentReviewSurface doc={docWithTwoOpenComments()} onDocChange={vi.fn()} />,
    );
    expect(screen.getByText(/finish llm setup/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /process all/i })).toBeNull();
  });
});
