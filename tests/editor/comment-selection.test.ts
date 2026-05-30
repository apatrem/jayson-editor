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

describe("getCommentSelection", () => {
  it("returns blockId, range, and quoted text for a non-empty selection", () => {
    const editor = makeEditor();
    try {
      const textStart = 2;
      editor.commands.setTextSelection({ from: textStart, to: textStart + 5 });
      const selection = getCommentSelection(editor);
      expect(selection).not.toBeNull();
      expect(selection!.blockId).toBe("h1");
      expect(selection!.from).toBe(textStart);
      expect(selection!.to).toBe(textStart + 5);
      expect(selection!.quotedText).toBe("Hello");
    } finally {
      editor.destroy();
    }
  });

  it("returns null for an empty selection", () => {
    const editor = makeEditor();
    try {
      editor.commands.setTextSelection(3);
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
