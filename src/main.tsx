import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import type { DocModel } from "./schema/docmodel";

async function loadInitialDocumentFromUrl(): Promise<
  { path: string; doc: DocModel } | undefined
> {
  const docPath = new URLSearchParams(window.location.search).get("doc");
  if (docPath === null) return undefined;
  const { invoke } = await import("@tauri-apps/api/core");
  const { parseDocModelJson } = await import("./docmodel/serialize");
  const { DocModelSchema } = await import("./schema/docmodel");
  const raw = await invoke<string>("read_document_file", { path: docPath });
  const doc = DocModelSchema.parse(parseDocModelJson(raw));
  return { path: docPath, doc };
}

async function bootstrap(): Promise<void> {
  if (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    !("__TAURI_INTERNALS__" in window)
  ) {
    const { installBrowserIpcStub } = await import("./dev/browser-ipc-stub");
    installBrowserIpcStub();
  }

  let initialDocument: { path: string; doc: DocModel } | undefined;
  if (import.meta.env.DEV) {
    try {
      initialDocument = await loadInitialDocumentFromUrl();
    } catch (error) {
      console.error("[main] Failed to load ?doc= fixture:", error);
    }
  }

  const root = document.getElementById("root");
  if (!root) {
    throw new Error("Root element #root not found");
  }

  createRoot(root).render(
    <StrictMode>
      <App {...(initialDocument !== undefined ? { initialDocument } : {})} />
    </StrictMode>,
  );
}

void bootstrap();
