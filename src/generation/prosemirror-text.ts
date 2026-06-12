/**
 * Plain-text extraction from ProseMirror JSON fragments.
 * Pure module — no React. Used by generation down-conversion (toPlaceholder).
 */

export function fragmentToPlainText(fragment: unknown): string {
  const read = (node: unknown): string => {
    if (node === null || typeof node !== "object") return "";
    const n = node as { type?: unknown; text?: unknown; content?: unknown };
    if (typeof n.text === "string") {
      return n.text;
    }
    if (n.type === "hardBreak" || n.type === "hard_break") return " ";
    if (!Array.isArray(n.content)) return "";

    const separator = n.type === "doc" ? " " : "";
    return n.content.map(read).join(separator);
  };
  return read(fragment);
}
