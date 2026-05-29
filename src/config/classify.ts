import { M8PartialConfigSchema, type M8PartialConfig } from "../schema/app-config";
import {
  InstallAppConfigSchema,
  type InstallAppConfig,
} from "../schema/install-config";

/**
 * Classifies the raw `read_app_config` payload into one of three shapes, shared
 * by app boot routing (`boot.ts`) and LLM runtime init (`runtime-config.ts`) so
 * the two can't drift:
 *
 *   - `partial` — a GUI folder-picker install (paths only, no `llm` block / keys).
 *     Routing works; LLM features stay disabled (D-101).
 *   - `full`    — a CLI-wizard install with the full `llm` config.
 *   - `invalid` — present but matches neither schema (corruption). Callers must
 *     surface this rather than silently treating it as "not set up."
 *
 * Order matters: `M8PartialConfigSchema` is `.strict()`, so a full config (with
 * `user`/`llm`/`editor` keys) fails it and falls through to the full schema.
 */
export type AppConfigClassification =
  | { kind: "partial"; config: M8PartialConfig }
  | { kind: "full"; config: InstallAppConfig }
  | { kind: "invalid" };

export function classifyAppConfig(raw: unknown): AppConfigClassification {
  const partial = M8PartialConfigSchema.safeParse(raw);
  if (partial.success) return { kind: "partial", config: partial.data };
  const full = InstallAppConfigSchema.safeParse(raw);
  if (full.success) return { kind: "full", config: full.data };
  return { kind: "invalid" };
}
