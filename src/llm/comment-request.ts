/**
 * Builds the LLM request for comment-to-AI (D-12/D-13): turn a consultant's
 * comments into a batched request that asks the model to return one BlockPatch
 * per comment. Reuses the doc + brand context builders from authored-block
 * generation and feeds them through the batched-comment pipeline.
 *
 * No cost/usage is involved (ADR-0019) — the request carries only the contexts
 * and the comments.
 */

import type { DocumentModel } from "../renderer/DocumentRenderer";
import type { ModelKind } from "./client";
import type { BatchedComment, BatchedCommentRequest } from "./batch-comments";
import { buildBrandTokensContext, buildDocContext } from "./generate-authored-block";

export const COMMENT_SYSTEM_PROMPT = `\
You are an editing assistant for a structured document. Each input comment names a
block and carries the consultant's instruction (and any follow-ups). For EACH
comment, return a single proposal that edits the document to satisfy the
instruction. Return ONLY JSON of the shape:

  { "results": [
      { "status": "ok", "commentId": "<id>", "patch": <BlockPatch> }
    | { "status": "failed", "commentId": "<id>", "error": "<why>" }
  ] }

No prose, no markdown fences. One result per input comment, keyed by commentId.`;

export const COMMENT_SCHEMA_CONTEXT = `\
A BlockPatch is one of:
  { "op": "replace", "blockId": "<id>", "block": <Block>, "reason"?: "<text>" }
  { "op": "remove", "blockId": "<id>", "reason"?: "<text>" }
  { "op": "insert-after", "afterBlockId": "<id>", "block": <Block>, "reason"?: "<text>" }
A <Block> must be a schema-valid block of one of the catalogue types, with a
stable unique id. Edit only the block the comment targets; keep every other
block byte-identical.`;

/**
 * Assemble a `BatchedCommentRequest` for the given model kind. `comments` are the
 * already-converted `BatchedComment[]` (see `commentToBatchedComment`).
 */
export function buildCommentBatchRequest(
  doc: DocumentModel,
  comments: BatchedComment[],
  model: ModelKind,
): BatchedCommentRequest {
  return {
    model,
    systemPrompt: COMMENT_SYSTEM_PROMPT,
    schemaContext: COMMENT_SCHEMA_CONTEXT,
    brandTokensContext: buildBrandTokensContext(doc),
    docContext: buildDocContext(doc),
    comments,
  };
}
