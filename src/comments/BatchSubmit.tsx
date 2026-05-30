import type { CSSProperties, FC } from "react";
import { useState } from "react";
import { commentToBatchedComment } from "../llm/thread-context";
import type {
  BatchedComment,
  BatchedCommentResponse,
} from "../llm/batch-comments";
import type { Comment } from "../schema/comment";
import type { CommentAuthor } from "./CreateComment";
import { latestAiProposal } from "./ProposalCard";

export type BatchSubmitStatus = "idle" | "pending" | "done" | "failed";

export interface BuildProcessAllBatchInput {
  comments: Comment[];
  followUps?: Record<string, string> | undefined;
  followUpAuthor?: CommentAuthor | undefined;
  createdAt?: string | undefined;
}

export interface BatchSubmitProps extends BuildProcessAllBatchInput {
  onSubmit: (batch: BatchedComment[]) => Promise<BatchedCommentResponse>;
  /** Per-comment "use the thinking model" selection (D-11, ephemeral). */
  thinkingCommentIds?: Set<string>;
  onToggleThinking?: (commentId: string) => void;
}

/**
 * Open comments eligible for "Process all": no AI proposal yet, or a follow-up
 * was queued since the last proposal (avoids duplicate ai-proposal entries).
 */
export function isCommentEligibleForBatchSubmit(
  comment: Comment,
  followUps: Record<string, string> | undefined,
): boolean {
  if (comment.status !== "open") {
    return false;
  }
  const hasQueuedFollowUp = (followUps?.[comment.id]?.trim()?.length ?? 0) > 0;
  return latestAiProposal(comment) === null || hasQueuedFollowUp;
}

export function buildProcessAllBatch(
  input: BuildProcessAllBatchInput,
): BatchedComment[] {
  return input.comments
    .filter((comment) => isCommentEligibleForBatchSubmit(comment, input.followUps))
    .map((comment) => commentToBatchedComment(withQueuedFollowUp(comment, input)));
}

export const BatchSubmit: FC<BatchSubmitProps> = ({
  comments,
  followUps,
  followUpAuthor,
  createdAt,
  onSubmit,
  thinkingCommentIds,
  onToggleThinking,
}) => {
  const openComments = comments.filter((comment) => comment.status === "open");
  const eligibleComments = openComments.filter((comment) =>
    isCommentEligibleForBatchSubmit(comment, followUps),
  );
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, BatchSubmitStatus>>(
    () => Object.fromEntries(openComments.map((comment) => [comment.id, "idle"])),
  );

  const processAll = async () => {
    const batch = buildProcessAllBatch({
      comments,
      followUps,
      followUpAuthor,
      createdAt,
    });
    if (batch.length === 0) {
      return;
    }
    setRunning(true);
    setStatuses(Object.fromEntries(batch.map((entry) => [entry.commentId, "pending"])));
    try {
      const response = await onSubmit(batch);
      setStatuses(
        Object.fromEntries(
          response.results.map((result) => [
            result.commentId,
            result.status === "ok" ? "done" : "failed",
          ]),
        ),
      );
    } catch {
      setStatuses(Object.fromEntries(batch.map((entry) => [entry.commentId, "failed"])));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-label="Batch submit" style={styles.shell}>
      <button
        type="button"
        disabled={running || eligibleComments.length === 0}
        onClick={() => {
          void processAll();
        }}
      >
        Process all
      </button>
      <ul style={styles.list}>
        {openComments.map((comment) => (
          <li key={comment.id}>
            <label>
              <input
                type="checkbox"
                checked={thinkingCommentIds?.has(comment.id) ?? false}
                onChange={() => onToggleThinking?.(comment.id)}
              />{" "}
              thinking
            </label>{" "}
            {comment.id}: {statuses[comment.id] ?? "idle"}
          </li>
        ))}
      </ul>
    </section>
  );
};

function withQueuedFollowUp(
  comment: Comment,
  input: BuildProcessAllBatchInput,
): Comment {
  const followUpText = input.followUps?.[comment.id]?.trim();
  if (followUpText === undefined || followUpText.length === 0) {
    return comment;
  }
  if (input.followUpAuthor === undefined) {
    throw new Error("followUpAuthor is required when queued follow-ups are present.");
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    ...comment,
    updatedAt: createdAt,
    thread: [
      ...comment.thread,
      {
        kind: "follow-up",
        author: input.followUpAuthor.name,
        authorEmail: input.followUpAuthor.email,
        text: followUpText,
        createdAt,
      },
    ],
  };
}

const styles: Record<string, CSSProperties> = {
  shell: {
    display: "grid",
    gap: "0.5rem",
  },
  list: {
    margin: 0,
    paddingInlineStart: "1.25rem",
  },
};
