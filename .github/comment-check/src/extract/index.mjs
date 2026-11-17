import path from 'node:path';
import { extractScriptComments, scriptExtensions } from './script.mjs';
import { extractStyleComments } from './css.mjs';
import { extractHtmlComments } from './html.mjs';
import { extractVueComments } from './vue.mjs';
import { extractYamlComments } from './yaml.mjs';
import { extractPythonComments } from './python.mjs';
import { extractShellComments } from './shell.mjs';

const EXTRACTORS = new Map([
  ...scriptExtensions.map((ext) => [ext, (text, file) => extractScriptComments(text, ext, 0, file)]),
  ['.css', (text) => extractStyleComments(text, 'css')],
  ['.scss', (text) => extractStyleComments(text, 'scss')],
  ['.less', (text) => extractStyleComments(text, 'less')],
  ['.html', (text) => extractHtmlComments(text)],
  ['.htm', (text) => extractHtmlComments(text)],
  ['.vue', (text) => extractVueComments(text)],
  ['.yml', (text) => extractYamlComments(text)],
  ['.yaml', (text) => extractYamlComments(text)],
  ['.py', (text) => extractPythonComments(text)],
  ['.sh', (text) => extractShellComments(text)],
  ['.bash', (text) => extractShellComments(text)],
]);

const NOT_APPLICABLE = new Set(['.md', '.mdx', '.txt', '.lock', '.patch', '.diff', '.snap', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.zip']);

const UNSUPPORTED_CODE = new Set(['.kt', '.kts', '.cs', '.java', '.ps1', '.go', '.rs', '.c', '.h', '.cpp', '.swift', '.ahk', '.gradle', '.astro', '.svelte', '.sass', '.styl']);

const UNCHECKED_CONFIG = new Set(['.toml', '.ini', '.cfg', '.conf', '.properties', '.xml', '.plist', '.env', '.example', '.npmrc', '.editorconfig']);

export function classifyFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (EXTRACTORS.has(ext)) return { status: 'supported', extract: EXTRACTORS.get(ext) };
  if (UNSUPPORTED_CODE.has(ext)) return { status: 'unsupported' };
  if (UNCHECKED_CONFIG.has(ext)) return { status: 'unchecked-config' };
  return { status: NOT_APPLICABLE.has(ext) || ext === '' ? 'not-applicable' : 'unknown' };
}
