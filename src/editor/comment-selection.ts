import type { Editor } from "@tiptap/core";
import type { CommentSelection } from "../comments/CreateComment";

/**
 * Resolve the current text selection into comment anchor data for CreateComment.
 * Returns null when the selection is empty or not inside a block with a blockId.
 */
export function getCommentSelection(editor: Editor): CommentSelection | null {
  const { from, to, empty } = editor.state.selection;
  if (empty || to <= from) {
    return null;
  }

  const quotedText = editor.state.doc.textBetween(from, to, " ");
  if (quotedText.length === 0) {
    return null;
  }

  const blockId = findEnclosingBlockId(editor.state.selection.$from);
  if (blockId === null) {
    return null;
  }

  return { blockId, from, to, quotedText };
}

function findEnclosingBlockId($pos: Editor["state"]["selection"]["$from"]): string | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    const blockId = node.attrs.blockId;
    if (typeof blockId === "string" && blockId.length > 0) {
      return blockId;
    }
  }
  return null;
}
