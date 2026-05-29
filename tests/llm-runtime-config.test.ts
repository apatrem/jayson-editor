import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "../src/llm/runtime-config";

// Tauri's invoke() rejects with the raw { kind, message } JSON object, NOT an
// Error instance (see src/ipc/errors.ts). Mirror that shape so the loader's
// isIpcError branch is exercised the way it runs in production.
function rejectIpc(kind: string, message: string): Promise<never> {
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  return Promise.reject({ kind, message });
}

const fullConfig = {
  user: {
    name: "Alice",
    email: "alice@example.com",
    role: "consultant",
    initials: "A",
  },
  paths: { cloudSyncRoot: "/cloud", sharedFolder: "/shared" },
  llm: {
    fastModel: {
      provider: "anthropic",
      model: "claude-haiku-4",
      keychainEntry: "llm.fast.api-key",
    },
    thinkingModel: {
      provider: "anthropic",
      model: "claude-opus-4-7",
      keychainEntry: "llm.thinking.api-key",
    },
    codegenModel: {
      provider: "anthropic",
      model: "claude-opus-4-7",
      keychainEntry: "llm.codegen.api-key",
    },
  },
  editor: { reviewMode: "panel", autosaveDebounceMs: 2000 },
};

describe("loadRuntimeConfig", () => {
  it("returns available with the config for a full config", async () => {
    const result = await loadRuntimeConfig(() => Promise.resolve(fullConfig));
    expect(result.llmAvailable).toBe(true);
    if (result.llmAvailable) {
      expect(result.config.llm.fastModel.provider).toBe("anthropic");
    }
  });

  it("returns not-configured (silent) for a partial folder-picker config", async () => {
    const result = await loadRuntimeConfig(() =>
      Promise.resolve({ paths: { cloudSyncRoot: "/cloud" } }),
    );
    expect(result).toEqual({ llmAvailable: false, reason: "not-configured" });
  });

  it("returns not-configured when no config exists yet (IPC not-found)", async () => {
    const result = await loadRuntimeConfig(() =>
      rejectIpc("not-found", "missing"),
    );
    expect(result).toEqual({ llmAvailable: false, reason: "not-configured" });
  });

  it("flags a corrupt config as invalid — not silently not-configured", async () => {
    const result = await loadRuntimeConfig(() =>
      Promise.resolve({ totally: "wrong" }),
    );
    expect(result.llmAvailable).toBe(false);
    if (!result.llmAvailable) expect(result.reason).toBe("invalid");
  });

  it("surfaces an IO error as invalid with detail", async () => {
    const result = await loadRuntimeConfig(() => rejectIpc("io", "disk fail"));
    expect(result.llmAvailable).toBe(false);
    if (!result.llmAvailable) {
      expect(result.reason).toBe("invalid");
      expect(result.detail).toContain("disk fail");
    }
  });

  it("treats a non-IPC rejection (no Tauri bridge) as not-configured, not invalid", async () => {
    const result = await loadRuntimeConfig(() =>
      Promise.reject(new Error("window.__TAURI_INTERNALS__ is undefined")),
    );
    // A browser / test env with no Tauri bridge is "LLM unavailable here", not a
    // corrupt config — degrade silently rather than surfacing a false error.
    expect(result).toEqual({ llmAvailable: false, reason: "not-configured" });
  });
});
