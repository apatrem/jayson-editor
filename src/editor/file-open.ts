import { parseDocModelJson } from "../docmodel/serialize";
import { DocModelSchema, type DocModel } from "../schema/docmodel";

export interface OpenFileSystem {
  listDirectory(path: string): Promise<Array<{ name: string; path: string; kind: "file" | "directory" }>>;
  readTextFile(path: string): Promise<string>;
}

export interface OpenDocumentTarget {
  folderPath: string;
  jsonPath: string;
  doc: DocModel;
  needsWrapPrompt: boolean;
}

export async function openDocumentTarget(
  inputPath: string,
  cloudSyncRoot: string,
  fileSystem: OpenFileSystem,
): Promise<OpenDocumentTarget> {
  const normalizedInput = trimTrailingSlash(inputPath);
  const normalizedRoot = trimTrailingSlash(cloudSyncRoot);
  const isJson = normalizedInput.endsWith(".json");
  const folderPath = isJson ? parentPath(normalizedInput) : normalizedInput;
  const jsonPath = isJson
    ? normalizedInput
    : await findJsonInFolder(normalizedInput, fileSystem);
  const raw = await fileSystem.readTextFile(jsonPath);
  const doc = DocModelSchema.parse(parseDocModelJson(raw));
  return {
    folderPath,
    jsonPath,
    doc,
    needsWrapPrompt: isJson && folderPath === normalizedRoot,
  };
}

async function findJsonInFolder(
  folderPath: string,
  fileSystem: OpenFileSystem,
): Promise<string> {
  const jsonFiles = (await fileSystem.listDirectory(folderPath)).filter(
    (entry) => entry.kind === "file" && entry.name.endsWith(".json"),
  );
  if (jsonFiles.length === 0) {
    throw new Error("No JSON document found in selected folder");
  }
  if (jsonFiles.length > 1) {
    const folderName = folderPath.split("/").at(-1) ?? "";
    const expectedName = folderName.length > 0 ? `${folderName}.json` : "";
    const docJson = jsonFiles.find((entry) => entry.name === expectedName);
    if (docJson !== undefined) {
      return docJson.path;
    }
  }
  return jsonFiles[0]?.path ?? "";
}

function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

function trimTrailingSlash(path: string): string {
  return path.replace(/\/+$/g, "");
}
