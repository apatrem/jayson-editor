import { invoke } from "@tauri-apps/api/core";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FC,
  type ReactNode,
} from "react";
import type { JSONContent } from "@tiptap/react";
import type { Editor as TipTapEditor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { defaultBrand } from "../../brand/defaultBrand";
import { BrandProvider } from "../../brand-tokens/BrandProvider";
import { parseDocModelYaml } from "../../docmodel/serialize";
import { loadAllBlocks } from "../../blocks/runtime-registry";
import type { InstalledAuthoredBlock } from "../../blocks/runtime-registry";
import type { BlockRegistryRecord } from "../../blocks/defineBlock";
import {
  createAutosaveController,
  type AutosaveController,
} from "../../editor/autosave";
import { Editor } from "../../editor/Editor";
import {
  denormalizeProseMarksForDocModel,
  normalizeProseMarksForEditor,
} from "../../editor/normalize-prose-marks";
import { BlockPalette, type BlockPaletteProps } from "../../editor/BlockPalette";
import {
  docModelToProseMirror,
  proseMirrorToDocModel,
  type ProseMirrorDocument,
  type ProseMirrorNode,
} from "../../editor/mapping";
import type { DocumentModel } from "../../renderer/DocumentRenderer";
import { PageView } from "../../renderer/PageView";
import { DocModelSchema } from "../../schema/docmodel";
import type { Meta } from "../../schema/meta";
import { DocumentSettingsDialog } from "./DocumentSettingsDialog";
import { SectionSidebar } from "./SectionSidebar";
import {
  moveSection,
  renameSection,
  createSection,
  deleteSection,
} from "../../docmodel/section-ops";
import {
  useBrandBlocksFromRegistry,
  useAuthoredManifestsFromRegistry,
} from "../../blocks/runtime-registry";
import { AuthoringPanel, type AuthoringPanelGenerateParams } from "../authoring/AuthoringPanel";
import {
  buildGenerateAuthoredBlockRequest,
  buildRefineAuthoredBlockRequest,
  type AuthoredBlockConversationTurn,
  type GenerateAuthoredBlockParams,
} from "../../llm/generate-authored-block";
import { buildAuthoredRenderer } from "../../blocks/authored/template-expander";
import type { AuthoredBlockManifest } from "../../blocks/authored/defineAuthoredBlock";
import { lintAuthoredBlock, type AuthoredBlockLintResult } from "../../ipc/authored-block";
import type { LLMRequest, LLMResponse } from "../../llm/client";
import type { BatchedCommentClient } from "../../llm/batch-comments";
import { CommentReviewSurface } from "../../comments/CommentReviewSurface";
import {
  CreateComment,
  DEFAULT_COMMENT_AUTHOR,
  type CommentAuthor,
  type CommentSelection,
} from "../../comments/CreateComment";
import {
  CommentSelectionBubble,
  type CommentSelectionBubbleProps,
} from "../../comments/CommentSelectionBubble";

export interface EditorSurfaceProps {
  initialContent: JSONContent;
  editable: boolean;
  onUpdate: (content: JSONContent) => void;
  onEditorReady?: (editor: BlockPaletteProps["editor"]) => void;
  /**
   * The current DocModel, so the editor can resolve per-document layout (block
   * gap + heading-numbering scheme) from `meta.layout` (ADR-0018, item 6).
   */
  docModel?: DocumentModel;
  /**
   * Installed authored manifests whose TipTap nodes the editor appends to its
   * closed schema (ADR-0015). Default [] = static blocks only.
   */
  authoredManifests?: AuthoredBlockManifest[];
  /**
   * When provided, the editor toolbar shows an "Add block" button that calls
   * this (DocumentView opens the block-palette drawer). Omitted for surfaces
   * with no palette (e.g. the standalone deck editor).
   */
  onAddBlock?: () => void;
}

export interface DocumentViewProps {
  path: string;
  initialDoc?: DocumentModel;
  readYamlFile?: (path: string) => Promise<string>;
  writeYamlFile?: (path: string, yaml: string) => Promise<void>;
  autosaveDebounceMs?: number;
  onDocumentChange?: (doc: DocumentModel) => void;
  EditorComponent?: FC<EditorSurfaceProps>;
  /**
   * Called when the consultant clicks "Create new Authored block" in the palette.
   * Receives the current document context so the generation pipeline (T-172 / T-173)
   * can use the surrounding blocks, brand tokens, and document tone.
   */
  onCreateAuthoredBlock?: (doc: DocumentModel) => void;
  /**
   * Injectable LLM call function for the authored-block generation pipeline.
   * Defaults to a no-op (null) when not provided — the Generate button still
   * appears but calls won't reach a real LLM.  Injected from the app root once
   * an LLMClient is available; also used in tests to assert prompt structure.
   */
  callLlm?: (request: LLMRequest) => Promise<LLMResponse>;
  /**
   * Comment-to-AI client. Present when LLM is configured; absent → the review
   * panel still accepts/rejects existing proposals but "Send to AI" is disabled.
   */
  commentClient?: BatchedCommentClient;
  /** Author identity for new comments and follow-ups (from install config when wired). */
  commentAuthor?: CommentAuthor;
  /**
   * The floating selection bubble that opens the create-comment draft. Defaults
   * to the real `CommentSelectionBubble` (a TipTap `BubbleMenu`, tippy-positioned).
   * Injectable so tests can exercise the bubble → draft → mark → comment wiring
   * without mounting tippy in happy-dom.
   */
  CommentBubbleComponent?: FC<CommentSelectionBubbleProps>;
  /**
   * Injectable advisory lint function for the preview pipeline.
   * Defaults to the real `lintAuthoredBlock` IPC command.
   * Tests inject a stub that returns `{ ok: true, violations: [], extractedManifest: {...} }`.
   */
  lintForPreview?: (source: string) => Promise<AuthoredBlockLintResult>;
}

const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 2000;

const DefaultEditorSurface: FC<EditorSurfaceProps> = ({
  initialContent,
  editable,
  onUpdate,
  onEditorReady,
  authoredManifests = [],
  onAddBlock,
  docModel,
}) => (
  <Editor
    initialContent={initialContent}
    editable={editable}
    onUpdate={onUpdate}
    authoredManifests={authoredManifests}
    {...(docModel === undefined ? {} : { docModel })}
    {...(onAddBlock === undefined ? {} : { onAddBlock })}
    {...(onEditorReady === undefined
      ? {}
      : {
          onEditorReady: (readyEditor) => {
            onEditorReady(readyEditor as BlockPaletteProps["editor"]);
          },
        })}
  />
);

/**
 * A stable signature of the document's numbering override, used in the editor's
 * remount key so a numbering-format change from the settings dialog rebuilds
 * the editor (its HeadingNumber scheme is captured at creation). Block spacing
 * doesn't need a remount — it recomputes from the re-rendered surface style.
 */
function numberingSignature(doc: DocumentModel | null): string {
  return JSON.stringify(doc?.meta.layout?.numbering ?? null);
}

/**
 * Signature of the section structure (ids + nav titles). The editor onUpdate
 * compares it to detect structural changes — including undo/redo of a section
 * reorder/create/delete/rename — and re-renders the sidebar then (but not on
 * every keystroke).
 */
function sectionStructureSignature(doc: DocumentModel): string {
  return doc.sections.map((section) => `${section.id}:${section.title ?? ""}`).join("|");
}

export const DocumentView: FC<DocumentViewProps> = ({
  path,
  initialDoc,
  readYamlFile = defaultReadYamlFile,
  writeYamlFile = defaultWriteYamlFile,
  autosaveDebounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
  onDocumentChange,
  EditorComponent = DefaultEditorSurface,
  onCreateAuthoredBlock,
  callLlm,
  commentClient,
  commentAuthor = DEFAULT_COMMENT_AUTHOR,
  CommentBubbleComponent = CommentSelectionBubble,
  lintForPreview = defaultLintForPreview,
}) => {
  const generatedBlocks = useBrandBlocksFromRegistry();
  const installedAuthored = useAuthoredManifestsFromRegistry();
  const authoredManifests = useMemo(
    () => installedAuthored.map((i) => i.manifest),
    [installedAuthored],
  );
  // Remount the editor when the installed set changes in a way that affects
  // the schema or node views (see authoredRemountSignature / ADR-0015).
  const authoredSignature = useMemo(
    () => authoredRemountSignature(installedAuthored),
    [installedAuthored],
  );
  const [doc, setDoc] = useState<DocumentModel | null>(initialDoc ?? null);
  // editorSeed is the DocModel projected to editor JSON. It depends on the
  // installed set because authored blocks need the mapping to reconcile their
  // {sender}:{slug} type (ADR-0016); a doc referencing a not-yet-loaded authored
  // block yields null → "Loading…" until the set arrives (the boot race) or the
  // block is permanently deleted (deferred removed-block edge).
  const editorSeed = useMemo<JSONContent | null>(
    () => (doc === null ? null : safeDocumentToEditorContent(doc, installedAuthored)),
    [doc, installedAuthored],
  );
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [paletteOpen, setPaletteOpen] = useState(false);
  // "edit" = continuous WYSIWYG surface; "page" = on-demand read-only A4
  // pagination (paged.js) showing real page breaks (ADR-0017).
  const [viewMode, setViewMode] = useState<"edit" | "page">("edit");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editor, setEditor] = useState<TipTapEditor | null>(null);
  const [authoringContext, setAuthoringContext] = useState<DocumentModel | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [commentDraftSelection, setCommentDraftSelection] =
    useState<CommentSelection | null>(null);
  // ── Selection-driven structured-block panel (P0c) ────────────────────────
  // Tracks which atom block is currently node-selected so DocumentView can
  // mount the matching side panel. Cleared whenever the selection moves off a
  // panel-bearing block. `nodeJson` is the selected node's ProseMirror JSON
  // (attrs + content), bridged to a typed block via the registry's fromPm.
  const [selectedNode, setSelectedNode] = useState<
    { nodeName: string; pos: number; nodeJson: ProseMirrorNode } | null
  >(null);
  const handleEditorReady = useCallback(
    (readyEditor: BlockPaletteProps["editor"]) => {
      setEditor(readyEditor as TipTapEditor | null);
    },
    [],
  );
  // Apply edited document metadata/layout from the settings dialog (ADR-0018,
  // item 6). Updating `doc` re-renders the editor surface (so the block-gap
  // recomputes) and changes its remount key when the numbering scheme changes.
  const applyMeta = useCallback(
    (nextMeta: Meta) => {
      const previous = currentDoc.current;
      if (previous === null) {
        return;
      }
      const updated: DocumentModel = { ...previous, meta: nextMeta };
      currentDoc.current = updated;
      setDoc(updated);
      setSaveState("saving");
      onDocumentChange?.(updated);
      autosave.current?.schedule(updated);
      setSettingsOpen(false);
    },
    [onDocumentChange],
  );
  // Fallback for structural edits before the editor is ready: setDoc remounts
  // and re-seeds the editor (loses undo history, but only used pre-mount).
  const applyDocChange = useCallback(
    (updated: DocumentModel) => {
      currentDoc.current = updated;
      setDoc(updated);
      setSaveState("saving");
      onDocumentChange?.(updated);
      autosave.current?.schedule(updated);
    },
    [onDocumentChange],
  );
  // Structural section edits (reorder/create/delete/rename) applied as ONE
  // undoable ProseMirror transaction on the live editor — this keeps the editor
  // history intact (no remount) and makes the section change itself undoable
  // (Cmd+Z). The editor's onUpdate persists it; setDoc re-renders the sidebar
  // (the editor key has no section signature, so it does not remount).
  const applySectionStructureChange = useCallback(
    (updated: DocumentModel) => {
      const ed = editor;
      if (ed === null) {
        applyDocChange(updated);
        return;
      }
      let docNode;
      try {
        docNode = ed.state.schema.nodeFromJSON(
          documentToEditorContent(updated, installedAuthored),
        );
      } catch {
        applyDocChange(updated);
        return;
      }
      ed.view.dispatch(
        ed.state.tr.replaceWith(0, ed.state.doc.content.size, docNode.content),
      );
      setDoc(updated);
    },
    [editor, installedAuthored, applyDocChange],
  );
  const handleReorderSection = useCallback(
    (from: number, to: number) => {
      const cur = currentDoc.current;
      if (cur !== null) applySectionStructureChange(moveSection(cur, from, to));
    },
    [applySectionStructureChange],
  );
  const handleRenameSection = useCallback(
    (sectionId: string, title: string) => {
      const cur = currentDoc.current;
      if (cur !== null) applySectionStructureChange(renameSection(cur, sectionId, title));
    },
    [applySectionStructureChange],
  );
  const handleCreateSection = useCallback(
    (afterIndex: number) => {
      const cur = currentDoc.current;
      if (cur !== null) {
        applySectionStructureChange(
          createSection(cur, {
            sectionId: crypto.randomUUID(),
            blockId: crypto.randomUUID(),
            afterIndex,
          }),
        );
      }
    },
    [applySectionStructureChange],
  );
  const handleDeleteSection = useCallback(
    (sectionId: string) => {
      const cur = currentDoc.current;
      if (cur !== null) applySectionStructureChange(deleteSection(cur, sectionId));
    },
    [applySectionStructureChange],
  );
  const handleJumpToSection = useCallback((sectionId: string) => {
    if (typeof document === "undefined") {
      return;
    }
    const selectorId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(sectionId)
        : sectionId;
    const el = document.querySelector(`[data-section-id="${selectorId}"]`);
    if (!(el instanceof HTMLElement)) {
      return;
    }
    // Deterministic scroll: land the section just below the sticky formatting
    // toolbar (scrollIntoView + scroll-margin behaved inconsistently). Offset =
    // toolbar height + a small gap.
    const toolbar = document.querySelector('[aria-label="Formatting toolbar"]');
    const offset = (toolbar instanceof HTMLElement ? toolbar.getBoundingClientRect().height : 44) + 12;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);
  // ── Generation state (T-173) ─────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [previewNode, setPreviewNode] = useState<ReactNode>(undefined);
  const generationHistory = useRef<AuthoredBlockConversationTurn[]>([]);
  const lastGenerateParams = useRef<GenerateAuthoredBlockParams | null>(null);
  const currentDoc = useRef<DocumentModel | null>(initialDoc ?? null);
  const autosave = useRef<AutosaveController | null>(null);

  useEffect(() => {
    autosave.current?.cancel();
    autosave.current = createAutosaveController({
      debounceMs: autosaveDebounceMs,
      writeYaml: async (yaml) => {
        await writeYamlFile(path, yaml);
        setSaveState("saved");
      },
    });
    return () => {
      autosave.current?.cancel();
      autosave.current = null;
    };
  }, [autosaveDebounceMs, path, writeYamlFile]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (initialDoc !== undefined) {
      currentDoc.current = initialDoc;
      setDoc(initialDoc);
      return;
    }
    void readYamlFile(path)
      .then((yaml) => parseDocumentYaml(yaml))
      .then((loadedDoc) => {
        if (!cancelled) {
          currentDoc.current = loadedDoc;
          setDoc(loadedDoc);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialDoc, path, readYamlFile]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && paletteOpen) {
        event.preventDefault();
        setPaletteOpen(false);
        return;
      }
      if (event.key !== "/" || paletteOpen) {
        return;
      }
      event.preventDefault();
      setPaletteOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [paletteOpen]);

  useEffect(() => {
    if (editor === null) return undefined;
    // Tests inject a mock editor that exposes only `commands`. Skip the
    // selection-listener wiring when the full TipTap API isn't available.
    if (typeof editor.on !== "function" || typeof editor.off !== "function") {
      return undefined;
    }
    const onSelectionUpdate = (): void => {
      const { selection } = editor.state;
      if (selection instanceof NodeSelection) {
        const name = selection.node.type.name;
        if (PANEL_RECORDS.has(name)) {
          setSelectedNode({
            nodeName: name,
            pos: selection.from,
            nodeJson: selection.node.toJSON() as ProseMirrorNode,
          });
          return;
        }
      }
      setSelectedNode(null);
    };
    editor.on("selectionUpdate", onSelectionUpdate);
    return () => {
      editor.off("selectionUpdate", onSelectionUpdate);
    };
  }, [editor]);

  // ── Generation handler (T-173) ─────────────────────────────────────────────
  const handleGenerate = (panelParams: AuthoringPanelGenerateParams): void => {
    const context = authoringContext ?? currentDoc.current;
    if (context === null || callLlm === undefined) {
      return;
    }

    const genParams: GenerateAuthoredBlockParams = {
      description: panelParams.description,
      slug: panelParams.slug,
      displayName: panelParams.displayName,
    };

    const history = generationHistory.current;
    const isRefinement = history.length > 0;

    const request = isRefinement
      ? buildRefineAuthoredBlockRequest(
          genParams,
          context,
          history,
          panelParams.description,
        )
      : buildGenerateAuthoredBlockRequest(genParams, context);

    setGenerating(true);
    lastGenerateParams.current = genParams;

    void callLlm(request)
      .then(async (response) => {
        const source = response.content.trim();

        // Append turns to conversation history for next refinement iteration.
        const userMessage = isRefinement
          ? panelParams.description
          : `Generate ${genParams.slug}: ${genParams.description}`;
        generationHistory.current = [
          ...history,
          { role: "user", content: userMessage },
          { role: "assistant", content: source },
        ];

        // Advisory lint for preview — warnings only, does not quarantine.
        const lintResult = await lintForPreview(source);
        if (lintResult.ok && lintResult.extractedManifest !== null) {
          const manifest = lintResult.extractedManifest as unknown as AuthoredBlockManifest;
          const Renderer = buildAuthoredRenderer(manifest);
          // Render a preview with empty attrs — the block renders its defaults.
          const previewBlock = { id: "preview", type: manifest.slug };
          setPreviewNode(<Renderer block={previewBlock} />);
        } else {
          // Lint failed on preview — show source as code so the consultant
          // can see what the LLM generated before it's refined.
          setPreviewNode(
            <pre style={{ fontSize: "0.75rem", overflow: "auto", margin: 0 }}>
              {source}
            </pre>,
          );
        }
      })
      .catch((genError: unknown) => {
        const msg = genError instanceof Error ? genError.message : String(genError);
        setPreviewNode(
          <p role="alert" style={{ color: "red", margin: 0 }}>
            Generation failed: {msg}
          </p>,
        );
      })
      .finally(() => {
        setGenerating(false);
      });
  };

  if (error !== null) {
    return (
      <main aria-label="Document view" style={styles.shell}>
        <p role="alert" style={styles.errorText}>
          {error}
        </p>
      </main>
    );
  }

  if (doc === null || editorSeed === null) {
    return (
      <main aria-label="Document view" style={styles.shell}>
        <p>Loading document…</p>
      </main>
    );
  }

  return (
    <main aria-label="Document view" style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerActions}>
          <div role="group" aria-label="View mode" style={styles.viewToggle}>
            <button
              type="button"
              aria-pressed={viewMode === "edit"}
              onClick={() => setViewMode("edit")}
              style={{
                ...styles.viewToggleButton,
                ...(viewMode === "edit" ? styles.viewToggleButtonActive : {}),
              }}
            >
              Edit
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "page"}
              onClick={() => setViewMode("page")}
              style={{
                ...styles.viewToggleButton,
                ...(viewMode === "page" ? styles.viewToggleButtonActive : {}),
              }}
            >
              Page view
            </button>
          </div>
          <button
            type="button"
            aria-label="Document settings"
            onClick={() => setSettingsOpen(true)}
            style={styles.viewToggleButton}
          >
            Document settings
          </button>
          <button
            type="button"
            aria-pressed={reviewOpen}
            onClick={() => setReviewOpen((open) => !open)}
            style={styles.viewToggleButton}
          >
            Review comments ({(currentDoc.current ?? doc).comments.length})
          </button>
          <span aria-label="Autosave status" style={saveStatusStyle(saveState)}>
            {SAVE_STATE_LABEL[saveState]}
          </span>
        </div>
      </header>
      {settingsOpen ? (
        <DocumentSettingsDialog
          meta={(currentDoc.current ?? doc).meta}
          onApply={applyMeta}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      <BrandProvider tokens={defaultBrand}>
      {viewMode === "page" ? (
        <PageView
          doc={currentDoc.current ?? doc}
          brand={defaultBrand}
          docFolderPath={parentPath(path)}
        />
      ) : null}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "flex-start",
          ...(viewMode === "page" ? { display: "none" } : {}),
        }}
      >
        <SectionSidebar
          sections={(currentDoc.current ?? doc).sections.map((section) => ({
            id: section.id,
            title: section.title,
          }))}
          onJump={handleJumpToSection}
          onRename={handleRenameSection}
          onReorder={handleReorderSection}
          onCreate={handleCreateSection}
          onDelete={handleDeleteSection}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
        <section aria-label="Editable document" style={styles.editorPane}>
          <div style={styles.editorBody}>
          {/* Re-seed/remount when a different file is opened OR the installed
              authored set changes (the editor schema is built once at mount). */}
          <EditorComponent
            key={`${path}::${authoredSignature}::${numberingSignature(currentDoc.current ?? doc)}`}
            initialContent={editorSeed}
            editable={true}
            docModel={currentDoc.current ?? doc}
            authoredManifests={authoredManifests}
            onEditorReady={handleEditorReady}
            onAddBlock={() => setPaletteOpen(true)}
            onUpdate={(content) => {
              try {
                // `currentDoc.current` is initialized at mount (initialDoc or
                // null) and reassigned synchronously to `loadedDoc` in the
                // load effect before `setDoc(loadedDoc)` fires the re-render
                // that mounts the editor. By the time the editor calls back
                // here, the ref is always non-null — no `?? doc` fallback
                // needed.
                const previous = currentDoc.current!;
                const updated = editorContentToDocument(
                  previous,
                  content,
                  installedAuthored,
                );
                currentDoc.current = updated;
                // Re-render the sidebar only when the section structure changes
                // (a section op or its undo/redo) — not on every keystroke.
                if (sectionStructureSignature(updated) !== sectionStructureSignature(previous)) {
                  setDoc(updated);
                }
                setSaveState("saving");
                onDocumentChange?.(updated);
                autosave.current?.schedule(updated);
              } catch (updateError) {
                setSaveState("failed");
                setError(
                  updateError instanceof Error
                    ? updateError.message
                    : String(updateError),
                );
              }
            }}
          />
          </div>
        </section>
        </div>
        {editor !== null &&
        editor.view !== undefined &&
        commentDraftSelection === null ? (
          <CommentBubbleComponent
            editor={editor}
            onAddComment={setCommentDraftSelection}
          />
        ) : null}
        {commentDraftSelection !== null ? (
          <CreateComment
            selection={commentDraftSelection}
            author={commentAuthor}
            onApplyMark={(commentId, selection) => {
              if (editor === null) {
                return false;
              }
              // Re-select the captured range before marking: focus may have moved
              // to the popup, leaving the editor's live selection stale. Marking
              // the captured from/to keeps the highlight on the intended text.
              return editor
                .chain()
                .focus()
                .setTextSelection({ from: selection.from, to: selection.to })
                .applyCommentMark(commentId)
                .run();
            }}
            onCreate={(comment) => {
              const base = currentDoc.current ?? doc;
              if (base === null) {
                return;
              }
              applyDocChange({
                ...base,
                comments: [...base.comments, comment],
              });
              setCommentDraftSelection(null);
            }}
            onCancel={() => {
              setCommentDraftSelection(null);
            }}
          />
        ) : null}
        {reviewOpen ? (
          <CommentReviewSurface
            doc={currentDoc.current ?? doc}
            commentAuthor={commentAuthor}
            {...(commentClient === undefined ? {} : { commentClient })}
            onDocChange={applyDocChange}
            onClose={() => setReviewOpen(false)}
          />
        ) : null}
      </div>
      {paletteOpen ? (
        <>
          <div
            style={styles.drawerBackdrop}
            onClick={() => setPaletteOpen(false)}
            aria-hidden="true"
          />
          <section
            aria-label="Insert block palette"
            role="dialog"
            aria-modal="true"
            style={styles.paletteDrawer}
          >
            <div style={styles.drawerHeader}>
              <span style={styles.drawerTitle}>Add block</span>
              <button
                type="button"
                aria-label="Close block palette"
                onClick={() => setPaletteOpen(false)}
                style={styles.drawerClose}
              >
                ✕
              </button>
            </div>
            <div style={styles.drawerBody}>
              <BlockPalette
                editor={editor as BlockPaletteProps["editor"]}
                generatedBlocks={generatedBlocks}
                onInsert={() => {
                  setPaletteOpen(false);
                }}
                onCreateAuthoredBlock={() => {
                  const current = currentDoc.current;
                  if (current !== null) {
                    setAuthoringContext(current);
                    onCreateAuthoredBlock?.(current);
                  }
                }}
              />
            </div>
          </section>
        </>
      ) : null}
      </BrandProvider>
      {authoringContext !== null ? (
        <div style={styles.authoringOverlay}>
          <AuthoringPanel
            docContext={authoringContext}
            onClose={() => {
              setAuthoringContext(null);
              setPreviewNode(undefined);
              generationHistory.current = [];
              lastGenerateParams.current = null;
            }}
            {...(callLlm !== undefined ? { onGenerate: handleGenerate } : {})}
            llmAvailable={callLlm !== undefined}
            previewNode={previewNode}
            generating={generating}
          />
        </div>
      ) : null}
      {selectedNode !== null && editor !== null
        ? renderStructuredBlockPanel(selectedNode, editor, () =>
            setSelectedNode(null),
          )
        : null}
    </main>
  );
};

// Node-name → registry record, for every block that ships a side panel.
// Built once at module load (loadAllBlocks is already called at module load by
// the editor). Lets DocumentView mount the right panel generically instead of
// switching on block type.
const PANEL_RECORDS: ReadonlyMap<string, BlockRegistryRecord> = new Map(
  loadAllBlocks()
    .filter((record) => record.panel !== undefined)
    .map((record) => [record.tiptapNode.name, record] as const),
);

function renderStructuredBlockPanel(
  selection: { nodeName: string; pos: number; nodeJson: ProseMirrorNode },
  editor: TipTapEditor,
  onClose: () => void,
): ReactNode {
  const record = PANEL_RECORDS.get(selection.nodeName);
  if (record?.panel === undefined) return null;
  const Panel = record.panel;
  // fromPm bridges the live node (attrs + content) to a typed block; toPm maps
  // edits back. updateAttributes applies only attrs — rich-text body content
  // (callout) is edited inline and preserved here.
  const block: unknown = record.fromPm(selection.nodeJson);
  return (
    <Panel
      block={block}
      onUpdate={(next: unknown) => {
        const pm = record.toPm(next);
        editor
          .chain()
          .setNodeSelection(selection.pos)
          .updateAttributes(selection.nodeName, pm.attrs ?? {})
          .run();
      }}
      onClose={onClose}
    />
  );
}

/**
 * A stable string that changes whenever the installed set would produce a
 * different editor schema or node view, used as the editor remount key
 * (ADR-0015). TipTap builds the node set, per-node attrs, and node views once
 * at mount and can't mutate them on a live editor, so the surrounding
 * component remounts the editor whenever this value changes.
 *
 * Derived from each manifest's `fullType` AND its full serialized manifest --
 * not slugs alone -- so a same-slug replacement (T-170, where a v2 replaces
 * v1 under the same slug) that changes sender, content, attrs, or template
 * still forces a rebuild. Entries are sorted by `fullType` (unique per
 * installed block, since the set is deduped by slug) so the result is
 * independent of load order, then serialized as one JSON string (unambiguous
 * -- distinct installed sets cannot collide on the same signature).
 */
export function authoredRemountSignature(
  installedAuthored: readonly InstalledAuthoredBlock[],
): string {
  const pairs = installedAuthored
    .map((i) => [i.fullType, i.manifest] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(pairs);
}

export function documentToEditorContent(
  doc: DocumentModel,
  installedAuthored: readonly InstalledAuthoredBlock[] = [],
): JSONContent {
  const mapped = docModelToProseMirror(doc, installedAuthored);
  return normalizeProseMarksForEditor({
    type: "doc",
    content: (mapped.content ?? []).filter(isProseMirrorNode) as JSONContent[],
  });
}

/**
 * documentToEditorContent that returns null instead of throwing when a block
 * can't be mapped — typically an authored block whose manifest hasn't loaded
 * yet (the boot race). The caller shows "Loading…" and recomputes when the
 * installed set arrives. A permanently-deleted authored block stays unmappable
 * (deferred removed-block edge, ADR-0016).
 */
function safeDocumentToEditorContent(
  doc: DocumentModel,
  installedAuthored: readonly InstalledAuthoredBlock[],
): JSONContent | null {
  try {
    return documentToEditorContent(doc, installedAuthored);
  } catch {
    return null;
  }
}

export function editorContentToDocument(
  previousDoc: DocumentModel,
  editorContent: JSONContent,
  installedAuthored: readonly InstalledAuthoredBlock[] = [],
): DocumentModel {
  const previousPm = docModelToProseMirror(previousDoc, installedAuthored);
  const normalized = denormalizeProseMarksForDocModel(editorContent);
  const nextDoc = proseMirrorToDocModel(
    {
      type: "doc",
      attrs: previousPm.attrs,
      content: editorSectionsFromContent(normalized, previousDoc, previousPm),
    } satisfies ProseMirrorDocument,
    installedAuthored,
  );
  if (nextDoc.kind !== "document") {
    throw new Error("DocumentView only supports kind=document");
  }
  return nextDoc;
}

function editorSectionsFromContent(
  editorContent: JSONContent,
  previousDoc: DocumentModel,
  previousPm: ProseMirrorDocument,
): ProseMirrorNode[] {
  const nodes = (editorContent.content ?? []).filter(isProseMirrorNode);
  if (nodes.length === 0) {
    return [];
  }
  if (nodes[0]?.type === "section") {
    return nodes as ProseMirrorNode[];
  }
  if (previousDoc.sections.length !== 1) {
    throw new Error(
      "Editor content must use section nodes for multi-section documents",
    );
  }
  const section = previousDoc.sections[0]!;
  const previousSection = previousPm.content[0];
  return [
    {
      type: "section",
      attrs: previousSection?.attrs ?? {
        sectionId: section.id,
        title: section.title ?? "",
      },
      content: nodes,
    },
  ];
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

async function defaultReadYamlFile(path: string): Promise<string> {
  return invoke<string>("read_yaml_file", { path });
}

async function defaultLintForPreview(source: string): Promise<AuthoredBlockLintResult> {
  return lintAuthoredBlock(source);
}

async function defaultWriteYamlFile(path: string, yaml: string): Promise<void> {
  await invoke("write_yaml_file", { path, content: yaml });
}

function parseDocumentYaml(yaml: string): DocumentModel {
  const parsed = DocModelSchema.parse(parseDocModelYaml(yaml));
  if (parsed.kind !== "document") {
    throw new Error("DocumentView only supports kind=document");
  }
  return parsed;
}

function isProseMirrorNode(value: unknown): value is ProseMirrorNode {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

type SaveState = "idle" | "saving" | "saved" | "failed";

const SAVE_STATE_LABEL: Record<SaveState, string> = {
  idle: "All changes saved",
  saving: "Saving…",
  saved: "Saved",
  failed: "Save failed",
};

const SAVE_STATE_COLOR: Record<SaveState, { color: string; background: string }> = {
  idle: { color: "#64748B", background: "#F1F5F9" },
  saving: { color: "#92600A", background: "#FEF3C7" },
  saved: { color: "#166534", background: "#DCFCE7" },
  failed: { color: "#B91C1C", background: "#FEE2E2" },
};

function saveStatusStyle(state: SaveState): CSSProperties {
  return {
    ...styles.saveStatus,
    ...SAVE_STATE_COLOR[state],
  };
}

const styles = {
  shell: {
    display: "grid",
    gap: "1rem",
    minHeight: "100%",
    padding: "1rem",
    background: "#F1F5F9",
  },
  header: {
    alignItems: "center",
    display: "flex",
    gap: "1rem",
    justifyContent: "flex-end",
  },
  headerActions: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
  },
  saveStatus: {
    fontSize: "0.75rem",
    fontWeight: 600,
    borderRadius: "999px",
    padding: "0.2rem 0.6rem",
  },
  viewToggle: {
    display: "inline-flex",
    border: "1px solid #D6DEE8",
    borderRadius: "0.5rem",
    overflow: "hidden",
    background: "#FFFFFF",
  },
  viewToggleButton: {
    appearance: "none",
    border: "none",
    background: "transparent",
    color: "#475569",
    cursor: "pointer",
    fontSize: "0.8125rem",
    fontWeight: 600,
    padding: "0.35rem 0.75rem",
  },
  viewToggleButtonActive: {
    background: "#0B3D91",
    color: "#FFFFFF",
  },
  // The editor body must NOT create a scroll/clip context (no `overflow`), so
  // the editor's position:sticky toolbar resolves against the window and pins
  // to the viewport top as the page scrolls.
  editorBody: {
    padding: "1.5rem 2rem",
    flex: "1 1 auto",
  },
  // Single WYSIWYG surface — a centered document card.
  editorPane: {
    minWidth: 0,
    width: "100%",
    maxWidth: "60rem",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    border: "1px solid #E2E8F0",
    borderRadius: "0.75rem",
    background: "#FFFFFF",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
  },
  drawerBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.25)",
    zIndex: 40,
  },
  paletteDrawer: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: "22rem",
    maxWidth: "90vw",
    zIndex: 41,
    display: "flex",
    flexDirection: "column",
    background: "#FFFFFF",
    borderLeft: "1px solid #E2E8F0",
    boxShadow: "-8px 0 24px rgba(15, 23, 42, 0.12)",
  },
  drawerHeader: {
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.75rem 1rem",
    borderBottom: "1px solid #E2E8F0",
  },
  drawerTitle: {
    fontSize: "0.9375rem",
    fontWeight: 700,
    color: "#0F172A",
  },
  drawerClose: {
    appearance: "none",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: "0.9375rem",
    color: "#64748B",
    padding: "0.25rem 0.4rem",
    borderRadius: "0.375rem",
  },
  drawerBody: {
    flex: "1 1 auto",
    overflow: "auto",
    padding: "1rem",
  },
  errorText: {
    color: "#B91C1C",
    margin: 0,
  },
  authoringOverlay: {
    marginTop: "1rem",
  },
} satisfies Record<string, CSSProperties>;
