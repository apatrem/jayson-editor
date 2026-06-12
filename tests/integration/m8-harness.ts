import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type * as EChartsModule from "echarts";
import App from "../../src/App";
import type { BlockPaletteItem } from "../../src/editor/BlockPalette";
import type { BootStrategy } from "../../src/ui/router/boot";

vi.mock("echarts", async () => {
  const actual = await vi.importActual<typeof EChartsModule>("echarts");
  type InitArgs = Parameters<typeof actual.init>;
  return {
    ...actual,
    init: (dom: InitArgs[0], theme?: InitArgs[1], opts?: InitArgs[2]) =>
      dom === null
        ? actual.init(dom, theme, opts)
        : { setOption: vi.fn(), resize: vi.fn(), dispose: vi.fn() },
  };
});

export const CLOUD_SYNC_ROOT = "/Users/me/Documents";
export const sampleProposalJson = readFileSync(
  "examples/sample-proposal.json",
  "utf8",
);
export const singleSectionJson = readFileSync(
  "tests/fixtures/m7-single-section-proposal.json",
  "utf8",
);

type IpcEntry = { name: string; path: string; is_dir: boolean };

export interface M8HarnessOptions {
  bootStrategy?: BootStrategy;
  initialFiles?: [string, string][];
  selectFolder?: () => Promise<string | null>;
  writeAppConfigFn?: () => Promise<void>;
  loadGeneratedBlocks?: (root: string) => Promise<BlockPaletteItem[]>;
  cloudSyncRoot?: string;
}

export function makeM8Harness(options: M8HarnessOptions = {}) {
  installSvgLayoutPolyfill();

  const root = options.cloudSyncRoot ?? CLOUD_SYNC_ROOT;
  const files = new Map<string, string>(options.initialFiles ?? []);
  let exportedHtml = "";
  let exportedPath = "";

  const readAppConfig = vi.fn(() =>
    Promise.resolve({ paths: { cloudSyncRoot: root } }),
  );

  const selectFolder = vi.fn(
    options.selectFolder ?? (() => Promise.resolve(root)),
  );

  const writeAppConfig = vi.fn(
    options.writeAppConfigFn ?? (() => Promise.resolve()),
  );

  const listDirectory = vi.fn((dirPath: string): Promise<IpcEntry[]> => {
    const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
    const entries: IpcEntry[] = [];
    const seenDirs = new Set<string>();
    for (const [filePath] of files) {
      if (!filePath.startsWith(prefix)) continue;
      const relative = filePath.slice(prefix.length);
      const slashIdx = relative.indexOf("/");
      if (slashIdx === -1) {
        if (relative.endsWith(".json")) {
          entries.push({ name: relative, path: filePath, is_dir: false });
        }
      } else {
        const dirName = relative.slice(0, slashIdx);
        if (!seenDirs.has(dirName)) {
          seenDirs.add(dirName);
          entries.push({
            name: dirName,
            path: `${prefix}${dirName}`,
            is_dir: true,
          });
        }
      }
    }
    return Promise.resolve(entries);
  });

  const readDocumentFile = vi.fn((path: string): Promise<string> => {
    const content = files.get(path);
    if (content === undefined) {
      return Promise.reject(new Error(`file not found: ${path}`));
    }
    return Promise.resolve(content);
  });

  const writeDocumentFile = vi.fn((path: string, content: string): Promise<void> => {
    files.set(path, content);
    return Promise.resolve();
  });

  const exportPdf = vi.fn(
    ({ html, suggestedName }: { html: string; suggestedName: string }) => {
      exportedHtml = html;
      exportedPath = join(tmpdir(), suggestedName.replace(/\.pdf$/iu, ".html"));
      writeFileSync(exportedPath, exportedHtml);
      return Promise.resolve({ kind: "browser_handoff" as const, path: exportedPath });
    },
  );

  const openPath = vi.fn(() => Promise.resolve());

  const loadGeneratedBlocks = vi.fn(
    options.loadGeneratedBlocks ?? ((_r: string) => Promise.resolve([])),
  );

  const invokeMock = vi.fn((cmd: string) => {
    if (cmd === "read_binary_file") return Promise.resolve("/9j/");
    if (cmd === "plugin:shell|open") return Promise.resolve();
    return Promise.reject(new Error(`unexpected invoke in M8 test: ${cmd}`));
  });
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { invoke: invokeMock },
  });

  const bootStrategy = options.bootStrategy ?? {
    bootRoute: () => Promise.resolve({ kind: "library" as const }),
  };

  const rtl = render(
    createElement(App, {
      bootStrategy,
      documentWatchdogBudgetMs: 1_000,
      readAppConfig,
      loadGeneratedBlocks,
      fileActions: {
        selectFolder,
        writeAppConfig,
        readAppConfig,
        listDirectory,
        readDocumentFile,
        writeDocumentFile,
        exportPdf,
        openPath,
        selectOpenPath: () => Promise.resolve(null),
        sharedFolderPath: "/Users/me/Consultancy-Shared",
      },
    }),
  );

  return {
    ...rtl,
    readAppConfig,
    selectFolder,
    writeAppConfig,
    listDirectory,
    readDocumentFile,
    writeDocumentFile,
    exportPdf,
    openPath,
    loadGeneratedBlocks,
    invokeMock,
    files,
    getExportedHtml: () => exportedHtml,
    getExportedPath: () => exportedPath,
  };
}

function installSvgLayoutPolyfill(): void {
  if (typeof SVGElement === "undefined") return;
  if ("getBBox" in SVGElement.prototype) return;
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 120, height: 40 }),
  });
}
