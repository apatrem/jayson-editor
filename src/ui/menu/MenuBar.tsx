import type { CSSProperties, FC } from "react";
import { FileMenu, type FileMenuProps } from "./FileMenu";

export interface MenuBarProps extends FileMenuProps {
  statusMessage?: string | null;
}

export const MenuBar: FC<MenuBarProps> = ({ statusMessage, ...fileMenuProps }) => (
  <header role="menubar" aria-label="Application menu" style={styles.bar}>
    <FileMenu {...fileMenuProps} />
    {statusMessage ? (
      <p role="status" style={styles.status}>
        {statusMessage}
      </p>
    ) : null}
  </header>
);

const styles: Record<string, CSSProperties> = {
  bar: {
    alignItems: "center",
    display: "flex",
    gap: "1rem",
    padding: "0.625rem 1rem",
    background: "#FFFFFF",
    borderBottom: "1px solid #E2E8F0",
  },
  status: {
    margin: 0,
    fontSize: "0.8125rem",
    color: "#16A34A",
    fontWeight: 500,
    // Take the leftover width and wrap within it, so a long hint never pushes
    // the file buttons (which are flexShrink: 0).
    flex: "1 1 auto",
    minWidth: 0,
  },
};
