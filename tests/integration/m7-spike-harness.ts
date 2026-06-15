import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { vi } from "vitest";
import type * as EChartsModule from "echarts";
import App from "../../src/App";
import { parseDocModelJson } from "../../src/docmodel/serialize";
import { DocModelSchema } from "../../src/schema/docmodel";
import type { DocModel } from "../../src/schema/docmodel";
import type { BootStrategy } from "../../src/ui/router/boot";

const welcomeBootStrategy: BootStrategy = {
  bootRoute: () => Promise.resolve({ kind: "welcome" as const }),
};

vi.mock("echarts", async () => {
  const actual = await vi.importActual<typeof EChartsModule>("echarts");
  type InitArgs = Parameters<typeof actual.init>;
  return {
    ...actual,
    init: (dom: InitArgs[0], theme?: InitArgs[1], opts?: InitArgs[2]) =>
      dom === null
        ? actual.init(dom, theme, opts)
        : {
            setOption: vi.fn(),
            resize: vi.fn(),
            dispose: vi.fn(),
          },
  };
});

export const sampleProposalPath = "/Users/me/Documents/sample-proposal.json";
export const sampleProposalJson = readFileSync("examples/sample-proposal.json", "utf8");
export const singleSectionProposalJson = readFileSync(
  "tests/fixtures/m7-single-section-proposal.json",
  "utf8",
);
export const singleSectionProposalDoc = DocModelSchema.parse(
  parseDocModelJson(singleSectionProposalJson),
) as Extract<DocModel, { kind: "document" }>;

export interface M7HarnessOptions {
  initialJson?: string;
  readDocumentFile?: (path: string) => Promise<string>;
  writeDocumentFile?: (path: string, json: string) => Promise<void>;
  initialDocument?: { path: string; doc: DocModel };
  useRealOpenPath?: boolean;
  bootStrategy?: BootStrategy;
}

export function renderM7SpikeHarness(options: M7HarnessOptions = {}) {
  installSvgLayoutPolyfill();
  let currentJson = options.initialJson ?? singleSectionProposalJson;
  let exportedHtml = "";
  let exportedPath = "";
  const invokeMock = vi.fn((cmd: string) => {
    if (cmd === "read_binary_file") {
      return Promise.resolve("/9j/");
    }
    if (cmd === "plugin:shell|open") {
      return Promise.resolve();
    }
    return Promise.reject(new Error(`unexpected invoke ${cmd}`));
  });
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: { invoke: invokeMock },
  });

  const readDocumentFile = vi.fn(
    options.readDocumentFile ?? ((_path: string) => Promise.resolve(currentJson)),
  );
  const writeDocumentFile = vi.fn(
    options.writeDocumentFile ??
      ((_path: string, json: string) => {
        currentJson = json;
        return Promise.resolve();
      }),
  );
  const exportPdf = vi.fn(({ html, suggestedName }: { html: string; suggestedName: string }) => {
    exportedHtml = html;
    exportedPath = join(tmpdir(), suggestedName.replace(/\.pdf$/iu, ".html"));
    writeFileSync(exportedPath, exportedHtml);
    return Promise.resolve({
      kind: "browser_handoff" as const,
      path: exportedPath,
    });
  });
  const openPath = vi.fn(() => Promise.resolve());

  const rtl = render(
    createElement(App, {
      bootStrategy: options.bootStrategy ?? welcomeBootStrategy,
      ...(options.initialDocument === undefined
        ? {}
        : { initialDocument: options.initialDocument }),
      // jsdom + full DocumentRenderer + ECharts/Mermaid SSR is ~10x slower than production browser; production budget is 50ms. 1s is the lowest value that doesn't flake CI.
      documentWatchdogBudgetMs: 1_000,
      fileActions: {
        selectOpenPath: () => Promise.resolve(sampleProposalPath),
        readDocumentFile,
        writeDocumentFile,
        exportPdf,
        ...(options.useRealOpenPath ? {} : { openPath }),
        sharedFolderPath: "/Users/me/Consultancy-Shared",
      },
    }),
  );

  return {
    ...rtl,
    readDocumentFile,
    writeDocumentFile,
    exportPdf,
    openPath,
    invokeMock,
    getCurrentJson: () => currentJson,
    getExportedHtml: () => exportedHtml,
    getExportedPath: () => exportedPath,
  };
}

function installSvgLayoutPolyfill(): void {
  if (typeof SVGElement === "undefined") return;
  if ("getBBox" in SVGElement.prototype) return;
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      width: 120,
      height: 40,
    }),
  });
}
