import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Structural-parity test for docs/privacy-notice.md
//
// The notice is bilingual (D-28). Today the English and French sections
// match line-for-line. Future edits could let them diverge silently —
// e.g., a translator adds a new disclosure to one language and forgets
// the other. This test fails when the two sections differ in headline
// structure (`### …` subheadings) or bullet count.
//
// What this test does NOT check:
// - Word-level translation accuracy (that requires a human reviewer).
// - Paragraph wording or order of paragraphs.
//
// What it DOES guarantee:
// - Every bullet in the EN section has exactly one counterpart in FR.
// - Every `### subsection` in EN has exactly one counterpart in FR.
//
// If you ARE intentionally adding a clause to only one language (rare —
// usually a structural change should land in both), update this test in
// the same commit so the change is visible at review time.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const NOTICE_PATH = join(repoRoot, "docs/privacy-notice.md");

interface SectionShape {
  bulletCount: number;
  subheadingCount: number;
  // Paragraph count is a fuzzy signal — translations can collapse or
  // split paragraphs idiomatically — but a large mismatch here usually
  // indicates a missing block, so we still track it.
  paragraphCount: number;
}

function parseSection(lines: string[]): SectionShape {
  let bulletCount = 0;
  let subheadingCount = 0;
  let paragraphCount = 0;
  let inParagraph = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("### ")) {
      subheadingCount++;
      inParagraph = false;
    } else if (line.startsWith("- ")) {
      bulletCount++;
      inParagraph = false;
    } else if (line === "") {
      inParagraph = false;
    } else {
      if (!inParagraph) {
        paragraphCount++;
        inParagraph = true;
      }
    }
  }

  return { bulletCount, subheadingCount, paragraphCount };
}

function splitByLanguage(notice: string): {
  english: string[];
  french: string[];
} {
  const lines = notice.split(/\r?\n/);
  const enStart = lines.findIndex((l) => l.trim() === "## English");
  const frStart = lines.findIndex((l) => l.trim() === "## Français");

  if (enStart === -1) {
    throw new Error("privacy-notice.md is missing `## English` heading");
  }
  if (frStart === -1) {
    throw new Error("privacy-notice.md is missing `## Français` heading");
  }
  if (frStart <= enStart) {
    throw new Error("`## Français` must appear after `## English`");
  }

  // Exclude the heading lines themselves; include everything until the
  // next top-level heading (or EOF for French).
  const english = lines.slice(enStart + 1, frStart);
  const french = lines.slice(frStart + 1);
  return { english, french };
}

describe("privacy-notice.md bilingual structural parity (D-28)", () => {
  const notice = readFileSync(NOTICE_PATH, "utf8");
  const { english, french } = splitByLanguage(notice);
  const en = parseSection(english);
  const fr = parseSection(french);

  it("has both `## English` and `## Français` top-level sections", () => {
    expect(english.length).toBeGreaterThan(0);
    expect(french.length).toBeGreaterThan(0);
  });

  it("has the same bullet count in EN and FR", () => {
    expect(fr.bulletCount).toBe(en.bulletCount);
    expect(en.bulletCount).toBeGreaterThan(0);
  });

  it("has the same `### subsection` count in EN and FR", () => {
    expect(fr.subheadingCount).toBe(en.subheadingCount);
  });

  it("has paragraph counts within one of each other (translation can collapse/split)", () => {
    expect(Math.abs(fr.paragraphCount - en.paragraphCount)).toBeLessThanOrEqual(1);
  });

});
