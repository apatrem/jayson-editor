import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it, vi } from "vitest";
import {
  generateDocFromOutline,
  LlmOutputParseError,
  LlmOutputValidationError,
  type GenerateDocClient,
  type StructuredOutline,
} from "../src/llm/generate-doc";
import { validateDocModel } from "../src/schema/validate";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sampleDoc = parse(
  readFileSync(join(repoRoot, "examples/sample-proposal.yaml"), "utf8"),
) as unknown;

const outline: StructuredOutline = {
  client: "Acme Industrial",
  project: "SMR Heat Strategy Assessment",
  docKind: "proposal",
  language: "en",
  ownerEmail: "j.smith@boutique.example",
  sector: "energy",
  tags: ["nuclear", "industrial heat"],
  confidentialityLevel: "high",
  sections: [
    {
      title: "Executive summary",
      objective: "Summarize the engagement and quantified value.",
      blockHints: [{ type: "prose", purpose: "One-paragraph opening" }],
    },
  ],
};

describe("outline-driven document generation (T-62)", () => {
  it("returns a schema-valid DocModel from LLM JSON", async () => {
    const call = vi.fn<GenerateDocClient["call"]>(() =>
      Promise.resolve({
        content: JSON.stringify(sampleDoc),
        raw: {},
      }),
    );
    const client: GenerateDocClient = { call };

    const doc = await generateDocFromOutline(client, outline);
    const validation = validateDocModel(doc);

    expect(validation.ok).toBe(true);
    const callInput = call.mock.calls[0];
    expect(callInput?.[0]).toBe("fast");
    expect(callInput?.[1].responseFormat).toBe("json");
    expect(callInput?.[1].messages[0]?.content).toContain("Acme Industrial");
    expect(callInput?.[1].cachedContexts?.[0]?.kind).toBe("schemaContext");
  });

  it("rejects malformed JSON with a parse error", async () => {
    const client: GenerateDocClient = {
      call: () =>
        Promise.resolve({
          content: "not-json",
          raw: {},
        }),
    };

    await expect(generateDocFromOutline(client, outline)).rejects.toBeInstanceOf(
      LlmOutputParseError,
    );
  });

  it("rejects off-schema LLM output before acceptance", async () => {
    const client: GenerateDocClient = {
      call: () =>
        Promise.resolve({
          content: JSON.stringify({ kind: "document", schemaVersion: "1.0.0" }),
          raw: {},
        }),
    };

    await expect(generateDocFromOutline(client, outline)).rejects.toThrow(
      LlmOutputValidationError,
    );
  });
});
