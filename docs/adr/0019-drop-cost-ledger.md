# Drop the cost ledger; the app does not meter or cap LLM spend

**Status:** accepted

**Supersedes:** D-14's per-consultant cost-ledger requirement, D-34 (operational
cost-tracking rules), and O-10 (cost-tracking-is-operational resolution). **Revises:** D-32.

## Context

D-14 committed to a per-consultant monthly LLM spend cap (80% warning, 100% hard
stop, admin override), and D-34/O-10 carved out a local SQLite **cost ledger** as
"operationally necessary" to enforce it — under GDPR legitimate interest, storing
only cost-computation fields (no prompt/response content, no behavioral signal),
13-month retention, with View/Wipe/Disable controls and an install-time privacy
disclosure.

The full ledger was scaffolded (TS `src/cost-ledger/*`, a Rust SQLite IPC, a
`Settings → My LLM Spend` view, the `CostLedgerSink` on the LLM client). When the
LLM runtime was activated, we re-examined whether to wire the ledger in and
concluded it isn't worth it for this product:

- **Single trusted internal user.** There is one consultant per install (D-23), and
  projected spend is already in budget (D-14: ~$120–250/mo). The cap protects mainly
  against an accidental runaway loop, not against a person.
- **Complexity.** Activating the ledger meant real Rust SQLite persistence + migration,
  a renderer sink, cap-enforcement, a settings view, prune-on-launch, doc attribution,
  and IPC-row validation — a large surface whose entire payoff is "enforce a $ cap and
  show spend."
- **Disclosure surface.** Even with no content, a persistent local store of *which
  client documents had AI activity and how much* is engagement metadata a consultancy's
  client-confidentiality / infosec review must account for. Removing it lets the app
  state plainly that **no usage or cost data is persisted at all** — a stronger, simpler
  privacy posture.

## Decision

**Remove the cost ledger and the D-14 monthly cap entirely. Jayson Docs does not meter
or cap LLM spend.** Keep the LLM features (authored-block generation, comment-to-AI)
active. Runaway-spend protection is delegated to **provider-side billing alerts /
account limits**; setting up provider/org-level spend controls is a recommended
operational step before rollout, not an app feature.

No usage or model data is persisted anywhere: an `ai-proposal` thread entry keeps only
its patch + timestamp, and the comment model response is `{ results }` only.

## Consequences

- No in-app spend visibility or guardrail; spend is governed externally (provider billing).
- The privacy story simplifies: the install notice and `docs/privacy-notice.md` state
  that no cost/usage data is stored. D-32 reverts to a clean "no telemetry and no
  persisted usage/cost data in v1" (the operational carve-out is no longer needed).
- The scaffolding is deleted from the app. The full prior design and the decisions that
  produced it are preserved in [docs/archive/cost-ledger.md](../archive/cost-ledger.md)
  so the feature can be revived from git history if a future release needs it.
- This is the pre-release/clean-slate moment: there are no installed configs or live
  documents to migrate.
