import type { CSSProperties, FC, FormEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { CommentSchema, type Comment } from "../schema/comment";

/**
 * Viewport-relative rect of the highlighted selection, used to anchor the popup
 * next to the text instead of pushing document content aside (issue #8). All
 * fields are client (viewport) coordinates, as returned by
 * `editor.view.coordsAtPos`.
 */
export interface CommentAnchorRect {
  left: number;
  top: number;
  bottom: number;
}

export interface CommentSelection {
  blockId: string;
  from: number;
  to: number;
  quotedText: string;
}

export interface CommentAuthor {
  name: string;
  email: string;
  role: "consultant" | "reviewer";
}

export const DEFAULT_COMMENT_AUTHOR: CommentAuthor = {
  name: "You",
  // `.invalid` is a reserved TLD (RFC 6761): a non-deliverable placeholder that
  // still satisfies the comment schema's email() validation. Used only when no
  // install config supplies a real identity — otherwise comment creation throws.
  email: "you@local.invalid",
  role: "consultant",
};

export interface CreateOpenCommentInput {
  id: string;
  selection: CommentSelection;
  author: CommentAuthor;
  instruction: string;
  createdAt: string;
}

export interface CreateCommentProps {
  selection: CommentSelection | null;
  author: CommentAuthor;
  onCreate: (comment: Comment) => void;
  /**
   * Highlight the captured selection with the comment's id. Receives the same
   * selection the popup was opened with (not the editor's live selection) so the
   * mark lands on the intended range even if focus moved. Returns whether the
   * mark applied — the comment is only created when it did.
   */
  onApplyMark?: (commentId: string, selection: CommentSelection) => boolean;
  onCancel?: () => void;
  generateId?: () => string;
  now?: () => Date;
  /**
   * When provided, the popup floats as a fixed overlay anchored beside the
   * highlighted text (viewport coords) instead of sitting in document flow.
   * Null/undefined keeps the original in-flow rendering (tests, fallback).
   */
  anchor?: CommentAnchorRect | null;
}

export function createOpenComment(input: CreateOpenCommentInput): Comment {
  const instruction = input.instruction.trim();
  if (instruction.length === 0) {
    throw new Error("Comment instruction is required.");
  }
  if (input.selection.to <= input.selection.from) {
    throw new Error("Comment selection must contain at least one character.");
  }

  return CommentSchema.parse({
    id: input.id,
    blockId: input.selection.blockId,
    range: {
      from: input.selection.from,
      to: input.selection.to,
    },
    quotedText: input.selection.quotedText,
    status: "open",
    thread: [
      {
        kind: "instruction",
        author: input.author.name,
        authorEmail: input.author.email,
        authorRole: input.author.role,
        text: instruction,
        createdAt: input.createdAt,
      },
    ],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}

export const CreateComment: FC<CreateCommentProps> = ({
  selection,
  author,
  onCreate,
  onApplyMark,
  onCancel,
  generateId = () => crypto.randomUUID(),
  now = () => new Date(),
  anchor,
}) => {
  const [instruction, setInstruction] = useState("");
  const [markError, setMarkError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  // Resolved fixed-position coords once the popup has been measured against the
  // viewport (null until measured, or when not anchored).
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (anchor === null || anchor === undefined) {
      setPlacement(null);
      return;
    }
    const el = formRef.current;
    if (el === null || typeof window === "undefined") {
      return;
    }
    setPlacement(computePopupPlacement(anchor, el.getBoundingClientRect()));
  }, [anchor, selection]);

  if (selection === null) {
    return null;
  }

  const isFloating = anchor !== null && anchor !== undefined;
  const floatingStyle: CSSProperties = isFloating
    ? {
        position: "fixed",
        left: placement?.left ?? anchor.left,
        top: placement?.top ?? anchor.bottom + POPUP_GAP,
        zIndex: 50,
        margin: 0,
        // Hide the first paint until measured so it doesn't flash at the
        // pre-clamp position.
        visibility: placement === null ? "hidden" : "visible",
      }
    : {};

  const trimmedInstruction = instruction.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (trimmedInstruction.length === 0) {
      return;
    }

    const commentId = generateId();
    const comment = createOpenComment({
      id: commentId,
      selection,
      author,
      instruction: trimmedInstruction,
      createdAt: now().toISOString(),
    });

    // Apply the highlight first; only persist the comment if it landed. A failed
    // mark (e.g. the selection no longer resolves) must not leave an orphan
    // comment pointing at an un-highlighted range.
    const marked = onApplyMark?.(commentId, selection) ?? true;
    if (!marked) {
      setMarkError("Couldn't highlight the selected text — try selecting it again.");
      return;
    }

    onCreate(comment);
    setInstruction("");
    setMarkError(null);
  };

  return (
    <form
      ref={formRef}
      aria-label="Create AI comment"
      role="dialog"
      onSubmit={handleSubmit}
      style={{ ...styles.popup, ...floatingStyle }}
    >
      <p style={styles.quote}>Comment on &quot;{selection.quotedText}&quot;</p>
      <label style={styles.label}>
        AI instruction
        <textarea
          aria-label="AI instruction"
          autoFocus
          value={instruction}
          onChange={(event) => {
            setInstruction(event.target.value);
          }}
          placeholder="Tell the AI what to change..."
          rows={4}
          style={styles.textarea}
        />
      </label>
      {markError === null ? null : (
        <p role="alert" style={styles.error}>
          {markError}
        </p>
      )}
      <div style={styles.actions}>
        {onCancel === undefined ? null : (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={trimmedInstruction.length === 0}>
          Create comment
        </button>
      </div>
    </form>
  );
};

const POPUP_GAP = 8;
const VIEWPORT_MARGIN = 8;

/**
 * Clamp the anchored popup inside the viewport: align it to the selection's
 * left edge and prefer placing it just below the selection, flipping above when
 * it would overflow the bottom. Pure given the viewport size so it's testable.
 */
export function computePopupPlacement(
  anchor: CommentAnchorRect,
  rect: { width: number; height: number },
  viewport: { width: number; height: number } = {
    width: window.innerWidth,
    height: window.innerHeight,
  },
): { left: number; top: number } {
  const maxLeft = viewport.width - rect.width - VIEWPORT_MARGIN;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, maxLeft));

  const below = anchor.bottom + POPUP_GAP;
  let top = below;
  if (below + rect.height > viewport.height - VIEWPORT_MARGIN) {
    const above = anchor.top - rect.height - POPUP_GAP;
    top =
      above >= VIEWPORT_MARGIN
        ? above
        : Math.max(VIEWPORT_MARGIN, viewport.height - rect.height - VIEWPORT_MARGIN);
  }
  return { left, top };
}

const styles: Record<string, CSSProperties> = {
  popup: {
    background: "Canvas",
    border: "1px solid ButtonBorder",
    borderRadius: "0.5rem",
    boxShadow: "0 0.5rem 1rem color-mix(in srgb, CanvasText 12%, transparent)",
    display: "grid",
    gap: "0.75rem",
    maxWidth: "22rem",
    padding: "0.75rem",
  },
  quote: {
    color: "CanvasText",
    margin: 0,
  },
  error: {
    color: "#B91C1C",
    fontSize: "0.8125rem",
    margin: 0,
  },
  label: {
    display: "grid",
    gap: "0.375rem",
  },
  textarea: {
    font: "inherit",
    resize: "vertical",
  },
  actions: {
    display: "flex",
    gap: "0.5rem",
    justifyContent: "flex-end",
  },
};
