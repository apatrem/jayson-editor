import type { Editor as TipTapEditor, Extensions, Node as TipTapNode } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { Code } from "@tiptap/extension-code";
import { CodeBlock } from "@tiptap/extension-code-block";
import { Document } from "@tiptap/extension-document";
import { SectionNode } from "./SectionNode";
import { HardBreak } from "@tiptap/extension-hard-break";
import { History } from "@tiptap/extension-history";
import { Italic } from "@tiptap/extension-italic";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike } from "@tiptap/extension-strike";
import { Text } from "@tiptap/extension-text";
import { Underline } from "@tiptap/extension-underline";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { useEffect, useMemo, useState, type CSSProperties, type FC } from "react";
import { CommentMark } from "../comments/CommentMark";
import { BaseBlockAttributes } from "./extensions/BaseBlockAttributes";
import { BASE_BLOCK_ATTR_NAMES } from "./base-block-attrs";
import { HeadingNumber } from "./extensions/HeadingNumber";
import { DragReorder } from "./extensions/DragReorder";
import { LayoutMarkers } from "./extensions/LayoutMarkers";
import { resolveBlockGapPx, resolveBlockSpacingMultiple } from "../renderer/block-spacing";
import {
  resolveNumberingScheme,
  type NumberingScheme,
} from "../blocks/heading/numbering";
import type { DocModel } from "../schema/docmodel";
import { docModelToProseMirror } from "./mapping";
import { loadAllBlocks } from "../blocks/runtime-registry";
import { NumberedListItemTipTapNode } from "../blocks/numbered-list";
import {
  BulletListItemTipTapNode,
  SubBulletListTipTapNode,
  SubBulletItemTipTapNode,
} from "../blocks/bullet-list";
import { tableBlockEditorExtensions } from "../blocks/table";
import { buildAuthoredTipTapNode } from "../blocks/authored/node-builder";
import type { AuthoredBlockManifest } from "../blocks/authored/defineAuthoredBlock";
import { BrandProvider } from "../brand-tokens/BrandProvider";
import { defaultBrand } from "../brand/defaultBrand";
import { resolveBrandToken } from "../brand-tokens/resolve";
import "./editor.css";

export interface EditorProps {
  initialContent?: JSONContent | string;
  docModel?: DocModel;
  editable?: boolean;
  onUpdate?: (content: JSONContent) => void;
  onEditorReady?: (editor: TipTapEditor | null) => void;
  /**
   * The Installed manifest set (ADR-0015) — authored manifests whose TipTap
   * nodes are appended to the closed schema at mount. Default [] reproduces
   * today's static-only behavior. The schema is built once at mount; the parent
   * (DocumentView) remounts via a key when this set changes (TipTap can't add
   * node types to a live schema).
   */
  authoredManifests?: AuthoredBlockManifest[];
  /**
   * When provided, the toolbar shows an "Add block" button that calls this
   * (the parent opens the block-palette drawer). Omitted on surfaces without a
   * palette (e.g. the standalone deck editor).
   */
  onAddBlock?: () => void;
}

const DEFAULT_CONTENT: JSONContent = {
  type: "doc",
  content: [
    {
      type: "section",
      attrs: { sectionId: "default-section", title: "" },
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Start writing..." }],
        },
      ],
    },
  ],
};

// ── Registry-derived editor configuration ────────────────────────────────
// All Standard blocks register their TipTap node in the runtime registry.
// Editor extensions, allowed node names, and per-node allowed attrs are
// derived here so no per-block hand-maintenance is needed (T-157a).

const _allBlocks = loadAllBlocks();

const blockExtensions = _allBlocks.map((r) => r.tiptapNode);

// Non-block infra node names registered by TipTap built-ins.
const STATIC_INFRA_NODE_NAMES = [
  "doc",
  "section",
  "text",
  "paragraph",
  "hardBreak",
  "blockquote",
  "codeBlock",
  "numberedListItem",
  "bulletListItem",
  "subBulletList",
  "subBulletItem",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
] as const;

// Block node names come from the registry.
const _blockNodeNames = _allBlocks.map((r) => r.tiptapNode.name);

// Names already claimed by the static schema — an authored slug colliding with
// one of these is dropped so it can never shadow or double-register a node.
const _staticNodeNames = new Set<string>([
  ...STATIC_INFRA_NODE_NAMES,
  ..._blockNodeNames,
]);

// Dedupe the supplied manifests against the static schema and against each
// other (first occurrence wins — loadAuthoredManifests already orders
// active-before-archived). Returns the manifests whose nodes will register.
function dedupeAuthoredManifests(
  authoredManifests: readonly AuthoredBlockManifest[],
): AuthoredBlockManifest[] {
  const seen = new Set<string>(_staticNodeNames);
  const out: AuthoredBlockManifest[] = [];
  for (const manifest of authoredManifests) {
    if (seen.has(manifest.slug)) continue;
    seen.add(manifest.slug);
    out.push(manifest);
  }
  return out;
}

/**
 * The closed editor node-name set (CONTEXT.md) for a given Installed manifest
 * set: static infra ∪ Standard block names ∪ authored slugs. The exported
 * {@link ALLOWED_EDITOR_NODE_NAMES} is this with no authored manifests — the
 * static base used by the no-arg path and by tests as today's baseline.
 *
 * The closed-schema security invariant requires this to stay in lock-step with
 * the node set {@link createEditorExtensions} registers for the SAME manifests.
 */
export function allowedEditorNodeNames(
  authoredManifests: readonly AuthoredBlockManifest[] = [],
): readonly string[] {
  return [
    ...STATIC_INFRA_NODE_NAMES,
    ..._blockNodeNames,
    ...dedupeAuthoredManifests(authoredManifests).map((m) => m.slug),
  ];
}

export const ALLOWED_EDITOR_NODE_NAMES: readonly string[] = allowedEditorNodeNames();

export const ALLOWED_EDITOR_MARK_NAMES = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "commentMark",
] as const;

const ALLOWED_HTML_TAGS = new Set([
  "A",
  "BLOCKQUOTE",
  "BR",
  "CODE",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "LI",
  "OL",
  "P",
  "PRE",
  "S",
  "SPAN",
  "STRONG",
  "U",
  "UL",
]);

const ALLOWED_MARK_NAMES = new Set<string>(ALLOWED_EDITOR_MARK_NAMES);

const DocumentWithSections = Document.extend({
  content: "section+",
});

export function createEditorExtensions(
  authoredManifests: readonly AuthoredBlockManifest[] = [],
  numberingScheme?: NumberingScheme,
  blockSpacingMultiple = 3,
): Extensions {
  return [
    DocumentWithSections,
    SectionNode,
    Paragraph,
    Text,
    Bold,
    Italic,
    Underline,
    Strike,
    Code,
    CodeBlock,
    Blockquote,
    HardBreak,
    History,
    NumberedListItemTipTapNode,
    BulletListItemTipTapNode,
    SubBulletListTipTapNode,
    SubBulletItemTipTapNode,
    ...tableBlockEditorExtensions(),
    CommentMark,
    ...blockExtensions,
    // Adds breakBefore/spaceBefore (ADR-0018) to every Standard block node in
    // one place; their names are unioned into allowedAttrsForNode below.
    BaseBlockAttributes.configure({ types: [..._blockNodeNames] }),
    // Live heading outline numbering (decoration plugin). Scheme resolved from
    // brand ⊕ meta at editor creation; defaults to all-decimal when omitted.
    HeadingNumber.configure(numberingScheme ? { scheme: numberingScheme } : {}),
    // Gutter drag-handle to reorder blocks within/across sections (ADR-0018).
    // The default spacing multiple feeds the "Spacing above" placeholder.
    DragReorder.configure({ defaultSpacingMultiple: blockSpacingMultiple }),
    // Editor-only layout markers: a "page break" rule above breakBefore blocks
    // and a margin-top override for spaceBefore (ADR-0018, items 5/7).
    LayoutMarkers.configure({ spacingUnit: defaultBrand.spacing.unit }),
    ...dedupeAuthoredManifests(authoredManifests).map(buildAuthoredTipTapNode),
  ];
}

// Per-authored-slug attr allow-list, derived from the SAME TipTap node the
// editor registers (via _getNodeAttrNames) so the attr check can never drift
// from what the node actually serializes.
function authoredAttrsMap(
  authoredManifests: readonly AuthoredBlockManifest[],
): Map<string, Set<string>> {
  return new Map(
    dedupeAuthoredManifests(authoredManifests).map(
      (m) =>
        [m.slug, _getNodeAttrNames(buildAuthoredTipTapNode(m))] as const,
    ),
  );
}

export function assertClosedEditorContent(
  content: JSONContent,
  authoredManifests: readonly AuthoredBlockManifest[] = [],
): void {
  const allowedNodeNames = new Set<string>(
    allowedEditorNodeNames(authoredManifests),
  );
  assertClosedNode(content, allowedNodeNames, authoredAttrsMap(authoredManifests));
}

export function runAsSeparateUndoStep(
  editor: TipTapEditor,
  operation: (editor: TipTapEditor) => void,
): void {
  editor.view.dispatch(closeHistory(editor.state.tr));
  operation(editor);
  editor.view.dispatch(closeHistory(editor.state.tr));
}

export function sanitizePastedHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  sanitizeElement(template.content);
  return template.innerHTML;
}

export const Editor: FC<EditorProps> = ({
  initialContent = DEFAULT_CONTENT,
  docModel,
  editable = true,
  onUpdate,
  onEditorReady,
  authoredManifests = [],
  onAddBlock,
}) => {
  const deck = docModel?.kind === "deck" ? docModel : null;
  // M6 known limitation (see docs/archive/BLOCKERS.md drift-2026-05-25b): the deck surface
  // strips the slide wrapper when feeding a slide into TipTap, so there is no
  // inverse mapping from edited editor JSON back to the deck DocModel. Until
  // that round-trip exists, force editable=false for decks — silently allowing
  // edits would lose user input on the next slide switch.
  const effectiveEditable = deck === null ? editable : false;
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const activeSlideIndex =
    deck === null
      ? 0
      : // Math.max guards the empty-deck case (slides.length === 0 would
        // otherwise yield -1 and an undefined slide lookup downstream).
        Math.max(0, Math.min(currentSlideIndex, deck.slides.length - 1));
  const activeSlide = deck?.slides[activeSlideIndex];
  const editorContent = useMemo(
    () =>
      deck === null
        ? initialContent
        : editorContentForDeckSlide(deck, activeSlideIndex),
    [activeSlideIndex, deck, initialContent],
  );
  // Resolve the heading-numbering scheme once (brand house style ⊕ this
  // document's meta override) for live editor numbering (ADR-0018, item 4).
  const numberingScheme = useMemo(
    () =>
      resolveNumberingScheme(
        defaultBrand,
        docModel?.kind === "document" ? docModel.meta : undefined,
      ),
    [docModel],
  );
  const editor = useEditor({
    extensions: createEditorExtensions(
      authoredManifests,
      numberingScheme,
      resolveBlockSpacingMultiple(docModel?.kind === "document" ? docModel.meta : undefined),
    ),
    content: editorContent,
    editable: effectiveEditable,
    editorProps: {
      attributes: {
        "aria-label": "Document editor",
      },
      transformPastedHTML: sanitizePastedHtml,
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onUpdate?.(updatedEditor.getJSON());
    },
  });

  useEffect(() => {
    setCurrentSlideIndex(0);
  }, [deck]);

  useEffect(() => {
    onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (editor === null || deck === null) {
      return;
    }
    editor.commands.setContent(editorContent, false);
  }, [deck, editor, editorContent]);

  // The inter-block gap is exposed as a CSS custom property so editor.css can
  // apply one consistent margin between top-level blocks (see
  // `.doc-section-content > * + *`). Resolved from the brand default ⊕ this
  // document's `meta.layout.blockSpacing` override (ADR-0018, item 6).
  const surfaceStyle: CSSProperties = { ...styles.surface };
  (surfaceStyle as Record<string, string>)["--doc-block-gap"] = `${resolveBlockGapPx(
    defaultBrand,
    docModel?.kind === "document" ? docModel.meta : undefined,
  )}px`;
  const editorSurface = <EditorContent editor={editor} style={surfaceStyle} />;

  return (
    // Provide brand context so block node-views (which render the real block
    // renderers calling useBrandTokens) work regardless of how the Editor is
    // mounted — including the standalone deck surface. Harmless double-wrap
    // when already under DocumentView's BrandProvider.
    <BrandProvider tokens={defaultBrand}>
    <section style={styles.shell} aria-label="WYSIWYG editor">
      <div style={styles.toolbar} aria-label="Formatting toolbar">
        {onAddBlock !== undefined ? (
          <>
            <button
              type="button"
              aria-label="Insert block"
              disabled={!effectiveEditable}
              onClick={onAddBlock}
              style={styles.addBlockButton}
            >
              + Add block
            </button>
            <span style={styles.toolbarGroup} aria-hidden="true" />
          </>
        ) : null}
        <ToolbarButton
          label="Bold"
          active={editor?.isActive("bold") ?? false}
          disabled={editor === null || !effectiveEditable}
          onClick={() => {
            editor?.chain().focus().toggleBold().run();
          }}
        />
        <ToolbarButton
          label="Italic"
          active={editor?.isActive("italic") ?? false}
          disabled={editor === null || !effectiveEditable}
          onClick={() => {
            editor?.chain().focus().toggleItalic().run();
          }}
        />
        <ToolbarButton
          label="Underline"
          active={editor?.isActive("underline") ?? false}
          disabled={editor === null || !effectiveEditable}
          onClick={() => {
            editor?.chain().focus().toggleUnderline().run();
          }}
        />
        <ToolbarButton
          label="Strike"
          active={editor?.isActive("strike") ?? false}
          disabled={editor === null || !effectiveEditable}
          onClick={() => {
            editor?.chain().focus().toggleStrike().run();
          }}
        />
        <ToolbarButton
          label="Code"
          active={editor?.isActive("code") ?? false}
          disabled={editor === null || !effectiveEditable}
          onClick={() => {
            editor?.chain().focus().toggleCode().run();
          }}
        />
        {editor?.isActive("table") ? (
          <span style={styles.toolbarGroup} aria-label="Table controls">
            <ToolbarButton
              label="+ Row"
              active={false}
              disabled={!effectiveEditable}
              onClick={() => {
                editor?.chain().focus().addRowAfter().run();
              }}
            />
            <ToolbarButton
              label="− Row"
              active={false}
              disabled={!effectiveEditable}
              onClick={() => {
                editor?.chain().focus().deleteRow().run();
              }}
            />
            <ToolbarButton
              label="+ Col"
              active={false}
              disabled={!effectiveEditable}
              onClick={() => {
                editor?.chain().focus().addColumnAfter().run();
              }}
            />
            <ToolbarButton
              label="− Col"
              active={false}
              disabled={!effectiveEditable}
              onClick={() => {
                editor?.chain().focus().deleteColumn().run();
              }}
            />
          </span>
        ) : null}
      </div>
      {deck === null ? (
        editorSurface
      ) : (
        <div style={styles.deckShell}>
          <nav aria-label="Slide navigation" style={styles.slideStrip}>
            {deck.slides.map((slide, index) => {
              const isActive = index === activeSlideIndex;
              return (
                <button
                  key={slide.id}
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  aria-label={`Slide ${index + 1} ${slide.layout}`}
                  onClick={() => {
                    setCurrentSlideIndex(index);
                  }}
                  style={{
                    ...styles.slideButton,
                    ...(isActive ? styles.slideButtonActive : {}),
                  }}
                >
                  <span>Slide {index + 1}</span>
                  <span style={styles.slideLayoutLabel}>{slide.layout}</span>
                </button>
              );
            })}
          </nav>
          <section
            aria-label="Current slide"
            data-current-slide-id={activeSlide?.id ?? ""}
            style={styles.slideFocus}
          >
            <p style={styles.slideMeta}>
              Slide {activeSlideIndex + 1} of {deck.slides.length} ·{" "}
              {activeSlide?.layout ?? "unknown"}
            </p>
            {editorSurface}
          </section>
        </div>
      )}
    </section>
    </BrandProvider>
  );
};

function editorContentForDeckSlide(
  deck: Extract<DocModel, { kind: "deck" }>,
  slideIndex: number,
): JSONContent {
  const mapped = docModelToProseMirror(deck);
  const slide = mapped.content[slideIndex];
  const content = (slide?.content ?? []).filter(isJsonContentNode);
  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

function isJsonContentNode(value: unknown): value is JSONContent {
  if (value === null || typeof value !== "object") {
    return false;
  }
  return typeof (value as { type?: unknown }).type === "string";
}

function assertClosedNode(
  node: JSONContent,
  allowedNodeNames: ReadonlySet<string>,
  authoredAttrs: ReadonlyMap<string, Set<string>>,
): void {
  if (node.type === undefined || !allowedNodeNames.has(node.type)) {
    throw new Error(`Unknown editor node type: ${node.type ?? "(missing)"}`);
  }
  if (node.attrs !== undefined) {
    const allowedAttrs = allowedAttrsForNode(node.type, authoredAttrs);
    for (const attrName of Object.keys(node.attrs)) {
      if (!allowedAttrs.has(attrName)) {
        throw new Error(
          `Unknown attr "${attrName}" on editor node type "${node.type}"`,
        );
      }
    }
  }
  for (const mark of node.marks ?? []) {
    assertClosedMark(mark);
  }
  for (const child of node.content ?? []) {
    assertClosedNode(child, allowedNodeNames, authoredAttrs);
  }
}

function assertClosedMark(mark: NonNullable<JSONContent["marks"]>[number]): void {
  if (mark.type === undefined || !ALLOWED_MARK_NAMES.has(mark.type)) {
    throw new Error(`Unknown editor mark type: ${mark.type ?? "(missing)"}`);
  }
  if (mark.attrs !== undefined) {
    const allowedAttrs = allowedAttrsForMark(mark.type);
    for (const attrName of Object.keys(mark.attrs)) {
      if (!allowedAttrs.has(attrName)) {
        throw new Error(
          `Unknown attr "${attrName}" on editor mark type "${mark.type}"`,
        );
      }
    }
  }
}

// Build a map of { tiptapNodeName → Set<allowedAttr> } from the registry.
// TipTap's Node.create() stores the configuration object on the extension.
// Calling config.addAttributes() returns the full attrs declaration,
// so Object.keys() gives the exact attr names the node serializes to JSON.
function _getNodeAttrNames(node: TipTapNode): Set<string> {
  // TipTap extensions expose config.addAttributes as a plain function — we use
  // a type-cast to access the internal config shape without importing internals.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const raw: Record<string, unknown> = (node as any).config?.addAttributes?.() ?? {};
  return new Set(Object.keys(raw));
}

const _blockNodeAttrsMap: Map<string, Set<string>> = new Map(
  _allBlocks.map((r) => [r.tiptapNode.name, _getNodeAttrNames(r.tiptapNode)] as const),
);

// Attrs carried by the native table infra nodes (TipTap built-ins + the
// header's align/colWidth column metadata added in src/blocks/table). Listed
// explicitly because these nodes aren't in the block registry but still appear
// in editor content and must pass the closed-schema attr check.
const _TABLE_NODE_ATTRS: Record<string, ReadonlySet<string>> = {
  table: new Set(),
  tableRow: new Set(),
  tableHeader: new Set(["colspan", "rowspan", "colwidth", "align", "colWidth"]),
  tableCell: new Set(["colspan", "rowspan", "colwidth"]),
};

function allowedAttrsForNode(
  nodeType: string,
  authoredAttrs: ReadonlyMap<string, Set<string>>,
): Set<string> {
  // Standard block nodes — attrs derived from TipTap node definition via
  // registry, plus the base layout attrs added globally by BaseBlockAttributes
  // (invisible to per-node introspection, so unioned explicitly here).
  const blockAttrs = _blockNodeAttrsMap.get(nodeType);
  if (blockAttrs) return new Set([...blockAttrs, ...BASE_BLOCK_ATTR_NAMES]);
  // Installed authored nodes — attrs derived from the built TipTap node.
  const authored = authoredAttrs.get(nodeType);
  if (authored) return authored;
  if (nodeType === "section") {
    return new Set(["sectionId", "title"]);
  }
  const tableAttrs = _TABLE_NODE_ATTRS[nodeType];
  if (tableAttrs) return new Set(tableAttrs);
  // Infrastructure nodes (paragraph, doc, etc.) carry no custom attrs.
  return new Set();
}

function allowedAttrsForMark(markType: string): Set<string> {
  switch (markType) {
    case "commentMark":
      return new Set(["commentId"]);
    default:
      // Marks listed in ALLOWED_EDITOR_MARK_NAMES without an explicit case
      // here (bold, italic, strike, code) are attr-free by design. If you
      // add a mark with attrs, add a case above — the empty-set default
      // means a forgotten case rejects all attrs, which is the safe failure
      // mode for a security boundary.
      return new Set();
  }
}

function sanitizeElement(parent: ParentNode): void {
  for (const child of [...parent.childNodes]) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    if (!ALLOWED_HTML_TAGS.has(child.tagName)) {
      child.remove();
      continue;
    }
    sanitizeElement(child);
  }
}

const ToolbarButton: FC<{
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}> = ({ label, active, disabled, onClick }) => (
  <button
    type="button"
    aria-pressed={active}
    disabled={disabled}
    onClick={onClick}
    style={{
      ...styles.toolbarButton,
      fontWeight: active ? 700 : 400,
    }}
  >
    {label}
  </button>
);

const styles: Record<string, CSSProperties> = {
  shell: {
    display: "grid",
    gap: "0.75rem",
  },
  toolbar: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.375rem",
    padding: "0.5rem 0.75rem",
    margin: "0 -0.75rem",
    background: "rgba(226, 232, 240, 0.82)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    borderBottom: "1px solid #D6DEE8",
  },
  toolbarGroup: {
    display: "inline-flex",
    gap: "0.375rem",
    marginLeft: "0.5rem",
    paddingLeft: "0.5rem",
    borderLeft: "1px solid #E2E8F0",
  },
  toolbarButton: {
    appearance: "none",
    border: "1px solid #D6DEE8",
    background: "#FFFFFF",
    color: "#1E293B",
    borderRadius: "0.375rem",
    cursor: "pointer",
    fontSize: "0.8125rem",
    minWidth: "2rem",
    padding: "0.3rem 0.6rem",
  },
  addBlockButton: {
    appearance: "none",
    border: "1px solid #0B3D91",
    background: "#0B3D91",
    color: "#FFFFFF",
    borderRadius: "0.375rem",
    cursor: "pointer",
    fontSize: "0.8125rem",
    fontWeight: 600,
    padding: "0.3rem 0.7rem",
  },
  surface: {
    minHeight: "16rem",
    padding: "0.25rem 0",
    // Base typography matches DocumentRenderer's page so editor text is the
    // same size/font as the rendered output (plain paragraphs would otherwise
    // inherit the 16px browser default and look larger than the export).
    fontFamily: defaultBrand.typography.fonts.body.family,
    fontSize: defaultBrand.typography.scale.body,
    lineHeight: defaultBrand.typography.lineHeight.normal,
    color: resolveBrandToken(defaultBrand, "colors.semantic.textPrimary"),
  },
  deckShell: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: "12rem minmax(0, 1fr)",
  },
  slideStrip: {
    alignContent: "start",
    display: "grid",
    gap: "0.5rem",
  },
  slideButton: {
    background: "Canvas",
    border: "1px solid ButtonBorder",
    borderRadius: "0.5rem",
    color: "CanvasText",
    cursor: "pointer",
    display: "grid",
    gap: "0.25rem",
    padding: "0.625rem",
    textAlign: "left",
  },
  slideButtonActive: {
    outline: "2px solid Highlight",
    outlineOffset: "2px",
  },
  slideLayoutLabel: {
    color: "GrayText",
    fontSize: "0.75rem",
  },
  slideFocus: {
    border: "1px solid ButtonBorder",
    borderRadius: "0.75rem",
    display: "grid",
    gap: "0.75rem",
    padding: "0.75rem",
  },
  slideMeta: {
    color: "GrayText",
    fontSize: "0.875rem",
    margin: 0,
  },
};

export default Editor;
