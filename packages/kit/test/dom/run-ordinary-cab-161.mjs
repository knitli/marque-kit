// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

// Run the two ordinary-CAB DOM suites against the qualified #159 Node package.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  constants,
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [entryArg, expectedEntry, expectedBinary, mode = 'focused', ...extraArgs] = process.argv.slice(2);
if (
  !entryArg ||
  extraArgs.length !== 0 ||
  basename(entryArg) !== 'marque_wasm.js' ||
  !['focused', 'full'].includes(mode) ||
  !/^[a-f0-9]{64}$/.test(expectedEntry ?? '') ||
  !/^[a-f0-9]{64}$/.test(expectedBinary ?? '')
) {
  throw new Error(
    'usage: node run-ordinary-cab-161.mjs /path/to/marque_wasm.js ENTRY_SHA256 WASM_SHA256 [focused|full]',
  );
}
const entry = resolve(entryArg);
const binary = resolve(dirname(entry), 'marque_wasm_bg.wasm');
if (statSync(entry).size > 256 * 1024 || statSync(binary).size > 64 * 1024 * 1024) {
  throw new Error('WASM package exceeds the evidence-runner bounds');
}
async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
if ((await sha256(entry)) !== expectedEntry || (await sha256(binary)) !== expectedBinary) {
  throw new Error('WASM package does not match the supplied SHA-256 hashes');
}
let selected;
if (mode === 'full') {
  const selectedEntry = process.env.MARQUE_SELECTED_AUDIENCE_WASM;
  const selectedExpected = process.env.MARQUE_SELECTED_AUDIENCE_WASM_SHA256;
  const registry = process.env.MARQUE_SELECTED_AUDIENCE_REGISTRY;
  if (
    !selectedEntry ||
    !registry ||
    !/^[a-f0-9]{64}$/.test(selectedExpected ?? '') ||
    basename(selectedEntry) !== 'marque_wasm.js'
  ) {
    throw new Error('full mode requires the selected-audience WASM, its SHA-256, and its engine register');
  }
  const selectedBinary = resolve(dirname(selectedEntry), 'marque_wasm_bg.wasm');
  if (
    statSync(selectedEntry).size > 256 * 1024 ||
    statSync(selectedBinary).size > 64 * 1024 * 1024 ||
    statSync(registry).size > 2 * 1024 * 1024
  ) {
    throw new Error('selected-audience evidence exceeds the runner bounds');
  }
  const hashes = await Promise.all([sha256(selectedEntry), sha256(selectedBinary), sha256(registry)]);
  if (hashes[1] !== selectedExpected) throw new Error('selected-audience WASM does not match its supplied SHA-256');
  selected = { selectedEntry, selectedBinary, registry, hashes };
}

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const kit = resolve(root, 'packages/kit');
const parent = resolve(kit, 'test/dom/artifacts');
const stage = resolve(parent, 'candidate');
const stagedEntry = resolve(stage, 'marque_wasm.js');
const stagedBinary = resolve(stage, 'marque_wasm_bg.wasm');
const stagedManifest = resolve(stage, 'package.json');
const files = [
  'apps/office-addin/README.md',
  'apps/office-addin/src/ordinary-cab-preview.ts',
  'apps/office-addin/src/ordinary-cab-workspace.ts',
  'apps/office-addin/src/selected-audience-workspace.ts',
  'apps/office-addin/src/selected-audience-wire.ts',
  'apps/office-addin/src/selected-audience-vocabulary.ts',
  'apps/office-addin/src/workspace.ts',
  'apps/office-addin/src/taskpane.ts',
  'packages/core/src/native-cab.ts',
  'packages/core/src/native-wire.ts',
  'packages/core/src/types.ts',
  'packages/kit/vite.config.ts',
  'packages/kit/package.json',
  'packages/kit/test/dom/ordinary-cab-161.test.ts',
  'packages/kit/test/dom/ordinary-cab-preview-adversarial.test.ts',
  'packages/kit/test/dom/ordinary-cab-questions-adversarial.test.ts',
  'packages/kit/test/dom/ordinary-source-evidence-165.test.ts',
  'packages/kit/test/dom/native-office-entry.test.ts',
  'packages/kit/test/dom/selected-audience.test.ts',
  'packages/kit/test/dom/fixtures/ordinary-cab-161.json',
  'packages/kit/test/dom/fixtures/ordinary-cab-basis-161.json',
  'packages/kit/test/dom/fixtures/ordinary-source-link-166.json',
  'packages/kit/test/dom/fixtures/ordinary-source-link-166.json.license',
  'packages/kit/test/dom/run-ordinary-cab-161.mjs',
];
async function sourceHashes() {
  return Promise.all(files.map(async (file) => ({ file, sha256: await sha256(resolve(root, file)) })));
}
function head() {
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (git.status !== 0) throw new Error('could not identify the kit checkout');
  return git.stdout.trim();
}
const base = head();
const before = await sourceHashes();
const createdParent = !existsSync(parent);
if (createdParent) mkdirSync(parent);
try {
  // Refuse to replace anything a previous run or another caller left behind.
  mkdirSync(stage);
} catch (error) {
  if (createdParent) rmdirSync(parent);
  throw error;
}
try {
  copyFileSync(entry, stagedEntry, constants.COPYFILE_EXCL);
  copyFileSync(binary, stagedBinary, constants.COPYFILE_EXCL);
  writeFileSync(stagedManifest, '{"type":"commonjs"}\n', { flag: 'wx' });
  if ((await sha256(stagedEntry)) !== expectedEntry || (await sha256(stagedBinary)) !== expectedBinary) {
    throw new Error('staged WASM package does not match the qualified package');
  }
  process.stdout.write(
    `${JSON.stringify({ kitBaseCommit: base, node: process.version, mode, wasmEntrySha256: expectedEntry, wasmSha256: expectedBinary, selectedAudienceHashes: selected?.hashes, kitFilesSha256: before })}\n`,
  );
  const testArgs =
    mode === 'full'
      ? [resolve(root, 'node_modules/vite-plus/bin/vp'), 'run', '-r', '--no-cache', 'test']
      : [
          resolve(kit, 'node_modules/vite-plus/bin/vp'),
          'test',
          '--run',
          'test/dom/ordinary-cab-161.test.ts',
          'test/dom/ordinary-cab-questions-adversarial.test.ts',
        ];
  const test = spawnSync(process.execPath, testArgs, {
    cwd: mode === 'full' ? root : kit,
    stdio: 'inherit',
    env: { ...process.env, MARQUE_159_WASM: entry },
  });
  if (test.error) throw test.error;
  if (test.status !== 0) throw new Error(`DOM suites failed with status ${test.status}`);
  if (
    (await sha256(entry)) !== expectedEntry ||
    (await sha256(binary)) !== expectedBinary ||
    (await sha256(stagedEntry)) !== expectedEntry ||
    (await sha256(stagedBinary)) !== expectedBinary ||
    JSON.stringify(await sourceHashes()) !== JSON.stringify(before) ||
    head() !== base
  ) {
    throw new Error('evidence source, checkout, or WASM package changed during the run');
  }
  if (selected) {
    const hashes = await Promise.all([
      sha256(selected.selectedEntry),
      sha256(selected.selectedBinary),
      sha256(selected.registry),
    ]);
    if (JSON.stringify(hashes) !== JSON.stringify(selected.hashes))
      throw new Error('selected-audience evidence changed during the run');
  }
  process.stdout.write('Evidence sources and WASM package remained unchanged.\n');
} finally {
  for (const file of [stagedEntry, stagedBinary, stagedManifest]) {
    if (existsSync(file)) unlinkSync(file);
  }
  rmdirSync(stage);
  if (createdParent) rmdirSync(parent);
}
