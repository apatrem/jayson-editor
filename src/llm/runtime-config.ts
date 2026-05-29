import { invoke } from "@tauri-apps/api/core";
import { formatErrorMessage, isIpcError } from "../ipc/errors";
import { classifyAppConfig } from "../config/classify";
import type { InstallAppConfig } from "../schema/install-config";

/**
 * Whether the LLM runtime can be initialized. `available` carries the full
 * config (with the `llm` block). `unavailable` distinguishes a benign
 * not-configured state (folder-picker install / first launch — disable LLM
 * features silently) from `invalid` (corrupt config — the caller should
 * surface it rather than silently treat it as "not set up").
 */
export type RuntimeConfig =
  | { llmAvailable: true; config: InstallAppConfig }
  | { llmAvailable: false; reason: "not-configured" | "invalid"; detail?: string };

export async function loadRuntimeConfig(
  read: () => Promise<unknown> = readAppConfig,
): Promise<RuntimeConfig> {
  let raw: unknown;
  try {
    raw = await read();
  } catch (error) {
    if (isIpcError(error) && error.kind === "not-found") {
      return { llmAvailable: false, reason: "not-configured" };
    }
    return {
      llmAvailable: false,
      reason: "invalid",
      detail: formatErrorMessage(error),
    };
  }

  const classified = classifyAppConfig(raw);
  switch (classified.kind) {
    case "full":
      return { llmAvailable: true, config: classified.config };
    case "partial":
      return { llmAvailable: false, reason: "not-configured" };
    case "invalid":
      return {
        llmAvailable: false,
        reason: "invalid",
        detail: "config.yaml is present but does not match a known schema",
      };
  }
}

async function readAppConfig(): Promise<unknown> {
  return invoke<unknown>("read_app_config");
}
