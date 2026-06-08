# Examples directory

Worked examples that match the shapes defined in `TYPES.md`. Use these as fixtures, reference patterns, and acceptance-test inputs.

> **Pre-clean-break fixtures:** the DocModel examples below are still YAML
> filenames in the current repository. ADR-0022 requires the clean-break task to
> retarget document fixtures to deterministic JSON before generation-pipeline
> implementation begins. The LLM I/O fixtures are already JSON and are
> unaffected.

## Files

### Valid documents
- **`sample-proposal.yaml`** — complete `kind: document` DocModel exercising 10 of the 15 block types (prose, heading, bullet-list, callout, kpi-cards, chart, timeline, team, image, table).
- **`sample-deck.yaml`** — complete `kind: deck` DocModel exercising 6 slide layouts (cover, agenda, section-divider, kpis, chart-commentary, two-column, closing).

### Invalid documents (each fails validation in a documented way)
- **`invalid/missing-block-id.yaml`** — block without required `id` field.
- **`invalid/unknown-block-type.yaml`** — block with a `type` outside the closed library.
- **`invalid/asset-traversal.yaml`** — asset path uses `..` parent-directory escape (D-10 enforcement).

### LLM I/O fixtures
- **`sample-block-patch.json`** — all three `BlockPatch` shapes (replace, remove, insert-after).
- **`sample-comment-thread.json`** — a Comment with a multi-round thread (instruction → ai-proposal → follow-up → ai-proposal). Demonstrates D-12.
- **`sample-llm-batch-request.json`** — a batched comment-to-AI request with prompt-cached context fields.
- **`sample-llm-batch-response.json`** — the corresponding response, including one `failed` entry to exercise the per-patch validation + retry path (D-13).

## How to use these

### As acceptance-test fixtures (M1, M3, M5)
```typescript
import { validateDocModel } from "../src/schema/validate";
import * as yaml from "yaml";
import * as fs from "fs";

// Valid fixture should parse cleanly
test("sample-proposal validates", () => {
  const raw = fs.readFileSync("examples/sample-proposal.yaml", "utf8");
  const parsed = yaml.parse(raw);
  const result = validateDocModel(parsed);
  expect(result.ok).toBe(true);
});

// Invalid fixtures should fail with the documented error
test("invalid asset-traversal is rejected", () => {
  const raw = fs.readFileSync("examples/invalid/asset-traversal.yaml", "utf8");
  const parsed = yaml.parse(raw);
  const result = validateDocModel(parsed);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors[0].path).toMatch(/blocks\.0\.src/);
    expect(result.errors[0].message).toMatch(/\.\./);
  }
});
```

### As reference patterns for the LLM
The LLM prompts in M3 should include the JSON-structured examples (block patches, comment threads) as few-shot context so the model knows the expected output shapes. Use `sample-block-patch.json` and `sample-comment-thread.json` as the few-shot examples in the system prompt.

### As starting points for new docs
The scaffolding skill (D-15) can use `sample-proposal.yaml` and `sample-deck.yaml` as templates for new documents, filling in placeholders from the consultant's structured questionnaire.

## Conventions for adding new examples

- **Valid** fixtures go in `examples/` at the top level.
- **Invalid** fixtures go in `examples/invalid/` and the filename describes what's wrong (`missing-X.yaml`, `invalid-Y-pattern.yaml`).
- Every invalid fixture must have a header comment specifying the expected `ValidationError` shape — so the test can assert the *exact* failure mode, not just "something failed."
- Use placeholder client names (`Acme Industrial`, `Test Client`) — never real client names, even in tests.
- Use placeholder emails ending in `@example.com` or `@boutique.example`.
