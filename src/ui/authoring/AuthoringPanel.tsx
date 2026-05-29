/**
 * Preview-first hybrid authoring UI for Authored blocks (T-172, ADR-0011).
 *
 * Surfaces three panes in a single panel:
 *   1. Description input — free-text intent that feeds the generation prompt.
 *   2. Structured manifest fields — slug + displayName, editable before or after
 *      generation; both surfaces stay in sync.
 *   3. Live preview pane — renders whatever `previewNode` T-173 injects, wrapped
 *      in the RenderWatchdog so preview crashes never crash the authoring UI.
 *
 * T-173 will wire `onGenerate` and inject `previewNode` once the LLM pipeline
 * exists.  Until then the panel is a complete interactive shell.
 */

import {
  type ChangeEvent,
  type CSSProperties,
  type FC,
  type ReactNode,
  useState,
} from "react";
import type { DocumentModel } from "../../renderer/DocumentRenderer";
import { withRenderWatchdog } from "../../block-primitives/RenderWatchdog";
import { FINISH_SETUP_HINT, FinishSetupHint } from "../FinishSetupHint";

// ─── Preview sandbox ──────────────────────────────────────────────────────────

/**
 * Thin wrapper so we can pass `previewNode` through `withRenderWatchdog`.
 * The watchdog catches both render-budget overruns and synchronous throw errors.
 */
const PreviewInner: FC<{ node: ReactNode }> = ({ node }) => <>{node}</>;
const SafePreview = withRenderWatchdog(PreviewInner, { catchErrors: true });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthoringPanelGenerateParams {
  /** Free-text description of the block the consultant wants to create. */
  description: string;
  /**
   * Kebab-case identifier for the block (e.g. "competitive-matrix").
   * Must be unique within the sender's namespace.
   */
  slug: string;
  /** Human-readable name shown in the palette and as the block title. */
  displayName: string;
}

export interface AuthoringPanelProps {
  /** The document open at the time "Create new" was triggered — passed to the
   *  generation prompt so the LLM sees context (surrounding blocks, brand tokens,
   *  tone).  Read-only here; mutated only by DocumentView. */
  docContext: DocumentModel;
  /** Called when the consultant dismisses the panel without generating. */
  onClose: () => void;
  /**
   * Called when the consultant clicks "Generate" (or re-generates via follow-up).
   * T-173 hooks this to fire the LLM call and pipe the result back through
   * `previewNode`.  Absent until T-173 is wired.
   */
  onGenerate?: (params: AuthoringPanelGenerateParams) => void;
  /**
   * Rendered inside the live preview pane.  T-173 injects the watchdog-wrapped
   * block component once a generation result is available.  Absent means "not
   * generated yet" — the panel shows a placeholder.
   */
  previewNode?: ReactNode;
  /** True while a generation request is in flight. */
  generating?: boolean;
  /**
   * Whether the LLM runtime is configured. When false (a folder-picker / M8
   * install with no `llm` block or keys), Generate is disabled with a
   * "finish setup" hint rather than silently doing nothing (ADR-0019).
   * Defaults to true.
   */
  llmAvailable?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a slug to a title-case display name.
 * "competitive-matrix" → "Competitive Matrix"
 */
function slugToDisplayName(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Normalises a user-typed string into a valid kebab-case slug.
 * Strips leading/trailing spaces, lowercases, collapses spaces and underscores
 * to hyphens, removes characters that aren't alphanumeric or hyphens.
 */
function normaliseSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AuthoringPanel: FC<AuthoringPanelProps> = ({
  docContext: _docContext,
  onClose,
  onGenerate,
  previewNode,
  generating = false,
  llmAvailable = true,
}) => {
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  // Track whether the user has manually edited displayName so we stop auto-syncing.
  const [displayNameManual, setDisplayNameManual] = useState(false);

  const handleSlugChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const raw = e.target.value;
    setSlug(raw);
    // Auto-populate displayName from slug unless the user already edited it.
    if (!displayNameManual) {
      setDisplayName(slugToDisplayName(normaliseSlug(raw)));
    }
  };

  const handleDisplayNameChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setDisplayName(e.target.value);
    setDisplayNameManual(true);
  };

  const handleGenerate = (): void => {
    onGenerate?.({
      description,
      slug: normaliseSlug(slug) || "unnamed-block",
      displayName: displayName || slugToDisplayName(normaliseSlug(slug)) || "Unnamed Block",
    });
  };

  const canGenerate = description.trim().length > 0 && !generating && llmAvailable;

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label="Create new Authored block"
      style={styles.panel}
    >
      {/* ── Header ── */}
      <header style={styles.header}>
        <h2 style={styles.title}>Create new Authored block</h2>
        <button
          type="button"
          aria-label="Close authoring panel"
          style={styles.closeButton}
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      {/* ── Body (two-column: form + preview) ── */}
      <div style={styles.body}>
        {/* Left column: description + manifest fields */}
        <section style={styles.formColumn} aria-label="Block description and fields">
          <div style={styles.fieldGroup}>
            <label htmlFor="authoring-description" style={styles.label}>
              Describe the block you want
            </label>
            <textarea
              id="authoring-description"
              style={styles.textarea}
              value={description}
              placeholder="e.g. A competitive-landscape matrix with quadrant positioning and brief annotations per competitor"
              rows={4}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label htmlFor="authoring-slug" style={styles.label}>
              Slug <span style={styles.hint}>(kebab-case identifier)</span>
            </label>
            <input
              id="authoring-slug"
              type="text"
              style={styles.input}
              value={slug}
              placeholder="competitive-matrix"
              onChange={handleSlugChange}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label htmlFor="authoring-display-name" style={styles.label}>
              Display name
            </label>
            <input
              id="authoring-display-name"
              type="text"
              style={styles.input}
              value={displayName}
              placeholder="Competitive Matrix"
              onChange={handleDisplayNameChange}
            />
          </div>
        </section>

        {/* Right column: live preview */}
        <section style={styles.previewColumn} aria-label="Block preview">
          <p style={styles.previewHeading}>Live preview</p>
          <div style={styles.previewViewport}>
            {previewNode !== undefined ? (
              <SafePreview node={previewNode} />
            ) : (
              <div style={styles.previewPlaceholder}>
                <p style={styles.previewPlaceholderText}>
                  {generating
                    ? "Generating…"
                    : "Describe a block and click Generate to see a preview."}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <footer style={styles.footer}>
        {!llmAvailable ? <FinishSetupHint /> : null}
        <button
          type="button"
          style={styles.cancelButton}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          style={styles.generateButton}
          disabled={!canGenerate}
          title={llmAvailable ? undefined : FINISH_SETUP_HINT}
          onClick={handleGenerate}
        >
          {generating ? "Generating…" : "Generate"}
        </button>
      </footer>
    </aside>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  panel: {
    background: "Canvas",
    border: "1px solid ButtonBorder",
    borderRadius: "0.75rem",
    display: "grid",
    gap: "1rem",
    gridTemplateRows: "auto 1fr auto",
    maxHeight: "80vh",
    overflow: "hidden",
    padding: "1.25rem",
  },
  header: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  },
  title: {
    fontSize: "1.125rem",
    margin: 0,
  },
  closeButton: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: "1rem",
    padding: "0.25rem",
  },
  body: {
    display: "grid",
    gap: "1rem",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    overflow: "auto",
  },
  formColumn: {
    display: "grid",
    alignContent: "start",
    gap: "1rem",
  },
  fieldGroup: {
    display: "grid",
    gap: "0.375rem",
  },
  label: {
    fontSize: "0.875rem",
    fontWeight: 600,
  },
  hint: {
    color: "GrayText",
    fontWeight: 400,
  },
  textarea: {
    borderRadius: "0.375rem",
    border: "1px solid ButtonBorder",
    fontFamily: "inherit",
    fontSize: "0.875rem",
    padding: "0.5rem",
    resize: "vertical",
    width: "100%",
  },
  input: {
    border: "1px solid ButtonBorder",
    borderRadius: "0.375rem",
    fontFamily: "inherit",
    fontSize: "0.875rem",
    padding: "0.5rem",
    width: "100%",
  },
  previewColumn: {
    display: "grid",
    alignContent: "start",
    gap: "0.5rem",
  },
  previewHeading: {
    fontSize: "0.875rem",
    fontWeight: 600,
    margin: 0,
  },
  previewViewport: {
    border: "1px solid ButtonBorder",
    borderRadius: "0.375rem",
    minHeight: "12rem",
    overflow: "auto",
    padding: "0.75rem",
  },
  previewPlaceholder: {
    alignItems: "center",
    display: "flex",
    height: "100%",
    justifyContent: "center",
    minHeight: "10rem",
  },
  previewPlaceholderText: {
    color: "GrayText",
    fontSize: "0.875rem",
    margin: 0,
    textAlign: "center",
  },
  footer: {
    display: "flex",
    gap: "0.75rem",
    justifyContent: "flex-end",
  },
  cancelButton: {
    border: "1px solid ButtonBorder",
    borderRadius: "0.375rem",
    cursor: "pointer",
    padding: "0.5rem 1rem",
  },
  generateButton: {
    borderRadius: "0.375rem",
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
    padding: "0.5rem 1.25rem",
  },
};

export default AuthoringPanel;
