import { describe, expect, it, vi } from "vitest";
import {
  createLlmEndpointSchema,
  LLMClient,
  LlmEndpointSchema,
  NotImplementedError,
  type LLMRequest,
  type Provider,
} from "../src/llm/client";
import { createAnthropicProvider } from "../src/llm/providers/anthropic";
import { createLocalProvider } from "../src/llm/providers/local";
import { createOpenAIProvider } from "../src/llm/providers/openai";

const request: LLMRequest = {
  systemPrompt: "Return JSON only.",
  messages: [{ role: "user", content: "Draft the executive summary." }],
  responseFormat: "json",
};

const cachedRequest: LLMRequest = {
  systemPrompt: "Use the schema exactly.",
  cachedContexts: [
    { kind: "schemaContext", content: "BlockPatchSchema" },
    { kind: "brandTokensContext", content: "colors.brand.primary: #0B3D91" },
    { kind: "docContext", content: "doc-state-v1" },
  ],
  messages: [{ role: "user", content: "Patch comment c1." }],
  responseFormat: "json",
};

describe("LLMClient (T-60)", () => {
  it("routes by endpoint provider and fetches API keys from keychain", async () => {
    const providerCall = vi.fn<Provider["call"]>(() =>
      Promise.resolve({
        content: "{\"ok\":true}",
        raw: { id: "call-1" },
      }),
    );
    const fakeProvider: Provider = {
      key: "openai",
      cacheCapability: "automatic",
      call: providerCall,
      validateKeyFormat: (apiKey) => {
        if (!apiKey.startsWith("sk-")) {
          throw new Error("bad key");
        }
      },
    };
    const keychain = vi.fn((name: string) => Promise.resolve(`sk-${name}`));
    const client = new LLMClient({
      config: {
        llm: {
          fastModel: {
            provider: "openai",
            model: "gpt-5.5",
            keychainEntry: "fast-key",
          },
          thinkingModel: {
            provider: "anthropic",
            model: "claude-opus-4-7",
            keychainEntry: "thinking-key",
          },
          codegenModel: {
            provider: "anthropic",
            model: "claude-opus-4-7",
            keychainEntry: "codegen-key",
          },
        },
      },
      keychain,
      providers: { openai: fakeProvider },
    });

    const response = await client.call("fast", request);

    expect(response.content).toBe("{\"ok\":true}");
    expect(keychain).toHaveBeenCalledWith("fast-key");
    const callInput = providerCall.mock.calls[0]?.[0];
    expect(callInput?.apiKey).toBe("sk-fast-key");
    expect(callInput?.endpoint.provider).toBe("openai");
    expect(callInput?.request).toBe(request);
  });

  it("keeps provider extension outside the client", async () => {
    const extendedEndpointSchema = createLlmEndpointSchema([
      "openai",
      "anthropic",
      "azure",
      "mistral",
      "openai-compatible",
      "local",
      "acme",
    ]);
    const acmeEndpoint = extendedEndpointSchema.parse({
      provider: "acme",
      model: "acme-fast",
      keychainEntry: "acme-key",
    });
    const acmeProvider: Provider = {
      key: "acme",
      cacheCapability: "none",
      call: () =>
        Promise.resolve({
          content: "done",
          raw: {},
        }),
      validateKeyFormat: () => undefined,
    };
    const client = new LLMClient({
      config: {
        llm: {
          fastModel: acmeEndpoint,
          thinkingModel: acmeEndpoint,
          codegenModel: acmeEndpoint,
        },
      },
      keychain: () => Promise.resolve("acme-secret"),
      providers: { acme: acmeProvider },
    });

    await expect(client.call("fast", request)).resolves.toMatchObject({
      content: "done",
    });
  });

  it("validates baseUrl requirements for openai-compatible endpoints", () => {
    expect(() =>
      LlmEndpointSchema.parse({
        provider: "openai-compatible",
        model: "vendor-model",
        keychainEntry: "vendor-key",
      }),
    ).not.toThrow();

    const provider = createOpenAIProvider({
      key: "openai-compatible",
      baseUrl: (endpoint) => endpoint.baseUrl,
    });

    expect(() => {
      if (provider.validateEndpoint === undefined) {
        throw new Error("missing validateEndpoint");
      }
      provider.validateEndpoint({
        provider: "openai-compatible",
        model: "vendor-model",
        keychainEntry: "vendor-key",
      });
    }).toThrow(/baseUrl/);
  });

  it("posts OpenAI-shaped JSON and returns the message content", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"summary\":\"ok\"}" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
      ),
    );
    const provider = createOpenAIProvider();

    const response = await provider.call({
      apiKey: "sk-test",
      endpoint: {
        provider: "openai",
        model: "gpt-5.5",
        keychainEntry: "openai-key",
      },
      request,
      fetch: fetchImpl,
    });

    expect(response).toMatchObject({
      content: "{\"summary\":\"ok\"}",
    });
    const fetchCall = fetchImpl.mock.calls[0];
    expect(fetchCall?.[0]).toBe("https://api.openai.com/v1/chat/completions");
    const fetchInit = fetchCall?.[1];
    expect(fetchInit?.method).toBe("POST");
    expect(fetchInit?.headers).toMatchObject({
      Authorization: "Bearer sk-test",
    });
  });

  it("registers an explicit stub for azure", async () => {
    const client = new LLMClient({
      config: {
        llm: {
          fastModel: {
            provider: "azure",
            model: "deployment-name",
            keychainEntry: "azure-key",
          },
          thinkingModel: {
            provider: "azure",
            model: "deployment-name",
            keychainEntry: "azure-key",
          },
          codegenModel: {
            provider: "azure",
            model: "deployment-name",
            keychainEntry: "azure-key",
          },
        },
      },
      keychain: () => Promise.resolve("stub-key"),
    });

    await expect(client.call("fast", request)).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });
});

describe("LLM adapter prompt caching (T-61)", () => {
  it("emits explicit cache markers for Anthropic context blocks", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "{\"patches\":[]}" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const provider = createAnthropicProvider();

    await provider.call({
      apiKey: "anthropic-key",
      endpoint: {
        provider: "anthropic",
        model: "claude-opus-4-7",
        keychainEntry: "anthropic-key",
      },
      request: cachedRequest,
      fetch: fetchImpl,
    });

    const body = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    const system = body.system as Array<{
      text: string;
      cache_control?: { type: string };
    }>;
    expect(system).toHaveLength(4);
    expect(system.every((block) => block.cache_control?.type === "ephemeral")).toBe(
      true,
    );
    expect(system.map((block) => block.text).join("\n")).toContain(
      "BlockPatchSchema",
    );
  });

  it("keeps OpenAI automatic caching marker-free", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "{\"patches\":[]}" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const provider = createOpenAIProvider();

    await provider.call({
      apiKey: "sk-test",
      endpoint: {
        provider: "openai",
        model: "gpt-5.5",
        keychainEntry: "openai-key",
      },
      request: cachedRequest,
      fetch: fetchImpl,
    });

    const bodyText = String(fetchImpl.mock.calls[0]?.[1]?.body);
    expect(bodyText).toContain("BlockPatchSchema");
    expect(bodyText).not.toContain("cache_control");
  });

  it("local no-cache endpoint posts without cache markers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "{\"patches\":[]}" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const provider = createLocalProvider();

    const response = await provider.call({
      apiKey: "",
      endpoint: {
        provider: "local",
        model: "llama3",
        keychainEntry: "local-key",
        baseUrl: "http://127.0.0.1:11434/v1",
      },
      request: cachedRequest,
      fetch: fetchImpl,
    });

    expect(provider.cacheCapability).toBe("none");
    expect(response.content).toBe("{\"patches\":[]}");
    const bodyText = String(fetchImpl.mock.calls[0]?.[1]?.body);
    expect(bodyText).not.toContain("cache_control");
  });
});
