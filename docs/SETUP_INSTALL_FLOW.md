# Setup Install CLI Flow

**Purpose:** specify the prompts, defaults, validation, and side-effects of `npm run setup:install` — the per-consultant install flow run by devops.

**Audience:** the developer implementing T-73 (privacy notice + install CLI).

**Companion to:** `docs/DECISIONS.md` (D-22, D-23, D-32, D-34), `docs/TAURI_IPC.md` (§2 keychain), `docs/TYPES.md` §10 (AppConfig).

---

## When this runs

Run **once per consultant per machine** during onboarding. Devops walks each consultant through it. After completion:
- A local `config.yaml` exists at the OS config dir.
- LLM API keys are in the OS keychain.
- The consultant can launch the app and open the library.

Not run for app upgrades — the app reads the existing config.

---

## CLI structure

```bash
npm run setup:install
```

Or with all answers pre-filled (for scripted rollout):

```bash
npm run setup:install \
  --name "Jane Smith" \
  --email j.smith@boutique.example \
  --role consultant \
  --cloud-sync-root "$HOME/Dropbox/Consultancy" \
  --shared-folder "$HOME/Dropbox/Consultancy-Shared" \
  --fast-provider anthropic \
  --fast-model claude-haiku-4 \
  --thinking-provider anthropic \
  --thinking-model claude-opus-4-7 \
  --accept-privacy-notice

  # openai-compatible / local providers also require --{fast,thinking}-base-url:
  #   --fast-provider openai-compatible \
  #   --fast-base-url https://api.lightning.ai/v1 \
  #   --fast-model meta-llama/Meta-Llama-3.1-70B-Instruct
```

---

## The flow (interactive mode)

### Step 1 — Welcome + privacy notice

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Jayson Editor — Setup                                                     │
│                                                                         │
│ This wizard configures the app for your machine. ~5 minutes.            │
│                                                                         │
│ Before we start, please review what this app stores locally:            │
│                                                                         │
│   • Your user identity (name, email, role) — in a local config file.    │
│   • Paths to your cloud-sync folder.                                    │
│   • LLM provider + model preferences.                                   │
│                                                                         │
│ LLM API keys are stored in your OS keychain (not in any file).          │
│                                                                         │
│ The app does NOT meter or cap LLM spend and stores no usage/cost data:   │
│ no cost ledger, no token counts. Manage spend via your LLM provider's    │
│ own billing dashboard and account limits (ADR-0019).                     │
│                                                                         │
│ Nothing is sent to consultancy-owned servers. Everything stays on your  │
│ machine + your cloud-sync provider.                                     │
│                                                                         │
│ See docs/privacy-notice.md for the full text.                           │
│                                                                         │
│ Do you accept these terms? [y/N]: _                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

**Default:** N. The consultant must type `y` (and press enter) to proceed. Anything else aborts with code 1.

### Step 2 — Identity

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 1 of 4 — Your identity                                             │
│                                                                         │
│ Your name (for comment attribution):                                    │
│   [Jane Smith]                                                          │
│                                                                         │
│ Your work email:                                                        │
│   [j.smith@boutique.example]                                            │
│                                                                         │
│ Your role:                                                              │
│   (1) Consultant   (default)                                            │
│   (2) Senior consultant                                                 │
│   (3) Admin                                                             │
│   Choice [1]: _                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Defaults:**
- Name: from `git config --global user.name` if available, else from OS user account.
- Email: from `git config --global user.email` if available, else `<os-user>@<hostname>`.
- Role: `consultant` (1).

**Validation:**
- Name: non-empty, max 80 chars.
- Email: must match an `@`-containing pattern (loose RFC 5322 check, not strict).
- Role: must be one of the three.

The derived `initials` field is auto-computed from the first letter of each space-separated name token (max 4 chars) — no prompt for it.

### Step 3 — Cloud-sync paths

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 2 of 4 — Cloud-sync folders                                        │
│                                                                         │
│ Where do you keep your client documents?                                │
│ This should be a folder synced by Dropbox / Google Drive / OneDrive.    │
│                                                                         │
│ Detected candidates (~/Dropbox, ~/Library/Mobile Documents/...):        │
│   (1) ~/Dropbox/Consultancy        (default if exists)                  │
│   (2) ~/Google Drive/Consultancy                                        │
│   (3) ~/OneDrive/Consultancy                                            │
│   (4) Other (enter path)                                                │
│   Choice [1]: _                                                         │
│                                                                         │
│ Where is the shared brand folder?                                       │
│   (1) ~/Dropbox/Consultancy-Shared (default if exists)                  │
│   (2) Other (enter path)                                                │
│   Choice [1]: _                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Defaults:**
- Cloud-sync root: detect Dropbox / iCloud / GDrive / OneDrive folders that exist on disk; offer them in order. Default to the first that's writeable.
- Shared folder: same detection logic; if a folder named `*-Shared` exists alongside, prefer it.

**Validation:**
- Path must exist (rejects with: "Path not found — create the folder first, or pick another.").
- Path must be writeable (rejects with: "Cannot write to that path. Check permissions.").
- Path must NOT contain the app's own data dir (would create a recursion loop).

### Step 4 — LLM provider + models

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 3 of 4 — LLM models                                                │
│                                                                         │
│ Two models are used:                                                    │
│   • Fast/cheap   — default for comment-to-AI requests.                  │
│   • Thinking     — used when you toggle "Thinking" on a comment.        │
│                                                                         │
│ FAST/CHEAP model:                                                       │
│   Provider:                                                             │
│     (1) OpenAI                                                          │
│     (2) Anthropic (default)                                             │
│     (3) Azure OpenAI                                                    │
│     (4) Mistral                                                         │
│     (5) OpenAI-compatible (lightning.ai, OpenRouter, Together, Groq, …) │
│     (6) Local (Ollama / llama.cpp, OpenAI-compatible endpoint)          │
│   Choice [2]: _                                                         │
│                                                                         │
│   [if 5 or 6] Base URL:                                                 │
│     e.g. https://api.lightning.ai/v1   or   http://localhost:11434/v1   │
│                                                                         │
│   Model name:                                                           │
│     [claude-haiku-4]   (suggested default for Anthropic fast)           │
│                                                                         │
│ THINKING model:                                                         │
│   Provider:                                                             │
│     (1) OpenAI                                                          │
│     (2) Anthropic (default)                                             │
│     (3) Azure OpenAI                                                    │
│     (4) Mistral                                                         │
│     (5) OpenAI-compatible                                               │
│     (6) Local                                                           │
│   Choice [2]: _                                                         │
│                                                                         │
│   [if 5 or 6] Base URL: _                                               │
│                                                                         │
│   Model name:                                                           │
│     [claude-opus-4-7]  (suggested default for Anthropic thinking)       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Defaults per provider:**

| Provider | Fast default | Thinking default |
|---|---|---|
| OpenAI | `gpt-4.1-mini` | `gpt-5` |
| Anthropic | `claude-haiku-4` | `claude-opus-4-7` |
| Azure OpenAI | (user-provided deployment name) | (user-provided deployment name) |
| Mistral | `mistral-small-latest` | `mistral-large-latest` |
| OpenAI-compatible | (user-provided; e.g. lightning.ai model id) | (user-provided) |
| Local | (user-provided; e.g. `llama3.1:8b`) | (user-provided; e.g. `llama3.1:70b`) |

**Validation:**
- Provider must be one of the six.
- Model name: non-empty, no whitespace.
- `openai-compatible` and `local` require a base URL — must parse as a valid URL.

### Step 5 — API keys (entered into OS keychain, never written to disk)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Step 4 of 4 — API keys                                                  │
│                                                                         │
│ These will be stored in your OS keychain — NOT in any config file.      │
│                                                                         │
│ FAST/CHEAP model — Anthropic API key:                                   │
│   Paste key: _ (input hidden as you type)                               │
│                                                                         │
│ THINKING model — Anthropic API key:                                     │
│   (Press Enter to reuse the fast-model key)                             │
│   Paste key: _ (input hidden)                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Validation:**
- Key must be non-empty (except `local`, where the key may be empty if the endpoint doesn't require auth — wizard accepts an empty value only when provider is `local`).
- Key format check (per provider; performed by the adapter's `validateKeyFormat`, T-60):
  - Anthropic: starts with `sk-ant-`.
  - OpenAI: starts with `sk-`.
  - Azure: no fixed prefix; skip prefix check.
  - Mistral: no fixed prefix; skip prefix check.
  - OpenAI-compatible: no fixed prefix (varies per vendor — lightning.ai, OpenRouter, etc.); skip prefix check.
  - Local: skip prefix check; empty allowed.
- A test call is made: the wizard calls the provider's "list models" or equivalent low-cost endpoint (for `openai-compatible` and `local`, this is `GET {baseUrl}/models`) to verify the key + endpoint work. **If it fails, the wizard prompts to re-enter** with the error message.

**Reuse:** if the user presses Enter on the thinking-model key prompt, the fast-model key is reused (same provider). If providers differ, no reuse — both keys required.

**Storage:**
```
keychain entry "llm.fast.api-key"     ← fast model's API key
keychain entry "llm.thinking.api-key" ← thinking model's API key (or same as fast)
```

The keychain entries' names are stored in `config.yaml` so the app knows what to fetch.

### Step 6 — Cost limit (with sane default)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Monthly LLM spending cap                                                │
│                                                                         │
│ The app warns at 80% and hard-stops at 100%.                            │
│                                                                         │
│ Cap [50 USD]: _                                                         │
│                                                                         │
│ (You can change this later in Settings.)                                │
└─────────────────────────────────────────────────────────────────────────┘
```

**Default:** 50 USD/month.
**Validation:** must be > 0, < 10000. If user enters 0, ask "Do you really want NO limit? [y/N]" — if yes, store `0` and the limit enforcement is bypassed.

### Step 7 — Summary + confirmation

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Summary                                                                 │
│                                                                         │
│ User                                                                    │
│   Name:           Jane Smith                                            │
│   Email:          j.smith@boutique.example                              │
│   Role:           consultant                                            │
│                                                                         │
│ Paths                                                                   │
│   Cloud sync:     ~/Dropbox/Consultancy                                 │
│   Shared brand:   ~/Dropbox/Consultancy-Shared                          │
│                                                                         │
│ LLM models                                                              │
│   Fast:           anthropic / claude-haiku-4 (key tested ✓)             │
│   Thinking:       anthropic / claude-opus-4-7 (key tested ✓)            │
│                                                                         │
│ Privacy                                                                 │
│   Spend metering: NONE (managed via your LLM provider's billing)        │
│   Telemetry:      NONE                                                  │
│                                                                         │
│ Write this configuration? [Y/n]: _                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Default:** Y. On confirmation:
1. Write `config.yaml` to OS config dir (`~/Library/Application Support/com.consultancy.docsystem/config.yaml` on macOS, `%APPDATA%\com.consultancy.docsystem\config.yaml` on Windows, `$XDG_CONFIG_HOME/docsystem/config.yaml` on Linux). (No cost ledger is created — ADR-0019.)
2. Run a final sanity check: `setup:validate` (see SETUP_PIPELINE.md §2).
3. Print: "Setup complete. Launch the app with `open /Applications/DocumentSystem.app` (or your platform equivalent)."

---

## Configuration file written

```yaml
# ~/Library/Application Support/com.consultancy.docsystem/config.yaml
# (or equivalent per OS)
user:
  name: "Jane Smith"
  email: "j.smith@boutique.example"
  role: "consultant"
  initials: "JS"

paths:
  cloudSyncRoot: "/Users/jane/Dropbox/Consultancy"
  sharedFolder: "/Users/jane/Dropbox/Consultancy-Shared"

llm:
  fastModel:
    provider: "anthropic"
    model: "claude-haiku-4"
    keychainEntry: "llm.fast.api-key"
  thinkingModel:
    provider: "anthropic"
    model: "claude-opus-4-7"
    keychainEntry: "llm.thinking.api-key"

editor:
  reviewMode: "panel"
  autosaveDebounceMs: 2000
```

This must conform to `AppConfigSchema` (`TYPES.md §10`). The wizard validates the constructed object before writing.

---

## Error handling

| Failure | Behavior |
|---|---|
| User cancels at any step (Ctrl+C, "n" at confirmation) | Exit code 1; no partial state written |
| Path doesn't exist | Re-prompt with error message; "Create it?" option |
| Path not writeable | Re-prompt with error message |
| API key validation fails | Re-prompt the key (max 3 attempts before exit) |
| OS keychain write fails | Exit with detailed error (e.g. "On Linux, install libsecret"; on macOS, "Allow keychain access for setup process") |
| Config write fails (rare — disk full or permission) | Exit with detailed error |
| Network down during API key validation | Offer to skip validation (with a warning that the key is unverified) |

---

## Non-interactive mode (for scripted rollout)

If all CLI flags are provided AND `--accept-privacy-notice` is set, the wizard runs non-interactively. API keys are read from environment variables (so they aren't visible in process arguments):

```bash
FAST_API_KEY="sk-ant-..." \
THINKING_API_KEY="sk-ant-..." \
npm run setup:install \
  --name "Jane Smith" \
  --email j.smith@boutique.example \
  --role consultant \
  --cloud-sync-root "/Users/jane/Dropbox/Consultancy" \
  --shared-folder "/Users/jane/Dropbox/Consultancy-Shared" \
  --fast-provider anthropic \
  --fast-model claude-haiku-4 \
  --thinking-provider anthropic \
  --thinking-model claude-opus-4-7 \
  --accept-privacy-notice
```

Each missing required value causes a failure with a clear error pointing at the missing flag.

---

## Migrations (future-proofing)

If the schema for `AppConfig` ever changes:

1. The wizard's `setup:install` always writes the **current** schema version.
2. The app reads the config and runs a one-shot migration if the on-disk version is older. Migrations live in `src/config/migrations/<version>.ts`.
3. Migrations NEVER touch keychain entries — those are stable identifiers.

---

## Re-running setup

Running `setup:install` on a machine with an existing config:

1. Detects the existing config.
2. Shows: "Existing config detected. Update [u] / Reset and start over [r] / Cancel [c]?"
3. **Update mode:** loads the existing config as defaults; consultant edits the steps they want; only changed values are written.
4. **Reset mode:** clears the existing config (warns first); starts fresh.
5. **Cancel mode:** exits without changes.

---

## Acceptance checklist (per T-73)

- [ ] Privacy notice shown before any data is collected.
- [ ] Cannot proceed past privacy notice without affirmative consent.
- [ ] All four steps validate input; rejects bad input with clear errors.
- [ ] API keys never appear in any written file.
- [ ] API keys validated by a live API call (or skip option with warning).
- [ ] Final summary shown before commit; cancellable.
- [ ] `config.yaml` validates against `AppConfigSchema`.
- [ ] Cost ledger SQLite initialized.
- [ ] Re-run mode (update / reset / cancel) works.
- [ ] Non-interactive mode works with all flags + env vars.
- [ ] Wizard exits with code 0 on success, code 1 on cancel/error.
- [ ] Setup wizard accessible from inside the app as "Settings → Re-run setup" for the update-mode path.
