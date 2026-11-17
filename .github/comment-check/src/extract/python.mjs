import { execFileSync } from 'node:child_process';

const PROGRAM = String.raw`
import ast, io, json, sys, tokenize
source = sys.stdin.read()
out = []
for tok in tokenize.generate_tokens(io.StringIO(source).readline):
    if tok.type == tokenize.COMMENT:
        out.append({"startLine": tok.start[0], "endLine": tok.end[0], "text": tok.string, "kind": "comment", "apiDoc": False})
tree = ast.parse(source)
DEFS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
def is_string_statement(stmt):
    return isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Constant) and isinstance(stmt.value.value, str)
def record(stmt, kind, public):
    text = ast.get_source_segment(source, stmt)
    if text is None:
        raise SyntaxError(f"cannot locate string statement at line {stmt.lineno}")
    out.append({"startLine": stmt.lineno, "endLine": stmt.end_lineno, "text": text, "kind": kind, "apiDoc": public})
def visit_body(owner, body, scope_public, owner_public):
    for index, stmt in enumerate(body):
        if is_string_statement(stmt):
            is_docstring = index == 0 and owner is not None
            record(stmt, "docstring" if is_docstring else "string-comment", is_docstring and owner_public)
        visit_node(stmt, scope_public)
def visit_node(node, scope_public):
    if isinstance(node, DEFS):
        public = scope_public and not node.name.startswith('_')
        inner_scope = public if isinstance(node, ast.ClassDef) else False
        visit_body(node, node.body, inner_scope, public)
        for field in ('decorator_list',):
            for child in getattr(node, field, []):
                visit_node(child, False)
        return
    for field, value in ast.iter_fields(node):
        if isinstance(value, list) and value and all(isinstance(v, ast.stmt) for v in value):
            visit_body(None, value, scope_public, False)
        elif isinstance(value, list):
            for v in value:
                if isinstance(v, ast.AST): visit_node(v, scope_public)
        elif isinstance(value, ast.AST):
            visit_node(value, scope_public)
visit_body(tree, tree.body, True, False)
json.dump(out, sys.stdout)
`;

export function extractPythonComments(text, python = process.env.COMMENT_CHECK_PYTHON ?? 'python3') {
  const stdout = execFileSync(python, ['-c', PROGRAM], { input: text, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout).sort((a, b) => a.startLine - b.startLine);
}
