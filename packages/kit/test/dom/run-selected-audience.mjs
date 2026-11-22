// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

// Run the selected-audience DOM suite against an explicitly fingerprinted Node WASM package.
import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const [entryArg, expected, registryArg, mode = 'full'] = process.argv.slice(2);
if (!entryArg || !/^[a-f0-9]{64}$/.test(expected ?? '') || !registryArg || !['full', 'mismatch'].includes(mode)) {
  throw new Error(
    'usage: node run-selected-audience.mjs /path/to/marque_wasm.js EXPECTED_WASM_SHA256 /path/to/engine/values.rs [full|mismatch]',
  );
}
const entry = resolve(entryArg);
const registry = resolve(registryArg);
if (basename(entry) !== 'marque_wasm.js') throw new Error('expected the Node WASM package entry');
const binary = resolve(dirname(entry), 'marque_wasm_bg.wasm');
if (
  statSync(binary).size > 64 * 1024 * 1024 ||
  statSync(entry).size > 256 * 1024 ||
  statSync(registry).size > 2 * 1024 * 1024
) {
  throw new Error('WASM package exceeds the evidence-runner bounds');
}
async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
const binaryHash = await sha256(binary);
const entryHash = await sha256(entry);
const registryHash = await sha256(registry);
if (binaryHash !== expected) throw new Error('WASM package does not match the expected SHA-256');
const wasm = createRequire(import.meta.url)(entry);
if (typeof wasm.evaluate_selected_audience !== 'function') {
  throw new Error('WASM package does not provide the selected-audience operation');
}
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const kit = resolve(root, 'packages/kit');
const files = [
  'apps/office-addin/src/selected-audience-wire.ts',
  'apps/office-addin/src/selected-audience-vocabulary.ts',
  'apps/office-addin/src/selected-audience-workspace.ts',
  'apps/office-addin/src/workspace.ts',
  'apps/office-addin/src/taskpane.ts',
  'apps/office-addin/README.md',
  'apps/office-addin/test/selected-audience-wire.test.ts',
  'fixtures/extract-selected-audience-vocabulary.py',
  'packages/kit/test/dom/selected-audience.test.ts',
  'packages/kit/test/dom/run-selected-audience.mjs',
];
const filesHashed = {};
for (const file of files) filesHashed[file] = await sha256(resolve(root, file));
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
if (git.status !== 0) throw new Error('could not identify the kit checkout');
console.log(
  JSON.stringify({
    kitBaseCommit: git.stdout.trim(),
    node: process.version,
    wasmEntry: entry,
    wasmEntrySha256: entryHash,
    wasmSha256: binaryHash,
    mode,
    engineRegistry: registry,
    engineRegistryFileSha256: registryHash,
    kitFilesSha256: filesHashed,
  }),
);
const test = spawnSync(
  process.execPath,
  [
    resolve(kit, 'node_modules/vite-plus/bin/vp'),
    'test',
    '--run',
    'test/dom/selected-audience.test.ts',
    ...(mode === 'mismatch' ? ['-t', 'rejects an older actual WASM package'] : []),
  ],
  {
    cwd: kit,
    stdio: 'inherit',
    env: {
      ...process.env,
      MARQUE_SELECTED_AUDIENCE_WASM: entry,
      MARQUE_SELECTED_AUDIENCE_WASM_SHA256: binaryHash,
      MARQUE_SELECTED_AUDIENCE_REGISTRY: registry,
    },
  },
);
if (test.error) throw test.error;
if (test.status !== 0) process.exit(test.status ?? 1);
for (const file of files) {
  if ((await sha256(resolve(root, file))) !== filesHashed[file]) {
    throw new Error(`evidence source changed during the run: ${file}`);
  }
}
if (
  (await sha256(binary)) !== binaryHash ||
  (await sha256(entry)) !== entryHash ||
  (await sha256(registry)) !== registryHash
) {
  throw new Error('WASM package or engine register changed during the run');
}
const finalGit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
if (finalGit.status !== 0 || finalGit.stdout.trim() !== git.stdout.trim()) {
  throw new Error('kit checkout changed during the run');
}
console.log('Evidence sources and WASM package remained unchanged.');
