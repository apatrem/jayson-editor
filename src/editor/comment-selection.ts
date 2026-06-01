import type { Editor } from "@tiptap/core";
import type { CommentSelection } from "../comments/CreateComment";
import { COMMENT_MARK_NAME } from "../comments/CommentMark";

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

  // Anchor the comment to a single block. A selection that spans two blocks would
  // store quotedText/range covering both while blockId points only at the first —
  // an invalid comment. Reject unless both ends resolve to the same blockId.
  const { $from, $to } = editor.state.selection;
  const blockId = findEnclosingBlockId($from);
  if (blockId === null || blockId !== findEnclosingBlockId($to)) {
    return null;
  }

  // The highlight is an inline mark, so only offer a comment where the mark can
  // attach. Plain-text blocks like headings declare `marks: ""` and reject it —
  // and even serialize to a bare `{ text }`, so the highlight couldn't round-trip
  // anyway. Returning null here hides the bubble (shouldShow keys off this) and
  // blocks creation, instead of failing after the user writes an instruction.
  if (!editor.can().setMark(COMMENT_MARK_NAME)) {
    return null;
  }

  return { blockId, from, to, quotedText };
}

function findEnclosingBlockId($pos: Editor["state"]["selection"]["$from"]): string | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth);
    const blockId: unknown = node.attrs.blockId;
    if (typeof blockId === "string" && blockId.length > 0) {
      return blockId;
    }
  }
  return null;
}
