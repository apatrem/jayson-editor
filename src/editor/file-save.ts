import type { DocModel } from "../schema/docmodel";
import { serializeDocModel } from "../docmodel/serialize";

export interface EditorFileSystem {
  createDirectory(path: string): Promise<void> | void;
  writeTextFile(path: string, contents: string): Promise<void> | void;
}

export interface SavedDocumentRef {
  folderPath: string;
  jsonPath: string;
}

export interface SaveAsOptions {
  cloudSyncRoot: string;
  folderName: string;
  jsonFilename?: string;
}

export async function saveDocumentAs(
  doc: DocModel,
  options: SaveAsOptions,
  fileSystem: EditorFileSystem,
): Promise<SavedDocumentRef> {
  const folderName = normalizeFolderName(options.folderName);
  const jsonFilename = options.jsonFilename ?? `${folderName}.json`;
  assertJsonFilename(jsonFilename);

  const folderPath = joinPath(options.cloudSyncRoot, folderName);
  const jsonPath = joinPath(folderPath, jsonFilename);
  await fileSystem.createDirectory(folderPath);
  await fileSystem.writeTextFile(jsonPath, serializeDocModel(doc));
  return { folderPath, jsonPath };
}

export async function saveExistingDocument(
  doc: DocModel,
  ref: SavedDocumentRef,
  fileSystem: Pick<EditorFileSystem, "writeTextFile">,
): Promise<void> {
  await fileSystem.writeTextFile(ref.jsonPath, serializeDocModel(doc));
}

function normalizeFolderName(folderName: string): string {
  const normalized = folderName.trim();
  if (normalized.length === 0) {
    throw new Error("Save As folder name is required");
  }
  if (normalized.includes("/") || normalized.includes("\\")) {
    throw new Error("Save As folder name must not contain path separators");
  }
  return normalized;
}

function assertJsonFilename(filename: string): void {
  if (!filename.endsWith(".json") || filename.includes("/") || filename.includes("\\")) {
    throw new Error("JSON filename must be a local .json file name");
  }
}

function joinPath(...parts: string[]): string {
  return parts
    .map((part, index) =>
      index === 0 ? part.replace(/\/+$/g, "") : part.replace(/^\/+|\/+$/g, ""),
    )
    .filter((part) => part.length > 0)
    .join("/");
}
