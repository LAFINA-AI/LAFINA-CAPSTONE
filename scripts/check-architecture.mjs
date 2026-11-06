import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve('src');
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory()
      ? walk(name)
      : /\.tsx?$/.test(name)
      ? [name]
      : [];
  });

const files = walk(root);
const graph = new Map(files.map((file) => [file, []]));
const errors = [];

const FORBIDDEN_SPECIFIER_PATTERNS = [
  {
    pattern: /(^|\/)(businessStore|businessService|CompanyChatScreen|ManagerOverviewScreen|EmployeeTodayScreen|WorkScreen|TeamManagementModal)(\/|$)/,
    reason: 'business dashboard/workspace module is out of student capstone scope',
  },
  {
    pattern: /(^|\/)(gmailService|GmailInboxScreen)(\/|$)/,
    reason: 'Gmail integration is out of student capstone scope',
  },
  {
    pattern: /(^|\/)(pomodoro|flashcards|studynotes|PomodoroContext)(\/|$)/i,
    reason: 'study tools (Pomodoro, Flashcards, Study Notes) are out of scope',
  },
  {
    pattern: /kokoro|af_bella|LafinaTTSModule/i,
    reason: 'Kokoro 82M is replaced by react-native-tts',
  },
];

// AGY-PORT 04: assistant writes are reviewed. The unreviewed end-to-end
// helper is test-only, and the direct executor is reachable only from its own
// module, the NLU barrel and the orchestrator's read-only route.
const UNREVIEWED_WRITERS = [
  {
    name: 'processAndExecuteIntent',
    allowed: new Set(['ai/nlu/intentService.ts']),
  },
  {
    name: 'executeNluAction',
    allowed: new Set([
      'ai/nlu/actionExecutor.ts',
      'ai/nlu/intentService.ts',
      'ai/nlu/index.ts',
      'ai/chatOrchestrator.ts',
    ]),
  },
];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).split(path.sep).join('/');
  for (const writer of UNREVIEWED_WRITERS) {
    if (
      !writer.allowed.has(relative) &&
      new RegExp(`\\b${writer.name}\\b`).test(content)
    ) {
      errors.push(
        `${relative}: references ${writer.name}, which writes without a review (AGY-PORT 04)`,
      );
    }
  }
  if (/kokoro-v0_19|af_bella\.bin|LafinaTTSModule/.test(content)) {
    errors.push(
      `${path.relative(root, file)}: references forbidden Kokoro 82M TTS artifact or module`,
    );
  }

  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = [];
  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const isTypeOnly = Boolean(node.importClause?.isTypeOnly);
      imports.push({ specifier: node.moduleSpecifier.text, isTypeOnly });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const isTypeOnly = Boolean(node.isTypeOnly);
      imports.push({ specifier: node.moduleSpecifier.text, isTypeOnly });
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['require', 'import'].includes(node.expression.text) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({ specifier: node.arguments[0].text, isTypeOnly: false });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);

  for (const { specifier, isTypeOnly } of imports) {
    for (const rule of FORBIDDEN_SPECIFIER_PATTERNS) {
      if (rule.pattern.test(specifier)) {
        errors.push(
          `${path.relative(root, file)}: forbidden import "${specifier}" (${rule.reason})`,
        );
      }
    }

    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(file), specifier);
      if (/\.(png|jpg|jpeg|svg|onnx|bin|gguf|json)$/.test(specifier)) {
        if (!fs.existsSync(base)) {
          errors.push(`${path.relative(root, file)}: missing file ${specifier}`);
        }
        continue;
      }
      const target = [
        base + '.ts',
        base + '.tsx',
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
      ].find((candidate) => graph.has(candidate));
      if (!target) {
        errors.push(`${path.relative(root, file)}: unresolved import ${specifier}`);
      } else if (!isTypeOnly) {
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
        .map((item) => path.relative(root, item))
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
const allowedPermissions = new Set([
  'INTERNET',
  'ACCESS_NETWORK_STATE',
  'POST_NOTIFICATIONS',
  'SCHEDULE_EXACT_ALARM',
  'USE_EXACT_ALARM',
  'USE_FULL_SCREEN_INTENT',
  'RECEIVE_BOOT_COMPLETED',
  'VIBRATE',
  'RECORD_AUDIO',
  'WAKE_LOCK',
  'FOREGROUND_SERVICE',
  'FOREGROUND_SERVICE_MICROPHONE',
  'REQUEST_INSTALL_PACKAGES',
]);
for (const [, permission] of manifest.matchAll(
  /<uses-permission\s+android:name="android\.permission\.([A-Z_]+)"/g,
)) {
  if (!allowedPermissions.has(permission)) {
    errors.push(`Unapproved Android permission in manifest: ${permission}`);
  }
}

// AGY-PORT 12: offline leaves must not reach the network or an online module,
// transitively, except through an exact approved composition edge.
const { findViolations, readSources } = createRequire(import.meta.url)(
  './offline-boundary.cjs',
);
const boundary = findViolations(readSources(path.resolve('.')));
for (const violation of boundary.violations) {
  errors.push(`Offline boundary: ${violation}`);
}
for (const finding of boundary.dynamic) {
  errors.push(`Unchecked dynamic import: ${finding}`);
}
for (const edge of boundary.unusedApprovals) {
  errors.push(`Stale online-composition approval (edge no longer exists): ${edge}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `PASS: ${files.length} TypeScript modules checked; 0 import cycles, 0 forbidden business/Gmail/study-tool/Kokoro dependencies; ${boundary.offlineLeaves} offline leaves reach no network API or online module (transitive, dynamic imports included).`,
  );
}
