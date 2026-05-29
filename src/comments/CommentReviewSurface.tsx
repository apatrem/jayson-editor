import { useState, type CSSProperties, type FC } from "react";
import type { DocumentModel } from "../renderer/DocumentRenderer";
import {
  runBatchedCommentRequest,
  type BatchedComment,
  type BatchedCommentClient,
  type BatchedCommentResponse,
} from "../llm/batch-comments";
import { buildCommentBatchRequest } from "../llm/comment-request";
import { formatErrorMessage } from "../ipc/errors";
import { FinishSetupHint } from "../ui/FinishSetupHint";
import { ReviewPanel } from "./ReviewPanel";
import { BatchSubmit } from "./BatchSubmit";
import { appendAiProposals } from "./append-proposals";

export interface CommentReviewSurfaceProps {
  doc: DocumentModel;
  /**
   * When undefined (LLM not configured), accept/reject of existing proposals
   * still works, but "Send to AI" is replaced with a finish-setup hint.
   */
  commentClient?: BatchedCommentClient | undefined;
  /** Apply a doc mutation (accept/reject patch, or written proposals). */
  onDocChange: (doc: DocumentModel) => void;
  onClose?: (() => void) | undefined;
  /** Injectable clock for tests. */
  now?: (() => string) | undefined;
}

/**
 * The comment-to-AI surface (D-12/D-13): a ReviewPanel for accepting/rejecting
 * AI proposals plus a BatchSubmit to send open comments to the model. The
 * submit groups comments by the per-comment thinking toggle (D-11) into at most
 * two batches (fast + thinking), then writes the proposals back into the doc.
 */
export const CommentReviewSurface: FC<CommentReviewSurfaceProps> = ({
  doc,
  commentClient,
  onDocChange,
  onClose,
  now = () => new Date().toISOString(),
}) => {
  const [thinkingIds, setThinkingIds] = useState<Set<string>>(() => new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);

  const toggleThinking = (commentId: string): void => {
    setThinkingIds((current) => {
      const next = new Set(current);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const handleSubmit = async (
    batch: BatchedComment[],
  ): Promise<BatchedCommentResponse> => {
    if (commentClient === undefined) {
      throw new Error("LLM is not configured.");
    }
    // D-11: fast by default; comments toggled to "thinking" run as a second
    // batch on the frontier model — at most two batches total.
    const groups: Array<["fast" | "thinking", BatchedComment[]]> = [];
    const fast = batch.filter((c) => !thinkingIds.has(c.commentId));
    const thinking = batch.filter((c) => thinkingIds.has(c.commentId));
    if (fast.length > 0) groups.push(["fast", fast]);
    if (thinking.length > 0) groups.push(["thinking", thinking]);

    const results: BatchedCommentResponse["results"] = [];
    for (const [model, comments] of groups) {
      const response = await runBatchedCommentRequest(
        commentClient,
        buildCommentBatchRequest(doc, comments, model),
      );
      results.push(...response.results);
    }
    const merged: BatchedCommentResponse = { results };
    onDocChange(appendAiProposals(doc, merged, now()));
    return merged;
  };

  return (
    <aside aria-label="Comment review" style={styles.surface}>
      <ReviewPanel
        doc={doc}
        comments={doc.comments}
        // acceptCommentProposal returns the wider DocModel union; this view only
        // ever holds a document-kind doc, so narrow before applying.
        onDocChange={(updated) => {
          if (updated.kind === "document") {
            onDocChange(updated);
          }
        }}
        now={now}
        {...(onClose === undefined ? {} : { onClose })}
      />
      {commentClient === undefined ? (
        <FinishSetupHint />
      ) : (
        <>
          <BatchSubmit
            comments={doc.comments}
            onSubmit={(batch) =>
              handleSubmit(batch).catch((error: unknown) => {
                setSubmitError(formatErrorMessage(error));
                throw error;
              })
            }
            thinkingCommentIds={thinkingIds}
            onToggleThinking={toggleThinking}
          />
          {submitError !== null ? (
            <p role="alert" style={styles.error}>
              {submitError}
            </p>
          ) : null}
        </>
      )}
    </aside>
  );
};

const styles: Record<string, CSSProperties> = {
  surface: {
    width: "22rem",
    flexShrink: 0,
    display: "grid",
    gap: "0.75rem",
    alignContent: "start",
  },
  error: {
    color: "#B91C1C",
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: "0.5rem",
    padding: "0.5rem 0.75rem",
    fontSize: "0.8125rem",
    margin: 0,
  },
};
