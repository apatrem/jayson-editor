import { parseDocModelJson } from "../docmodel/serialize";
import type { LibraryEntry, LibraryIndex } from "./filter";
import { MetaSchema } from "../schema/meta";
import { dirname, joinPath } from "./path";

export interface DirectoryEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
}

export interface LibraryFileSystem {
  listDirectory(path: string): Promise<DirectoryEntry[]>;
  readText(path: string): Promise<string>;
  stat(path: string): Promise<{ size: number; mtimeMs: number }>;
}

export async function buildLibraryIndex(
  root: string,
  fileSystem: LibraryFileSystem,
  options: { maxDepth?: number; now?: () => number } = {},
): Promise<LibraryIndex> {
  const maxDepth = options.maxDepth ?? 4;
  const entries: LibraryEntry[] = [];
  await scanDirectory(root, fileSystem, entries, maxDepth);
  return {
    entries,
    lastScanAt: options.now?.() ?? Date.now(),
  };
}

async function scanDirectory(
  current: string,
  fileSystem: LibraryFileSystem,
  entries: LibraryEntry[],
  remainingDepth: number,
): Promise<void> {
  if (remainingDepth < 0) {
    return;
  }
  const children = await fileSystem.listDirectory(current);
  const jsonFile = children.find(
    (child) => child.kind === "file" && child.name.endsWith(".json"),
  );
  if (jsonFile !== undefined) {
    const entry = await entryFromJson(jsonFile, fileSystem);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  await Promise.all(
    children
      .filter((child) => child.kind === "directory")
      .map((child) =>
        scanDirectory(child.path, fileSystem, entries, remainingDepth - 1),
      ),
  );
}

async function entryFromJson(
  jsonFile: DirectoryEntry,
  fileSystem: LibraryFileSystem,
): Promise<LibraryEntry | null> {
  const parsed = parseDocModelJson(await fileSystem.readText(jsonFile.path)) as {
    meta?: unknown;
  };
  const metaResult = MetaSchema.safeParse(parsed.meta);
  if (!metaResult.success) {
    return null;
  }
  const stats = await fileSystem.stat(jsonFile.path);
  const folder = dirname(jsonFile.path);
  return {
    path: folder,
    jsonFilename: jsonFile.name,
    meta: metaResult.data,
    thumbnailUri: null,
    fileSize: stats.size,
    fileMtime: stats.mtimeMs,
    hasAssetIssues: false,
    hasUnsavedComments: false,
  };
}

export function updateLibraryEntry(
  index: LibraryIndex,
  updatedEntry: LibraryEntry,
): LibraryIndex {
  return {
    ...index,
    entries: index.entries.map((entry) =>
      entry.path === updatedEntry.path ? updatedEntry : entry,
    ),
  };
}

export function docFolderPath(root: string, client: string, project: string): string {
  return joinPath(root, slug(client), slug(project));
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
