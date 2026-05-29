import type { Comment, ThreadEntry } from "../schema/comment";
import type { BatchedComment } from "./batch-comments";

export type ThreadContextEntry = BatchedComment["thread"][number];

export function assembleThreadContext(comment: Comment): ThreadContextEntry[] {
  return comment.thread.map(formatThreadEntry);
}

export function commentToBatchedComment(comment: Comment): BatchedComment {
  return {
    commentId: comment.id,
    blockId: comment.blockId,
    quotedText: comment.quotedText,
    thread: assembleThreadContext(comment),
  };
}

function formatThreadEntry(entry: ThreadEntry): ThreadContextEntry {
  switch (entry.kind) {
    case "instruction":
      return {
        role: "user",
        content:
          `Comment from ${entry.author} (${entry.authorRole}) at ${entry.createdAt}:\n` +
          entry.text,
      };
    case "ai-proposal":
      return {
        role: "assistant",
        content:
          `Proposed patch at ${entry.createdAt}:\n` +
          JSON.stringify(entry.patch),
      };
    case "follow-up":
      return {
        role: "user",
        content: `Follow-up from ${entry.author} at ${entry.createdAt}:\n${entry.text}`,
      };
  }
}
