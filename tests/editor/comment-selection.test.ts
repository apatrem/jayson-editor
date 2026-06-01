import { Editor as CoreEditor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createEditorExtensions } from "../../src/editor/Editor";
import { getCommentSelection } from "../../src/editor/comment-selection";

function makeEditor(content?: object): CoreEditor {
  return new CoreEditor({
    extensions: createEditorExtensions(),
    content: content ?? {
      type: "doc",
      content: [
        {
          type: "section",
          attrs: { sectionId: "s1", title: "S" },
          content: [
            {
              type: "heading",
              attrs: { blockId: "h1", level: 2, numbered: true, note: "" },
              content: [{ type: "text", text: "Hello world" }],
            },
          ],
        },
      ],
    },
  });
}

/** A prose block accepts inline marks, so a comment can be created inside it. */
function proseSection(blocks: { blockId: string; text: string }[]): object {
  return {
    type: "doc",
    content: [
      {
        type: "section",
        attrs: { sectionId: "s1", title: "S" },
        content: blocks.map((b) => ({
          type: "prose",
          attrs: { blockId: b.blockId, align: "left", note: "" },
          content: [{ type: "paragraph", content: [{ type: "text", text: b.text }] }],
        })),
      },
    ],
  };
}

describe("getCommentSelection", () => {
  it("returns blockId, range, and quoted text for a non-empty prose selection", () => {
    const editor = makeEditor(proseSection([{ blockId: "p1", text: "Hello world" }]));
    try {
      // prose wraps a paragraph, so text begins one position deeper than a heading.
      const textStart = 3;
      editor.commands.setTextSelection({ from: textStart, to: textStart + 5 });
      const selection = getCommentSelection(editor);
      expect(selection).not.toBeNull();
      expect(selection!.blockId).toBe("p1");
      expect(selection!.from).toBe(textStart);
      expect(selection!.to).toBe(textStart + 5);
      expect(selection!.quotedText).toBe("Hello");
    } finally {
      editor.destroy();
    }
  });

  it("returns null for a heading selection — the comment mark can't attach", () => {
    // The heading node declares `marks: ""`, so a comment highlight can't be
    // applied; the bubble must not offer to comment there.
    const editor = makeEditor();
    try {
      editor.commands.setTextSelection({ from: 2, to: 7 });
      expect(getCommentSelection(editor)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("returns null when the selection spans two blocks", () => {
    const editor = makeEditor(
      proseSection([
        { blockId: "p1", text: "Hello" },
        { blockId: "p2", text: "World" },
      ]),
    );
    try {
      // from inside "Hello" (block p1) to inside "World" (block p2): a single
      // comment can't faithfully anchor to both, so the selection is rejected.
      editor.commands.setTextSelection({ from: 5, to: 14 });
      expect(getCommentSelection(editor)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("returns null for an empty selection", () => {
    const editor = makeEditor(proseSection([{ blockId: "p1", text: "Hello world" }]));
    try {
      editor.commands.setTextSelection(4);
      expect(getCommentSelection(editor)).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("returns null when no enclosing block carries a blockId", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "section",
          attrs: { sectionId: "s1", title: "S" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "No id" }] }],
        },
      ],
    });
    try {
      editor.commands.setTextSelection({ from: 3, to: 6 });
      expect(getCommentSelection(editor)).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});
