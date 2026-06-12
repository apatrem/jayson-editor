import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { open as openShellPath } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { defaultBrand } from "../../brand/defaultBrand";
import { BrandProvider } from "../../brand-tokens/BrandProvider";
import { withRenderWatchdog } from "../../block-primitives/RenderWatchdog";
import { parseDocModelJson, serializeDocModel } from "../../docmodel/serialize";
import { DOCUMENT_OPEN_FILTER, DOCUMENT_SAVE_FILTER } from "../menu/FileMenu";
import { renderStaticHtmlForExport } from "../../export/render-static-html";
import { formatErrorMessage } from "../../ipc/errors";
import { type AuthoredReceiveResult, receiveAuthoredBlock } from "../../ipc/authored-block";
import type { LLMRequest, LLMResponse } from "../../llm/client";
import type { BatchedCommentClient } from "../../llm/batch-comments";
import type { CommentAuthor } from "../../comments/CreateComment";
import type { DocModel } from "../../schema/docmodel";
import { DocModelSchema } from "../../schema/docmodel";
import { AppErrorBoundary } from "../AppErrorBoundary";
import { FolderPickerScreen } from "../install/FolderPickerScreen";
import { LibraryView } from "../library/LibraryView";
import { MenuBar } from "../menu/MenuBar";
import { DocumentView, type DocumentViewProps } from "../views/DocumentView";
import type { BootStrategy } from "./boot";
import type { Route, RouteIntent } from "./types";

export const DEFAULT_DOCUMENT_VIEW_RENDER_BUDGET_MS = 500;
export const LIBRARY_VIEW_RENDER_BUDGET_MS = 1500;

interface DocumentContent {
  path: string;
  doc: DocModel;
  dirty: boolean;
  paletteOpen: boolean;
}

interface ExportHandoff {
  kind: "browser_handoff";
  path: string;
}

export interface FileActionDeps {
  selectOpenPath: () => Promise<string | null>;
  selectSavePath: (defaultPath: string) => Promise<string | null>;
  readDocumentFile: (path: string) => Promise<string>;
  writeDocumentFile: (path: string, json: string) => Promise<void>;
  exportPdf: (input: { html: string; suggestedName: string }) => Promise<ExportHandoff>;
  openPath: (path: string) => Promise<void>;
  renderHtmlForExport: typeof renderStaticHtmlForExport;
  libraryRoot: string;
  sharedFolderPath: string;
  // M8 additions — injectable for testing
  selectFolder: () => Promise<string | null>;
  writeAppConfig: (config: { paths: { cloudSyncRoot: string } }) => Promise<void>;
  readAppConfig: () => Promise<{ paths: { cloudSyncRoot: string } }>;
  listDirectory: (path: string) => Promise<{ name: string; path: string; is_dir: boolean }[]>;
  /**
   * T-164 — file picker for Authored block files (.tsx).
   * Returns the chosen absolute path, or null if cancelled.
   * Injectable for testing; default opens a native dialog.
   */
  selectImportPath: () => Promise<string | null>;
  /**
   * T-164 — receive pipeline for Authored block files.
   * Takes the absolute path to a `.tsx` file (from drag-drop or file picker),
   * lints it, and writes to `generated-blocks/active/` or `quarantine/`.
   * Injectable for testing; default reads cloudSyncRoot from app config.
   */
  importAuthoredBlock: (path: string) => Promise<AuthoredReceiveResult>;
  /**
   * T-173 — runtime LLM call for authored-block generation (codegen model).
   * Supplied by App when a full config with an `llm` block is present; absent
   * on folder-picker / M8 installs, where Generate shows a "finish setup" hint.
   */
  callLlm: (request: LLMRequest) => Promise<LLMResponse>;
  /** Comment-to-AI client (D-12/D-13); supplied when LLM is configured. */
  commentClient: BatchedCommentClient;
  /** Comment author identity from install config (attribution + follow-ups). */
  commentAuthor: CommentAuthor;
}

export interface RoutesProps {
  bootStrategy: BootStrategy;
  initialDocContent?: DocumentContent | null;
  fileActions?: Partial<FileActionDeps>;
  DocumentViewComponent?: ComponentType<DocumentViewProps>;
  documentWatchdogBudgetMs?: number;
}

function routeReducer(route: Route, intent: RouteIntent): Route {
  switch (intent.intent) {
    case "__set":
      return intent.route;
    case "open-document":
      return {
        kind: "document",
        openDocs: [{ id: intent.path, path: intent.path }],
        activeIndex: 0,
      };
    case "back-to-library":
      return { kind: "library" };
    case "re-pick-folder":
      return { kind: "folder-picker", reason: "missing" };
    case "create-from-template":
    case "use-sample":
      return route;
  }
}

export function Routes({
  bootStrategy,
  initialDocContent,
  fileActions = {},
  DocumentViewComponent = DocumentView,
  documentWatchdogBudgetMs,
}: RoutesProps) {
  // When initialDocContent is provided (e.g. from tests using initialDocument),
  // initialize the route synchronously so test assertions don't need waitFor.
  const [route, dispatch] = useReducer(
    routeReducer,
    initialDocContent != null
      ? ({
          kind: "document",
          openDocs: [{ id: initialDocContent.path, path: initialDocContent.path }],
          activeIndex: 0,
        } satisfies Route)
      : ({ kind: "welcome" } satisfies Route),
  );
  const [docContent, setDocContent] = useState<DocumentContent | null>(
    initialDocContent ?? null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [boundaryResetVersion, setBoundaryResetVersion] = useState(0);

  // ── Authored-block receive pipeline (T-164) ───────────────────────────────
  // Keep a stable ref to the injectable importAuthoredBlock so the drag-drop
  // listener is registered only once (not re-subscribed on every render).
  const importAuthoredBlockFn = fileActions.importAuthoredBlock ?? importAuthoredBlockDefault;
  const importAuthoredBlockRef = useRef(importAuthoredBlockFn);
  useEffect(() => {
    importAuthoredBlockRef.current = importAuthoredBlockFn;
  }); // runs every render to keep ref current

  const handleImportResult = useCallback((result: AuthoredReceiveResult): void => {
    if (result.ok) {
      setStatusMessage("Block installed — refresh the palette to see it.");
    } else {
      const summary = result.violations.slice(0, 2).map((v) => v.message).join("; ");
      setActionError(
        `Block import failed (${result.violations.length} violation${result.violations.length === 1 ? "" : "s"}): ${summary}. ` +
        `The file has been quarantined.`,
      );
    }
  }, []);

  // Register Tauri drag-drop listener.  Silently skips when not running in Tauri
  // (browser, JSDOM tests) — the dynamic import + try/catch guard prevents crashes.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type !== "drop") return;
          for (const filePath of event.payload.paths) {
            if (!filePath.endsWith(".tsx")) continue;
            void importAuthoredBlockRef.current(filePath)
              .then(handleImportResult)
              .catch((err: unknown) => {
                setActionError(`Block import error: ${formatErrorMessage(err)}`);
              });
          }
        });
      } catch {
        // Not running in Tauri — drag-drop unavailable (expected in tests).
      }
    })();
    return () => { unlisten?.(); };
  }, [handleImportResult]); // subscribe once; ref keeps callback current

  const WatchdoggedDocumentView = useMemo(
    () =>
      withRenderWatchdog(DocumentViewComponent, {
        budgetMs: documentWatchdogBudgetMs ?? DEFAULT_DOCUMENT_VIEW_RENDER_BUDGET_MS,
      }),
    [DocumentViewComponent, documentWatchdogBudgetMs],
  );

  useEffect(() => {
    if (initialDocContent != null) return;
    void bootStrategy.bootRoute().then((initial) => {
      dispatch({ intent: "__set", route: initial });
    });
  }, [bootStrategy, initialDocContent]);

  const openDocument = useCallback(async (): Promise<void> => {
    setActionError(null);
    setStatusMessage(null);
    try {
      const path = await (fileActions.selectOpenPath ?? selectOpenPathDefault)();
      if (path === null) return;
      const raw = await (fileActions.readDocumentFile ?? readDocumentFileDefault)(path);
      const doc = DocModelSchema.parse(parseDocModelJson(raw));
      setDocContent({ path, doc, dirty: false, paletteOpen: false });
      dispatch({ intent: "open-document", path });
    } catch (error) {
      setActionError(formatErrorMessage(error));
    }
  }, [fileActions]);

  const openDocumentFromPath = useCallback(async (path: string): Promise<void> => {
    setActionError(null);
    setStatusMessage(null);
    try {
      const raw = await (fileActions.readDocumentFile ?? readDocumentFileDefault)(path);
      const doc = DocModelSchema.parse(parseDocModelJson(raw));
      setDocContent({ path, doc, dirty: false, paletteOpen: false });
      dispatch({ intent: "open-document", path });
    } catch (error) {
      setActionError(formatErrorMessage(error));
    }
  }, [fileActions]);

  const saveDocument = useCallback(async (): Promise<void> => {
    if (docContent === null) return;
    setActionError(null);
    try {
      await (fileActions.writeDocumentFile ?? writeDocumentFileDefault)(
        docContent.path,
        serializeDocModel(docContent.doc),
      );
      setDocContent({ ...docContent, dirty: false });
      setStatusMessage("Saved.");
    } catch (error) {
      setActionError(formatErrorMessage(error));
    }
  }, [docContent, fileActions]);

  const saveDocumentAs = useCallback(async (): Promise<void> => {
    if (docContent === null) return;
    setActionError(null);
    try {
      const selectSave =
        fileActions.selectSavePath ??
        ((defaultPath) => selectSavePathDefault(defaultPath));
      const selected = await selectSave(docContent.path);
      if (selected === null) return;
      await (fileActions.writeDocumentFile ?? writeDocumentFileDefault)(
        selected,
        serializeDocModel(docContent.doc),
      );
      setDocContent({ ...docContent, path: selected, dirty: false });
      setStatusMessage(
        fileActions.libraryRoot && !selected.startsWith(fileActions.libraryRoot)
          ? `Saved to ${selected}. This document is outside your library folder and won't appear in the library.`
          : "Saved As.",
      );
    } catch (error) {
      setActionError(formatErrorMessage(error));
    }
  }, [docContent, fileActions]);

  const reopenCurrentDocument = useCallback(async (): Promise<void> => {
    if (docContent === null) return;
    const raw = await (fileActions.readDocumentFile ?? readDocumentFileDefault)(docContent.path);
    const doc = DocModelSchema.parse(parseDocModelJson(raw));
    setDocContent({ ...docContent, doc, dirty: false });
    setBoundaryResetVersion((v) => v + 1);
  }, [docContent, fileActions]);

  const returnToWelcome = useCallback((): void => {
    setActionError(null);
    setStatusMessage(null);
    setDocContent(null);
    dispatch({ intent: "__set", route: { kind: "welcome" } });
    setBoundaryResetVersion((v) => v + 1);
  }, []);

  const exportPdf = useCallback(async (): Promise<void> => {
    if (docContent === null || docContent.doc.kind !== "document") return;
    setActionError(null);
    try {
      const renderHtml = fileActions.renderHtmlForExport ?? renderStaticHtmlForExport;
      const html = await renderHtml(
        docContent.doc,
        defaultBrand,
        parentPath(docContent.path),
        fileActions.sharedFolderPath ?? "/shared",
      );
      const exportHandoff = await (
        fileActions.exportPdf ??
        ((input) => invoke<ExportHandoff>("export_pdf", input))
      )({
        html,
        suggestedName: `${basename(docContent.path).replace(/\.ya?ml$/iu, "")}.pdf`,
      });
      await (fileActions.openPath ?? openShellPath)(exportHandoff.path);
      setStatusMessage(
        "Opened in your browser — use Cmd-P / Ctrl-P to save as PDF. " +
          'Turn OFF "Headers and footers" in the print dialog so only the ' +
          "document's own title and page numbers print (no date or file path).",
      );
    } catch (error) {
      setActionError(formatErrorMessage(error));
    }
  }, [docContent, fileActions]);

  const importBlock = useCallback(async (): Promise<void> => {
    setActionError(null);
    setStatusMessage(null);
    try {
      const selectPath = fileActions.selectImportPath ?? selectImportPathDefault;
      const selected = await selectPath();
      if (selected === null) return;
      const doImport = fileActions.importAuthoredBlock ?? importAuthoredBlockDefault;
      const result = await doImport(selected);
      handleImportResult(result);
    } catch (error) {
      setActionError(formatErrorMessage(error));
    }
  }, [fileActions, handleImportResult]);

  const canSave = route.kind === "document" && docContent !== null;
  const canExport = canSave && docContent.doc.kind === "document";

  return (
    <div style={styles.appShell}>
      <MenuBar
        canSave={canSave}
        canExport={canExport}
        onOpen={openDocument}
        onSave={saveDocument}
        onSaveAs={saveDocumentAs}
        onExportPdf={exportPdf}
        onImportBlock={importBlock}
        statusMessage={statusMessage}
      />
      {actionError ? (
        <p role="alert" style={styles.errorText}>
          {actionError}
        </p>
      ) : null}
      {route.kind === "welcome" ? (
        <main aria-label="Welcome" style={styles.welcome}>
          <section style={styles.welcomeCard}>
            <h1 style={styles.title}>Jayson Editor</h1>
            <button
              type="button"
              aria-label="Open Document"
              onClick={() => {
                void openDocument();
              }}
              style={styles.primaryButton}
            >
              Open Document
            </button>
          </section>
        </main>
      ) : route.kind === "folder-picker" ? (
        <FolderPickerScreen
          reason={route.reason}
          dispatch={dispatch}
          deps={{
            ...(fileActions.selectFolder !== undefined
              ? { selectFolder: fileActions.selectFolder }
              : {}),
            ...(fileActions.writeAppConfig !== undefined
              ? { writeAppConfig: fileActions.writeAppConfig }
              : {}),
          }}
        />
      ) : route.kind === "library" ? (
        <LibraryView
          onOpenDoc={openDocumentFromPath}
          deps={{
            ...(fileActions.readAppConfig !== undefined
              ? { readAppConfig: fileActions.readAppConfig }
              : {}),
            ...(fileActions.listDirectory !== undefined
              ? { listDirectory: fileActions.listDirectory }
              : {}),
            ...(fileActions.readDocumentFile !== undefined
              ? { readDocumentFile: fileActions.readDocumentFile }
              : {}),
            ...(fileActions.writeDocumentFile !== undefined
              ? { writeDocumentFile: fileActions.writeDocumentFile }
              : {}),
          }}
        />
      ) : docContent !== null ? (
        <main aria-label="Document shell" style={styles.documentShell}>
          <section
            aria-label="Loaded document"
            data-document-path={docContent.path}
            data-document-kind={docContent.doc.kind}
            style={styles.documentPlaceholder}
          >
            {docContent.doc.kind === "document" ? (
              <BrandProvider tokens={defaultBrand}>
                <AppErrorBoundary
                  onTryReopen={reopenCurrentDocument}
                  onBackToWelcome={returnToWelcome}
                  resetKey={`${docContent.path}:${boundaryResetVersion}`}
                >
                  <WatchdoggedDocumentView
                    path={docContent.path}
                    initialDoc={docContent.doc}
                    dirty={docContent.dirty}
                    {...(fileActions.readDocumentFile === undefined
                      ? {}
                      : { readDocumentFile: fileActions.readDocumentFile })}
                    {...(fileActions.writeDocumentFile === undefined
                      ? {}
                      : { writeDocumentFile: fileActions.writeDocumentFile })}
                    {...(fileActions.callLlm === undefined
                      ? {}
                      : { callLlm: fileActions.callLlm })}
                    {...(fileActions.commentClient === undefined
                      ? {}
                      : { commentClient: fileActions.commentClient })}
                    {...(fileActions.commentAuthor === undefined
                      ? {}
                      : { commentAuthor: fileActions.commentAuthor })}
                    onDocumentChange={(doc) => {
                      setDocContent((current) =>
                        current !== null ? { ...current, doc, dirty: true } : current,
                      );
                    }}
                  />
                </AppErrorBoundary>
              </BrandProvider>
            ) : (
              "DocumentView"
            )}
          </section>
        </main>
      ) : null}
    </div>
  );
}

/**
 * Default implementation of the Authored-block receive pipeline (T-164).
 * Reads cloudSyncRoot from the app config, reads the source file, then
 * delegates to `receiveAuthoredBlock()`.  Tauri-specific; replaced by a
 * mock in tests via fileActions.importAuthoredBlock.
 */
async function importAuthoredBlockDefault(path: string): Promise<AuthoredReceiveResult> {
  const config = await invoke<{ paths: { cloudSyncRoot: string } }>("read_app_config");
  const root = config.paths.cloudSyncRoot.endsWith("/")
    ? config.paths.cloudSyncRoot
    : `${config.paths.cloudSyncRoot}/`;
  const source = await invoke<string>("read_authored_block_file", { path });
  const filename = path.split("/").at(-1) ?? "block.tsx";
  const activeDir = `${root}generated-blocks/active`;
  const quarantineDir = `${root}generated-blocks/quarantine`;
  return receiveAuthoredBlock(source, filename, activeDir, quarantineDir);
}

async function selectImportPathDefault(): Promise<string | null> {
  const selected = await openDialog({
    multiple: false,
    filters: [{ name: "Authored Block", extensions: ["tsx"] }],
  });
  return typeof selected === "string" ? selected : null;
}

async function selectOpenPathDefault(): Promise<string | null> {
  const selected = await openDialog({
    multiple: false,
    filters: [DOCUMENT_OPEN_FILTER],
  });
  return typeof selected === "string" ? selected : null;
}

async function selectSavePathDefault(defaultPath: string): Promise<string | null> {
  const selected = await saveDialog({
    defaultPath,
    filters: [DOCUMENT_SAVE_FILTER],
  });
  return typeof selected === "string" ? selected : null;
}

async function readDocumentFileDefault(path: string): Promise<string> {
  return invoke<string>("read_document_file", { path });
}

async function writeDocumentFileDefault(path: string, json: string): Promise<void> {
  await invoke("write_document_file", { path, content: json });
}

function basename(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(index + 1) : path;
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

const styles = {
  appShell: {
    minHeight: "100vh",
    background: "#F1F5F9",
    color: "#1E293B",
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
  },
  welcome: {
    alignItems: "center",
    display: "grid",
    minHeight: "100vh",
    justifyItems: "center",
    padding: "2rem",
  },
  welcomeCard: {
    border: "1px solid #E2E8F0",
    borderRadius: "1rem",
    background: "#FFFFFF",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
    display: "grid",
    gap: "1.25rem",
    justifyItems: "center",
    padding: "2.5rem 3rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: 0,
  },
  primaryButton: {
    appearance: "none",
    border: "1px solid #0B3D91",
    background: "#0B3D91",
    color: "#FFFFFF",
    borderRadius: "0.5rem",
    fontSize: "0.9375rem",
    fontWeight: 600,
    cursor: "pointer",
    padding: "0.625rem 1.25rem",
  },
  errorText: {
    color: "#B91C1C",
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    borderRadius: "0.5rem",
    margin: "0.75rem 1rem",
    padding: "0.625rem 0.875rem",
    fontSize: "0.875rem",
  },
  documentShell: {
    display: "grid",
    gridTemplateRows: "minmax(0, 1fr)",
    minHeight: "100vh",
  },
  documentPlaceholder: {
    padding: 0,
    minHeight: 0,
  },
} satisfies Record<string, CSSProperties>;
