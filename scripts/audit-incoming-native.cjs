/* Read-only, narrowly extracted upstream pure helpers; no Android/network calls. */
const cp = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const revision = '9c183a20eca2377b5e54f219c5f83460b18af81b';
const sources = [];

function loadPureVariables(file, names) {
  const text = cp.execFileSync('git', ['show', `${revision}:${file}`], {
    encoding: 'utf8',
  });
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const selected = tree.statements.filter(
    node =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(declaration =>
        names.includes(declaration.name.text),
      ),
  );
  if (selected.length !== names.length) {
    throw new Error(`Unexpected helper declarations in ${file}`);
  }
  const input = selected.map(node => node.getText(tree)).join('\n');
  const output = ts.transpileModule(input, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const sandbox = {exports: {}};
  vm.runInNewContext(output, sandbox, {
    timeout: 1000,
    contextCodeGeneration: {strings: false, wasm: false},
  });
  sources.push({
    file,
    sha256: crypto.createHash('sha256').update(text).digest('hex'),
    declarations: names,
  });
  return sandbox.exports;
}

const {detectCallKeyword} = loadPureVariables(
  'src/scheduler/callDispatcher.ts',
  [
    'normalizeCallCommand',
    'editDistance',
    'isNearKeyword',
    'detectCallKeyword',
  ],
);
const {selectOfflineVoice} = loadPureVariables('src/ai/tts/ttsService.ts', [
  'selectOfflineVoice',
]);
const phrases = [
  'acknowledge',
  'do not acknowledge',
  'do not snooze',
  'acknowledge but remind me later',
  'knowledge',
  'snooze for 10 minutes',
];
const javaHash = value =>
  [...value].reduce(
    (hash, character) => (Math.imul(31, hash) + character.charCodeAt(0)) | 0,
    0,
  );
const result = {
  schemaVersion: 1,
  capturedAtUtc: new Date().toISOString(),
  upstreamRevision: revision,
  node: process.version,
  typescript: ts.version,
  scope:
    'Actual upstream pure helper declarations extracted through TypeScript AST; no complete app, database, network, model, audio, AlarmManager or Android execution.',
  sources,
  callCommands: phrases.map(text => ({text, actual: detectCallKeyword(text)})),
  voiceWithoutNetworkFlag: {
    input: [{id: 'unknown-network-flag', language: 'en-US'}],
    actual: selectOfflineVoice([
      {id: 'unknown-network-flag', language: 'en-US'},
    ]),
  },
  javaHashCollision: ['FB', 'Ea'].map(id => ({id, hash: javaHash(id)})),
  limitations: [
    'The hash calculation is the Java String hash algorithm on these ASCII examples; no PendingIntent was registered.',
    'These probes reproduce defects, not passing safety acceptance tests.',
    'Incoming Android builds, native inference and physical-device behavior were NOT RUN by this audit.',
  ],
};
const destination = process.argv[2];
if (destination) {
  fs.writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`, {
    flag: 'wx',
  });
  console.log(`Saved incoming pure-helper audit: ${destination}`);
} else {
  console.log(JSON.stringify(result, null, 2));
}
