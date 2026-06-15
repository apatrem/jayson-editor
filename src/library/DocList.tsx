import type { CSSProperties, FC } from "react";
import { DocCard, type DocCardProps } from "./DocCard";
import type { LibraryEntry, LibraryFilterState } from "./filter";

export interface DocListProps extends Omit<DocCardProps, "entry" | "compact"> {
  entries: LibraryEntry[];
  view: LibraryFilterState["view"];
  onResetFilters: () => void;
}

export const DocList: FC<DocListProps> = ({
  entries,
  view,
  onResetFilters,
  ...actions
}) => {
  if (entries.length === 0) {
    return (
      <div role="status" style={styles.empty}>
        <h2>No docs match your filters.</h2>
        <button type="button" onClick={onResetFilters}>
          Reset filters
        </button>
      </div>
    );
  }

  return (
    <div style={view === "grid" ? styles.grid : styles.list}>
      {entries.map((entry) => (
        <DocCard
          key={`${entry.path}/${entry.jsonFilename}`}
          entry={entry}
          compact={view === "list"}
          {...actions}
        />
      ))}
    </div>
  );
};

const styles: Record<string, CSSProperties> = {
  grid: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))",
  },
  list: {
    display: "grid",
  },
  empty: {
    border: "1px solid ButtonBorder",
    borderRadius: "0.5rem",
    padding: "2rem",
    textAlign: "center",
  },
};
