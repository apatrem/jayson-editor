import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { accessSync, mkdirSync, writeFileSync, constants } from "node:fs";
import { homedir, hostname, platform, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stringify } from "yaml";
import { z } from "zod";
import {
  EndpointSchema,
  InstallAppConfigSchema,
  ProviderSchema,
  RoleSchema,
  type InstallAppConfig,
} from "../schema/install-config";

type Provider = InstallAppConfig["llm"]["fastModel"]["provider"];
type Role = InstallAppConfig["user"]["role"];

interface InstallOptions {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  read?: (prompt: string) => Promise<string>;
  write?: (message: string) => void;
  writeSecret?: (name: string, value: string) => void | Promise<void>;
  configDir?: string;
  now?: () => Date;
}

interface ParsedArgs {
  values: Map<string, string>;
  flags: Set<string>;
}

const PROVIDER_DEFAULTS: Record<Provider, { fast: string; thinking: string }> = {
  openai: { fast: "gpt-4.1-mini", thinking: "gpt-5" },
  anthropic: { fast: "claude-haiku-4", thinking: "claude-opus-4-7" },
  azure: { fast: "", thinking: "" },
  mistral: { fast: "mistral-small-latest", thinking: "mistral-large-latest" },
  "openai-compatible": { fast: "", thinking: "" },
  local: { fast: "", thinking: "" },
};

export async function runInstallCli(options: InstallOptions = {}): Promise<number> {
  const args = parseArgs(options.argv ?? process.argv.slice(2));
  const env = options.env ?? process.env;
  const write = options.write ?? ((message) => output.write(message));
  const rl =
    options.read === undefined
      ? createInterface({ input, output })
      : undefined;
  const read =
    options.read ??
    ((prompt: string) => {
      if (rl === undefined) {
        throw new Error("readline was not initialized");
      }
      return rl.question(prompt);
    });

  try {
    const nonInteractive = args.flags.has("accept-privacy-notice");
    if (!nonInteractive) {
      write(PRIVACY_NOTICE);
      const accepted = await read("Do you accept these terms? [y/N]: ");
      if (accepted.trim().toLowerCase() !== "y") {
        write("Setup cancelled: privacy notice was not accepted.\n");
        return 1;
      }
    }

    const configDir = options.configDir ?? defaultConfigDir(env);
    const config = nonInteractive
      ? buildFromFlags(args, env)
      : await buildInteractively(args, read, write, env, configDir);

    validatePaths(config.paths.cloudSyncRoot, config.paths.sharedFolder, configDir);
    InstallAppConfigSchema.parse(config);

    write(summary(config));

    if (!nonInteractive) {
      const confirmed = await read("Write this configuration? [Y/n]: ");
      if (confirmed.trim().toLowerCase() === "n") {
        write("Setup cancelled: configuration was not written.\n");
        return 1;
      }
    }

    const secrets = resolveSecrets(args, env, config);
    await verifyKeys(config, secrets);
    const writeSecret = options.writeSecret ?? writeOsSecret;
    await writeSecret("llm.fast.api-key", secrets.fast);
    await writeSecret("llm.thinking.api-key", secrets.thinking);
    await writeSecret("llm.codegen.api-key", secrets.codegen);

    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.yaml"), stringify(config));
    write(`Setup complete. Config written to ${join(configDir, "config.yaml")}\n`);
    return 0;
  } catch (error) {
    write(`Setup failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    rl?.close();
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === undefined || !raw.startsWith("--")) {
      continue;
    }
    const key = raw.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      values.set(key, next);
      index += 1;
    } else {
      flags.add(key);
    }
  }
  return { values, flags };
}

async function buildInteractively(
  args: ParsedArgs,
  read: (prompt: string) => Promise<string>,
  write: (message: string) => void,
  env: NodeJS.ProcessEnv,
  configDir: string,
): Promise<InstallAppConfig> {
  const defaults = identityDefaults(env);
  write("\nStep 1 of 3 — Your identity\n");
  const name = await promptDefault(read, "Your name", defaults.name);
  const email = await promptDefault(read, "Your work email", defaults.email);
  const role = await promptRole(read);

  write("\nStep 2 of 3 — Cloud-sync folders\n");
  const cloudSyncRoot = await promptDefault(
    read,
    "Cloud-sync root",
    args.values.get("cloud-sync-root") ?? join(homedir(), "Dropbox", "Consultancy"),
  );
  const sharedFolder = await promptDefault(
    read,
    "Shared brand folder",
    args.values.get("shared-folder") ??
      join(homedir(), "Dropbox", "Consultancy-Shared"),
  );

  write("\nStep 3 of 3 — LLM models\n");
  const fast = await promptEndpoint("fast", read);
  const thinking = await promptEndpoint("thinking", read);

  void configDir;
  return makeConfig({
    name,
    email,
    role,
    cloudSyncRoot,
    sharedFolder,
    fast,
    thinking,
  });
}

function buildFromFlags(args: ParsedArgs, env: NodeJS.ProcessEnv): InstallAppConfig {
  const required = [
    "name",
    "email",
    "role",
    "cloud-sync-root",
    "shared-folder",
    "fast-provider",
    "fast-model",
    "thinking-provider",
    "thinking-model",
  ];
  for (const key of required) {
    if (!args.values.has(key)) {
      throw new Error(`Missing required flag --${key}`);
    }
  }
  if (env.FAST_API_KEY === undefined) {
    throw new Error("Missing FAST_API_KEY environment variable");
  }
  if (env.THINKING_API_KEY === undefined) {
    throw new Error("Missing THINKING_API_KEY environment variable");
  }
  // CODEGEN_API_KEY defaults to THINKING_API_KEY — same frontier key (ADR-0012).
  if (env.CODEGEN_API_KEY === undefined && env.THINKING_API_KEY === undefined) {
    throw new Error(
      "Missing THINKING_API_KEY (used for authored-block-generation). " +
        "Set CODEGEN_API_KEY to override.",
    );
  }

  return makeConfig({
    name: value(args, "name"),
    email: value(args, "email"),
    role: RoleSchema.parse(value(args, "role")),
    cloudSyncRoot: value(args, "cloud-sync-root"),
    sharedFolder: value(args, "shared-folder"),
    fast: endpointFromFlags(args, "fast"),
    thinking: endpointFromFlags(args, "thinking"),
  });
}

function makeConfig(inputConfig: {
  name: string;
  email: string;
  role: Role;
  cloudSyncRoot: string;
  sharedFolder: string;
  fast: Omit<InstallAppConfig["llm"]["fastModel"], "keychainEntry">;
  thinking: Omit<InstallAppConfig["llm"]["thinkingModel"], "keychainEntry">;
}): InstallAppConfig {
  return InstallAppConfigSchema.parse({
    user: {
      name: inputConfig.name.trim(),
      email: inputConfig.email.trim(),
      role: inputConfig.role,
      initials: initials(inputConfig.name),
    },
    paths: {
      cloudSyncRoot: resolve(inputConfig.cloudSyncRoot),
      sharedFolder: resolve(inputConfig.sharedFolder),
    },
    llm: {
      fastModel: withKeychain(inputConfig.fast, "llm.fast.api-key"),
      thinkingModel: withKeychain(inputConfig.thinking, "llm.thinking.api-key"),
      // ADR-0012: authored-block-generation always uses the same frontier model
      // as the thinking category.  A separate config entry lets the two diverge
      // in a future release.
      codegenModel: withKeychain(inputConfig.thinking, "llm.codegen.api-key"),
    },
    editor: {
      reviewMode: "panel",
      autosaveDebounceMs: 2000,
    },
  });
}

function endpointFromFlags(
  args: ParsedArgs,
  prefix: "fast" | "thinking",
): Omit<InstallAppConfig["llm"]["fastModel"], "keychainEntry"> {
  const provider = ProviderSchema.parse(value(args, `${prefix}-provider`));
  const model = value(args, `${prefix}-model`);
  const baseUrl = args.values.get(`${prefix}-base-url`);
  return endpoint(provider, model, baseUrl);
}

async function promptEndpoint(
  kind: "fast" | "thinking",
  read: (prompt: string) => Promise<string>,
): Promise<Omit<InstallAppConfig["llm"]["fastModel"], "keychainEntry">> {
  const provider = ProviderSchema.parse(
    await promptDefault(read, `${kind} provider`, "anthropic"),
  );
  const modelDefault =
    kind === "fast"
      ? PROVIDER_DEFAULTS[provider].fast
      : PROVIDER_DEFAULTS[provider].thinking;
  const model = await promptDefault(read, `${kind} model`, modelDefault);
  const baseUrl =
    provider === "openai-compatible" || provider === "local"
      ? await promptDefault(read, `${kind} base URL`, "http://localhost:11434/v1")
      : undefined;
  return endpoint(provider, model, baseUrl);
}

function endpoint(
  provider: Provider,
  model: string,
  baseUrl?: string,
): Omit<InstallAppConfig["llm"]["fastModel"], "keychainEntry"> {
  if (model.trim().length === 0 || /\s/.test(model)) {
    throw new Error("Model name must be non-empty and contain no whitespace");
  }
  if ((provider === "openai-compatible" || provider === "local") && baseUrl === undefined) {
    throw new Error(`${provider} requires a base URL`);
  }
  const parsedBaseUrl =
    baseUrl === undefined ? undefined : z.string().url().parse(baseUrl);
  return parsedBaseUrl === undefined
    ? { provider, model }
    : { provider, model, baseUrl: parsedBaseUrl };
}

function withKeychain(
  endpointConfig: Omit<InstallAppConfig["llm"]["fastModel"], "keychainEntry">,
  keychainEntry: string,
): InstallAppConfig["llm"]["fastModel"] {
  return EndpointSchema.parse({ ...endpointConfig, keychainEntry });
}

function resolveSecrets(
  args: ParsedArgs,
  env: NodeJS.ProcessEnv,
  config: InstallAppConfig,
): { fast: string; thinking: string; codegen: string } {
  const fast = env.FAST_API_KEY ?? args.values.get("fast-api-key") ?? "";
  const thinking =
    env.THINKING_API_KEY ??
    args.values.get("thinking-api-key") ??
    (config.llm.fastModel.provider === config.llm.thinkingModel.provider ? fast : "");
  // codegen defaults to the same key as thinking (ADR-0012).
  const codegen =
    env.CODEGEN_API_KEY ??
    args.values.get("codegen-api-key") ??
    thinking;
  validateKey(config.llm.fastModel.provider, fast);
  validateKey(config.llm.thinkingModel.provider, thinking);
  validateCodegenKey(config.llm.codegenModel.provider, codegen);
  return { fast, thinking, codegen };
}

async function verifyKeys(
  config: InstallAppConfig,
  secrets: { fast: string; thinking: string; codegen: string },
): Promise<void> {
  await verifyEndpoint(config.llm.fastModel, secrets.fast);
  await verifyEndpoint(config.llm.thinkingModel, secrets.thinking);
  await verifyCodegenEndpoint(config.llm.codegenModel, secrets.codegen);
}

async function verifyEndpoint(
  endpointConfig: InstallAppConfig["llm"]["fastModel"],
  apiKey: string,
): Promise<void> {
  if (
    endpointConfig.provider !== "openai-compatible" &&
    endpointConfig.provider !== "local"
  ) {
    return;
  }
  const url = new URL("models", `${endpointConfig.baseUrl?.replace(/\/$/, "")}/`);
  const response = await fetch(url, {
    headers: apiKey.length === 0 ? {} : { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Model endpoint check failed for ${endpointConfig.provider}`);
  }
}

function validateKey(provider: Provider, apiKey: string): void {
  if (provider === "local") {
    return;
  }
  if (apiKey.length === 0) {
    throw new Error(`${provider} API key is required`);
  }
  if (provider === "openai" && !apiKey.startsWith("sk-")) {
    throw new Error("OpenAI API key must start with sk-");
  }
  if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
    throw new Error("Anthropic API key must start with sk-ant-");
  }
}

/**
 * Validates that the frontier API key is suitable for authored-block code
 * generation (ADR-0012).  Code-gen requires the frontier model; some API plans
 * gate access to specific model families.  This produces an actionable error
 * so the consultant can resolve their plan before the app is installed.
 */
function validateCodegenKey(provider: Provider, apiKey: string): void {
  if (provider === "local") {
    return; // Local/self-hosted models are assumed to support any use.
  }
  if (apiKey.length === 0) {
    throw new Error(
      `Frontier API key for authored-block-generation is required. ` +
        `Set CODEGEN_API_KEY (or THINKING_API_KEY) to a ${provider} ` +
        `key that has access to frontier / code-generation models.`,
    );
  }
  // Re-use the same format checks as the thinking key.
  if (provider === "openai" && !apiKey.startsWith("sk-")) {
    throw new Error(
      "Frontier API key for authored-block-generation must start with sk- (OpenAI format).",
    );
  }
  if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
    throw new Error(
      "Frontier API key for authored-block-generation must start with sk-ant- (Anthropic format). " +
        "Check that your API plan includes access to frontier models (e.g. claude-opus-4-7).",
    );
  }
}

async function verifyCodegenEndpoint(
  endpointConfig: InstallAppConfig["llm"]["codegenModel"],
  apiKey: string,
): Promise<void> {
  // For openai-compatible / local providers, ping the /models endpoint to
  // confirm connectivity — same check as verifyEndpoint.
  if (
    endpointConfig.provider !== "openai-compatible" &&
    endpointConfig.provider !== "local"
  ) {
    return;
  }
  const url = new URL("models", `${endpointConfig.baseUrl?.replace(/\/$/, "")}/`);
  const response = await fetch(url, {
    headers: apiKey.length === 0 ? {} : { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(
      `Code-generation model endpoint check failed for ${endpointConfig.provider}. ` +
        `Authored blocks cannot be generated without a reachable frontier model endpoint.`,
    );
  }
}

function writeOsSecret(name: string, value: string): void {
  if (platform() === "darwin") {
    runSecretCommand("security", [
      "add-generic-password",
      "-a",
      "docsystem",
      "-s",
      name,
      "-w",
      value,
      "-U",
    ]);
    return;
  }
  if (platform() === "win32") {
    runSecretCommand("cmdkey", [`/generic:${name}`, "/user:docsystem", `/pass:${value}`]);
    return;
  }
  runSecretCommand("secret-tool", [
    "store",
    "--label",
    `Jayson Editor ${name}`,
    "service",
    "docsystem",
    "account",
    name,
  ], value);
}

function runSecretCommand(command: string, args: string[], inputValue?: string): void {
  const result = spawnSync(command, args, {
    input: inputValue,
    stdio: inputValue === undefined ? "ignore" : ["pipe", "ignore", "ignore"],
  });
  if (result.status !== 0) {
    throw new Error(`Failed to store keychain entry with ${command}`);
  }
}

function validatePaths(
  cloudSyncRoot: string,
  sharedFolder: string,
  configDir: string,
): void {
  for (const path of [cloudSyncRoot, sharedFolder]) {
    accessSync(path, constants.R_OK | constants.W_OK);
    if (resolve(path).startsWith(resolve(configDir))) {
      throw new Error("Cloud/shared paths must not be inside the app config dir");
    }
  }
}

async function promptRole(read: (prompt: string) => Promise<string>): Promise<Role> {
  const raw = await promptDefault(read, "Role (consultant/senior/admin)", "consultant");
  return RoleSchema.parse(raw);
}

async function promptDefault(
  read: (prompt: string) => Promise<string>,
  label: string,
  defaultValue: string,
): Promise<string> {
  const answer = await read(`${label} [${defaultValue}]: `);
  return answer.trim().length === 0 ? defaultValue : answer.trim();
}

function identityDefaults(env: NodeJS.ProcessEnv): { name: string; email: string } {
  const fallbackName = userInfo().username;
  const name = gitConfig("user.name") ?? fallbackName;
  const email = gitConfig("user.email") ?? `${fallbackName}@${hostname()}`;
  void env;
  return { name, email };
}

function gitConfig(key: string): string | undefined {
  const result = spawnSync("git", ["config", "--global", key], {
    encoding: "utf8",
  });
  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function defaultConfigDir(env: NodeJS.ProcessEnv): string {
  if (platform() === "darwin") {
    return join(homedir(), "Library", "Application Support", "com.consultancy.docsystem");
  }
  if (platform() === "win32") {
    return join(env.APPDATA ?? homedir(), "com.consultancy.docsystem");
  }
  return join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "docsystem");
}

function value(args: ParsedArgs, key: string): string {
  const found = args.values.get(key);
  if (found === undefined) {
    throw new Error(`Missing required flag --${key}`);
  }
  return found;
}

function summary(config: InstallAppConfig): string {
  return `
Summary
User: ${config.user.name} <${config.user.email}> (${config.user.role})
Paths: ${config.paths.cloudSyncRoot} / ${config.paths.sharedFolder}
Fast model: ${config.llm.fastModel.provider} / ${config.llm.fastModel.model}
Thinking model: ${config.llm.thinkingModel.provider} / ${config.llm.thinkingModel.model}
Codegen model: ${config.llm.codegenModel.provider} / ${config.llm.codegenModel.model} (authored-block-generation)
Telemetry: NONE
`;
}

const PRIVACY_NOTICE = `
Jayson Editor — Setup

This wizard configures the app for your machine. Before continuing, review
the privacy notice in docs/privacy-notice.md.

What is stored locally:
- Your identity for attribution: name, email, role, and initials.
- Cloud-sync and shared brand folder paths.
- LLM provider and model preferences.
- LLM API keys in your OS keychain, never in config.yaml.

What is never stored:
- Prompt contents, response contents, usage/cost data, analytics, or telemetry.
`;

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runInstallCli().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}
