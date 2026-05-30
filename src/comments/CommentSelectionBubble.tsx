import type { CSSProperties, FC } from "react";
import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react";
import { getCommentSelection } from "../editor/comment-selection";
import type { CommentSelection } from "./CreateComment";

export interface CommentSelectionBubbleProps {
  editor: Editor;
  onAddComment: (selection: CommentSelection) => void;
}

export const CommentSelectionBubble: FC<CommentSelectionBubbleProps> = ({
  editor,
  onAddComment,
}) => (
  <BubbleMenu
    editor={editor}
    shouldShow={({ editor: ed, state }) => {
      if (!ed.isEditable) {
        return false;
      }
      const { from, to, empty } = state.selection;
      return !empty && to > from;
    }}
    tippyOptions={{ duration: 100 }}
  >
    <button
      type="button"
      style={styles.button}
      onClick={() => {
        const selection = getCommentSelection(editor);
        if (selection !== null) {
          onAddComment(selection);
        }
      }}
    >
      Add comment / Ask AI
    </button>
  </BubbleMenu>
);

const styles: Record<string, CSSProperties> = {
  button: {
    background: "Canvas",
    border: "1px solid ButtonBorder",
    borderRadius: "0.375rem",
    boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
    cursor: "pointer",
    fontSize: "0.8125rem",
    padding: "0.375rem 0.625rem",
  },
};
