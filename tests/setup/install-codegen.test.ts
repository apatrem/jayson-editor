/**
 * Tests for T-175: authored-block-generation frontier-key provisioning.
 *
 * Verifies that the install pipeline:
 *   - Stores a `llm.codegen.api-key` keychain entry alongside the existing
 *     fast and thinking keys.
 *   - Defaults the codegen key to the THINKING_API_KEY (same frontier key,
 *     per ADR-0012).
 *   - Accepts an explicit CODEGEN_API_KEY override.
 *   - Produces a clear, actionable error when the frontier key is missing or
 *     its format does not match the expected provider pattern.
 *   - Shows the codegen model in the interactive summary.
 */

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { runInstallCli } from "../../src/setup/install";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a throwaway temp directory tree (cloud + shared + config). */
function makeTempDirs(): { cloud: string; shared: string; config: string; cleanup: () => void } {
  const base = mkdtempSync(join(tmpdir(), "docsys-t175-"));
  const cloud = join(base, "cloud");
  const shared = join(base, "shared");
  const config = join(base, "config");
  mkdirSync(cloud, { recursive: true });
  mkdirSync(shared, { recursive: true });
  return {
    cloud,
    shared,
    config,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

/** Minimal non-interactive flags for the CLI. */
function nonInteractiveFlags(cloud: string, shared: string): string[] {
  return [
    "--accept-privacy-notice",
    "--name", "Alice",
    "--email", "alice@example.com",
    "--role", "consultant",
    "--cloud-sync-root", cloud,
    "--shared-folder", shared,
    "--fast-provider", "anthropic",
    "--fast-model", "claude-haiku-4",
    "--thinking-provider", "anthropic",
    "--thinking-model", "claude-opus-4-7",
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("T-175 — install codegen key provisioning", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const fn of cleanups.splice(0)) {
      fn();
    }
  });

  it("stores llm.codegen.api-key during a successful non-interactive install", async () => {
    const dirs = makeTempDirs();
    cleanups.push(dirs.cleanup);

    const secrets: Array<[string, string]> = [];
    const code = await runInstallCli({
      argv: nonInteractiveFlags(dirs.cloud, dirs.shared),
      env: {
        FAST_API_KEY: "sk-ant-fast-key",
        THINKING_API_KEY: "sk-ant-thinking-key",
      },
      writeSecret: (name, value) => { secrets.push([name, value]); },
      configDir: dirs.config,
    });

    expect(code).toBe(0);
    const codegenEntry = secrets.find(([name]) => name === "llm.codegen.api-key");
    expect(codegenEntry).toBeDefined();
  });

  it("defaults llm.codegen.api-key to the THINKING_API_KEY value (same frontier key)", async () => {
    const dirs = makeTempDirs();
    cleanups.push(dirs.cleanup);

    const secrets: Array<[string, string]> = [];
    await runInstallCli({
      argv: nonInteractiveFlags(dirs.cloud, dirs.shared),
      env: {
        FAST_API_KEY: "sk-ant-fast-key",
        THINKING_API_KEY: "sk-ant-thinking-key",
      },
      writeSecret: (name, value) => { secrets.push([name, value]); },
      configDir: dirs.config,
    });

    const codegenEntry = secrets.find(([name]) => name === "llm.codegen.api-key");
    const thinkingEntry = secrets.find(([name]) => name === "llm.thinking.api-key");
    expect(codegenEntry?.[1]).toBe(thinkingEntry?.[1]);
  });

  it("accepts an explicit CODEGEN_API_KEY that differs from THINKING_API_KEY", async () => {
    const dirs = makeTempDirs();
    cleanups.push(dirs.cleanup);

    const secrets: Array<[string, string]> = [];
    const code = await runInstallCli({
      argv: nonInteractiveFlags(dirs.cloud, dirs.shared),
      env: {
        FAST_API_KEY: "sk-ant-fast-key",
        THINKING_API_KEY: "sk-ant-thinking-key",
        CODEGEN_API_KEY: "sk-ant-codegen-override",
      },
      writeSecret: (name, value) => { secrets.push([name, value]); },
      configDir: dirs.config,
    });

    expect(code).toBe(0);
    const codegenEntry = secrets.find(([name]) => name === "llm.codegen.api-key");
    expect(codegenEntry?.[1]).toBe("sk-ant-codegen-override");
  });

  it("fails with a clear error when THINKING_API_KEY is missing", async () => {
    const dirs = makeTempDirs();
    cleanups.push(dirs.cleanup);

    const messages: string[] = [];
    const code = await runInstallCli({
      argv: nonInteractiveFlags(dirs.cloud, dirs.shared),
      env: { FAST_API_KEY: "sk-ant-fast-key" }, // no THINKING_API_KEY
      writeSecret: () => {},
      write: (msg) => { messages.push(msg); },
      configDir: dirs.config,
    });

    expect(code).toBe(1);
    expect(messages.some((m) => m.toLowerCase().includes("thinking"))).toBe(true);
  });

  it("fails with an actionable error when codegen key format is invalid (bad Anthropic prefix)", async () => {
    const dirs = makeTempDirs();
    cleanups.push(dirs.cleanup);

    const messages: string[] = [];
    const code = await runInstallCli({
      argv: nonInteractiveFlags(dirs.cloud, dirs.shared),
      env: {
        FAST_API_KEY: "sk-ant-fast-key",
        THINKING_API_KEY: "sk-ant-thinking-key",
        CODEGEN_API_KEY: "bad-format-key",  // invalid Anthropic key format
      },
      writeSecret: () => {},
      write: (msg) => { messages.push(msg); },
      configDir: dirs.config,
    });

    expect(code).toBe(1);
    // The error message should mention authored-block-generation.
    const errorMsg = messages.join("\n");
    expect(errorMsg).toContain("authored-block-generation");
  });

  it("includes the codegen model in the install summary", async () => {
    const dirs = makeTempDirs();
    cleanups.push(dirs.cleanup);

    const messages: string[] = [];
    await runInstallCli({
      argv: nonInteractiveFlags(dirs.cloud, dirs.shared),
      env: {
        FAST_API_KEY: "sk-ant-fast-key",
        THINKING_API_KEY: "sk-ant-thinking-key",
      },
      writeSecret: () => {},
      write: (msg) => { messages.push(msg); },
      configDir: dirs.config,
    });

    const combined = messages.join("\n");
    expect(combined).toContain("authored-block-generation");
    expect(combined).toContain("claude-opus-4-7");
  });
});
