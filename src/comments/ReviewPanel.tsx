import type { CSSProperties, FC, KeyboardEvent } from "react";
import { useMemo, useState } from "react";
import type { Block } from "../schema/blocks";
import type { Comment } from "../schema/comment";
import type { DocModel } from "../schema/docmodel";
import { acceptCommentProposal, rejectCommentProposal } from "./ApplyComment";
import { BulkActions } from "./BulkActions";
import { detectCommentConflicts } from "./ConflictDetector";
import {
  latestAiProposal,
  ProposalCard,
  type ProposalUiState,
  type ReviewProposal,
} from "./ProposalCard";

export interface ReviewPanelProps {
  doc: DocModel;
  comments: Comment[];
  uiState?: Record<string, Partial<ProposalUiState>>;
  onAccept?: ((proposal: ReviewProposal) => void) | undefined;
  onReject?: ((proposal: ReviewProposal) => void) | undefined;
  onDocChange?: ((doc: DocModel) => void) | undefined;
  now?: (() => string) | undefined;
  runAsSeparateUndoStep?: ((operation: () => void) => void) | undefined;
  onEditPatch?: ((proposal: ReviewProposal) => void) | undefined;
  onClose?: (() => void) | undefined;
  onClickJumpToBlock?: ((proposal: ReviewProposal) => void) | undefined;
  onAcceptAllVisible?: ((proposals: ReviewProposal[]) => void) | undefined;
  onRejectAllVisible?: ((proposals: ReviewProposal[]) => void) | undefined;
  onFollowUpQueued?: ((commentId: string, text: string) => void) | undefined;
  initialFollowUps?: Record<string, string> | undefined;
  onFollowUpQueueChange?: ((followUps: Record<string, string>) => void) | undefined;
  onSendFollowUps?: ((followUps: Record<string, string>) => void) | undefined;
}

interface BlockLocation {
  block: Block;
  order: number;
  location: string;
}

export const ReviewPanel: FC<ReviewPanelProps> = ({
  doc,
  comments,
  uiState = {},
  onAccept,
  onReject,
  onDocChange,
  now,
  runAsSeparateUndoStep,
  onEditPatch,
  onClose,
  onClickJumpToBlock,
  onAcceptAllVisible,
  onRejectAllVisible,
  onFollowUpQueued,
  initialFollowUps = {},
  onFollowUpQueueChange,
  onSendFollowUps,
}) => {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [openFollowUpId, setOpenFollowUpId] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<Record<string, string>>(
    () => initialFollowUps,
  );

  const proposals = useMemo(
    () => buildReviewProposals(doc, comments, uiState),
    [comments, doc, uiState],
  );
  const pendingProposals = proposals.filter(
    (proposal) => proposal.uiState.uiStatus === "pending",
  );
  const focusedProposal = proposals[focusedIndex] ?? null;
  const followUpCount = Object.keys(followUps).length;

  const queueFollowUp = (proposal: ReviewProposal, text: string) => {
    updateFollowUps((current) => ({ ...current, [proposal.comment.id]: text }));
    onFollowUpQueued?.(proposal.comment.id, text);
  };

  const acceptProposal = (proposal: ReviewProposal) => {
    if (onDocChange !== undefined) {
      onDocChange(
        acceptCommentProposal(doc, proposal.comment, {
          now,
          runAsSeparateUndoStep,
        }),
      );
    }
    onAccept?.(proposal);
  };

  const rejectProposal = (proposal: ReviewProposal) => {
    if (onDocChange !== undefined) {
      onDocChange(
        rejectCommentProposal(doc, proposal.comment, {
          now,
          runAsSeparateUndoStep,
        }),
      );
    }
    onReject?.(proposal);
  };

  const updateFollowUps = (
    update: (current: Record<string, string>) => Record<string, string>,
  ) => {
    setFollowUps((current) => {
      const next = update(current);
      onFollowUpQueueChange?.(next);
      return next;
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (proposals.length === 0) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === "Enter") {
      event.preventDefault();
      onSendFollowUps?.(followUps);
      updateFollowUps(() => ({}));
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onAcceptAllVisible?.(pendingProposals);
      return;
    }

    switch (event.key) {
      case "j":
      case "ArrowDown":
        event.preventDefault();
        setFocusedIndex((index) => Math.min(index + 1, proposals.length - 1));
        break;
      case "k":
      case "ArrowUp":
        event.preventDefault();
        setFocusedIndex((index) => Math.max(index - 1, 0));
        break;
      case "Enter":
      case "y":
        event.preventDefault();
        if (focusedProposal !== null) {
          acceptProposal(focusedProposal);
        }
        break;
      case "Delete":
      case "n":
        event.preventDefault();
        if (focusedProposal !== null) {
          rejectProposal(focusedProposal);
        }
        break;
      case "f":
        event.preventDefault();
        setOpenFollowUpId(focusedProposal?.comment.id ?? null);
        break;
      case "e":
        event.preventDefault();
        if (focusedProposal !== null) {
          onEditPatch?.(focusedProposal);
        }
        break;
      case "Escape":
        event.preventDefault();
        onClose?.();
        break;
    }
  };

  if (proposals.length === 0) {
    return (
      <aside aria-label="Review panel" style={styles.panel}>
        <header style={styles.header}>
          <h2 style={styles.title}>No proposals pending</h2>
          {onClose === undefined ? null : (
            <button type="button" onClick={onClose}>
              Close review
            </button>
          )}
        </header>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Review panel"
      aria-live="polite"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={styles.panel}
    >
      <header style={styles.header}>
        <h2 style={styles.title}>{pendingProposals.length} proposals pending</h2>
        {onClose === undefined ? null : (
          <button type="button" onClick={onClose}>
            Close review
          </button>
        )}
      </header>

      <div style={styles.list}>
        {proposals.map((proposal, index) => {
          const cardProposal = withQueuedFollowUp(proposal, followUps);
          return (
            <ProposalCard
              key={proposal.comment.id}
              proposal={cardProposal}
              focused={index === focusedIndex}
              followUpOpen={openFollowUpId === proposal.comment.id}
              onFollowUpOpenChange={(open) => {
                setOpenFollowUpId(open ? proposal.comment.id : null);
              }}
              onAccept={acceptProposal}
              onReject={rejectProposal}
              onEditPatch={onEditPatch}
              onClickJumpToBlock={onClickJumpToBlock}
              onFollowUp={queueFollowUp}
            />
          );
        })}
      </div>

      <BulkActions
        pendingCount={pendingProposals.length}
        followUpCount={followUpCount}
        onAcceptAllVisible={
          onAcceptAllVisible === undefined
            ? undefined
            : () => onAcceptAllVisible(pendingProposals)
        }
        onRejectAllVisible={
          onRejectAllVisible === undefined
            ? undefined
            : () => onRejectAllVisible(pendingProposals)
        }
        onSendFollowUps={
          onSendFollowUps === undefined
            ? undefined
            : () => {
                onSendFollowUps(followUps);
                updateFollowUps(() => ({}));
              }
        }
      />
    </aside>
  );
};

export function buildReviewProposals(
  doc: DocModel,
  comments: Comment[],
  uiState: Record<string, Partial<ProposalUiState>> = {},
): ReviewProposal[] {
  const locations = blockLocations(doc);
  const conflictMap = detectCommentConflicts(comments);
  return comments
    .filter((comment) => comment.status === "open")
    .map((comment) => {
      const aiProposal = latestAiProposal(comment);
      const location = locations.get(comment.blockId);
      const stateOverride = uiState[comment.id] ?? {};
      const conflictsWith = stateOverride.conflictsWith ?? conflictMap[comment.id];
      const ui: ProposalUiState = {
        commentId: comment.id,
        uiStatus:
          stateOverride.uiStatus ??
          (conflictsWith === undefined || conflictsWith.length === 0
            ? "pending"
            : "conflict"),
        retryCount: stateOverride.retryCount ?? 0,
        ...(stateOverride.pendingFollowUp === undefined
          ? {}
          : { pendingFollowUp: stateOverride.pendingFollowUp }),
        ...(conflictsWith === undefined
          ? {}
          : { conflictsWith }),
        ...(stateOverride.rawFailedOutput === undefined
          ? {}
          : { rawFailedOutput: stateOverride.rawFailedOutput }),
      };
      return {
        comment,
        ...(location === undefined ? {} : { currentBlock: location.block }),
        blockType: location?.block.type ?? "unknown",
        location: location?.location ?? `Unknown block ${comment.blockId}`,
        blockOrder: location?.order ?? Number.MAX_SAFE_INTEGER,
        patch: aiProposal?.patch ?? null,
        uiState: ui,
      };
    })
    .sort((left, right) => left.blockOrder - right.blockOrder);
}

function withQueuedFollowUp(
  proposal: ReviewProposal,
  followUps: Record<string, string>,
): ReviewProposal {
  const pendingFollowUp = followUps[proposal.comment.id];
  if (pendingFollowUp === undefined) {
    return proposal;
  }
  return {
    ...proposal,
    uiState: {
      ...proposal.uiState,
      pendingFollowUp,
    },
  };
}

function blockLocations(doc: DocModel): Map<string, BlockLocation> {
  const locations = new Map<string, BlockLocation>();
  let order = 0;

  if (doc.kind === "document") {
    doc.sections.forEach((section, sectionIndex) => {
      section.blocks.forEach((block, blockIndex) => {
        order += 1;
        locations.set(block.id, {
          block,
          order,
          location: `Section ${sectionIndex + 1} > Block ${blockIndex + 1}`,
        });
      });
    });
    return locations;
  }

  doc.slides.forEach((slide, slideIndex) => {
    slide.blocks.forEach((block, blockIndex) => {
      order += 1;
      locations.set(block.id, {
        block,
        order,
        location: `Slide ${slideIndex + 1} > Block ${blockIndex + 1}`,
      });
    });
  });
  return locations;
}

const styles: Record<string, CSSProperties> = {
  panel: {
    borderLeft: "1px solid ButtonBorder",
    display: "grid",
    gap: "0.75rem",
    maxHeight: "100%",
    overflow: "auto",
    padding: "1rem",
    // Consistent panel typography across the app (sections + document settings
    // use 12–13px). Descendants inherit unless they set their own size.
    fontSize: "0.8125rem",
  },
  header: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    gap: "0.75rem",
  },
  title: {
    fontSize: "0.8125rem",
    fontWeight: 700,
    margin: 0,
  },
  list: {
    display: "grid",
    gap: "0.75rem",
  },
};
