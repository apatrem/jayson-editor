import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Editor, type JSONContent } from "@tiptap/core";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { acceptCommentProposal } from "../src/comments/ApplyComment";
import {
  docModelToProseMirror,
  proseMirrorToDocModel,
} from "../src/editor/mapping";
import { createEditorExtensions } from "../src/editor/Editor";
import { DocModelSchema, type DocModel } from "../src/schema/docmodel";
import { validateDocModel } from "../src/schema/validate";
import type { Comment } from "../src/schema/comment";

const repoRoot = process.cwd();

function loadSampleDeck(): Extract<DocModel, { kind: "deck" }> {
  const parsed: unknown = parse(
    readFileSync(join(repoRoot, "examples/sample-deck.yaml"), "utf8"),
  );
  const doc = DocModelSchema.parse(parsed);
  if (doc.kind !== "deck") {
    throw new Error("expected sample deck fixture");
  }
  return doc;
}

function asEditorJsonNode(value: unknown): JSONContent {
  if (value === null || typeof value !== "object") {
    throw new Error("expected editor JSON node");
  }
  const maybeNode = value as { type?: unknown };
  if (typeof maybeNode.type !== "string") {
    throw new Error("expected editor JSON node with type");
  }
  return value as JSONContent;
}

describe("deck reuse across shared systems", () => {
  it("validates decks with the same DocModel schema and editor mapping", () => {
    const deck = loadSampleDeck();

    expect(validateDocModel(deck).ok).toBe(true);
    const editorDoc = docModelToProseMirror(deck);

    expect(editorDoc.attrs.kind).toBe("deck");
    expect(editorDoc.content[0]?.type).toBe("slide");
    expect(proseMirrorToDocModel(editorDoc)).toEqual(deck);
  });

  it("loads deck leaf blocks into the same TipTap extension set", () => {
    const deck = loadSampleDeck();
    const editorDoc = docModelToProseMirror(deck);
    const firstBlockNode = asEditorJsonNode(editorDoc.content
      .flatMap((slide) => slide.content ?? [])
      .at(0));

    const editor = new Editor({
      extensions: createEditorExtensions(),
      content: {
        type: "doc",
        content: [firstBlockNode],
      },
    });

    try {
      expect(editor.getJSON().content?.[0]?.type).toBe(firstBlockNode.type);
      expect(editor.schema.marks.commentMark).toBeDefined();
    } finally {
      editor.destroy();
    }
  });

  it("applies comment proposals to deck blocks without deck-specific comment logic", () => {
    const deck = loadSampleDeck();
    const targetBlock = deck.slides[1]?.blocks[0];
    if (targetBlock?.type !== "numbered-list") {
      throw new Error("expected numbered-list block in sample deck");
    }

    const comment: Comment = {
      id: "comment-deck-1",
      blockId: targetBlock.id,
      quotedText: "Why now",
      status: "open",
      createdAt: "2026-05-25T00:00:00Z",
      updatedAt: "2026-05-25T00:00:00Z",
      thread: [
        {
          kind: "instruction",
          author: "Consultant",
          authorEmail: "consultant@example.com",
          authorRole: "consultant",
          text: "Start the agenda at three.",
          createdAt: "2026-05-25T00:00:00Z",
        },
        {
          kind: "ai-proposal",
          createdAt: "2026-05-25T00:00:01Z",
          patch: {
            op: "replace",
            blockId: targetBlock.id,
            block: { ...targetBlock, startAt: 3 },
          },
        },
      ],
    };

    const updated = acceptCommentProposal(
      { ...deck, comments: [comment] },
      comment,
      { now: () => "2026-05-25T00:00:02Z" },
    );

    if (updated.kind !== "deck") {
      throw new Error("expected deck after comment application");
    }
    const updatedBlock = updated.slides[1]?.blocks[0];

    expect(updatedBlock).toMatchObject({ id: targetBlock.id, startAt: 3 });
    expect(updated.comments[0]).toMatchObject({
      id: comment.id,
      status: "applied",
      updatedAt: "2026-05-25T00:00:02Z",
    });
    expect(validateDocModel(updated).ok).toBe(true);
  });
});
