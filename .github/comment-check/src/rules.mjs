const MARKER = /^(INVARIANT|SECURITY|EXTERNAL)\s*[:：]\s*([\s\S]*)$/;
const MARKER_ANYWHERE = /\b(INVARIANT|SECURITY|EXTERNAL)\s*[:：]\s*(\S[\s\S]*)$/;
const MIN_REASON_LENGTH = 8;

const LICENSE_START = /SPDX-License-Identifier:|\bCopyright\b|©|\(c\)\s*\d{4}/i;
const LICENSE_BODY = /licen[cs]e|rights reserved|warrant|liab|permission|damage|applicable law|\bAS IS\b|SOFTWARE\.?\s*$|\b(?:MIT|BSD|ISC|Apache|[AL]?GPL|MPL|Unlicense)\b/i;
export const GENERATED = /@generated\b|DO NOT EDIT|auto-?generated/i;
const SUPPRESSION = /\b(?:eslint|oxlint|stylelint|yamllint)[- ]disable|@ts-(?:ignore|expect-error|nocheck)\b|\bnoqa\b|type:\s*ignore|pyright:\s*ignore|mypy:\s*ignore-errors|pylint:\s*disable|pragma:\s*no\s*cover|istanbul\s+ignore|\bc8\s+ignore|\bv8\s+ignore|biome-ignore|deno-lint-ignore|shellcheck\s+disable|hadolint\s+ignore|\bNOLINT(?:NEXTLINE)?\b|NOSONAR|nosemgrep/i;
const DIRECTIVES = [
  /^\/?\s*<reference\s[^<>]*\/>$/,
  /^[@#]__(?:PURE|NO_SIDE_EFFECTS)__$/,
  /^webpack[A-Za-z]+\s*:\s*[^,]+(?:,\s*webpack[A-Za-z]+\s*:\s*[^,]+)*$/,
  /^@vite-ignore$/,
  /^prettier-ignore(?:-start|-end|-attribute(?:\s+[\w-]+)*)?$/,
  /^@jsx(?:ImportSource|Runtime|Frag)?\s+[\w@./-]+$/,
  /^@ts-check$/,
  /^yaml-language-server:\s*\$schema=\S+$/,
  /^-\*-\s*coding[:=]\s*[\w-]+\s*-\*-$|^(?:vim?:\s*set\s+)?(?:file)?(?:en)?coding[:=]\s*[\w-]+$/,
  /^#(?:end)?region\b[^\n]{0,60}$/,
];
const DEFERRAL = /\b(?:TODO|FIXME|HACK|XXX)\b|(?:あと|後)で(?:直|対応|修正|やる|考え|消す|削除)/;
const WORKAROUND = /workaround|ワークアラウンド|回避策|暫定(?:対応|処置|的)|一時的な(?:対応|回避|処置)|とりあえず|\bhack(?:y|ish)?\b/i;
const ACTION_PIN_COMMENT = /^#\s*v?\d+(?:\.\d+)*[\w.+-]*\s*$/;
const ACTION_PIN_LINE = /\buses:\s*\S+@[0-9a-f]{40}\b/;

export function isLicenseLine(line) {
  return LICENSE_START.test(line) || LICENSE_BODY.test(line);
}

export function startsLicenseNotice(text) {
  return LICENSE_START.test(text);
}

export function licenseNoticeLength(lines) {
  return lines.findLastIndex((line) => isLicenseLine(line)) + 1;
}

function isDirective(body) {
  return DIRECTIVES.some((pattern) => pattern.test(body));
}

const PYTHON_STRING = /^[rbuRBU]{0,2}("""|'''|"|')([\s\S]*)\1$/;

export function commentBody(text) {
  let body = text.trim();
  if (body.startsWith('<!--')) body = body.slice(4).replace(/--!?>$/, '');
  else if (body.startsWith('/*')) body = body.replace(/^\/\*+!?/, '').replace(/\*+\/$/, '').split('\n').map((l) => l.replace(/^\s*\*\s?/, '')).join('\n');
  else if (body.startsWith('//')) body = body.split('\n').map((l) => l.replace(/^\s*\/\/+!?\s?/, '')).join('\n');
  else if (body.startsWith('#')) body = body.split('\n').map((l) => l.replace(/^\s*#+\s?/, '')).join('\n');
  else {
    const quoted = body.match(PYTHON_STRING);
    if (quoted) body = quoted[2];
  }
  return body.trim();
}

export function classifyComment(comment, context = {}) {
  if (comment.startLine === 1 && comment.text.startsWith('#!')) return { allowed: true, category: 'directive', message: 'shebang' };
  const body = commentBody(comment.text);
  const marker = body.match(MARKER) ?? body.match(MARKER_ANYWHERE);
  const reasonOk = Boolean(marker) && marker[2].trim().length >= MIN_REASON_LENGTH;

  if (DEFERRAL.test(body)) return { allowed: false, category: 'deferral', message: 'TODO 等で先送りしない。issue にするか、いま直す' };
  if (WORKAROUND.test(body)) return { allowed: false, category: 'workaround', message: 'ワークアラウンドを正当化するコメントは禁止。根本原因を直すか、リーダー bot にエスカレーションする' };
  if (SUPPRESSION.test(body)) {
    return reasonOk
      ? { allowed: true, category: 'suppression-with-reason', message: '検査の無効化。理由付きなので通すが、リーダー bot のレビュー対象' }
      : { allowed: false, category: 'suppression', message: '検査を無効化するコメントは禁止。どうしても要るなら INVARIANT:/SECURITY:/EXTERNAL: で理由を書き、エスカレーションする' };
  }
  if (context.isHeader && startsLicenseNotice(body)) {
    const lines = body.split('\n');
    const trailing = lines.slice(licenseNoticeLength(lines)).filter((line) => line.trim() !== '');
    return trailing.length === 0
      ? { allowed: true, category: 'license', message: '著作権・ライセンス表記（ファイル冒頭）' }
      : { allowed: false, category: 'explanation', message: 'ライセンス表記の後ろに説明を書かない。説明は命名・関数抽出・型で表す' };
  }
  if (context.isHeader && GENERATED.test(body)) {
    return context.generatedHeaderAdded
      ? { allowed: false, category: 'generated-header-added', message: '既存の手書きファイルに生成物ヘッダを足さない。本当に生成物なら .comment-check.json の generated に入れる' }
      : { allowed: true, category: 'generated', message: '生成コードの表記（ファイル冒頭）' };
  }
  if (isDirective(body)) return { allowed: true, category: 'directive', message: 'ツール向けの指示' };
  if (context.lineText && ACTION_PIN_COMMENT.test(comment.text.trim()) && ACTION_PIN_LINE.test(context.lineText)) {
    return { allowed: true, category: 'action-pin', message: 'SHA 固定した Action のバージョン表記' };
  }
  if (marker && MARKER.test(body)) {
    return reasonOk
      ? { allowed: true, category: `constraint:${marker[1].toLowerCase()}`, message: 'マーカー付きの制約コメント' }
      : { allowed: false, category: 'constraint-without-reason', message: `${marker[1]}: の後に、コードで表せない理由を ${MIN_REASON_LENGTH} 文字以上で書く` };
  }
  if (comment.apiDoc) return { allowed: true, category: 'public-api-doc', message: '公開 API のドキュメント' };
  return { allowed: false, category: 'explanation', message: 'コメントを足さず、命名・関数抽出・型で意図を表す。例外に当たるなら INVARIANT:/SECURITY:/EXTERNAL: を付ける' };
}

export const VIOLATIONS_NEVER_INHERITED = new Set(['deferral', 'workaround', 'suppression', 'constraint-without-reason', 'generated-header-added']);

export function inheritsFromHead(category) {
  return category === 'license' || category.startsWith('constraint:');
}
