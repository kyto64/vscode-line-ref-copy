---
root: true
targets:
  - '*'
description: "Development quality policy (entry point)"
globs:
  - '**/*'
---
# 開発品質ポリシー（Claude Code Cloud 共通）

このリポジトリで実装・修正するセッションは、作業の前にこの節と `.claude/rules/` を読んで従う。ルールが自動で読み込まれない環境でも守れるように、重要な禁止事項はここにも書いてある。正は `.rulesync/rules/`（`quality-policy.md`、`code-quality.md`、`root-cause-first.md`）で、`npm run rules:generate` が `CLAUDE.md`・`AGENTS.md`・`.claude/rules/` を生成する。生成物は手で直さない。詳細と例外の書き方は次の2つにある。

- `.claude/rules/code-quality.md`：コメント規約、テスト、静的解析
- `.claude/rules/root-cause-first.md`：根本原因の特定と修正、エスカレーション

ルールとスキルの内容がぶつかったときは、このリポジトリのルールを優先する。

## 必ず守ること

1. **コメントを足さない。** 何をしているかの説明、処理手順の言い換え、変更履歴、修正理由の言い訳、TODO だけの先送り、ワークアラウンドの正当化は書かない。意図が読みにくければ、命名・関数抽出・責務分離・型・データ構造・制御フローを直す。例外（ライセンス表記、公開 API のドキュメント、`INVARIANT:` / `SECURITY:` / `EXTERNAL:` を付けた制約コメント、ツール向けの指示）だけ許す。例外のコメントを書くときは英語で書く。既存のコメントを一律に消さない。
2. **症状ではなく原因を直す。** 特殊分岐の追加、例外の握りつぶし、過剰なガード、根拠のないリトライや待ち時間、呼び出し側ごとの補正で症状を隠さない。原因がある層を直す。原因が局所的なら局所修正でよく、無関係なコードは書き換えない。
3. **テストで正しさを示す。** バグ修正では、修正前に失敗する回帰テストを先に書く（Red → Green → Refactor）。新機能では正常系に加えて重要な境界と異常系を確かめる。
4. **検査を弱めない。** 期待値を緩める、テストを消す・skip する、lint や型検査を無効化する、閾値を下げる、CI のジョブを外す、のどれもしない。
5. **実行した結果を隠さない。** テスト、静的解析、コメント検査を実行し、コマンド・結果・未実行の理由を PR に書く。走らなかったものを「通った」と書かない。
6. **一時回避が避けられないときは止まる。** 外部の制約で恒久修正ができないなら、黙って回避策を入れず、stopped コメントで理由を書いて止まる（担当 bot が kyto にエスカレーションする）。

## 作業の順番

1. **grilling（実装前に必ず）**：`.claude/skills/grilling/` のスキルを使い、質問ツリーをすべて出して推奨回答で自分で埋める。その Q&A を作業 issue に `Claude Code:` で始まるコメントとして残してから実装に入る。推奨回答で決めきれない分かれ道（仕様の変更、破壊的な変更、承認が要る操作など）があれば実装しない。stopped コメントに質問を書いて止まる。
2. **原因の確認**：バグ・テスト失敗・想定外の挙動では `.claude/skills/systematic-debugging/` に従い、現象・再現条件・根本原因の仮説と検証結果・影響範囲を整理する。
3. **テストを先に**：実装は `.claude/skills/test-driven-development/` に従う。
4. **検証**：このリポジトリの CI と同じテスト・静的解析・コメント検査を実行する。テストは `xvfb-run -a npm test`、静的解析は `npm run compile`（tsc）と `npm run lint`（oxlint）、コメント検査は `node .github/comment-check/src/cli.mjs --base origin/master`（詳細は `.claude/rules/code-quality.md` の「このリポジトリのコマンド」）。

スキル本文にある `superpowers:test-driven-development` は、このリポジトリの `.claude/skills/test-driven-development/` のこと。`superpowers:verification-before-completion` と `superpowers:writing-skills` は入れていないので、代わりに `.claude/rules/root-cause-first.md` の「完了前の検証」に従う。

## 実装報告フォーマット

PR 本文（先頭は `Claude Code:`）に、次をそのまま埋めて書く。

```markdown
## 実装報告
- 対象リポジトリ／PR：
- 問題と根本原因：
- 原因検証の根拠：
- 修正した設計・実装：
- 影響範囲と互換性：
- 追加・更新テスト：
- テスト・静的解析・コメント検査結果：
- コメント例外（なければ「なし」）：
- 未解決事項・制約（なければ「なし」）：
```

grilling の Q&A を残した issue コメントの URL も、PR 本文に書く。
