import { describe, expect, it } from "vitest";
import { commentAuthorFromInstallConfig } from "../../src/config/comment-author";
import { InstallAppConfigSchema } from "../../src/schema/install-config";

const config = InstallAppConfigSchema.parse({
  user: {
    name: "Jane Smith",
    email: "jane@example.com",
    role: "senior",
    initials: "JS",
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
});

describe("commentAuthorFromInstallConfig", () => {
  it("maps consultant role to consultant", () => {
    const author = commentAuthorFromInstallConfig({
      ...config,
      user: { ...config.user, role: "consultant" },
    });
    expect(author.role).toBe("consultant");
  });

  it("maps senior/admin install roles to reviewer comment role", () => {
    expect(commentAuthorFromInstallConfig(config).role).toBe("reviewer");
  });
});
