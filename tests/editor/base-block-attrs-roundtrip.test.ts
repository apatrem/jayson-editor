import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  docModelToProseMirror,
  proseMirrorToDocModel,
} from "../../src/editor/mapping";
import {
  readBaseAttrsFromPm,
  withBaseAttrsOnPm,
} from "../../src/editor/base-block-attrs";
import { serializeDocModel, parseDocModelJson } from "../../src/docmodel/serialize";
import { DocModelSchema, type DocModel } from "../../src/schema/docmodel";

function loadSampleDoc(): Extract<DocModel, { kind: "document" }> {
  const parsed: unknown = parse(
    readFileSync(join(process.cwd(), "examples", "sample-proposal.yaml"), "utf8"),
  );
  const doc = DocModelSchema.parse(parsed);
  if (doc.kind !== "document") {
    throw new Error("expected a document fixture");
  }
  return doc;
}

describe("base-block-attrs pure helpers (ADR-0018)", () => {
  it("writes breakBefore/spaceBefore onto a PM node, normalising defaults", () => {
    expect(withBaseAttrsOnPm({ breakBefore: true, spaceBefore: 3 }, { type: "x", attrs: { a: 1 } }))
      .toEqual({ type: "x", attrs: { a: 1, breakBefore: true, spaceBefore: 3 } });
    // 0 is a meaningful override (blocks touch) — kept, not treated as default.
    expect(withBaseAttrsOnPm({ spaceBefore: 0 }, { type: "x" }))
      .toEqual({ type: "x", attrs: { breakBefore: false, spaceBefore: 0 } });
    // Unset / invalid → node defaults (false / null).
    expect(withBaseAttrsOnPm({}, { type: "x" }))
      .toEqual({ type: "x", attrs: { breakBefore: false, spaceBefore: null } });
    expect(withBaseAttrsOnPm({ spaceBefore: -2 }, { type: "x" }))
      .toEqual({ type: "x", attrs: { breakBefore: false, spaceBefore: null } });
  });

  it("reads overrides back, omitting anything at its default", () => {
    expect(readBaseAttrsFromPm({ attrs: { breakBefore: true, spaceBefore: 3 } }))
      .toEqual({ breakBefore: true, spaceBefore: 3 });
    expect(readBaseAttrsFromPm({ attrs: { breakBefore: false, spaceBefore: 0 } }))
      .toEqual({ spaceBefore: 0 });
    expect(readBaseAttrsFromPm({ attrs: { breakBefore: false, spaceBefore: null } }))
      .toEqual({});
    expect(readBaseAttrsFromPm({})).toEqual({});
  });
});

describe("BlockBase layout overrides survive DocModel↔ProseMirror↔YAML", () => {
  it("round-trips breakBefore/spaceBefore on Standard blocks", () => {
    const doc = loadSampleDoc();
    const first = doc.sections[0]?.blocks[0];
    const second = doc.sections[0]?.blocks[1];
    if (!first || !second) {
      throw new Error("fixture needs at least two blocks in section 0");
    }
    first.breakBefore = true;
    first.spaceBefore = 0;
    second.spaceBefore = 4;
    const modified = DocModelSchema.parse(doc); // re-validate with overrides

    expect(proseMirrorToDocModel(docModelToProseMirror(modified))).toEqual(modified);
  });

  it("carries the overrides as PM node attrs", () => {
    const doc = loadSampleDoc();
    const first = doc.sections[0]?.blocks[0];
    if (!first) throw new Error("fixture needs a block");
    first.breakBefore = true;
    first.spaceBefore = 2;

    const pm = docModelToProseMirror(DocModelSchema.parse(doc));
    const node = pm.content?.[0]?.content?.[0] as { attrs?: Record<string, unknown> };
    expect(node.attrs?.breakBefore).toBe(true);
    expect(node.attrs?.spaceBefore).toBe(2);
  });

  it("does not leak the keys onto a clean block (round-trip is unchanged)", () => {
    const doc = loadSampleDoc();
    const restored = proseMirrorToDocModel(docModelToProseMirror(doc));
    expect(restored).toEqual(doc);
    const firstBlock = (restored as typeof doc).sections[0]?.blocks[0] as Record<string, unknown>;
    expect("breakBefore" in firstBlock).toBe(false);
    expect("spaceBefore" in firstBlock).toBe(false);
  });

  it("survives a full canonical YAML serialize/parse cycle", () => {
    const doc = loadSampleDoc();
    const block = doc.sections[0]?.blocks[0];
    if (!block) throw new Error("fixture needs a block");
    block.breakBefore = true;
    block.spaceBefore = 5;
    const modified = DocModelSchema.parse(doc);

    const reparsed = DocModelSchema.parse(parseDocModelJson(serializeDocModel(modified)));
    expect(reparsed).toEqual(modified);
  });
});
