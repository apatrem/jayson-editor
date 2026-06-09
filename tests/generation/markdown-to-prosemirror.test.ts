import { describe, expect, it } from "vitest";
import {
  ALLOWED_EDITOR_MARK_NAMES,
  ALLOWED_EDITOR_NODE_NAMES,
} from "../../src/editor/Editor";

// ─── FROZEN ACCEPTANCE TESTS · T-203 (plan/phase12-coarse) ──────────────────
// Committed red on purpose: they freeze the GENERATION_PIPELINE §4 converter
// contract before implementation. The module import below is computed so the
// missing module fails as a test assertion, not a compile error. Do not edit
// these tests to make a gate pass.

interface PmNode {
  type: string;
  content?: PmNode[];
  marks?: Array<{ type: string }>;
}

interface ConversionResult {
  content: PmNode[];
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

function collectNames(nodes: PmNode[]): { nodes: Set<string>; marks: Set<string> } {
  const found = { nodes: new Set<string>(), marks: new Set<string>() };
  const walk = (node: PmNode): void => {
    found.nodes.add(node.type);
    for (const mark of node.marks ?? []) found.marks.add(mark.type);
    for (const child of node.content ?? []) walk(child);
  };
  for (const node of nodes) walk(node);
  return found;
}

const allowedNodes = new Set<string>(ALLOWED_EDITOR_NODE_NAMES);
const allowedMarks = new Set<string>(ALLOWED_EDITOR_MARK_NAMES);

const SAMPLE_MD = [
  "## Findings",
  "",
  "A paragraph with **bold** and *italic* text.",
  "",
  "- first bullet",
  "- second bullet",
  "",
  "1. step one",
  "2. step two",
].join("\n");

describe("T-203 · markdown → ProseMirror is deterministic and closed-schema", () => {
  it("converts supported constructs to non-empty closed-schema content", async () => {
    const convert = await loadConverter();
    const result = convert(SAMPLE_MD);
    expect(result.content.length).toBeGreaterThan(0);
    const found = collectNames(result.content);
    for (const name of found.nodes) {
      expect(allowedNodes.has(name), `node "${name}" outside the closed editor schema`).toBe(true);
    }
    for (const name of found.marks) {
      expect(allowedMarks.has(name), `mark "${name}" outside the closed editor schema`).toBe(true);
    }
  });

  it("drops out-of-schema constructs with a coercion warning instead of throwing", async () => {
    const convert = await loadConverter();
    // <video> is outside the editor's allowed HTML set — it must be dropped
    // and warned about, never emitted and never thrown on.
    const hostile = 'before\n\n<video src="x.mp4"></video>\n\nafter';
    const result = convert(hostile);
    expect(result.warnings.length).toBeGreaterThan(0);
    const found = collectNames(result.content);
    for (const name of found.nodes) {
      expect(allowedNodes.has(name), `node "${name}" outside the closed editor schema`).toBe(true);
    }
  });

  it("is deterministic — same input, identical output", async () => {
    const convert = await loadConverter();
    expect(convert(SAMPLE_MD)).toEqual(convert(SAMPLE_MD));
  });
});
