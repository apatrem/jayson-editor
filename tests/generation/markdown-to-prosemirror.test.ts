import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/react";
import { ALLOWED_EDITOR_MARK_NAMES } from "../../src/editor/Editor";
import { normalizeProseMarksForEditor } from "../../src/editor/normalize-prose-marks";

// ─── FROZEN ACCEPTANCE TESTS · T-203 (plan/phase12-coarse) ──────────────────
// Committed red on purpose: they freeze the GENERATION_PIPELINE §4 converter
// contract before implementation. Scope (dual-review punch-list #2): this
// module converts PROSE segments only — heading/list/table → block mapping is
// structuring's separate deterministic job, NOT this converter. Output is a
// DocModel-canonical prose fragment (doc-rooted, marks named `strong`/`em` per
// src/editor/normalize-prose-marks.ts); editor-side names (`bold`/`italic`)
// exist only past the editor boundary. The module import is computed so the
// missing module fails as an assertion, not a compile error. Do not edit these
// tests to make a gate pass.

interface PmNode {
  type: string;
  text?: string;
  content?: PmNode[];
  marks?: Array<{ type: string }>;
}

interface ConversionResult {
  body: PmNode;
  warnings: Array<{ construct: string; action: string }>;
}

type Converter = (markdown: string) => ConversionResult;

async function loadConverter(): Promise<Converter> {
  const moduleName = "markdown-to-prosemirror";
  let mod: Record<string, unknown> | null = null;
  try {
    mod = (await import(`../../src/generation/${moduleName}.ts`)) as Record<string, unknown>;
  } catch {
    mod = null;
  }
  const fn = mod?.markdownToProseMirror;
  expect(
    fn,
    "src/generation/markdown-to-prosemirror.ts must export markdownToProseMirror(markdown) (T-203)",
  ).toBeTypeOf("function");
  return fn as Converter;
}

function collectNames(root: PmNode): { nodes: Set<string>; marks: Set<string> } {
  const found = { nodes: new Set<string>(), marks: new Set<string>() };
  const walk = (node: PmNode): void => {
    found.nodes.add(node.type);
    for (const mark of node.marks ?? []) found.marks.add(mark.type);
    for (const child of node.content ?? []) walk(child);
  };
  walk(root);
  return found;
}

const allowedEditorMarks = new Set<string>(ALLOWED_EDITOR_MARK_NAMES);

const PROSE_MD = "A paragraph with **bold**, *italic* and `code` spans.\n\nA second paragraph.";

describe("T-203 · markdown prose → DocModel ProseMirror fragment", () => {
  it("emits a doc-rooted fragment of paragraphs with canonical strong/em marks", async () => {
    const convert = await loadConverter();
    const { body } = convert(PROSE_MD);

    expect(body.type).toBe("doc");
    expect(body.content?.length).toBe(2);
    for (const child of body.content ?? []) {
      expect(child.type, "prose fragments contain paragraphs only").toBe("paragraph");
    }

    const found = collectNames(body);
    // Positive mapping — a constant-paragraph implementation must fail here.
    expect(found.marks.has("strong"), '**bold** must map to the canonical "strong" mark').toBe(true);
    expect(found.marks.has("em"), '*italic* must map to the canonical "em" mark').toBe(true);
    expect(found.marks.has("code"), "`code` must map to the \"code\" mark").toBe(true);
    // Editor-side names must NOT appear in the raw (DocModel-side) fragment.
    expect(found.marks.has("bold"), 'editor-side "bold" must not leak into the fragment').toBe(false);
    expect(found.marks.has("italic"), 'editor-side "italic" must not leak into the fragment').toBe(false);
  });

  it("normalizes cleanly through the real editor boundary", async () => {
    const convert = await loadConverter();
    const { body } = convert(PROSE_MD);
    const normalized = normalizeProseMarksForEditor(body as JSONContent) as PmNode;
    const found = collectNames(normalized);
    for (const name of found.marks) {
      expect(
        allowedEditorMarks.has(name),
        `mark "${name}" is outside the editor's closed mark set after normalization`,
      ).toBe(true);
    }
  });

  it("drops out-of-schema constructs with a coercion warning instead of throwing", async () => {
    const convert = await loadConverter();
    // <video> is outside the editor's allowed HTML set — it must be dropped
    // and warned about, never emitted and never thrown on.
    const hostile = 'before\n\n<video src="x.mp4"></video>\n\nafter';
    const result = convert(hostile);
    expect(result.warnings.length).toBeGreaterThan(0);
    const found = collectNames(result.body);
    for (const name of found.nodes) {
      expect(
        ["doc", "paragraph", "text"].includes(name),
        `node "${name}" outside the prose-fragment node set`,
      ).toBe(true);
    }
  });

  it("is deterministic — same input, identical output", async () => {
    const convert = await loadConverter();
    expect(convert(PROSE_MD)).toEqual(convert(PROSE_MD));
  });
});
