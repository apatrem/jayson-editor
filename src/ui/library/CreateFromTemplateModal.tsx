import { useState, type CSSProperties } from "react";
import commercialProposalJson from "../../../templates/commercial-proposal.json?raw";
import commercialProposalDeckJson from "../../../templates/commercial-proposal-deck.json?raw";
import standardReportJson from "../../../templates/standard-report.json?raw";
import standardReportDeckJson from "../../../templates/standard-report-deck.json?raw";

export interface Template {
  id: string;
  name: string;
  description: string;
  json: string;
}

const TEMPLATES: Template[] = [
  {
    id: "commercial-proposal",
    name: "Commercial Proposal",
    description: "Cover, executive summary, approach, deliverables, team, and pricing.",
    json: commercialProposalJson,
  },
  {
    id: "commercial-proposal-deck",
    name: "Commercial Proposal (Deck)",
    description: "10-slide deck: situation, approach, deliverables, timeline, team, pricing.",
    json: commercialProposalDeckJson,
  },
  {
    id: "standard-report",
    name: "Standard Report",
    description: "Cover, methodology, findings with chart, recommendations, risk matrix.",
    json: standardReportJson,
  },
  {
    id: "standard-report-deck",
    name: "Standard Report (Deck)",
    description: "10-slide deck: exec summary, methodology, findings, recommendations, risks.",
    json: standardReportDeckJson,
  },
];

export interface CreateFromTemplateModalDeps {
  writeDocumentFile: (path: string, content: string) => Promise<void>;
}

export interface CreateFromTemplateModalProps {
  cloudSyncRoot: string;
  onConfirm: (jsonPath: string) => Promise<void>;
  onCancel: () => void;
  deps?: Partial<CreateFromTemplateModalDeps>;
}

export function CreateFromTemplateModal({
  cloudSyncRoot,
  onConfirm,
  onCancel,
  deps = {},
}: CreateFromTemplateModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedTemplate = TEMPLATES.find((t) => t.id === selectedId) ?? null;

  const handleConfirm = async (): Promise<void> => {
    if (selectedTemplate === null || documentName.trim() === "") return;
    setError(null);
    setBusy(true);
    try {
      const filename = documentName.trim().endsWith(".json")
        ? documentName.trim()
        : `${documentName.trim()}.json`;
      const filePath = joinPath(cloudSyncRoot, filename);
      const writeDocumentFile = deps.writeDocumentFile ?? writeDocumentFileDefault;
      await writeDocumentFile(filePath, selectedTemplate.json);
      await onConfirm(filePath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const canConfirm =
    selectedTemplate !== null && documentName.trim() !== "" && !busy;

  return (
    <div role="dialog" aria-modal="true" aria-label="Create from template" style={styles.overlay}>
      <div style={styles.modal}>
        <header style={styles.header}>
          <h2 style={styles.title}>New from template</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            style={styles.closeButton}
          >
            ✕
          </button>
        </header>
        <div style={styles.body}>
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Choose a template</legend>
            {TEMPLATES.map((template) => (
              <label key={template.id} style={styles.templateOption}>
                <input
                  type="radio"
                  name="template"
                  value={template.id}
                  checked={selectedId === template.id}
                  onChange={() => setSelectedId(template.id)}
                />
                <span style={styles.templateInfo}>
                  <strong>{template.name}</strong>
                  <span style={styles.templateDescription}>{template.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label style={styles.nameLabel}>
            Document name
            <input
              type="text"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="e.g. Acme Corp — Q3 Proposal"
              style={styles.nameInput}
              aria-label="Document name"
            />
          </label>
          {error !== null ? (
            <p role="alert" style={styles.error}>
              {error}
            </p>
          ) : null}
        </div>
        <footer style={styles.footer}>
          <button type="button" onClick={onCancel} style={styles.cancelButton}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void handleConfirm();
            }}
            disabled={!canConfirm}
            style={styles.confirmButton}
          >
            {busy ? "Creating…" : "Create document"}
          </button>
        </footer>
      </div>
    </div>
  );
}

async function writeDocumentFileDefault(path: string, content: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_document_file", { path, content });
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

const styles = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "grid",
    placeItems: "center",
    zIndex: 100,
  },
  modal: {
    background: "Canvas",
    border: "1px solid ButtonBorder",
    borderRadius: "0.75rem",
    boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
    display: "grid",
    gridTemplateRows: "auto 1fr auto",
    maxHeight: "80vh",
    maxWidth: "520px",
    overflow: "hidden",
    width: "100%",
  },
  header: {
    alignItems: "center",
    borderBottom: "1px solid ButtonBorder",
    display: "flex",
    justifyContent: "space-between",
    padding: "1rem 1.25rem",
  },
  title: {
    fontSize: "1.125rem",
    margin: 0,
  },
  closeButton: {
    background: "transparent",
    border: 0,
    cursor: "pointer",
    fontSize: "1rem",
    padding: "0.25rem",
  },
  body: {
    display: "grid",
    gap: "1.25rem",
    overflowY: "auto" as const,
    padding: "1.25rem",
  },
  fieldset: {
    border: 0,
    display: "grid",
    gap: "0.5rem",
    margin: 0,
    padding: 0,
  },
  legend: {
    fontWeight: 700,
    marginBottom: "0.5rem",
    padding: 0,
  },
  templateOption: {
    alignItems: "flex-start",
    border: "1px solid ButtonBorder",
    borderRadius: "0.5rem",
    cursor: "pointer",
    display: "flex",
    gap: "0.75rem",
    padding: "0.75rem",
  },
  templateInfo: {
    display: "grid",
    gap: "0.25rem",
  },
  templateDescription: {
    color: "GrayText",
    fontSize: "0.875rem",
  },
  nameLabel: {
    display: "grid",
    fontWeight: 700,
    gap: "0.375rem",
  },
  nameInput: {
    border: "1px solid ButtonBorder",
    borderRadius: "0.375rem",
    fontWeight: "normal" as const,
    padding: "0.5rem",
    width: "100%",
  },
  error: {
    color: "red",
    margin: 0,
  },
  footer: {
    borderTop: "1px solid ButtonBorder",
    display: "flex",
    gap: "0.5rem",
    justifyContent: "flex-end",
    padding: "1rem 1.25rem",
  },
  cancelButton: {
    cursor: "pointer",
    padding: "0.5rem 0.875rem",
  },
  confirmButton: {
    cursor: "pointer",
    padding: "0.5rem 0.875rem",
  },
} satisfies Record<string, CSSProperties>;
