/**
 * Transport selection for LLM HTTP calls.
 *
 * In the Tauri webview, a cross-origin `fetch` with an `Authorization` header +
 * JSON body triggers a CORS *preflight* (`OPTIONS`). Browsers never attach the
 * auth header to a preflight, and some OpenAI-compatible gateways (e.g.
 * Lightning) reject the unauthenticated `OPTIONS` with 401 — so the real POST
 * never fires ("Preflight response is not successful. Status code: 401").
 *
 * Tauri's HTTP plugin performs the request from the Rust side: no preflight, no
 * CORS, and the webview CSP `connect-src` doesn't apply either (it's a native
 * request, exactly like curl). We use it only when every configured endpoint is
 * covered by the static Tauri HTTP capability scope; custom gateways fall back
 * to browser fetch so the capability file doesn't become an accidental runtime
 * allowlist for unsupported hosts.
 *
 * Outside Tauri (vitest / plain `npm run dev` in a browser) we return
 * undefined so the LLMClient falls back to `globalThis.fetch`.
 */
export interface RuntimeFetchEndpoint {
  provider: string;
  baseUrl?: string | undefined;
}

const NATIVE_HTTPS_HOSTS = new Set([
  "api.anthropic.com",
  "api.groq.com",
  "api.lightning.ai",
  "api.openai.com",
  "api.openrouter.ai",
  "api.together.xyz",
  "lightning.ai",
  "openrouter.ai",
]);

export async function getRuntimeFetch(
  endpoints: readonly RuntimeFetchEndpoint[] = [],
): Promise<typeof fetch | undefined> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return undefined;
  }
  if (!endpoints.every(isNativeFetchAllowedForEndpoint)) {
    return undefined;
  }
  try {
    const mod = await import("@tauri-apps/plugin-http");
    return mod.fetch as unknown as typeof fetch;
  } catch {
    // Plugin not available (e.g. not yet installed) — degrade to global fetch.
    return undefined;
  }
}

export function isNativeFetchAllowedForEndpoint(
  endpoint: RuntimeFetchEndpoint,
): boolean {
  const url = endpointUrl(endpoint);
  return url !== undefined && isNativeFetchAllowedUrl(url);
}

function endpointUrl(endpoint: RuntimeFetchEndpoint): string | undefined {
  switch (endpoint.provider) {
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "mistral":
      return "https://api.mistral.ai/v1";
    case "openai":
      return "https://api.openai.com/v1";
    case "azure":
    case "local":
    case "openai-compatible":
    default:
      return endpoint.baseUrl;
  }
}

function isNativeFetchAllowedUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const hostname = url.hostname.toLowerCase();
  if (isLocalhost(hostname)) {
    return url.protocol === "http:" || url.protocol === "https:";
  }
  if (url.protocol !== "https:") {
    return false;
  }
  return NATIVE_HTTPS_HOSTS.has(hostname) || hostname.endsWith(".mistral.ai");
}

function isLocalhost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}
