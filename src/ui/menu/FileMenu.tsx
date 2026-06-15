import type { CSSProperties, FC } from "react";

export const DOCUMENT_OPEN_FILTER = { name: "JSON", extensions: ["json"] as string[] };
export const DOCUMENT_SAVE_FILTER = { name: "JSON", extensions: ["json"] as string[] };

export interface FileMenuProps {
  canSave: boolean;
  canExport: boolean;
  onOpen: () => Promise<void> | void;
  onSave: () => Promise<void> | void;
  onSaveAs: () => Promise<void> | void;
  onExportPdf: () => Promise<void> | void;
  /** Import an Authored block via a file picker (T-164). */
  onImportBlock?: () => Promise<void> | void;
}

const MenuButton: FC<{
  label: string;
  onClick: () => Promise<void> | void;
  disabled?: boolean;
  variant?: "default" | "primary";
}> = ({ label, onClick, disabled = false, variant = "default" }) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    onClick={() => {
      void onClick();
    }}
    style={{
      ...styles.button,
      ...(variant === "primary" ? styles.buttonPrimary : {}),
      ...(disabled ? styles.buttonDisabled : {}),
    }}
  >
    {label}
  </button>
);

export const FileMenu: FC<FileMenuProps> = ({
  canSave,
  canExport,
  onOpen,
  onSave,
  onSaveAs,
  onExportPdf,
  onImportBlock,
}) => (
  <div role="menu" aria-label="File menu" style={styles.menu}>
    <MenuButton label="Open" onClick={onOpen} />
    <MenuButton label="Save" onClick={onSave} disabled={!canSave} variant="primary" />
    <MenuButton label="Save As" onClick={onSaveAs} disabled={!canSave} />
    <MenuButton label="Export PDF" onClick={onExportPdf} disabled={!canExport} />
    {onImportBlock !== undefined ? (
      <>
        <span style={styles.divider} aria-hidden="true" />
        <MenuButton label="Import block…" onClick={onImportBlock} />
      </>
    ) : null}
  </div>
);

const styles: Record<string, CSSProperties> = {
  menu: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
    // Never let the status message (or anything else) squeeze the file buttons:
    // they keep their size and the message wraps in the remaining space instead.
    flexShrink: 0,
  },
  button: {
    appearance: "none",
    border: "1px solid #D6DEE8",
    background: "#FFFFFF",
    color: "#1E293B",
    borderRadius: "0.5rem",
    padding: "0.4rem 0.85rem",
    fontSize: "0.8125rem",
    fontWeight: 500,
    lineHeight: 1.2,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  buttonPrimary: {
    border: "1px solid #0B3D91",
    background: "#0B3D91",
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  divider: {
    width: "1px",
    alignSelf: "stretch",
    margin: "0.15rem 0.25rem",
    background: "#E2E8F0",
  },
};
