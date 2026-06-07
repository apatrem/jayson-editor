/**
 * Plain-text extraction from ProseMirror JSON fragments.
 * Pure module — no React. Used by generation down-conversion (toPlaceholder).
 */

export function fragmentToPlainText(fragment: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    const n = node as { text?: unknown; content?: unknown };
    if (typeof n.text === "string") {
      parts.push(n.text);
      return;
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(fragment);
  return parts.join("");
}
