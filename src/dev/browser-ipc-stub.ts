/**
 * Dev-only IPC stub for running the app in a plain browser (no Tauri shell).
 *
 * Auto-installs when `window.__TAURI_INTERNALS__` is undefined, providing
 * sensible default responses for every IPC command the renderer issues.
 * Errors are emitted as the JSON `{ kind, message }` shape that real Tauri
 * `invoke()` rejects with, so `isIpcError` / `formatErrorMessage` work
 * identically against the stub and the real shell.
 *
 * Templates under `/templates/**.json` are bundled at build time via
 * `import.meta.glob` and served by `read_document_file` so the dev surface can
 * load real document fixtures without filesystem access.
 *
 * Not shipped to production: callers must gate behind `import.meta.env.DEV`.
 */

import type { IpcError } from "../ipc/errors";

interface InvokeArgs {
  [key: string]: unknown;
}

const ipcError = (kind: IpcError["kind"], message: string): IpcError => ({
  kind,
  message,
});

const bundledDocs: Record<string, string> = import.meta.glob(
  ["/templates/**/*.json", "/documents/**/*.json"],
  { query: "?raw", import: "default", eager: true },
);

function findBundledDoc(path: string): string | null {
  for (const marker of ["/templates/", "/documents/"]) {
    const idx = path.lastIndexOf(marker);
    if (idx >= 0) {
      const relative = path.slice(idx);
      const found = bundledDocs[relative];
      if (found !== undefined) return found;
    }
  }
  return null;
}

const writtenFiles = new Map<string, string>();

type Handler = (args: InvokeArgs) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  read_app_config: () =>
    Promise.resolve({ paths: { cloudSyncRoot: "/dev-fixture-root" } }),

  write_app_config: () => Promise.resolve(null),

  file_exists: () => Promise.resolve(true),

  list_directory: () => Promise.resolve([]),

  read_document_file: (args) => {
    const path = String(args["path"] ?? "");
    const cached = writtenFiles.get(path);
    if (cached !== undefined) return Promise.resolve(cached);
    const bundled = findBundledDoc(path);
    if (bundled !== null) return Promise.resolve(bundled);
    // IPC contract: reject with the JSON shape, not an Error instance.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    return Promise.reject(ipcError("not-found", `File not found in stub: ${path}`));
  },

  write_document_file: (args) => {
    const path = String(args["path"] ?? "");
    const content = String(args["content"] ?? "");
    writtenFiles.set(path, content);
    // eslint-disable-next-line no-console
    console.info(
      `[browser-ipc-stub] write_document_file: ${path} (${content.length} bytes — held in memory only)`,
    );
    return Promise.resolve(null);
  },

  read_authored_block_file: (args) => {
    const path = String(args["path"] ?? "");
    const cached = writtenFiles.get(path);
    if (cached !== undefined) return Promise.resolve(cached);
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    return Promise.reject(ipcError("not-found", `File not found in stub: ${path}`));
  },

  write_authored_block_file: (args) => {
    const path = String(args["path"] ?? "");
    const content = String(args["content"] ?? "");
    writtenFiles.set(path, content);
    // eslint-disable-next-line no-console
    console.info(
      `[browser-ipc-stub] write_authored_block_file: ${path} (${content.length} bytes — held in memory only)`,
    );
    return Promise.resolve(null);
  },

  read_binary_file: () => Promise.resolve("/9j/"),

  delete_file: () => Promise.resolve(null),

  ensure_directory: () => Promise.resolve(null),

  export_pdf: () =>
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    Promise.reject(
      ipcError("internal", "PDF export is not supported in browser dev mode."),
    ),

  get_secret: () => Promise.resolve(null),

  lint_authored_block: () =>
    Promise.resolve({ ok: true, violations: [], extractedManifest: null }),

  archive_authored_block: () => Promise.resolve(null),

  restore_authored_block: () => Promise.resolve(null),

  permanently_delete_authored_block: () => Promise.resolve(null),

  share_block_file: () => Promise.resolve(null),
};

export function installBrowserIpcStub(): void {
  if (typeof window === "undefined") return;
  if ("__TAURI_INTERNALS__" in window) return;

  const invoke = (cmd: string, args: InvokeArgs = {}): Promise<unknown> => {
    const handler = handlers[cmd];
    if (handler === undefined) {
      // eslint-disable-next-line no-console
      console.warn(`[browser-ipc-stub] unhandled command: ${cmd}`, args);
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      return Promise.reject(
        ipcError("invalid", `Unhandled stub command: ${cmd}`),
      );
    }
    return handler(args);
  };

  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { invoke },
  });

  // eslint-disable-next-line no-console
  console.info(
    "[browser-ipc-stub] Installed. Use ?doc=<path> to open a fixture, " +
      `e.g. ?doc=/templates/commercial-proposal.json. ` +
      `Bundled docs: ${Object.keys(bundledDocs).join(", ")}`,
  );
}
