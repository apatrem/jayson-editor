import {
  InstallAppConfigSchema,
  ProviderSchema,
  type InstallAppConfig,
} from "../schema/install-config";

export interface DevLlmEnv {
  DEV?: boolean;
  VITE_LLM_PROVIDER?: string;
  VITE_LLM_MODEL?: string;
  VITE_LLM_BASE_URL?: string;
  VITE_LLM_API_KEY?: string;
}

const DEV_KEYCHAIN_ENTRY = "dev.llm.api-key";

/**
 * DEV-only override: when all four VITE_LLM_* vars are set, synthesize a minimal
 * InstallAppConfig and return the inline API key (never used in production builds).
 */
export function readDevLlmConfig(
  env: DevLlmEnv = import.meta.env as DevLlmEnv,
): { config: InstallAppConfig; apiKey: string } | null {
  if (!env.DEV) {
    return null;
  }

  const providerRaw = env.VITE_LLM_PROVIDER;
  const model = env.VITE_LLM_MODEL;
  const baseUrl = env.VITE_LLM_BASE_URL;
  const apiKey = env.VITE_LLM_API_KEY;

  if (
    providerRaw === undefined ||
    model === undefined ||
    baseUrl === undefined ||
    apiKey === undefined ||
    providerRaw.length === 0 ||
    model.length === 0 ||
    baseUrl.length === 0 ||
    apiKey.length === 0
  ) {
    return null;
  }

  const provider = ProviderSchema.safeParse(providerRaw);
  if (!provider.success) {
    return null;
  }

  const endpoint = {
    provider: provider.data,
    model,
    keychainEntry: DEV_KEYCHAIN_ENTRY,
    baseUrl,
  };

  const config = InstallAppConfigSchema.parse({
    user: {
      name: "Dev User",
      email: "dev@example.com",
      role: "consultant",
      initials: "DV",
    },
    paths: {
      cloudSyncRoot: "/dev/cloud",
      sharedFolder: "/dev/shared",
    },
    llm: {
      fastModel: endpoint,
      thinkingModel: endpoint,
      codegenModel: endpoint,
    },
    editor: {
      reviewMode: "panel",
      autosaveDebounceMs: 2000,
    },
  });

  return { config, apiKey };
}
