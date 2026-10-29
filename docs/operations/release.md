# Release plan

This document describes **publish preparation** for **Line Ref Copy** (`line-ref-copy`, publisher `kyto64`). 公開は Trusted Publishing で自動化されているが、すべての公開は `release` 環境での kyto の承認を必須とする。

## Current state (2026-10-14)

| Item | Status |
|------|--------|
| Extension id | `line-ref-copy` (`package.json` `name`) |
| Display name | Line Ref Copy |
| Publisher (VS Code Marketplace) | `kyto64` — publisher account exists |
| Open VSX namespace | **Not** created yet |
| Version | `0.1.2`, `preview: true` |
| Icon | `images/icon.svg` (source) → `images/icon.png` (256×256, Marketplace) |
| LICENSE | MIT — yassh (2017) + kyto64 (2026); credited in README |

## Local packaging (no publish)

After `npm ci` and `npm run compile`:

```bash
npx @vscode/vsce ls          # list files in the VSIX
npm run vsce:package         # produces line-ref-copy-0.1.0.vsix
```

`.vscodeignore` trims dev-only paths (tests, docs, rulesync, CI configs). Do not commit `.vsix` artifacts.

Open VSX (`ovsx`) は未対応（namespace 作成後に検討）。

## Marketplace 認証（Trusted Publishing）

- 公開は GitHub Actions（`.github/workflows/publish.yml`）から **Trusted Publishing（OIDC）** で行う。PAT（Personal Access Token）は **もう使わない**。リポジトリにシークレットは保存しない。
- `@vscode/vsce` の `publish --oidc` を使う（4.1.0 以上が必要。`package.json` の devDependencies で固定）。
- 参照: [Publishing Extensions — Secure automated publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

## 自動公開（publish.yml）

- トリガー: タグ `v*` の push、または `workflow_dispatch`（必須入力 `tag`）。どちらも `refs/tags/<tag>` を checkout し、ブランチ HEAD からは公開しない（タグが存在しなければ失敗）。
- job は `environment: release` を使うため、kyto64 の承認が済むまで開始されない。
- 手順: lint → `xvfb-run -a npm test` → compile → ガード → `vsce publish --oidc`。
- 公開前ガード:
  - `package.json` の `version` とタグ名（先頭 `v` を除く）が一致しなければ失敗。
  - Marketplace に同じ version が既にあれば失敗（既存タグの再公開を防ぐ。`vsce publish` 自体も同 version では失敗する）。
- 同時公開は `concurrency`（`cancel-in-progress: false`）で防ぐ。

## 初回セットアップ（kyto が手動で実施）

1. **Marketplace の Trusted Publisher ポリシー登録**: [publisher 管理画面](https://marketplace.visualstudio.com/manage) で publisher `kyto64` → Trusted Publishing → Create:
   - Repository owner: `kyto64`
   - Repository: `vscode-line-ref-copy`
   - Workflow: `publish.yml`
   - Environment: `release`
2. **GitHub environment の作成**: リポジトリの Settings → Environments で `release` を作成し、Required reviewers に `kyto64` を設定する。

## リリース手順

1. version bump と `CHANGELOG.md` 更新の PR をマージする。
2. kyto がタグ `vX.Y.Z` を作成して push する（または Actions から `Publish` を `workflow_dispatch` し、`tag` に既存タグを入力）。
3. `release` 環境で kyto が承認する。
4. `publish.yml` が Marketplace へ公開する。
5. GitHub Release を `CHANGELOG.md` の内容で作成する。

## フォールバック（手動 VSIX アップロード）

Trusted Publishing が使えない場合は、従来どおり手動でアップロードする: `npm run vsce:package` で VSIX を作成し、Marketplace 管理画面からアップロードする。

## Pre-publish checklist

- [ ] kyto explicit approval for the version
- [ ] `CHANGELOG.md` entry for the version
- [ ] `npm run lint` and `xvfb-run -a npm test` green on `master`
- [ ] `npm run vsce:package` succeeds; spot-check `vsce ls`
- [ ] README credits yassh; LICENSE notices intact
- [ ] Regenerate `images/icon.png` from `images/icon.svg` if the artwork changes (`npx -p sharp` one-off; see repo `images/`)

## Post-publish

- Create a GitHub release with notes from `CHANGELOG.md`.
- Monitor [GitHub Issues](https://github.com/kyto64/vscode-line-ref-copy/issues) for regressions.
