/*
 * AGY-PORT 12: offline-boundary analysis over the TypeScript AST.
 *
 * Adapted from LAFINA scripts/check-architecture.cjs (donor 0d4bbe39). For
 * AGY, "offline leaves" are the modules that must work without the internet
 * (local storage, scheduler, on-device NLU/STT/TTS and native bridges). The
 * analysis follows static imports, re-exports, require() and dynamic import()
 * transitively (type-only imports are erased), and reports every path from an
 * offline leaf to a network API (fetch/WebSocket/XMLHttpRequest, network npm
 * packages) or to an online module (src/cloud, src/sync, src/skills,
 * src/updates).
 *
 * AGY composes its online features (Chat, documents, meetings, cloud speech)
 * outside the leaves: src/ai/chatOrchestrator.ts, src/ai/documentIntent.ts,
 * src/ai/meeting, src/meetings and src/ui. Those are not checked as leaves.
 * If a leaf ever needs an online edge, it must be listed in ONLINE_COMPOSITION
 * as one exact importer -> target pair with a reason; there are no
 * directory-wide or wildcard allowances, and a dynamic import whose specifier
 * is not a string literal is itself a finding. The list is empty today.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const posix = path.posix;

const OFFLINE_LEAF = /^src\/(storage|scheduler|ai\/(nlu|stt|tts|native))\//;
const ONLINE_MODULE = /^src\/(cloud|sync|updates|skills)\//;
const NETWORK_PACKAGE = /^(?:node:)?(?:https?|net|tls|dgram)$|^(?:axios|undici|node-fetch|cross-fetch|ky|socket\.io-client|@react-native-community\/netinfo)$/;
const NETWORK_GLOBALS = ['fetch', 'WebSocket', 'XMLHttpRequest', 'EventSource'];

/** Exact importer -> target edges that compose an online feature on purpose. */
const ONLINE_COMPOSITION = {};

const isErasedImport = node => {
  const clause = node.importClause;
  const named = clause?.namedBindings;
  if (node.isTypeOnly || clause?.isTypeOnly) return true;
  if (named && ts.isNamedImports(named) && !clause.name && named.elements.length > 0 && named.elements.every(item => item.isTypeOnly)) {
    return true;
  }
  if (
    node.exportClause &&
    ts.isNamedExports(node.exportClause) &&
    node.exportClause.elements.length > 0 &&
    node.exportClause.elements.every(item => item.isTypeOnly)
  ) {
    return true;
  }
  return false;
};

/**
 * sources: {"src/x.ts": "...source..."}. Returns the import graph, the files
 * that touch a network API directly, and unresolvable dynamic imports.
 */
function analyzeSources(sources) {
  const graph = new Map();
  const direct = new Map();
  const dynamic = [];
  const resolve = (file, specifier) => {
    if (!specifier.startsWith('.')) return null;
    const base = posix.normalize(posix.join(posix.dirname(file), specifier));
    return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(candidate => candidate in sources) ?? null;
  };
  for (const [file, content] of Object.entries(sources)) {
    const edges = new Map();
    graph.set(file, edges);
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const depend = (specifier, how) => {
      if (NETWORK_PACKAGE.test(specifier)) direct.set(file, `imports network package "${specifier}"`);
      const target = resolve(file, specifier);
      if (target && !edges.has(target)) edges.set(target, how);
    };
    const visit = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        if (!isErasedImport(node)) depend(node.moduleSpecifier.text, 'import');
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression;
        if (ts.isStringLiteral(expression) && !node.isTypeOnly) depend(expression.text, 'import');
      } else if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const isLoader = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require');
        if (isLoader) {
          const argument = node.arguments[0];
          if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
            depend(argument.text, callee.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic import' : 'require');
          } else {
            dynamic.push(`${file}: ${callee.kind === ts.SyntaxKind.ImportKeyword ? 'import()' : 'require()'} with a non-literal specifier`);
          }
        }
        const name = ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && ['global', 'globalThis', 'window'].includes(callee.expression.text)
          ? callee.name.text
          : null;
        if (name && NETWORK_GLOBALS.includes(name)) direct.set(file, `calls ${name}()`);
      } else if (ts.isNewExpression(node)) {
        const callee = node.expression;
        const name = ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && ['global', 'globalThis', 'window'].includes(callee.expression.text)
          ? callee.name.text
          : null;
        if (name && NETWORK_GLOBALS.includes(name)) direct.set(file, `constructs ${name}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return {graph, direct, dynamic};
}

/**
 * Every offline leaf that reaches a network API or an online module through
 * an edge that is not an approved composition. Paths are shortest-first (BFS).
 */
function findViolations(sources, composition = ONLINE_COMPOSITION) {
  const {graph, direct, dynamic} = analyzeSources(sources);
  const approved = new Set(Object.keys(composition));
  const usedApprovals = new Set();
  const violations = [];
  for (const start of [...graph.keys()].sort()) {
    if (!OFFLINE_LEAF.test(start)) continue;
    const previous = new Map([[start, null]]);
    const queue = [start];
    let found = null;
    while (queue.length && !found) {
      const file = queue.shift();
      if (file !== start && ONLINE_MODULE.test(file)) {
        found = [file, 'online module'];
        break;
      }
      if (direct.has(file)) {
        found = [file, direct.get(file)];
        break;
      }
      for (const target of graph.get(file)?.keys() ?? []) {
        const edge = `${file} -> ${target}`;
        if (approved.has(edge)) {
          usedApprovals.add(edge);
          continue;
        }
        if (!previous.has(target)) {
          previous.set(target, file);
          queue.push(target);
        }
      }
    }
    if (found) {
      const chain = [];
      for (let at = found[0]; at; at = previous.get(at)) chain.unshift(at);
      violations.push(`${chain.join(' -> ')} (${found[1]})`);
    }
  }
  const unusedApprovals = [...approved].filter(edge => !usedApprovals.has(edge)).sort();
  return {
    files: graph.size,
    offlineLeaves: [...graph.keys()].filter(file => OFFLINE_LEAF.test(file)).length,
    violations,
    dynamic: dynamic.sort(),
    unusedApprovals,
  };
}

/** Project TypeScript under src only; never .env files or assets. */
function readSources(root) {
  const sources = {};
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (entry.name.startsWith('.env')) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) sources[path.relative(root, full).split(path.sep).join('/')] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(path.join(root, 'src'));
  return sources;
}

module.exports = {analyzeSources, findViolations, readSources, ONLINE_COMPOSITION, OFFLINE_LEAF, ONLINE_MODULE};

if (require.main === module) {
  const result = findViolations(readSources(path.resolve(__dirname, '..')));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.violations.length || result.dynamic.length || result.unusedApprovals.length ? 1 : 0;
}
