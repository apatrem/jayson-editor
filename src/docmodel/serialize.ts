import type { DocModel } from "../schema/docmodel";
import { canonicalize } from "./canonicalize";
import { stringifyDocModelJson } from "./json-config";

export function serializeDocModel(doc: DocModel): string {
  const canonical = canonicalize(doc);
  return stringifyDocModelJson(canonical);
}

export function parseDocModelJson(source: string): unknown {
  return JSON.parse(source) as unknown;
}
