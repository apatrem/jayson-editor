import type { CSSProperties, FC, FormEvent } from "react";
import { useState } from "react";
import { CommentSchema, type Comment } from "../schema/comment";

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
  email: "you@local",
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
  onApplyMark?: (commentId: string) => void;
  onCancel?: () => void;
  generateId?: () => string;
  now?: () => Date;
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
}) => {
  const [instruction, setInstruction] = useState("");

  if (selection === null) {
    return null;
  }

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

    onApplyMark?.(commentId);
    onCreate(comment);
    setInstruction("");
  };

  return (
    <form
      aria-label="Create AI comment"
      role="dialog"
      onSubmit={handleSubmit}
      style={styles.popup}
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
