import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─── FROZEN ACCEPTANCE TESTS · T-201 IPC surface (plan/phase12-coarse) ──────
// Committed red on purpose: they freeze the ADR-0022 document-IPC contract
// before implementation. Do not edit them to make a gate pass.
// Commands are DOMAIN-named (read_document_file / write_document_file), not
// syntax-named — binding per docs/BUILD_BRIEF.md ("File IPCs should be
// domain-named") and docs/TAURI_IPC.md (dual-review punch-list #1).

describe("T-201 · document-file IPC (domain-named, JSON payload)", () => {
  const fsRs = readFileSync("src-tauri/src/ipc/fs.rs", "utf8");

  it("implements read_document_file and write_document_file", () => {
    expect(fsRs).toContain("pub async fn read_document_file");
    expect(fsRs).toContain("pub async fn write_document_file");
  });

  it("keeps the atomic write-then-rename contract on the document write path", () => {
    const start = fsRs.indexOf("pub async fn write_document_file");
    expect(
      start,
      "write_document_file must exist before its atomicity can be checked",
    ).toBeGreaterThanOrEqual(0);
    const writeSection = fsRs.slice(start, start + 2000);
    // Both halves of the atomic idiom: a temp target AND a rename/persist step.
    expect(writeSection).toMatch(/tmp|temp/i);
    expect(writeSection).toMatch(/rename|persist/i);
  });

  it("documents the document-file commands in docs/TAURI_IPC.md", () => {
    const doc = readFileSync("docs/TAURI_IPC.md", "utf8");
    expect(doc).toContain("read_document_file");
    expect(doc).toContain("write_document_file");
  });
});
