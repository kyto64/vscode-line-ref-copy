import { execFileSync } from 'node:child_process';

const PROGRAM = String.raw`
import ast, io, json, sys, tokenize
source = sys.stdin.read()
lines = source.splitlines(keepends=True)
starts = [0]
for line in lines:
    starts.append(starts[-1] + len(line))
def offset(row, col):
    return starts[row - 1] + col if row - 1 < len(lines) else starts[-1]
out = []
for tok in tokenize.generate_tokens(io.StringIO(source).readline):
    if tok.type == tokenize.COMMENT:
        s = offset(*tok.start); e = offset(*tok.end)
        out.append({"startLine": tok.start[0], "endLine": tok.end[0], "text": tok.string, "kind": "comment", "apiDoc": False})
tree = ast.parse(source)
def docstring_owner(parent, node, public):
    body = getattr(node, 'body', None)
    if not body or not isinstance(body[0], ast.Expr) or not isinstance(getattr(body[0], 'value', None), ast.Constant) or not isinstance(body[0].value.value, str):
        return
    d = body[0]
    s = offset(d.lineno, d.col_offset); e = offset(d.end_lineno, d.end_col_offset)
    out.append({"startLine": d.lineno, "endLine": d.end_lineno, "text": source[s:e], "kind": "docstring", "apiDoc": public})
docstring_owner(None, tree, False)
for node in tree.body:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        public = not node.name.startswith('_')
        docstring_owner(tree, node, public)
        if isinstance(node, ast.ClassDef):
            for member in node.body:
                if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    docstring_owner(node, member, public and not member.name.startswith('_'))
json.dump(out, sys.stdout)
`;

export function extractPythonComments(text, python = process.env.COMMENT_CHECK_PYTHON ?? 'python3') {
  const stdout = execFileSync(python, ['-c', PROGRAM], { input: text, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout).sort((a, b) => a.startLine - b.startLine);
}
