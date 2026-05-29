import { useEffect, useMemo, useState, type ComponentType } from "react";
import type { DocModel } from "./schema/docmodel";
import type { DocumentViewProps } from "./ui/views/DocumentView";
import { createIpcBootStrategy, type BootStrategy } from "./ui/router/boot";
import { Routes, type FileActionDeps } from "./ui/router/Routes";
import {
  BrandBlocksContext,
  AuthoredManifestsContext,
  loadBrandBlockPaletteItems,
  loadAuthoredManifests,
  type InstalledAuthoredBlock,
} from "./blocks/runtime-registry";
import type { BlockPaletteItem } from "./editor/BlockPalette";
import { loadRuntimeConfig, type RuntimeConfig } from "./llm/runtime-config";
import { createRuntimeLlm, type RuntimeLlm } from "./llm/runtime";

export { DEFAULT_DOCUMENT_VIEW_RENDER_BUDGET_MS } from "./ui/router/Routes";

interface LoadedDocument {
  path: string;
  doc: DocModel;
}

export interface AppProps {
  bootStrategy?: BootStrategy;
  initialDocument?: LoadedDocument;
  // onOpenDocument kept for API-surface continuity; file-open injection goes
  // through fileActions.selectOpenPath instead.
  onOpenDocument?: () => Promise<LoadedDocument | null>;
  fileActions?: Partial<FileActionDeps>;
  DocumentViewComponent?: ComponentType<DocumentViewProps>;
  documentWatchdogBudgetMs?: number;
  readAppConfig?: () => Promise<{ paths: { cloudSyncRoot: string } }>;
  loadGeneratedBlocks?: (cloudSyncRoot: string) => Promise<BlockPaletteItem[]>;
  loadAuthoredManifestSet?: (
    cloudSyncRoot: string,
  ) => Promise<InstalledAuthoredBlock[]>;
  /** Injectable for tests; defaults to reading config.yaml and classifying it. */
  loadRuntime?: () => Promise<RuntimeConfig>;
}

export default function App({
  bootStrategy,
  initialDocument,
  fileActions,
  DocumentViewComponent,
  documentWatchdogBudgetMs,
  readAppConfig = readAppConfigDefault,
  loadGeneratedBlocks = loadBrandBlockPaletteItems,
  loadAuthoredManifestSet = loadAuthoredManifests,
  loadRuntime = loadRuntimeConfig,
}: AppProps) {
  const [generatedBlocks, setGeneratedBlocks] = useState<BlockPaletteItem[]>([]);
  const [authoredManifests, setAuthoredManifests] = useState<
    InstalledAuthoredBlock[]
  >([]);
  const [runtime, setRuntime] = useState<RuntimeLlm | null>(null);
  const [llmConfigError, setLlmConfigError] = useState<string | null>(null);

  useEffect(() => {
    readAppConfig()
      .then((config) => loadGeneratedBlocks(config.paths.cloudSyncRoot))
      .then(setGeneratedBlocks)
      .catch((e: unknown) => {
        console.error("Generated blocks load failed — palette degraded to defaults:", e);
      });
  }, [readAppConfig, loadGeneratedBlocks]);

  // Parallel channel to the palette load: the Installed manifest set feeds the
  // editor's closed schema and the editor↔DocModel mapping (ADR-0015/0016).
  useEffect(() => {
    readAppConfig()
      .then((config) => loadAuthoredManifestSet(config.paths.cloudSyncRoot))
      .then(setAuthoredManifests)
      .catch((e: unknown) => {
        console.error(
          "Authored manifests load failed — editor schema degraded to static blocks:",
          e,
        );
      });
  }, [readAppConfig, loadAuthoredManifestSet]);

  // Initialize the runtime LLM facade when a full config (with an `llm` block)
  // is present. Folder-picker / M8 installs leave it null → AI features show a
  // "finish setup" hint; a corrupt config is surfaced, not silently masked.
  useEffect(() => {
    let cancelled = false;
    void loadRuntime()
      .then((rc) => {
        if (cancelled) return;
        if (rc.llmAvailable) {
          setRuntime(createRuntimeLlm(rc.config));
        } else if (rc.reason === "invalid") {
          const message =
            "LLM configuration couldn't be read — AI features are disabled. " +
            "Re-run setup to fix it.";
          console.error(message, rc.detail);
          setLlmConfigError(message);
        }
      })
      .catch((e: unknown) => {
        console.error("LLM runtime init failed — AI features disabled:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [loadRuntime]);

  const resolvedBootStrategy = useMemo((): BootStrategy => {
    if (bootStrategy !== undefined) return bootStrategy;
    if (initialDocument !== undefined) {
      const { path } = initialDocument;
      return {
        bootRoute: () =>
          Promise.resolve({
            kind: "document" as const,
            openDocs: [{ id: path, path }],
            activeIndex: 0,
          }),
      };
    }
    return createIpcBootStrategy();
  }, [bootStrategy, initialDocument]);

  const initialDocContent = useMemo(() => {
    if (initialDocument === undefined) return undefined;
    return {
      path: initialDocument.path,
      doc: initialDocument.doc,
      dirty: false,
      paletteOpen: false,
    };
  }, [initialDocument]);

  // Thread the codegen call into the document view via fileActions, unless a
  // test already supplied its own callLlm.
  const mergedFileActions = useMemo<Partial<FileActionDeps> | undefined>(() => {
    if (runtime === null) return fileActions;
    const base = fileActions ?? {};
    const additions: Partial<FileActionDeps> = {};
    if (base.callLlm === undefined) additions.callLlm = runtime.callForCodegen;
    if (base.commentClient === undefined) additions.commentClient = runtime.commentClient;
    return Object.keys(additions).length === 0 ? fileActions : { ...base, ...additions };
  }, [fileActions, runtime]);

  return (
    <BrandBlocksContext.Provider value={generatedBlocks}>
      <AuthoredManifestsContext.Provider value={authoredManifests}>
        {llmConfigError !== null ? (
          <p
            role="alert"
            style={{
              margin: "0.75rem 1rem",
              padding: "0.625rem 0.875rem",
              border: "1px solid #FECACA",
              borderRadius: "0.5rem",
              background: "#FEF2F2",
              color: "#B91C1C",
              fontSize: "0.875rem",
            }}
          >
            {llmConfigError}
          </p>
        ) : null}
        <Routes
          bootStrategy={resolvedBootStrategy}
          {...(initialDocContent !== undefined ? { initialDocContent } : {})}
          {...(mergedFileActions !== undefined ? { fileActions: mergedFileActions } : {})}
          {...(DocumentViewComponent !== undefined ? { DocumentViewComponent } : {})}
          {...(documentWatchdogBudgetMs !== undefined ? { documentWatchdogBudgetMs } : {})}
        />
      </AuthoredManifestsContext.Provider>
    </BrandBlocksContext.Provider>
  );
}

async function readAppConfigDefault(): Promise<{
  paths: { cloudSyncRoot: string };
}> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke("read_app_config");
}
