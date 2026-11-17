---
name: spec-lookup
description: |
  Answer questions from repository docs (docs/ first, code when needed).
disable-model-invocation: false
---
# Spec lookup

Answer the user's question using repository specifications.

## Search order

1. `docs/_inventory.md` — find the right doc area
2. Area `index.md` under `docs/product/`, `docs/architecture/`, `docs/operations/`, `docs/development/`
3. Specific markdown files referenced from indexes
4. Source code only when docs are missing or explicitly marked as stale

## Response rules

- Cite file paths for every factual claim from docs.
- If docs and code disagree, state both and note that code is authoritative until docs are updated.
- If unknown, say so and suggest where to document the answer.
