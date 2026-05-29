/**
 * Tests for T-173: Authored-block generation pipeline.
 *
 * Covers:
 *   - buildGenerateAuthoredBlockRequest: correct structure, modelKind, and
 *     cached contexts.
 *   - buildRefineAuthoredBlockRequest: uses conversation history without
 *     re-sending the full initial prompt (same cached contexts; history in messages).
 *   - buildDocContext: extracts client, project, brand, and block types.
 *   - buildBrandTokensContext: includes brand namespace.
 *   - Iteration does NOT duplicate initial user prompt.
 */

import { describe, expect, it } from "vitest";
import {
  buildGenerateAuthoredBlockRequest,
  buildRefineAuthoredBlockRequest,
  buildDocContext,
  buildBrandTokensContext,
  AUTHORED_BLOCK_SYSTEM_PROMPT,
  AUTHORED_BLOCK_SCHEMA_CONTEXT,
  type GenerateAuthoredBlockParams,
  type AuthoredBlockConversationTurn,
} from "../src/llm/generate-authored-block";
import type { DocumentModel } from "../src/renderer/DocumentRenderer";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const minDoc: DocumentModel = {
  kind: "document",
  schemaVersion: "1.0.0",
  meta: {
    client: "Acme Industrial",
    project: "SMR Heat Strategy",
    docKind: "proposal",
    tags: [],
    language: "en",
    status: "draft",
    archived: false,
    confidentialityLevel: "high",
    owner: "owner@example.com",
    reviewers: [],
    createdAt: "2026-05-27T00:00:00Z",
    updatedAt: "2026-05-27T00:00:00Z",
    brandRef: "$brand:default",
  },
  sections: [
    {
      id: "s1",
      title: "Overview",
      blocks: [
        { id: "b1", type: "heading", level: 1, text: "Title", numbered: false },
        { id: "b2", type: "prose" } as never,
      ],
    },
  ],
  comments: [],
};

const params: GenerateAuthoredBlockParams = {
  description: "A competitive-landscape quadrant with annotations per competitor",
  slug: "competitive-matrix",
  displayName: "Competitive Matrix",
};

// ─── buildGenerateAuthoredBlockRequest ────────────────────────────────────────

describe("buildGenerateAuthoredBlockRequest (T-173)", () => {
  it("uses the authored-block system prompt", () => {
    const req = buildGenerateAuthoredBlockRequest(params, minDoc);
    expect(req.systemPrompt).toBe(AUTHORED_BLOCK_SYSTEM_PROMPT);
  });

  it("includes schemaContext, brandTokensContext, and docContext as cached contexts", () => {
    const req = buildGenerateAuthoredBlockRequest(params, minDoc);
    expect(req.cachedContexts).toHaveLength(3);
    const kinds = req.cachedContexts?.map((c) => c.kind);
    expect(kinds).toContain("schemaContext");
    expect(kinds).toContain("brandTokensContext");
    expect(kinds).toContain("docContext");
  });

  it("schema context contains the manifest interface description", () => {
    const req = buildGenerateAuthoredBlockRequest(params, minDoc);
    const schemaCtx = req.cachedContexts?.find((c) => c.kind === "schemaContext");
    expect(schemaCtx?.content).toBe(AUTHORED_BLOCK_SCHEMA_CONTEXT);
    expect(schemaCtx?.content).toContain("AuthoredBlockManifest");
    expect(schemaCtx?.content).toContain("for-each");
    expect(schemaCtx?.content).toContain("$token");
  });

  it("doc context contains client, project, and block types", () => {
    const req = buildGenerateAuthoredBlockRequest(params, minDoc);
    const docCtx = req.cachedContexts?.find((c) => c.kind === "docContext");
    expect(docCtx?.content).toContain("Acme Industrial");
    expect(docCtx?.content).toContain("SMR Heat Strategy");
    // Both block types present in the fixture
    expect(docCtx?.content).toContain("heading");
    expect(docCtx?.content).toContain("prose");
  });

  it("user message includes slug, displayName, and description", () => {
    const req = buildGenerateAuthoredBlockRequest(params, minDoc);
    const userMsg = req.messages?.[0];
    expect(userMsg?.role).toBe("user");
    expect(userMsg?.content).toContain("competitive-matrix");
    expect(userMsg?.content).toContain("Competitive Matrix");
    expect(userMsg?.content).toContain(params.description);
  });
});

// ─── buildRefineAuthoredBlockRequest ─────────────────────────────────────────

describe("buildRefineAuthoredBlockRequest (T-173)", () => {
  const priorTurns: AuthoredBlockConversationTurn[] = [
    { role: "user", content: "Generate competitive-matrix: A quadrant diagram" },
    { role: "assistant", content: "export default defineAuthoredBlock({ slug: 'competitive-matrix', ... })" },
  ];

  it("uses the same system prompt as the initial generation", () => {
    const req = buildRefineAuthoredBlockRequest(params, minDoc, priorTurns, "Add an x-axis label");
    expect(req.systemPrompt).toBe(AUTHORED_BLOCK_SYSTEM_PROMPT);
  });

  it("has the same three cached contexts as the initial call (cache hit)", () => {
    const initial = buildGenerateAuthoredBlockRequest(params, minDoc);
    const refinement = buildRefineAuthoredBlockRequest(
      params,
      minDoc,
      priorTurns,
      "Add an x-axis label",
    );
    // Cached contexts are identical — same content → cache hit on the LLM side.
    expect(refinement.cachedContexts).toEqual(initial.cachedContexts);
  });

  it("prepends conversation history before the new refinement instruction", () => {
    const refinementInstruction = "Add an x-axis label";
    const req = buildRefineAuthoredBlockRequest(
      params,
      minDoc,
      priorTurns,
      refinementInstruction,
    );

    // Messages should be: [...priorTurns, { role: "user", refinement }]
    expect(req.messages).toHaveLength(priorTurns.length + 1);
    expect(req.messages?.[0]).toEqual(priorTurns[0]);
    expect(req.messages?.[1]).toEqual(priorTurns[1]);
    const lastMsg = req.messages?.[req.messages.length - 1];
    expect(lastMsg?.role).toBe("user");
    expect(lastMsg?.content).toBe(refinementInstruction);
  });

  it("does NOT duplicate the initial system description in the new messages", () => {
    // Key D-13 requirement: refinement messages only carry what's NEW.
    // The full initial generation prompt must NOT appear as a user message.
    const req = buildRefineAuthoredBlockRequest(
      params,
      minDoc,
      priorTurns,
      "Make the background blue",
    );
    const newMsg = req.messages?.[req.messages.length - 1];
    // The new user message should be just the refinement instruction, not the
    // full initial description repeated.
    expect(newMsg?.content).not.toContain(params.description);
    expect(newMsg?.content).toBe("Make the background blue");
  });
});

// ─── Context helpers ──────────────────────────────────────────────────────────

describe("buildDocContext (T-173)", () => {
  it("includes client and project names", () => {
    const ctx = buildDocContext(minDoc);
    expect(ctx).toContain("Acme Industrial");
    expect(ctx).toContain("SMR Heat Strategy");
  });

  it("lists unique block types sorted alphabetically", () => {
    const ctx = buildDocContext(minDoc);
    // heading and prose appear in order
    expect(ctx.indexOf("heading")).toBeLessThan(ctx.indexOf("prose"));
  });

  it("includes brand ref", () => {
    const ctx = buildDocContext(minDoc);
    expect(ctx).toContain("$brand:default");
  });

  it("shows (empty document) when there are no blocks", () => {
    const emptyDoc: DocumentModel = {
      ...minDoc,
      sections: [{ id: "s1", blocks: [] as never }],
    };
    const ctx = buildDocContext(emptyDoc);
    expect(ctx).toContain("empty document");
  });

  it("deduplicates block types", () => {
    const docWithRepeats: DocumentModel = {
      ...minDoc,
      sections: [
        {
          id: "s1",
          blocks: [
            { id: "b1", type: "heading", level: 1, text: "H1", numbered: false },
            { id: "b2", type: "heading", level: 2, text: "H2", numbered: false },
            { id: "b3", type: "prose" } as never,
          ],
        },
      ],
    };
    const ctx = buildDocContext(docWithRepeats);
    // "heading" should appear exactly once
    const matches = ctx.match(/heading/g);
    expect(matches).toHaveLength(1);
  });
});

describe("buildBrandTokensContext (T-173)", () => {
  it("mentions the brand namespace from the document", () => {
    const ctx = buildBrandTokensContext(minDoc);
    expect(ctx).toContain("$brand:default");
  });

  it("suggests using $token references", () => {
    const ctx = buildBrandTokensContext(minDoc);
    expect(ctx).toContain("$token");
  });
});
