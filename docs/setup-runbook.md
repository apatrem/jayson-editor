# Setup Runbook

## Purpose

This runbook lets a devops admin set up Jayson Docs for a new consultancy install in roughly one hour of hands-on devops admin clock time, **excluding** LLM-call latency, human review time for proposed brand tokens, and human review time for proposed Brand blocks. A real-world install with 5–15 Brand-block proposals plus a careful brand review can easily run 2–3 wall-clock hours; the one-hour figure is the floor, not the ceiling.

The setup flow turns curated demo files into:

- A reviewed shared `brand.yaml`.
- Optional reviewed Brand blocks in `generated-blocks/active/` (Tier 2 per ADR-0004).
- A per-consultant local config and OS-keychain LLM credentials.

## Prerequisites

- Node 20+ and npm 10+ installed.
- Rust toolchain installed for Tauri validation.
- Repository checked out at the release commit to install.
- LLM API credentials available to devops.
- A cloud-synced shared folder chosen for the consultancy, for example `~/Consultancy-Shared/`.
- A cloud-synced client-documents folder chosen for each consultant.
- 3-10 curated demo files from the consultancy in DOCX, PPTX, or PDF format.

Before using demo files, remove client-confidential names and content that are not needed to infer brand identity or reusable layout patterns. The setup pipeline sends extracted demo analysis to the LLM for brand extraction and catalogue comparison.

## One-Time Consultancy Setup

### 1. Prepare Inputs

Create an input folder:

```bash
mkdir -p /tmp/docsystem-demos
```

Copy the curated demo files into that folder. Keep filenames descriptive enough for review, for example:

```text
/tmp/docsystem-demos/
  board-readout.pptx
  proposal-template.docx
  audit-report.pdf
```

### 2. Run Demo Scan

Run the setup scan:

```bash
npm run setup:scan-demos -- --input /tmp/docsystem-demos --output /tmp/docsystem-setup-output
```

Expected outputs:

- `/tmp/docsystem-setup-output/demo-analysis.json`
- `/tmp/docsystem-setup-output/brand.draft.yaml`
- `/tmp/docsystem-setup-output/catalogue-diff.json`
- `/tmp/docsystem-setup-output/setup-report.md`
- `/tmp/docsystem-setup-output/generated-blocks/pending/` when new blocks are proposed

If the command fails, stop and fix the reported parse, schema, or lint error before continuing.

### 3. Review Brand Draft

Open `/tmp/docsystem-setup-output/setup-report.md` and `/tmp/docsystem-setup-output/brand.draft.yaml`.

Confirm with the consultancy:

- Consultancy name, short name, and confidentiality notice.
- Logo paths and shared asset locations.
- Brand colors and semantic color references.
- Fonts, typography scale, spacing, page, and deck settings.
- Chart defaults.

Edit `brand.draft.yaml` directly if the LLM inferred an incorrect value. Do not invent missing brand values. Use `TBD` and flag the item for consultancy review.

When approved:

```bash
mkdir -p ~/Consultancy-Shared
cp /tmp/docsystem-setup-output/brand.draft.yaml ~/Consultancy-Shared/brand.yaml
```

### 4. Review Brand Blocks

If `/tmp/docsystem-setup-output/generated-blocks/pending/` is empty, skip this step.

For each proposed Brand block:

- Confirm no Standard block can express the observed pattern.
- Review schema, renderer, TipTap node, and test files.
- Confirm generated code uses only the scaffolded surface and approved imports.
- Confirm there is no `dangerouslySetInnerHTML`, `eval`, `Function`, `fetch`, `XMLHttpRequest`, direct CSS injection, browser-global access, or hard-coded brand values.
- Confirm generated tests describe a valid and invalid fixture for the block.

Run validation:

```bash
npm run setup:validate -- \
  --shared ~/Consultancy-Shared \
  --generated-blocks /tmp/docsystem-setup-output/generated-blocks/pending
```

For each approved block, update the metadata header with reviewer name and date, then move the whole block folder into the app's active generated-block folder:

```bash
mkdir -p generated-blocks/active
mv /tmp/docsystem-setup-output/generated-blocks/pending/<block-folder> generated-blocks/active/
```

Leave rejected blocks in `pending/` or delete them from the setup-output folder. Never move an unreviewed Brand block into `active/`.

### 5. Validate Shared Install State

Run:

```bash
npm run setup:validate -- \
  --shared ~/Consultancy-Shared \
  --generated-blocks generated-blocks/active
```

That command checks the runtime install state — the approved `brand.yaml`, every approved Brand block, and the cross-references between them.

Then, **inside the repository checkout** (not the shared folder), run:

```bash
bash scripts/verify-gates.sh
```

This is the dev-loop gate runner (tsc + lint + tests). It validates that the **repository checkout** the consultancy will ship from is internally consistent — it does NOT re-validate the shared folder. Both checks must pass before configuring consultant machines.

## Per-Consultant Machine Setup

Run on each consultant's machine:

```bash
npm run setup:install
```

The wizard asks for:

- Name, email, and role.
- Client document cloud-sync folder.
- Shared brand folder.
- Fast and thinking LLM provider/model choices.
- API keys, stored in the OS keychain.

The consultant must accept the privacy notice before setup writes config. The notice explains that no telemetry is collected and that no usage/cost data is persisted (the cost ledger was removed — ADR-0019).

For scripted rollout, read the keys interactively so they never enter shell history:

```bash
read -rs -p "Fast API key: " FAST_API_KEY; echo
read -rs -p "Thinking API key: " THINKING_API_KEY; echo
export FAST_API_KEY THINKING_API_KEY

npm run setup:install -- \
  --name "Jane Smith" \
  --email j.smith@boutique.example \
  --role consultant \
  --cloud-sync-root "$HOME/Dropbox/Consultancy" \
  --shared-folder "$HOME/Consultancy-Shared" \
  --fast-provider anthropic \
  --fast-model claude-haiku-4 \
  --thinking-provider anthropic \
  --thinking-model claude-opus-4-7 \
  --monthly-cap-usd 50 \
  --accept-privacy-notice

unset FAST_API_KEY THINKING_API_KEY
```

`read -rs` suppresses echo so the typed key never appears on the terminal; the keys live in the environment only for the lifetime of the `npm run setup:install` process and are unset immediately after. **Never** prefix the command with `FAST_API_KEY="..." THINKING_API_KEY="..." npm run ...` — that form ends up in `~/.bash_history` / `~/.zsh_history` on shared machines and is hard to scrub.

## Rollback

If validation fails partway through, back the shared state out before re-running. The pieces written by this runbook are all on disk and reversible by hand.

### Rollback after step 3 (brand approved + copied)

```bash
# Remove the approved brand from the shared folder.
rm ~/Consultancy-Shared/brand.yaml
# (Optional) wipe the setup-output folder so the next run starts clean.
rm -rf /tmp/docsystem-setup-output
```

### Rollback after step 4 (some Brand blocks moved into active/)

```bash
# Identify blocks moved this run and move them back to pending/ for review.
# Replace <block-folder> with the folder name reported in step 4 output.
mkdir -p /tmp/docsystem-setup-output/generated-blocks/pending
mv generated-blocks/active/<block-folder> /tmp/docsystem-setup-output/generated-blocks/pending/

# After moving all this-run blocks back, re-run validation:
npm run setup:validate -- \
  --shared ~/Consultancy-Shared \
  --generated-blocks generated-blocks/active
```

Do not blanket-delete `generated-blocks/active/` — earlier installs may have approved blocks there that you must not lose. Only move back the folders this run added.

### Rollback after a failed per-consultant install

```bash
# Per-consultant config lives in the app config directory. Remove the
# config file; the wizard will recreate it on the next run.
# macOS:   ~/Library/Application Support/com.consultancy.docsystem/config.yaml
# Windows: %APPDATA%\com.consultancy.docsystem\config.yaml
# Linux:   ~/.config/docsystem/config.yaml (or $XDG_CONFIG_HOME/docsystem/)

# Also clear keychain entries (macOS example — adjust per OS):
security delete-generic-password -s docsystem -a llm.fast.api-key || true
security delete-generic-password -s docsystem -a llm.thinking.api-key || true
```

## First-Launch Notes (Unsigned Installers)

Until T-108 (code signing) lands, installers are unsigned on macOS and Windows. The first launch will trigger OS protection prompts:

- **macOS Gatekeeper:** opening the `.dmg` will show "Jayson Docs can't be opened because it is from an unidentified developer." Right-click the `.app` in Finder → **Open** → confirm in the dialog. macOS then remembers the choice. Do not bypass globally with `sudo spctl --master-disable` — that weakens system-wide security for one app.
- **Windows SmartScreen:** Microsoft Defender SmartScreen shows "Windows protected your PC." Click **More info** → **Run anyway**. SmartScreen also remembers the per-binary choice.
- **Linux AppImage:** mark executable (`chmod +x Jayson\ Docs-*.AppImage`); no Gatekeeper-equivalent prompt.

Document this in the consultancy onboarding email so consultants know it's expected. Once T-108 ships, both prompts disappear and this section can be removed from the runbook.

## Verification Checklist

On each consultant machine:

- `config.yaml` exists in the app config directory.
- LLM API keys are present in the OS keychain and absent from `config.yaml`.
- `~/Consultancy-Shared/brand.yaml` validates.
- The app opens and shows the library.
- A sample proposal and sample deck validate and render.

## Troubleshooting

- **Demo scan fails:** inspect the named input file and rerun with a smaller set of demos.
- **Brand schema fails:** edit `brand.draft.yaml` to match `brand.example.yaml`, then rerun validation.
- **Large number of Brand blocks proposed (≥ 20):** stop and escalate to developer review (ADR-0004 removes the hard cap but flags unusually large proposals).
- **Brand block lint fails:** reject the block or regenerate after fixing the scaffold. Do not hand-edit unsafe generated code into `active/`.
- **Path validation fails during install:** create the selected folder or choose a writable cloud-sync folder outside the app config directory.
- **LLM endpoint check fails:** verify provider, base URL, model name, and API key.

## Handoff

Record for the consultancy:

- Shared folder path.
- Approved brand file location.
- Brand blocks approved and reviewer/date.
- LLM providers and model names, not API keys.
- Monthly cap policy.
- Any `TBD` brand values or rejected Brand block proposals.

Do not record API keys, prompt contents, response contents, or cost-ledger rows in the handoff notes.
