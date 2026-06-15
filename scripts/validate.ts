#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { parseDocModelJson } from "../src/docmodel/serialize";
import { validateDocModel } from "../src/schema/validate";

const path = process.argv[2];
if (!path) {
  console.error("usage: npm run validate <path-to-doc.json>");
  process.exit(2);
}

let source: string;
try {
  source = readFileSync(path, "utf8");
} catch (e) {
  console.error(`cannot read ${path}: ${(e as Error).message}`);
  process.exit(2);
}

// Authoring placeholders must never reach a finished document.
const placeholderLines = source
  .split("\n")
  .map((line, i) => [i + 1, line] as const)
  .filter(([, line]) => line.includes("[REPLACE"));
if (placeholderLines.length > 0) {
  console.error(`${path}: ${placeholderLines.length} unfilled [REPLACE …] placeholder(s):`);
  for (const [n, line] of placeholderLines) console.error(`  ${n}: ${line.trim()}`);
  process.exit(1);
}

let parsed: unknown;
try {
  parsed = parseDocModelJson(source);
} catch (e) {
  console.error(`${path}: JSON parse error: ${(e as Error).message}`);
  process.exit(1);
}

const result = validateDocModel(parsed);
if (!result.ok) {
  console.error(`${path}: invalid DocModel (${result.errors.length} error(s)):`);
  for (const err of result.errors) console.error(`  ${err.path || "<root>"}: ${err.message}`);
  process.exit(1);
}

const tbd = (source.match(/\bTBD\b/g) ?? []).length;
console.log(`${path}: valid DocModel (kind=${result.doc.kind}).`);
if (tbd > 0) console.warn(`  note: ${tbd} TBD value(s) still open — fill before sending.`);
process.exit(0);
