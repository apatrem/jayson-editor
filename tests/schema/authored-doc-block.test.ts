/**
 * The DocModel accepts Authored blocks stored as `{sender}:{slug}` (ADR-0009,
 * ADR-0016) and round-trips them losslessly through YAML serialization.
 *
 * Authored blocks carry per-manifest dynamic attrs, so the DocModel layer
 * validates only the common shape (id, authored type, optional note/body) and
 * passes attr fields through (ADR-0016). Manifest-specific validation is not a
 * DocModel-parse concern; ADR-0013 guarantees the data can't execute.
 */

import { describe, expect, it } from "vitest";
import { DocModelSchema, type DocModel } from "../../src/schema/docmodel";
import { parseDocModelJson, serializeDocModel } from "../../src/docmodel/serialize";

const SENDER = "alice@firm.example";

function docWith(blocks: Record<string, unknown>[]): Record<string, unknown> {
  return {
    kind: "document",
    schemaVersion: "1.0.0",
    meta: {
      client: "Acme",
      project: "Authored doc-block test",
      docKind: "proposal",
      tags: [],
      language: "en",
      status: "draft",
      archived: false,
      confidentialityLevel: "medium",
      owner: "owner@example.com",
      reviewers: [],
      createdAt: "2026-05-28T00:00:00Z",
      updatedAt: "2026-05-28T00:00:00Z",
      brandRef: "$brand:default",
    },
    sections: [{ id: "section-1", title: "Overview", blocks }],
    comments: [],
  };
}

describe("DocModel accepts Authored blocks (ADR-0016)", () => {
  it("parses a document containing an attrs-only authored block", () => {
    const parsed = DocModelSchema.parse(
      docWith([
        {
          id: "ab-1",
          type: `${SENDER}:sector-risk`,
          note: "",
          riskLevel: "high",
          score: 42,
        },
      ]),
    );
    expect(parsed.kind).toBe("document");
    const block = (parsed as Extract<DocModel, { kind: "document" }>).sections[0]!
      .blocks[0]! as Record<string, unknown>;
    expect(block.type).toBe(`${SENDER}:sector-risk`);
    // Dynamic attr fields pass through.
    expect(block.riskLevel).toBe("high");
    expect(block.score).toBe(42);
  });

  it("parses a rich-text authored block with a body fragment", () => {
    const parsed = DocModelSchema.parse(
      docWith([
        {
          id: "ab-2",
          type: `${SENDER}:rich-note`,
          heading: "Hello",
          body: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "hi" }] },
            ],
          },
        },
      ]),
    );
    expect(parsed.kind).toBe("document");
  });

  it("rejects a block whose type is neither a Standard identifier nor authored", () => {
    expect(() =>
      DocModelSchema.parse(docWith([{ id: "bad", type: "Not A Type!" }])),
    ).toThrow();
  });

  it("round-trips an authored block through serialize → parse losslessly", () => {
    const doc = DocModelSchema.parse(
      docWith([
        {
          id: "ab-3",
          type: `${SENDER}:sector-risk`,
          riskLevel: "high",
          note: "watch this",
        },
      ]),
    );

    const yaml = serializeDocModel(doc);
    const reparsed = DocModelSchema.parse(parseDocModelJson(yaml));

    expect(reparsed).toEqual(doc);
    // Serializing the reparsed doc is byte-identical (stable round-trip).
    expect(serializeDocModel(reparsed)).toBe(yaml);
  });
});
