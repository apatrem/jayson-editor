import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─── FROZEN ACCEPTANCE TESTS · T-201 IPC surface (plan/phase12-coarse) ──────
// Committed red on purpose: they freeze the ADR-0022 document-IPC contract
// before implementation. Do not edit them to make a gate pass.

describe("T-201 · JSON document IPC", () => {
  const fsRs = readFileSync("src-tauri/src/ipc/fs.rs", "utf8");

  it("implements read_json_file and write_json_file", () => {
    expect(fsRs).toContain("pub async fn read_json_file");
    expect(fsRs).toContain("pub async fn write_json_file");
  });

  it("keeps the atomic write-then-rename contract on the JSON write path", () => {
    const start = fsRs.indexOf("pub async fn write_json_file");
    expect(
      start,
      "write_json_file must exist before its atomicity can be checked",
    ).toBeGreaterThanOrEqual(0);
    const writeSection = fsRs.slice(start, start + 2000);
    expect(writeSection).toMatch(/rename|persist|tmp|temp/i);
  });

  it("documents the JSON commands in docs/TAURI_IPC.md", () => {
    const doc = readFileSync("docs/TAURI_IPC.md", "utf8");
    expect(doc).toContain("read_json_file");
    expect(doc).toContain("write_json_file");
  });
});
