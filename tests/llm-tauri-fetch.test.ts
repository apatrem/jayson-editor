import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRuntimeFetch,
  isNativeFetchAllowedForEndpoint,
  type RuntimeFetchEndpoint,
} from "../src/llm/tauri-fetch";

const mocks = vi.hoisted(() => ({
  nativeFetch: vi.fn<typeof fetch>(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: mocks.nativeFetch,
}));

function installTauriBridge(): void {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
}

function endpoint(
  provider: string,
  baseUrl?: string,
): RuntimeFetchEndpoint {
  return baseUrl === undefined ? { provider } : { provider, baseUrl };
}

describe("getRuntimeFetch", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.clearAllMocks();
  });

  it("uses browser fetch outside Tauri", async () => {
    await expect(getRuntimeFetch([endpoint("anthropic")])).resolves.toBeUndefined();
  });

  it("uses Tauri HTTP fetch when every configured endpoint is capability-scoped", async () => {
    installTauriBridge();

    await expect(
      getRuntimeFetch([
        endpoint("openai-compatible", "https://api.lightning.ai/v1"),
        endpoint("local", "http://localhost:11434/v1"),
        endpoint("mistral"),
      ]),
    ).resolves.toBe(mocks.nativeFetch);
  });

  it("falls back to browser fetch for custom gateways outside the static scope", async () => {
    installTauriBridge();

    await expect(
      getRuntimeFetch([
        endpoint("openai-compatible", "https://llm.example.com/v1"),
      ]),
    ).resolves.toBeUndefined();
  });
});

describe("isNativeFetchAllowedForEndpoint", () => {
  it("matches hosted providers and common OpenAI-compatible gateways", () => {
    expect(isNativeFetchAllowedForEndpoint(endpoint("anthropic"))).toBe(true);
    expect(isNativeFetchAllowedForEndpoint(endpoint("openai"))).toBe(true);
    expect(
      isNativeFetchAllowedForEndpoint(
        endpoint("openai-compatible", "https://openrouter.ai/api/v1"),
      ),
    ).toBe(true);
    expect(
      isNativeFetchAllowedForEndpoint(
        endpoint("openai-compatible", "https://api.groq.com/openai/v1"),
      ),
    ).toBe(true);
  });

  it("allows local model servers but rejects arbitrary HTTP endpoints", () => {
    expect(
      isNativeFetchAllowedForEndpoint(
        endpoint("local", "http://127.0.0.1:11434/v1"),
      ),
    ).toBe(true);
    expect(
      isNativeFetchAllowedForEndpoint(
        endpoint("openai-compatible", "http://example.com/v1"),
      ),
    ).toBe(false);
  });
});
