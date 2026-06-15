import { Editor as CoreEditor } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Code from "@tiptap/extension-code";
import Document from "@tiptap/extension-document";
import Italic from "@tiptap/extension-italic";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import type { JSONContent } from "@tiptap/react";
import { describe, expect, it } from "vitest";
import { normalizeProseMarksForEditor } from "../../src/editor/normalize-prose-marks";
import { markdownToProseMirror } from "../../src/generation/markdown-to-prosemirror";

interface PmNode {
  type: string;
  text?: string;
  content?: PmNode[];
  marks?: Array<{ type: string }>;
}

function collectTextNodes(root: PmNode): PmNode[] {
  const nodes: PmNode[] = [];
  const walk = (node: PmNode): void => {
    if (node.type === "text") nodes.push(node);
    for (const child of node.content ?? []) walk(child);
  };
  walk(root);
  return nodes;
}

function assertCodeMarkIsolated(root: PmNode): void {
  for (const node of collectTextNodes(root)) {
    const markTypes = (node.marks ?? []).map((mark) => mark.type);
    if (markTypes.includes("code")) {
      expect(markTypes, `text "${node.text}" must not combine code with other marks`).toEqual([
        "code",
      ]);
    }
  }
}

function assertPassesPmSchema(body: PmNode): void {
  const editor = new CoreEditor({
    extensions: [Document, Paragraph, Text, Bold, Italic, Code],
    content: normalizeProseMarksForEditor(body as JSONContent),
  });
  try {
    editor.state.doc.check();
  } finally {
    editor.destroy();
  }
}

describe("T-203 · markdown converter code-mark schema conformance", () => {
  it("keeps backtick spans literal and isolates code from emphasis (review triggers)", () => {
    const cases: Array<{ input: string; codeText: string }> = [
      { input: "`a **b** c`", codeText: "a **b** c" },
      { input: "**use the `foo` flag**", codeText: "foo" },
    ];

    for (const { input, codeText } of cases) {
      const { body } = markdownToProseMirror(input);
      assertCodeMarkIsolated(body);
      assertPassesPmSchema(body);
      const codeNodes = collectTextNodes(body).filter((node) =>
        node.marks?.some((mark) => mark.type === "code"),
      );
      expect(
        codeNodes.some((node) => node.text === codeText),
        `expected literal code span "${codeText}" for input ${JSON.stringify(input)}`,
      ).toBe(true);
    }
  });

  it("preserves emphasis delimiters literally inside backticks", () => {
    const { body } = markdownToProseMirror("`**not bold**`");
    const codeNode = collectTextNodes(body).find((node) =>
      node.marks?.some((mark) => mark.type === "code"),
    );
    expect(codeNode?.text).toBe("**not bold**");
    assertCodeMarkIsolated(body);
    assertPassesPmSchema(body);
  });

  it("never emits code combined with strong/em across an emphasis matrix", () => {
    const matrix = [
      "**use the `foo` flag**",
      "*use the `foo` flag*",
      "**`foo`**",
      "*`foo`*",
      "<strong>use the <code>foo</code> flag</strong>",
      "<em>use the <code>foo</code> flag</em>",
      "<strong><code>foo</code></strong>",
      "`a **b** c`",
      "`*not italic*`",
    ];

    for (const input of matrix) {
      const { body } = markdownToProseMirror(input);
      assertCodeMarkIsolated(body);
      assertPassesPmSchema(body);
    }
  });

  it("records coercion warnings when emphasis marks are dropped for code spans", () => {
    const { warnings } = markdownToProseMirror("**use the `foo` flag**");
    expect(
      warnings.some(
        (warning) =>
          warning.action.includes("dropped conflicting marks") &&
          warning.action.includes("strong"),
      ),
    ).toBe(true);
  });
});
