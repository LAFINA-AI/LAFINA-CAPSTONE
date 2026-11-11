// Offline only: derive provider contracts from the mobile allowlist. No secrets or network.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/ai/voiceActions/actionRegistry.ts'), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const loaded = {exports: {}};
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const tools = loaded.exports.REGISTERED_TOOLS;
assert(tools.length > 0);
assert.equal(new Set(tools.map(t => t.name)).size, tools.length);
for (const tool of tools) {
  assert.match(tool.name, /^[a-z][a-z0-9_]+$/);
  assert.equal(tool.parameters.type, 'object');
  for (const key of tool.parameters.required || []) assert(key in tool.parameters.properties);
}
const schema = tool => ({...tool.parameters, additionalProperties: false});
const deepseek = tools.map(tool => ({type: 'function', function: {
  name: tool.name, description: tool.description, parameters: schema(tool),
}}));
const client = tools.map(tool => ({type: 'client', name: tool.name,
  description: tool.description, parameters: schema(tool),
  expects_response: true, response_timeout_secs: 30,
}));
const grouped = deepseek.find(t => t.function.name === 'prepare_multi_action');
assert(grouped, 'Grouped tool must remain in the deployed allowlist.');
assert.equal(grouped.function.parameters.properties.items.type, 'array');
assert(grouped.function.parameters.properties.items.items.properties.title);
const output = {schemaVersion: 1, source: 'src/ai/voiceActions/actionRegistry.ts',
  clientEventsToAdd: ['client_tool_call'], elevenlabsClientTools: client, deepseekTools: deepseek};
const body = JSON.stringify(output, null, 2) + '\n';
const target = path.join(__dirname, 'tool-contract.json');
if (process.argv.includes('--check')) assert.equal(fs.readFileSync(target, 'utf8'), body, 'Contract drift: regenerate and review.');
else fs.writeFileSync(target, body);
console.log(`PASS: ${tools.length} unique tools; flat grouped schema; ${process.argv.includes('--check') ? 'contract matches' : 'contract generated'}; no network used.`);
