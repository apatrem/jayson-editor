import { describe, expect, it } from "vitest";
import { classifyAppConfig } from "../src/config/classify";

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

describe("classifyAppConfig", () => {
  it("classifies a GUI folder-picker (paths-only) config as partial", () => {
    expect(classifyAppConfig({ paths: { cloudSyncRoot: "/cloud" } }).kind).toBe(
      "partial",
    );
  });

  it("classifies a full CLI-wizard config as full and exposes the llm block", () => {
    const result = classifyAppConfig(fullConfig);
    expect(result.kind).toBe("full");
    if (result.kind === "full") {
      expect(result.config.llm.codegenModel.model).toBe("claude-opus-4-7");
    }
  });

  it("does NOT misclassify a full config as partial (strict M8 schema)", () => {
    // M8PartialConfigSchema is .strict(); the extra user/llm/editor keys must
    // push a full config to the full schema, not the partial one.
    expect(classifyAppConfig(fullConfig).kind).toBe("full");
  });

  it("classifies an unrecognized or null payload as invalid", () => {
    expect(classifyAppConfig({ nonsense: true }).kind).toBe("invalid");
    expect(classifyAppConfig(null).kind).toBe("invalid");
  });
});
