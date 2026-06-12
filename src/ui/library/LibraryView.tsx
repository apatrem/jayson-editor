import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { CreateFromTemplateButton } from "./CreateFromTemplateButton";
import { CreateFromTemplateModal } from "./CreateFromTemplateModal";
import { QuarantinePanel, type QuarantinePanelDeps } from "./QuarantinePanel";
import {
  AuthoredBlockManager,
  type AuthoredBlockManagerDeps,
} from "./AuthoredBlockManager";
import type { AuthoredReceiveResult } from "../../ipc/authored-block";
import {
  archiveAuthoredBlock,
  restoreAuthoredBlock,
  permanentlyDeleteAuthoredBlock,
} from "../../ipc/authored-block";
import { loadAuthoredBlockEntries } from "../../blocks/runtime-registry";
import { invoke } from "@tauri-apps/api/core";
import { buildLibraryIndex } from "../../library/index-builder";
import {
  applyFilters,
  applySort,
  DEFAULT_LIBRARY_FILTER_STATE,
  type LibraryEntry,
  type LibraryFilterState,
} from "../../library/filter";
import { DocList } from "../../library/DocList";
import { FilterSidebar } from "../../library/FilterSidebar";
import { SearchBar } from "../../library/SearchBar";
import { formatErrorMessage } from "../../ipc/errors";
import { EmptyLibraryState } from "./EmptyLibraryState";
import sampleProposalJson from "../../../examples/sample-proposal.json?raw";

type IpcDirectoryEntry = { name: string; path: string; is_dir: boolean };

export interface LibraryViewDeps {
  readAppConfig: () => Promise<{ paths: { cloudSyncRoot: string } }>;
  listDirectory: (path: string) => Promise<IpcDirectoryEntry[]>;
  readDocumentFile: (path: string) => Promise<string>;
  writeDocumentFile: (path: string, content: string) => Promise<void>;
  // T-165 — quarantine panel dependencies
  deleteFile?: (path: string) => Promise<void>;
  importAuthoredBlock?: (path: string) => Promise<AuthoredReceiveResult>;
  // T-169 — authored-block manager dependencies
  authoredBlockManagerDeps?: AuthoredBlockManagerDeps;
}

export interface LibraryViewProps {
  onOpenDoc: (jsonPath: string) => Promise<void>;
  currentUserEmail?: string;
  deps?: Partial<LibraryViewDeps>;
}

type ScanStatus = "loading" | "empty" | "loaded" | "error";

const SORT_LABELS: Record<LibraryFilterState["sort"], string> = {
  "updated-desc": "Updated (newest)",
  "updated-asc": "Updated (oldest)",
  "client-asc": "Client A–Z",
  "created-desc": "Created (newest)",
};

export function LibraryView({ onOpenDoc, currentUserEmail = "", deps = {} }: LibraryViewProps) {
  const [status, setStatus] = useState<ScanStatus>("loading");
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [cloudSyncRoot, setCloudSyncRoot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [filters, setFilters] = useState<LibraryFilterState>({
    ...DEFAULT_LIBRARY_FILTER_STATE,
    ownerMode: "all",
  });

  const scan = useCallback(async (root: string): Promise<void> => {
    const readDocumentFile = deps.readDocumentFile ?? readDocumentFileDefault;
    const listDirectory = deps.listDirectory ?? listDirectoryDefault;
    setStatus("loading");
    const ipcFs = {
      listDirectory: async (path: string) => {
        const raw = await listDirectory(path);
        return raw.map((e) => ({
          name: e.name,
          path: e.path,
          kind: e.is_dir ? ("directory" as const) : ("file" as const),
        }));
      },
      readText: readDocumentFile,
      stat: (_path: string) => Promise.resolve({ size: 0, mtimeMs: 0 }),
    };
    const index = await buildLibraryIndex(root, ipcFs);
    setEntries(index.entries);
    setStatus(index.entries.length === 0 ? "empty" : "loaded");
  }, [deps.listDirectory, deps.readDocumentFile]);

  useEffect(() => {
    const readAppConfig = deps.readAppConfig ?? readAppConfigDefault;
    void (async () => {
      try {
        const config = await readAppConfig();
        const root = config.paths.cloudSyncRoot;
        setCloudSyncRoot(root);
        await scan(root);
      } catch (e) {
        setError(formatErrorMessage(e));
        setStatus("error");
      }
    })();
  }, [deps.readAppConfig, scan]);

  const handleUseSample = useCallback(async (): Promise<void> => {
    try {
      const writeDocumentFile = deps.writeDocumentFile ?? writeDocumentFileDefault;
      const samplePath = joinPath(cloudSyncRoot, "Sample Proposal.json");
      await writeDocumentFile(samplePath, sampleProposalJson);
      await scan(cloudSyncRoot);
    } catch (e) {
      setError(formatErrorMessage(e));
    }
  }, [cloudSyncRoot, deps.writeDocumentFile, scan]);

  const visibleEntries = useMemo(
    () => applySort(applyFilters(entries, filters, currentUserEmail), filters.sort),
    [entries, filters, currentUserEmail],
  );

  const noop = () => undefined;

  if (status === "loading") {
    return (
      <main aria-label="Library" style={styles.shell}>
        <p style={styles.loading}>Loading library…</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main aria-label="Library" style={styles.shell}>
        <p role="alert" style={styles.errorText}>
          {error}
        </p>
      </main>
    );
  }

  // Build quarantine panel deps — uses cloudSyncRoot resolved above.
  const quarantineDir = cloudSyncRoot
    ? (cloudSyncRoot.endsWith("/")
        ? `${cloudSyncRoot}generated-blocks/quarantine`
        : `${cloudSyncRoot}/generated-blocks/quarantine`)
    : "";

  const quarantineDeps: QuarantinePanelDeps = {
    listDirectory: deps.listDirectory ?? listDirectoryDefault,
    readFile: deps.readDocumentFile ?? readDocumentFileDefault,
    deleteFile: deps.deleteFile ?? deleteFileDefault,
    importAuthoredBlock: deps.importAuthoredBlock ?? importAuthoredBlockDefault,
  };

  const sharedHeader = (
    <header style={styles.header}>
      <h1 style={styles.title}>Library</h1>
      <CreateFromTemplateButton onOpen={() => setModalOpen(true)} />
    </header>
  );

  const modal = modalOpen ? (
    <CreateFromTemplateModal
      cloudSyncRoot={cloudSyncRoot}
      onConfirm={async (jsonPath) => {
        setModalOpen(false);
        await onOpenDoc(jsonPath);
      }}
      onCancel={() => setModalOpen(false)}
      deps={
        deps.writeDocumentFile !== undefined
          ? { writeDocumentFile: deps.writeDocumentFile }
          : {}
      }
    />
  ) : null;

  // QuarantinePanel rendered in both "empty" and "loaded" states so users can
  // see and manage quarantined blocks even when the document library is empty.
  const quarantinePanel = quarantineDir ? (
    <QuarantinePanel
      quarantineDir={quarantineDir}
      deps={quarantineDeps}
    />
  ) : null;

  // AuthoredBlockManager — shows when cloudSyncRoot is resolved.
  const managerDeps: AuthoredBlockManagerDeps =
    deps.authoredBlockManagerDeps ?? defaultAuthoredBlockManagerDeps;

  const authoredBlockManager = cloudSyncRoot ? (
    <AuthoredBlockManager
      cloudSyncRoot={cloudSyncRoot}
      deps={managerDeps}
    />
  ) : null;

  if (status === "empty") {
    return (
      <main aria-label="Library" style={styles.shell}>
        {sharedHeader}
        {modal}
        {quarantinePanel}
        {authoredBlockManager}
        <EmptyLibraryState
          onUseSample={() => {
            void handleUseSample();
          }}
        />
      </main>
    );
  }

  return (
    <main aria-label="Library" style={styles.shell}>
      {sharedHeader}
      {modal}
      {quarantinePanel}
      {authoredBlockManager}
      <div style={styles.layout}>
        <FilterSidebar entries={entries} state={filters} onChange={setFilters} />
        <div style={styles.main}>
          <SearchBar
            value={filters.search}
            onChange={(search) => setFilters((f) => ({ ...f, search }))}
          />
          <div style={styles.sortRow}>
            <label style={styles.sortLabel}>
              {"Sort: "}
              <select
                value={filters.sort}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    sort: e.target.value as LibraryFilterState["sort"],
                  }))
                }
              >
                {(Object.keys(SORT_LABELS) as LibraryFilterState["sort"][]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <span style={styles.viewToggle}>
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={filters.view === "grid"}
                onClick={() => setFilters((f) => ({ ...f, view: "grid" }))}
              >
                Grid
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={filters.view === "list"}
                onClick={() => setFilters((f) => ({ ...f, view: "list" }))}
              >
                List
              </button>
            </span>
          </div>
          <DocList
            entries={visibleEntries}
            view={filters.view}
            onResetFilters={() => setFilters(DEFAULT_LIBRARY_FILTER_STATE)}
            onOpen={(e) => {
              void onOpenDoc(joinPath(e.path, e.jsonFilename));
            }}
            onOpenAsReviewer={noop}
            onDuplicate={noop}
            onArchive={noop}
            onShowInFolder={noop}
          />
        </div>
      </div>
    </main>
  );
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

async function readAppConfigDefault(): Promise<{ paths: { cloudSyncRoot: string } }> {
  return invoke<{ paths: { cloudSyncRoot: string } }>("read_app_config");
}

async function listDirectoryDefault(path: string): Promise<IpcDirectoryEntry[]> {
  return invoke<IpcDirectoryEntry[]>("list_directory", { path });
}

async function readDocumentFileDefault(path: string): Promise<string> {
  return invoke<string>("read_document_file", { path });
}

async function writeDocumentFileDefault(path: string, content: string): Promise<void> {
  await invoke("write_document_file", { path, content });
}

async function deleteFileDefault(path: string): Promise<void> {
  await invoke("delete_file", { path });
}

async function importAuthoredBlockDefault(
  path: string,
): Promise<AuthoredReceiveResult> {
  // Dynamically resolve cloudSyncRoot for each retry (cheap; retries are rare).
  const config = await invoke<{ paths: { cloudSyncRoot: string } }>("read_app_config");
  const root = config.paths.cloudSyncRoot.endsWith("/")
    ? config.paths.cloudSyncRoot
    : `${config.paths.cloudSyncRoot}/`;
  const source = await invoke<string>("read_authored_block_file", { path });
  const filename = path.split("/").at(-1) ?? "block.tsx";
  const { receiveAuthoredBlock } = await import("../../ipc/authored-block");
  return receiveAuthoredBlock(
    source,
    filename,
    `${root}generated-blocks/active`,
    `${root}generated-blocks/quarantine`,
  );
}

// ─── Default deps for AuthoredBlockManager (T-169) ────────────────────────────

const defaultAuthoredBlockManagerDeps: AuthoredBlockManagerDeps = {
  loadEntries: loadAuthoredBlockEntries,
  archiveBlock: archiveAuthoredBlock,
  restoreBlock: restoreAuthoredBlock,
  permanentlyDeleteBlock: permanentlyDeleteAuthoredBlock,
};

const styles = {
  shell: {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    minHeight: "100vh",
    padding: "1.5rem",
    gap: "1rem",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: "1.5rem",
    margin: 0,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "15rem 1fr",
    gap: "1.5rem",
    alignItems: "start",
  },
  main: {
    display: "grid",
    gap: "0.75rem",
  },
  sortRow: {
    alignItems: "center",
    display: "flex",
    gap: "1rem",
    justifyContent: "space-between",
  },
  sortLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  viewToggle: {
    display: "flex",
    gap: "0.25rem",
  },
  loading: {
    color: "GrayText",
    padding: "2rem",
    textAlign: "center" as const,
  },
  errorText: {
    color: "CanvasText",
    padding: "2rem",
    textAlign: "center" as const,
    margin: 0,
  },
} satisfies Record<string, CSSProperties>;
