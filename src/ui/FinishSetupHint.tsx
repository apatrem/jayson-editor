import type { CSSProperties, FC } from "react";

/**
 * Shared affordance for when LLM features aren't configured (a GUI
 * folder-picker / M8-partial install with no `llm` block or API keys).
 *
 * Used by both the authoring "Generate" control and the comment "Send to AI"
 * action so the two never diverge — the control stays visible but disabled,
 * and this note explains why (ADR-0019 graceful degradation).
 */
export const FINISH_SETUP_HINT = "Finish LLM setup to enable AI features.";

export const FinishSetupHint: FC = () => (
  <p role="note" style={styles.hint}>
    {FINISH_SETUP_HINT}
  </p>
);

const styles: Record<string, CSSProperties> = {
  hint: {
    color: "GrayText",
    fontSize: "0.8125rem",
    margin: 0,
    marginRight: "auto",
  },
};
