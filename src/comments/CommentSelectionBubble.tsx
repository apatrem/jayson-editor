import { useRef, type CSSProperties, type FC } from "react";
import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react";
import { getCommentSelection } from "../editor/comment-selection";
import type { CommentSelection } from "./CreateComment";

export interface CommentSelectionBubbleProps {
  editor: Editor;
  onAddComment: (selection: CommentSelection) => void;
  /**
   * When false the bubble never shows — used to suppress it while a comment
   * draft is already open. This MUST be a visibility flag, not a mount/unmount
   * toggle: TipTap's BubbleMenu relocates its menu node out of React's DOM tree
   * (`element.remove()` in the plugin), so unmounting it makes React crash on
   * the missing node and takes down the whole document view.
   */
  enabled?: boolean;
}

export const CommentSelectionBubble: FC<CommentSelectionBubbleProps> = ({
  editor,
  onAddComment,
  enabled = true,
}) => {
  // `shouldShow` is captured once when the plugin registers, so read the live
  // `enabled` through a ref — toggling it then never re-registers (or unmounts)
  // the menu.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: ed }) => {
        if (!enabledRef.current || !ed.isEditable) {
          return false;
        }
        // Single source of truth: show the bubble only where a comment can
        // actually be created (non-empty, single block, mark can attach).
        return getCommentSelection(ed) !== null;
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
};

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
