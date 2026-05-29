import { describe, expect, it } from "vitest";
import { createRuntimeLlm } from "../src/llm/runtime";
import type { Provider } from "../src/llm/client";
import { InstallAppConfigSchema } from "../src/schema/install-config";

const config = InstallAppConfigSchema.parse({
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
      model: "claude-opus-4-7-thinking",
      keychainEntry: "llm.thinking.api-key",
    },
    codegenModel: {
      provider: "anthropic",
      model: "claude-opus-4-7-codegen",
      keychainEntry: "llm.codegen.api-key",
    },
  },
  editor: { reviewMode: "panel", autosaveDebounceMs: 2000 },
});

describe("createRuntimeLlm", () => {
  it("routes callForCodegen to the codegen model and commentClient by model kind", async () => {
    const seen: string[] = [];
    const fakeProvider: Provider = {
      key: "anthropic",
      cacheCapability: "explicit",
      validateKeyFormat: () => undefined,
      call: (input) => {
        seen.push(input.endpoint.model);
        return Promise.resolve({ content: "ok", raw: {} });
      },
    };
    const runtime = createRuntimeLlm(config, {
      keychain: () => Promise.resolve("sk-test"),
      providers: { anthropic: fakeProvider },
    });

    await runtime.callForCodegen({
      messages: [{ role: "user", content: "generate a block" }],
    });
    expect(seen.at(-1)).toBe("claude-opus-4-7-codegen");

    await runtime.commentClient.call("fast", {
      messages: [{ role: "user", content: "patch a comment" }],
    });
    expect(seen.at(-1)).toBe("claude-haiku-4");

    await runtime.commentClient.call("thinking", {
      messages: [{ role: "user", content: "patch a comment" }],
    });
    expect(seen.at(-1)).toBe("claude-opus-4-7-thinking");
  });
});
