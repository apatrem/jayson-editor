import { readFileSync } from "node:fs";
import { invoke } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";

async function readDocumentFile(path: string): Promise<string> {
  return invoke<string>("read_yaml_file", { path });
}

async function writeDocumentFile(path: string, content: string): Promise<void> {
  await invoke("write_yaml_file", { path, content });
}

// T-125 promoted these from deferred to registered.
const M8_FS_COMMANDS = [
  "list_directory",
  "file_exists",
  "ensure_directory",
  "move_file",
] as const;

describe("fs IPC smoke contract", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    vi.restoreAllMocks();
  });

  it("invokes read_yaml_file and write_yaml_file with the expected payloads", async () => {
    const invokeMock = vi.fn((cmd: string) => {
      if (cmd === "read_yaml_file") {
        return Promise.resolve("kind: document\n");
      }
      return Promise.resolve(null);
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: { invoke: invokeMock },
    });

    await expect(readDocumentFile("/Users/me/Documents/doc.yaml")).resolves.toBe(
      "kind: document\n",
    );
    await expect(
      writeDocumentFile("/Users/me/Documents/doc.yaml", "kind: document\n"),
    ).resolves.toBeUndefined();

    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "read_yaml_file",
      {
        path: "/Users/me/Documents/doc.yaml",
      },
      undefined,
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "write_yaml_file",
      {
        path: "/Users/me/Documents/doc.yaml",
        content: "kind: document\n",
      },
      undefined,
    );
  });

  it("surfaces backend scope errors to the caller", async () => {
    const error = Object.assign(new Error("path is outside configured asset scope"), {
      kind: "permission-denied",
    });
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {
        invoke: vi.fn(() => Promise.reject(error)),
      },
    });

    await expect(readDocumentFile("/tmp/outside.yaml")).rejects.toMatchObject(error);
  });

  it("confirms M8 filesystem commands are registered in the Tauri invoke surface (T-125)", () => {
    const libRs = readFileSync("src-tauri/src/lib.rs", "utf8");

    for (const command of M8_FS_COMMANDS) {
      expect(libRs).toContain(`ipc::fs::${command}`);
    }
  });
});
