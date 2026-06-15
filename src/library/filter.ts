import type { Meta } from "../schema/meta";

export interface LibraryEntry {
  path: string;
  jsonFilename: string;
  meta: Meta;
  thumbnailUri: string | null;
  fileSize: number;
  fileMtime: number;
  hasAssetIssues: boolean;
  hasUnsavedComments: boolean;
}

export interface LibraryIndex {
  entries: LibraryEntry[];
  lastScanAt: number;
}

export interface LibraryFilterState {
  search: string;
  status: Meta["status"][] | null;
  docKind: Meta["docKind"][] | null;
  sector: string[] | null;
  language: Meta["language"][] | null;
  ownerMode: "me" | "all";
  showArchived: boolean;
  sort: "updated-desc" | "updated-asc" | "client-asc" | "created-desc";
  view: "grid" | "list";
}

export const DEFAULT_LIBRARY_FILTER_STATE: LibraryFilterState = {
  search: "",
  status: null,
  docKind: null,
  sector: null,
  language: null,
  ownerMode: "me",
  showArchived: false,
  sort: "updated-desc",
  view: "grid",
};

export function applyFilters(
  entries: LibraryEntry[],
  state: LibraryFilterState,
  currentUserEmail: string,
): LibraryEntry[] {
  const search = state.search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (!state.showArchived && entry.meta.archived) {
      return false;
    }
    if (state.status !== null && !state.status.includes(entry.meta.status)) {
      return false;
    }
    if (state.docKind !== null && !state.docKind.includes(entry.meta.docKind)) {
      return false;
    }
    if (
      state.sector !== null &&
      (entry.meta.sector === undefined || !state.sector.includes(entry.meta.sector))
    ) {
      return false;
    }
    if (state.language !== null && !state.language.includes(entry.meta.language)) {
      return false;
    }
    if (state.ownerMode === "me" && entry.meta.owner !== currentUserEmail) {
      return false;
    }
    if (search.length > 0) {
      const hit =
        entry.meta.client.toLowerCase().includes(search) ||
        entry.meta.project.toLowerCase().includes(search) ||
        entry.meta.tags.some((tag) => tag.toLowerCase().includes(search));
      if (!hit) {
        return false;
      }
    }
    return true;
  });
}

export function applySort(
  entries: LibraryEntry[],
  sort: LibraryFilterState["sort"],
): LibraryEntry[] {
  const sorted = [...entries];
  switch (sort) {
    case "updated-desc":
      sorted.sort((a, b) => Date.parse(b.meta.updatedAt) - Date.parse(a.meta.updatedAt));
      return sorted;
    case "updated-asc":
      sorted.sort((a, b) => Date.parse(a.meta.updatedAt) - Date.parse(b.meta.updatedAt));
      return sorted;
    case "client-asc":
      sorted.sort((a, b) => a.meta.client.localeCompare(b.meta.client));
      return sorted;
    case "created-desc":
      sorted.sort((a, b) => Date.parse(b.meta.createdAt) - Date.parse(a.meta.createdAt));
      return sorted;
  }
}

export function toggleFilterValue<T>(
  current: T[] | null,
  value: T,
  checked: boolean,
): T[] | null {
  const values = current ?? [];
  if (checked) {
    return values.includes(value) ? values : [...values, value];
  }
  const next = values.filter((item) => item !== value);
  return next.length === 0 ? null : next;
}
