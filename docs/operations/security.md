# Security and supply chain

## Vulnerability reporting

Public policy: [SECURITY.md](../../SECURITY.md) (English). Reports use [GitHub private vulnerability reporting](https://github.com/kyto64/vscode-line-ref-copy/security/advisories/new). This repository is a **fork** of [yassh/vscode-copy-with-line-numbers](https://github.com/yassh/vscode-copy-with-line-numbers); security support applies to the **latest release on the default branch (`master`) only**.

## Dependency updates

[`.github/dependabot.yml`](../../.github/dependabot.yml):

| Ecosystem | Schedule | Grouping |
|-----------|----------|----------|
| `npm` | Weekly | Minor and patch updates grouped |
| `github-actions` | Weekly | Minor and patch updates grouped |

`@types/vscode` is **ignored** for major/minor Dependabot bumps so it stays aligned with `engines.vscode` in `package.json` (manual coordinated bumps).

## GitHub Actions hardening

All workflows under `.github/workflows/`:

- Top-level `permissions: contents: read`
- Job-level least privilege (Scorecard job adds `security-events: write` and `id-token: write` only where needed)
- Third-party actions pinned to **full commit SHAs** with version comments
- `actions/checkout` uses `persist-credentials: false`

| Workflow | Purpose |
|----------|---------|
| `ci.yml` | Build, lint, extension tests |
| `check_rulesync.yaml` | `rulesync generate` + diff `AGENTS.md` / `.agents/` (every PR) |
| `scorecard.yml` | OpenSSF Scorecard (`publish_results: true`) |

## OpenSSF Scorecard

Scheduled weekly (Monday 08:00 UTC) and on pushes to `master`. With `publish_results: true`, scores are sent to the [OpenSSF Scorecard API](https://securityscorecards.dev/) (OIDC via `id-token: write`). `scorecard-action` requires `results_file` and `results_format`, so the workflow writes `results.sarif` (SARIF) on the runner; this workflow does not upload SARIF to GitHub code scanning.
