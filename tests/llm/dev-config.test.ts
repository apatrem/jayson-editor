import { describe, expect, it } from "vitest";
import { readDevLlmConfig } from "../../src/llm/dev-config";

const fullDevEnv = {
  DEV: true,
  VITE_LLM_PROVIDER: "openai-compatible",
  VITE_LLM_MODEL: "lightning/llama-3.1-70b",
  VITE_LLM_BASE_URL: "https://api.lightning.ai/v1",
  VITE_LLM_API_KEY: "sk-dev-test-key",
};

describe("readDevLlmConfig", () => {
  it("returns null when not in DEV mode", () => {
    expect(readDevLlmConfig({ ...fullDevEnv, DEV: false })).toBeNull();
  });

  it("returns null when any VITE_LLM_* var is missing", () => {
    const { VITE_LLM_API_KEY: _removed, ...withoutKey } = fullDevEnv;
    expect(readDevLlmConfig(withoutKey)).toBeNull();
    expect(readDevLlmConfig({ ...fullDevEnv, VITE_LLM_MODEL: "" })).toBeNull();
  });

  it("returns null for an invalid provider", () => {
    expect(
      readDevLlmConfig({ ...fullDevEnv, VITE_LLM_PROVIDER: "not-a-provider" }),
    ).toBeNull();
  });

  it("returns a valid config and api key when all vars are present", () => {
    const result = readDevLlmConfig(fullDevEnv);
    expect(result).not.toBeNull();
    if (result === null) return;

    expect(result.apiKey).toBe("sk-dev-test-key");
    expect(result.config.llm.fastModel).toMatchObject({
      provider: "openai-compatible",
      model: "lightning/llama-3.1-70b",
      baseUrl: "https://api.lightning.ai/v1",
      keychainEntry: "dev.llm.api-key",
    });
    expect(result.config.llm.thinkingModel).toEqual(result.config.llm.fastModel);
    expect(result.config.llm.codegenModel).toEqual(result.config.llm.fastModel);
  });
});
