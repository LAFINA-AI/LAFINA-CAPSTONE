import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve('src');
const walk = dir =>
  fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory()
      ? walk(name)
      : /\.tsx?$/.test(name)
      ? [name]
      : [];
  });
const files = walk(root);
const graph = new Map(files.map(file => [file, []]));
const errors = [];
for (const file of files) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['require', 'import'].includes(node.expression.text) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text);
    }
    if (
      ts.isIdentifier(node) &&
      ['fetch', 'XMLHttpRequest', 'WebSocket'].includes(node.text)
    ) {
      errors.push(
        `${path.relative(root, file)}: network global ${
          node.text
        } forbidden in offline foundation`,
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const specifier of imports) {
    if (
      /^(https?:|axios|node:https?$|firebase|@google\/|@google-cloud\/)/.test(
        specifier,
      ) ||
      /(^|\/)(cloud|backend|online|auth|skills)(\/|$)/.test(specifier)
    ) {
      errors.push(`${file}: forbidden dependency ${specifier}`);
    }
    if (
      file.includes(`${path.sep}core${path.sep}domain${path.sep}`) &&
      !specifier.startsWith('./')
    ) {
      errors.push(
        `${file}: domain must remain platform-independent (${specifier})`,
      );
    }
    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(file), specifier);
      const target = [
        base + '.ts',
        base + '.tsx',
        path.join(base, 'index.ts'),
      ].find(candidate => graph.has(candidate));
      if (!target) {
        errors.push(`${file}: unresolved import ${specifier}`);
      } else {
        graph.get(file).push(target);
      }
    }
  }
}
const visited = new Set();
const active = new Set();
function visitGraph(file, chain) {
  if (active.has(file)) {
    errors.push(
      `Import cycle: ${[...chain, file]
        .map(item => path.relative(root, item))
        .join(' -> ')}`,
    );
    return;
  }
  if (visited.has(file)) {
    return;
  }
  active.add(file);
  for (const target of graph.get(file)) {
    visitGraph(target, [...chain, file]);
  }
  active.delete(file);
  visited.add(file);
}
for (const file of files) {
  visitGraph(file, []);
}
const manifest = fs.readFileSync(
  'android/app/src/main/AndroidManifest.xml',
  'utf8',
);
if (
  /android.permission.(INTERNET|RECORD_AUDIO|POST_NOTIFICATIONS|USE_FULL_SCREEN_INTENT|SCHEDULE_EXACT_ALARM)/.test(
    manifest,
  )
) {
  errors.push(
    'Phase 01 release manifest must not request network, mic or alarm permissions',
  );
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `PASS: ${files.length} TypeScript modules; no import cycles, forbidden offline dependencies or premature release permissions.`,
  );
}
