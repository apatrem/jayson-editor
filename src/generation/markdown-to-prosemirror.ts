/**
 * Deterministic markdown prose → DocModel ProseMirror fragment converter.
 * Spec: docs/GENERATION_PIPELINE.md §4 (prose row only).
 */

export interface CoercionWarning {
  construct: string;
  action: string;
}

interface PmTextNode {
  type: "text";
  text: string;
  marks?: Array<{ type: string }>;
}

interface PmParagraphNode {
  type: "paragraph";
  content?: PmTextNode[];
}

interface PmDocNode {
  type: "doc";
  content: PmParagraphNode[];
}

export interface ConversionResult {
  body: PmDocNode;
  warnings: CoercionWarning[];
}

const HTML_MARK_MAP: Record<string, string> = {
  STRONG: "strong",
  B: "strong",
  EM: "em",
  I: "em",
  CODE: "code",
};

const DROPPED_HTML_TAGS = new Set(["VIDEO", "AUDIO", "IFRAME", "OBJECT", "EMBED", "SCRIPT", "STYLE"]);

type MarkType = "strong" | "em" | "code";

function markKey(marks: MarkType[]): string {
  return [...marks].sort().join(",");
}

function withMarks(marks: MarkType[]): Array<{ type: string }> | undefined {
  if (marks.length === 0) return undefined;
  return marks.map((type) => ({ type }));
}

function pushCodeSpan(
  inner: string,
  outerMarks: MarkType[],
  construct: string,
  nodes: PmTextNode[],
  warnings: CoercionWarning[],
): void {
  if (inner.length === 0) return;
  const conflicting = outerMarks.filter((mark) => mark !== "code");
  if (conflicting.length > 0) {
    warnings.push({
      construct,
      action: `dropped conflicting marks: ${[...conflicting].sort().join(",")}`,
    });
  }
  nodes.push({ type: "text", text: inner, marks: [{ type: "code" }] });
}

function mergeTextNodes(nodes: PmTextNode[]): PmTextNode[] {
  const merged: PmTextNode[] = [];
  for (const node of nodes) {
    if (node.text.length === 0) continue;
    const prev = merged[merged.length - 1];
    const key = markKey((node.marks ?? []).map((m) => m.type as MarkType));
    const prevKey = prev ? markKey((prev.marks ?? []).map((m) => m.type as MarkType)) : "";
    if (prev && key === prevKey) {
      prev.text += node.text;
    } else {
      merged.push({
        type: "text",
        text: node.text,
        ...(node.marks ? { marks: node.marks.map((m) => ({ type: m.type })) } : {}),
      });
    }
  }
  return merged;
}

function splitParagraphs(markdown: string): string[] {
  return markdown.split(/\n\n+/).map((part) => part.trim());
}

function parseInline(
  text: string,
  marks: MarkType[],
  warnings: CoercionWarning[],
): PmTextNode[] {
  const nodes: PmTextNode[] = [];
  let i = 0;

  const pushText = (value: string): void => {
    if (value.length === 0) return;
    const markAttrs = withMarks(marks);
    nodes.push(
      markAttrs ? { type: "text", text: value, marks: markAttrs } : { type: "text", text: value },
    );
  };

  while (i < text.length) {
    if (text[i] === "<") {
      const tagEnd = text.indexOf(">", i);
      if (tagEnd === -1) {
        pushText(text.slice(i));
        break;
      }
      const tagSource = text.slice(i, tagEnd + 1);
      const openMatch = /^<([a-zA-Z][\w-]*)\b[^>]*>$/.exec(tagSource);
      const closeMatch = /^<\/([a-zA-Z][\w-]*)\s*>$/.exec(tagSource);
      if (openMatch?.[1]) {
        const rawTag = openMatch[1];
        const tagName = rawTag.toUpperCase();
        const closeTag = `</${rawTag}>`;
        const closeIdx = text.toLowerCase().indexOf(closeTag.toLowerCase(), tagEnd + 1);
        const selfClosing = /\/>\s*$/.test(tagSource) || closeIdx === -1;
        const inner = selfClosing ? "" : text.slice(tagEnd + 1, closeIdx);
        const nextIdx = selfClosing ? tagEnd + 1 : closeIdx + closeTag.length;

        if (DROPPED_HTML_TAGS.has(tagName)) {
          warnings.push({ construct: tagSource, action: "dropped" });
          i = nextIdx;
          continue;
        }

        const markType = HTML_MARK_MAP[tagName];
        if (markType && !selfClosing) {
          if (markType === "code") {
            pushCodeSpan(inner, marks, tagSource, nodes, warnings);
          } else {
            nodes.push(...parseInline(inner, [...marks, markType as MarkType], warnings));
          }
          i = nextIdx;
          continue;
        }

        warnings.push({ construct: tagSource, action: "dropped" });
        if (!selfClosing && inner.length > 0) {
          nodes.push(...parseInline(inner, marks, warnings));
        }
        i = nextIdx;
        continue;
      }
      if (closeMatch) {
        warnings.push({ construct: tagSource, action: "dropped" });
        i = tagEnd + 1;
        continue;
      }
      pushText(text[i] ?? "");
      i += 1;
      continue;
    }

    if (text[i] === "`") {
      const close = text.indexOf("`", i + 1);
      if (close === -1) {
        pushText(text.slice(i));
        break;
      }
      const inner = text.slice(i + 1, close);
      pushCodeSpan(inner, marks, text.slice(i, close + 1), nodes, warnings);
      i = close + 1;
      continue;
    }

    if (text.startsWith("**", i)) {
      const close = text.indexOf("**", i + 2);
      if (close === -1) {
        pushText(text.slice(i));
        break;
      }
      const inner = text.slice(i + 2, close);
      nodes.push(...parseInline(inner, [...marks, "strong"], warnings));
      i = close + 2;
      continue;
    }

    if (text[i] === "*") {
      const close = text.indexOf("*", i + 1);
      if (close === -1) {
        pushText(text.slice(i));
        break;
      }
      const inner = text.slice(i + 1, close);
      nodes.push(...parseInline(inner, [...marks, "em"], warnings));
      i = close + 1;
      continue;
    }

    let plainEnd = i + 1;
    while (plainEnd < text.length) {
      const ch = text[plainEnd];
      if (ch === "<" || ch === "`" || ch === "*") break;
      plainEnd += 1;
    }
    pushText(text.slice(i, plainEnd));
    i = plainEnd;
  }

  return mergeTextNodes(nodes);
}

function parseParagraph(text: string, warnings: CoercionWarning[]): PmParagraphNode {
  const content = parseInline(text, [], warnings);
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

export function markdownToProseMirror(markdown: string): ConversionResult {
  const warnings: CoercionWarning[] = [];
  const parts = splitParagraphs(markdown);
  const content = parts.map((part) => parseParagraph(part, warnings));
  return {
    body: { type: "doc", content },
    warnings,
  };
}
