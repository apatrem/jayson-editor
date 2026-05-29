import type { CSSProperties, FC } from "react";
import { useState } from "react";
import type { BlockPatch } from "../schema/block-patch";
import type { Block } from "../schema/blocks";
import type { Comment, ThreadEntry } from "../schema/comment";
import { DiffPreview } from "./DiffPreview";
import { FollowUpInput } from "./FollowUpInput";

export type ProposalUiStatus =
  | "pending"
  | "accepted-pending-undo"
  | "rejected-pending-undo"
  | "failed"
  | "conflict";

export interface ProposalUiState {
  commentId: string;
  uiStatus: ProposalUiStatus;
  pendingFollowUp?: string;
  conflictsWith?: string[];
  rawFailedOutput?: string;
  retryCount: number;
}

export interface ReviewProposal {
  comment: Comment;
  currentBlock?: Block | undefined;
  blockType: string;
  location: string;
  blockOrder: number;
  patch: BlockPatch | null;
  uiState: ProposalUiState;
}

export interface ProposalCardProps {
  proposal: ReviewProposal;
  focused?: boolean;
  onAccept?: ((proposal: ReviewProposal) => void) | undefined;
  onReject?: ((proposal: ReviewProposal) => void) | undefined;
  onFollowUp?: ((proposal: ReviewProposal, text: string) => void) | undefined;
  onEditPatch?: ((proposal: ReviewProposal) => void) | undefined;
  onClickJumpToBlock?: ((proposal: ReviewProposal) => void) | undefined;
  followUpOpen?: boolean | undefined;
  onFollowUpOpenChange?: ((open: boolean) => void) | undefined;
}

export const ProposalCard: FC<ProposalCardProps> = ({
  proposal,
  focused = false,
  onAccept,
  onReject,
  onFollowUp,
  onEditPatch,
  onClickJumpToBlock,
  followUpOpen,
  onFollowUpOpenChange,
}) => {
  const [internalFollowUpOpen, setInternalFollowUpOpen] = useState(false);
  const instruction = latestInstruction(proposal.comment);
  const status = proposal.uiState.uiStatus;
  const blocked = status === "conflict" || status === "failed";
  const isFollowUpOpen = followUpOpen ?? internalFollowUpOpen;
  const setFollowUpOpen = (open: boolean) => {
    onFollowUpOpenChange?.(open);
    if (followUpOpen === undefined) {
      setInternalFollowUpOpen(open);
    }
  };

  return (
    <article
      role="article"
      aria-labelledby={`card-${proposal.comment.id}-header`}
      tabIndex={focused ? 0 : -1}
      style={{
        ...styles.card,
        ...(focused ? styles.focused : {}),
      }}
    >
      <header id={`card-${proposal.comment.id}-header`} style={styles.header}>
        <button
          type="button"
          onClick={() => onClickJumpToBlock?.(proposal)}
          style={styles.blockButton}
        >
          {proposal.location}
        </button>
        <span style={styles.badge}>{proposal.blockType}</span>
        <StatusBadge state={proposal.uiState} />
      </header>

      <p style={styles.instruction}>{instruction}</p>
      <ThreadHistory comment={proposal.comment} />
      <DiffPreview patch={proposal.patch} currentBlock={proposal.currentBlock} />

      {status === "failed" && proposal.uiState.rawFailedOutput !== undefined ? (
        <details>
          <summary>View raw failed output</summary>
          <pre style={styles.raw}>{proposal.uiState.rawFailedOutput}</pre>
        </details>
      ) : null}

      {isFollowUpOpen ? (
        <FollowUpInput
          commentId={proposal.comment.id}
          initialValue={proposal.uiState.pendingFollowUp}
          onCancel={() => {
            setFollowUpOpen(false);
          }}
          onQueue={(text) => {
            onFollowUp?.(proposal, text);
            setFollowUpOpen(false);
          }}
        />
      ) : null}

      <div style={styles.actions}>
        <button
          type="button"
          disabled={blocked || onAccept === undefined}
          onClick={() => onAccept?.(proposal)}
        >
          Accept proposal for {proposal.comment.id} in {proposal.location}
        </button>
        <button
          type="button"
          disabled={onReject === undefined}
          onClick={() => onReject?.(proposal)}
        >
          Reject proposal for {proposal.comment.id} in {proposal.location}
        </button>
        <button
          type="button"
          onClick={() => {
            setFollowUpOpen(true);
          }}
        >
          Follow up on {proposal.comment.id}
        </button>
        <button
          type="button"
          disabled={proposal.patch === null || onEditPatch === undefined}
          onClick={() => onEditPatch?.(proposal)}
        >
          Edit patch for {proposal.comment.id}
        </button>
      </div>
    </article>
  );
};

export function latestAiProposal(comment: Comment): Extract<
  ThreadEntry,
  { kind: "ai-proposal" }
> | null {
  for (let index = comment.thread.length - 1; index >= 0; index -= 1) {
    const entry = comment.thread[index];
    if (entry?.kind === "ai-proposal") {
      return entry;
    }
  }
  return null;
}

export function latestInstruction(comment: Comment): string {
  const instruction = comment.thread.find((entry) => entry.kind === "instruction");
  return instruction?.kind === "instruction" ? instruction.text : comment.quotedText;
}

const ThreadHistory: FC<{ comment: Comment }> = ({ comment }) => {
  const earlierEntries = comment.thread.slice(0, -1);
  if (earlierEntries.length <= 1) {
    return null;
  }
  return (
    <details>
      <summary>Show {earlierEntries.length} earlier thread entries</summary>
      <ol>
        {earlierEntries.map((entry, index) => (
          <li key={`${entry.kind}-${index}`}>{threadEntrySummary(entry)}</li>
        ))}
      </ol>
    </details>
  );
};

const StatusBadge: FC<{ state: ProposalUiState }> = ({ state }) => {
  const conflicts = state.conflictsWith?.join(", ");
  return (
    <span data-status={state.uiStatus} style={styles.status}>
      {state.uiStatus}
      {conflicts === undefined || conflicts.length === 0
        ? ""
        : ` with ${conflicts}`}
    </span>
  );
};

function threadEntrySummary(entry: ThreadEntry): string {
  switch (entry.kind) {
    case "instruction":
      return `${entry.author}: ${entry.text}`;
    case "follow-up":
      return `${entry.author}: ${entry.text}`;
    case "ai-proposal":
      return `Proposed: ${entry.patch.op}`;
  }
}

const styles: Record<string, CSSProperties> = {
  card: {
    border: "1px solid ButtonBorder",
    borderRadius: "0.5rem",
    display: "grid",
    gap: "0.75rem",
    padding: "0.75rem",
  },
  focused: {
    outline: "2px solid Highlight",
  },
  header: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  blockButton: {
    fontWeight: 700,
  },
  badge: {
    border: "1px solid ButtonBorder",
    borderRadius: "999px",
    padding: "0.125rem 0.5rem",
  },
  status: {
    textTransform: "capitalize",
  },
  instruction: {
    margin: 0,
  },
  raw: {
    overflow: "auto",
    whiteSpace: "pre-wrap",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
};
