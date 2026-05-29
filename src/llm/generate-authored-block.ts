/**
 * Authored-block generation pipeline (T-173, ADR-0011 / ADR-0012).
 *
 * Builds LLMRequests for:
 *   - Initial generation: full prompt with document context + description.
 *   - Refinement iterations: same cached contexts; conversation history appended
 *     as messages so the model refines without re-running the full prompt.
 *
 * Uses the `codegen` model kind (frontier model, per ADR-0012) and the
 * `authored-block-generation` cost-ledger callKind (D-34).
 *
 * Callers are responsible for:
 *   - Calling `client.call("codegen", request)` to get the raw source.
 *   - Running the advisory lint (warnings-only) for preview.
 *   - Running the binding lint at activation time via receiveAuthoredBlock().
 */

import type { DocumentModel } from "../renderer/DocumentRenderer";
import type { LLMRequest } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerateAuthoredBlockParams {
  /** Free-text description of the block the consultant wants to create. */
  description: string;
  /** Kebab-case identifier (e.g. "competitive-matrix"). */
  slug: string;
  /** Human-readable display name (e.g. "Competitive Matrix"). */
  displayName: string;
}

/**
 * One turn in the authoring conversation.
 * user: the consultant's instruction or refinement.
 * assistant: the LLM's generated .tsx source.
 */
export interface AuthoredBlockConversationTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

// ─── Prompt constants ─────────────────────────────────────────────────────────

/**
 * System prompt for authored-block generation.
 * Explains the role and output format. Kept short — the schema context
 * (a cached context block) carries the full type reference.
 */
export const AUTHORED_BLOCK_SYSTEM_PROMPT = `\
You are a TypeScript code generator that produces Authored block files for a \
document editing application. Your output is a single TypeScript file that \
follows the exact format below. Return ONLY the file content — no commentary, \
no markdown fences, no explanations.

FILE FORMAT:
  /**
   * authored-block-header: 1
   * scaffold-version: 1.0.0
   * sender: (leave blank — the share flow stamps this)
   * timestamp: (leave blank — set at share time)
   * slug: <slug>
   */
  import { defineAuthoredBlock } from "./defineAuthoredBlock";
  export default defineAuthoredBlock({ ... });

CONSTRAINTS (enforced by the AST validator — violations quarantine the file):
  - Exactly ONE top-level statement: the default export.
  - NO additional imports beyond the single defineAuthoredBlock import.
  - ALL values in the manifest object must be static literals (string, number,
    boolean, array literal, object literal). No functions, no arrow functions,
    no JSX, no template strings with expressions, no computed keys.
  - AttrRef: { $ref: "fieldId" } — resolves to the named attr field at render time.
  - ColorToken: { $token: "colors.brand.primary" } — resolves to the brand token.
`;

/**
 * Schema context block (cached via prompt-caching).
 * Describes the full AuthoredBlockManifest interface and all RenderNode types.
 * This context is identical across all generation and refinement calls for the
 * same session — cache it with the D-13 strategy.
 */
export const AUTHORED_BLOCK_SCHEMA_CONTEXT = `\
AUTHORED BLOCK MANIFEST INTERFACE

defineAuthoredBlock(manifest: AuthoredBlockManifest): BlockRegistryRecord

AuthoredBlockManifest {
  slug: string            // kebab-case, e.g. "competitive-matrix"
  title: string           // full display name, e.g. "Competitive Matrix"
  paletteLabel: string    // short chip label ≤ 24 chars
  content: "rich-text" | "none"
  attrs: AttrFieldDef[]   // ordered list of editable fields
  template: RenderNode    // the declarative render tree
}

ATTR FIELD TYPES (use in manifest.attrs[])
  { kind: "string",  fieldId, label, placeholder?, maxLength?, defaultValue? }
  { kind: "enum",    fieldId, label, options: [{value,label},...], defaultValue? }
  { kind: "number",  fieldId, label, min?, max?, step?, defaultValue? }
  { kind: "bool",    fieldId, label, defaultValue? }
  { kind: "repeated-item", fieldId, label, itemFields: SimpleAttrField[], minItems?, maxItems? }
  (SimpleAttrField = string | enum | number | bool — no nested repeated-item)

RENDER NODE TYPES (use in manifest.template)
  { kind: "text",    value: string | { $ref: "fieldId" }, color?: { $token: "..." } }
  { kind: "heading", level: 1|2|3|4, text: string | { $ref: "fieldId" } }
  { kind: "box",     padding?, background?: { $token }, borderRadius?, children: RenderNode[] }
  { kind: "row",     gap?, align?: "start"|"center"|"end"|"space-between", children: RenderNode[] }
  { kind: "column",  gap?, children: RenderNode[] }
  { kind: "badge",   text: string | { $ref: "fieldId" }, background?: { $token }, foreground?: { $token } }
  { kind: "rich-text-slot" }  — editable prose area; only valid when content = "rich-text"
  { kind: "for-each", fieldId: "repeatedItemFieldId", item: RenderNode }

BRAND TOKEN PATHS (examples — use { $token: "..." } in color fields)
  colors.brand.primary     colors.brand.secondary
  colors.neutral.50        colors.neutral.900
  colors.surface.default   colors.surface.raised
  spacing.base             typography.heading.lineHeight
`;

// ─── Request builders ─────────────────────────────────────────────────────────

/**
 * Builds the LLMRequest for the INITIAL generation of an Authored block.
 *
 * All three cached context blocks are identical across initial + refinement
 * calls for the same authoring session — the prompt-caching strategy (D-13)
 * stores them once and reuses on subsequent refinement iterations.
 */
export function buildGenerateAuthoredBlockRequest(
  params: GenerateAuthoredBlockParams,
  docContext: DocumentModel,
): LLMRequest {
  return {
    systemPrompt: AUTHORED_BLOCK_SYSTEM_PROMPT,
    cachedContexts: [
      {
        kind: "schemaContext",
        content: AUTHORED_BLOCK_SCHEMA_CONTEXT,
      },
      {
        kind: "brandTokensContext",
        content: buildBrandTokensContext(docContext),
      },
      {
        kind: "docContext",
        content: buildDocContext(docContext),
      },
    ],
    messages: [
      {
        role: "user",
        content: buildInitialUserPrompt(params),
      },
    ],
  };
}

/**
 * Builds the LLMRequest for a REFINEMENT iteration.
 *
 * Re-uses the same cached contexts as the initial call (cache hit).
 * The conversation history (`priorTurns`) is appended before the new
 * refinement instruction so the model sees what it produced previously
 * without a full re-prompt — exactly what D-13's "iteration" case requires.
 *
 * @param priorTurns  Ordered conversation history up to (but not including)
 *                    the current refinement instruction. Alternates user/assistant.
 * @param refinementInstruction  The consultant's new instruction.
 */
export function buildRefineAuthoredBlockRequest(
  _params: GenerateAuthoredBlockParams,
  docContext: DocumentModel,
  priorTurns: readonly AuthoredBlockConversationTurn[],
  refinementInstruction: string,
): LLMRequest {
  return {
    systemPrompt: AUTHORED_BLOCK_SYSTEM_PROMPT,
    cachedContexts: [
      {
        kind: "schemaContext",
        content: AUTHORED_BLOCK_SCHEMA_CONTEXT,
      },
      {
        kind: "brandTokensContext",
        content: buildBrandTokensContext(docContext),
      },
      {
        kind: "docContext",
        content: buildDocContext(docContext),
      },
    ],
    messages: [
      // Prior turns let the model see what it generated previously.
      // This avoids re-sending the full generation prompt on every iteration
      // (D-13: cached system prompt + context; only the new user message is new).
      ...priorTurns,
      {
        role: "user",
        content: refinementInstruction,
      },
    ],
  };
}

// ─── Context helpers ──────────────────────────────────────────────────────────

/**
 * Summarises the open document for the LLM — blocks already in use,
 * project/client names, and the brand reference.
 *
 * The summary is deterministic given the document; identical documents produce
 * identical context strings, so the prompt cache sees a cache hit.
 */
export function buildDocContext(doc: DocumentModel): string {
  const blockTypes = doc.sections
    .flatMap((section) => section.blocks)
    .map((block) => (block as { type: string }).type)
    .filter((t): t is string => typeof t === "string");

  const uniqueTypes = [...new Set(blockTypes)].sort();

  return [
    `Document: "${doc.meta.project}" for ${doc.meta.client}`,
    `Brand: ${doc.meta.brandRef}`,
    `Blocks in use: ${uniqueTypes.length === 0 ? "(empty document)" : uniqueTypes.join(", ")}`,
    doc.meta.confidentialityLevel !== undefined
      ? `Confidentiality: ${doc.meta.confidentialityLevel}`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Extracts the brand-token namespace from the document so the LLM can use
 * the correct token paths in ColorToken references.
 */
export function buildBrandTokensContext(doc: DocumentModel): string {
  return `Brand namespace for this document: ${doc.meta.brandRef}\n` +
    `Use { $token: "colors.brand.primary" } and other paths from the schema\n` +
    `context when setting background/foreground/color fields.`;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function buildInitialUserPrompt(params: GenerateAuthoredBlockParams): string {
  return [
    `Create an Authored block with:`,
    `  slug: ${params.slug}`,
    `  displayName: ${params.displayName}`,
    ``,
    `Description:`,
    params.description,
  ].join("\n");
}
