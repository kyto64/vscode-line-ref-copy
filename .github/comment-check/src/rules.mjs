const MARKER = /^(INVARIANT|SECURITY|EXTERNAL)\s*[:：]\s*([\s\S]*)$/;
const MARKER_ANYWHERE = /\b(INVARIANT|SECURITY|EXTERNAL)\s*[:：]\s*(\S[\s\S]*)$/;
const MIN_REASON_LENGTH = 8;

const LICENSE = /SPDX-License-Identifier:|\bCopyright\b|©|\(c\)\s*\d{4}/i;
const LICENSE_CONTINUATION = /\blicensed under\b|all rights reserved|\bwarranty\b|\bredistribution\b/i;
const GENERATED = /@generated\b|DO NOT EDIT|auto-?generated/i;
const SUPPRESSION = /\b(?:eslint|oxlint)-disable|@ts-(?:ignore|expect-error|nocheck)\b|\bnoqa\b|type:\s*ignore|pylint:\s*disable|istanbul\s+ignore|\bc8\s+ignore|\bv8\s+ignore|biome-ignore|deno-lint-ignore|shellcheck\s+disable|NOSONAR|nosemgrep/i;
const DIRECTIVE = /^\/?\s*<reference\s|[@#]__PURE__|[@#]__NO_SIDE_EFFECTS__|webpackChunkName|@vite-ignore|prettier-ignore|@jsx(?:ImportSource|Runtime|Frag)?\b|@ts-check\b|yaml-language-server:|-\*-\s*coding[:=]|^\s*#region\b|^\s*#endregion\b/;
const DEFERRAL = /\b(?:TODO|FIXME|HACK|XXX)\b|あとで|後で直す/;
const WORKAROUND = /workaround|ワークアラウンド|回避策|暫定|一時的|とりあえず|hack/i;
const ACTION_PIN_COMMENT = /^#\s*v?\d+(?:\.\d+)*[\w.+-]*\s*$/;
const ACTION_PIN_LINE = /\buses:\s*\S+@[0-9a-f]{40}\b/;

export function commentBody(text) {
  let body = text.trim();
  if (body.startsWith('<!--')) body = body.slice(4).replace(/--!?>$/, '');
  else if (body.startsWith('/*')) body = body.replace(/^\/\*+!?/, '').replace(/\*+\/$/, '').split('\n').map((l) => l.replace(/^\s*\*\s?/, '')).join('\n');
  else if (body.startsWith('//')) body = body.split('\n').map((l) => l.replace(/^\s*\/\/+!?\s?/, '')).join('\n');
  else if (body.startsWith('#')) body = body.split('\n').map((l) => l.replace(/^\s*#+\s?/, '')).join('\n');
  else if (/^[rbuRBU]{0,2}("""|''')/.test(body)) body = body.replace(/^[rbuRBU]{0,2}("""|''')/, '').replace(/("""|''')$/, '');
  return body.trim();
}

function isLicenseLine(line) {
  return !DEFERRAL.test(line) && !WORKAROUND.test(line) && (LICENSE.test(line) || LICENSE_CONTINUATION.test(line));
}

export function classifyComment(comment, context = {}) {
  if (comment.startLine === 1 && comment.text.startsWith('#!')) return { allowed: true, category: 'directive', message: 'shebang' };
  const body = commentBody(comment.text);
  const marker = body.match(MARKER) ?? body.match(MARKER_ANYWHERE);
  const reasonOk = marker && marker[2].trim().length >= MIN_REASON_LENGTH;

  if (SUPPRESSION.test(body)) {
    return reasonOk
      ? { allowed: true, category: 'suppression-with-reason', message: '検査の無効化。理由付きなので通すが、リーダー bot のレビュー対象' }
      : { allowed: false, category: 'suppression', message: '検査を無効化するコメントは禁止。どうしても要るなら INVARIANT:/SECURITY:/EXTERNAL: で理由を書き、エスカレーションする' };
  }
  if (LICENSE.test(body)) {
    const unrelated = body.split('\n').filter((line) => line.trim() && !isLicenseLine(line));
    if (unrelated.length === 0) return { allowed: true, category: 'license', message: '著作権・ライセンス表記' };
    return classifyComment({ ...comment, text: unrelated.map((line) => `// ${line}`).join('\n') }, { ...context, lineText: undefined });
  }
  if (GENERATED.test(body)) return { allowed: true, category: 'generated', message: '生成コードの表記' };
  if (DIRECTIVE.test(body)) return { allowed: true, category: 'directive', message: 'ツール向けの指示' };
  if (context.lineText && ACTION_PIN_COMMENT.test(comment.text.trim()) && ACTION_PIN_LINE.test(context.lineText)) {
    return { allowed: true, category: 'action-pin', message: 'SHA 固定した Action のバージョン表記' };
  }
  if (marker && body.match(MARKER)) {
    return reasonOk
      ? { allowed: true, category: `constraint:${marker[1].toLowerCase()}`, message: 'マーカー付きの制約コメント' }
      : { allowed: false, category: 'constraint-without-reason', message: `${marker[1]}: の後に、コードで表せない理由を ${MIN_REASON_LENGTH} 文字以上で書く` };
  }
  if (comment.apiDoc) return { allowed: true, category: 'public-api-doc', message: '公開 API のドキュメント' };
  if (DEFERRAL.test(body)) return { allowed: false, category: 'deferral', message: 'TODO 等で先送りしない。issue にするか、いま直す' };
  if (WORKAROUND.test(body)) return { allowed: false, category: 'workaround', message: 'ワークアラウンドを正当化するコメントは禁止。根本原因を直すか、リーダー bot にエスカレーションする' };
  return { allowed: false, category: 'explanation', message: 'コメントを足さず、命名・関数抽出・型で意図を表す。例外に当たるなら INVARIANT:/SECURITY:/EXTERNAL: を付ける' };
}
