import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  CreateComment,
  createOpenComment,
  type CommentAuthor,
  type CommentSelection,
} from "../../src/comments/CreateComment";
import { CommentSchema, type Comment } from "../../src/schema/comment";

const selection: CommentSelection = {
  blockId: "b1-prose-01",
  from: 6,
  to: 18,
  quotedText: "market share",
};

const author: CommentAuthor = {
  name: "Jane Consultant",
  email: "jane@example.com",
  role: "consultant",
};

describe("createOpenComment", () => {
  it("creates a schema-valid open comment with one instruction thread entry", () => {
    const comment = createOpenComment({
      id: "comment-1",
      selection,
      author,
      instruction: "Quantify this claim.",
      createdAt: "2026-05-25T12:00:00Z",
    });

    expect(CommentSchema.parse(comment)).toEqual(comment);
    expect(comment).toEqual({
      id: "comment-1",
      blockId: "b1-prose-01",
      range: { from: 6, to: 18 },
      quotedText: "market share",
      status: "open",
      thread: [
        {
          kind: "instruction",
          author: "Jane Consultant",
          authorEmail: "jane@example.com",
          authorRole: "consultant",
          text: "Quantify this claim.",
          createdAt: "2026-05-25T12:00:00Z",
        },
      ],
      createdAt: "2026-05-25T12:00:00Z",
      updatedAt: "2026-05-25T12:00:00Z",
    });
  });
});

describe("CreateComment", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits a new comment from a highlighted range", () => {
    let created: Comment | undefined;
    let markedCommentId: string | undefined;
    let markedSelection: CommentSelection | undefined;

    render(
      <CreateComment
        selection={selection}
        author={author}
        generateId={() => "comment-1"}
        now={() => new Date("2026-05-25T12:00:00Z")}
        onApplyMark={(commentId, sel) => {
          markedCommentId = commentId;
          markedSelection = sel;
          return true;
        }}
        onCreate={(comment) => {
          created = comment;
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("AI instruction"), {
      target: { value: "Shorten this sentence." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create comment" }));

    expect(markedCommentId).toBe("comment-1");
    // The captured selection (not the editor's live selection) is handed to the mark.
    expect(markedSelection).toBe(selection);
    expect(created?.thread).toEqual([
      {
        kind: "instruction",
        author: "Jane Consultant",
        authorEmail: "jane@example.com",
        authorRole: "consultant",
        text: "Shorten this sentence.",
        createdAt: "2026-05-25T12:00:00.000Z",
      },
    ]);
  });

  it("does not create the comment when the highlight fails to apply", () => {
    let created: Comment | undefined;

    render(
      <CreateComment
        selection={selection}
        author={author}
        onApplyMark={() => false}
        onCreate={(comment) => {
          created = comment;
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("AI instruction"), {
      target: { value: "Shorten this sentence." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create comment" }));

    // No orphan comment when the mark couldn't land; the user is told to retry.
    expect(created).toBeUndefined();
    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn't highlight",
    );
  });

  it("does not render when there is no highlighted range", () => {
    const { container } = render(
      <CreateComment selection={null} author={author} onCreate={() => {}} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
