/**
 * Deterministic JSON serialization options for DocModel document files (ADR-0022).
 * Used by src/docmodel/serialize.ts after canonicalize().
 */
export const JSON_STRINGIFY_INDENT = 2;

export function stringifyDocModelJson(value: unknown): string {
  return `${JSON.stringify(value, null, JSON_STRINGIFY_INDENT)}\n`;
}
