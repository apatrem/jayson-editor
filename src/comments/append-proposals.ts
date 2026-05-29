import type { DocumentModel } from "../renderer/DocumentRenderer";
import type { BatchedCommentResponse } from "../llm/batch-comments";

/**
 * Write the AI's batched proposals back into the document's comment threads.
 * For each `ok` result, append an `ai-proposal` entry ({ kind, patch, createdAt }
 * — no model/usage, per ADR-0019) to the matching comment and bump its
 * `updatedAt`. `failed` results are left for the review UI to surface; the
 * comment simply keeps no new proposal. Returns a new DocumentModel (pure).
 */
export function appendAiProposals(
  doc: DocumentModel,
  response: BatchedCommentResponse,
  now: string,
): DocumentModel {
  const patchByCommentId = new Map(
    response.results
      .filter(
        (r): r is Extract<BatchedCommentResponse["results"][number], { status: "ok" }> =>
          r.status === "ok",
      )
      .map((r) => [r.commentId, r.patch]),
  );
  if (patchByCommentId.size === 0) {
    return doc;
  }
  return {
    ...doc,
    comments: doc.comments.map((comment) => {
      const patch = patchByCommentId.get(comment.id);
      if (patch === undefined) {
        return comment;
      }
      return {
        ...comment,
        updatedAt: now,
        thread: [...comment.thread, { kind: "ai-proposal" as const, patch, createdAt: now }],
      };
    }),
  };
}
