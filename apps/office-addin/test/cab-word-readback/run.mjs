// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

// macOS: node run.mjs /absolute/path/to/marque_wasm.js
// Drive installed Word on a private fixture. Evaluate its observations with
// the actual engine. This exercises Apple Events, separately from Office.js.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverWordCabBindings, readWordCabInspection } from '../../src/cab-placement.ts';

const wasm = createRequire(import.meta.url)(resolve(process.argv[2]));
assert.equal(typeof wasm.inspect_cab_placement, 'function');
const script = fileURLToPath(new URL('probe.applescript', import.meta.url));
const scratch = realpathSync(mkdtempSync('/private/tmp/marque-cab-readback-'));
const filename = join(scratch, basename(scratch) + '.docx');
function word(action) {
  // LaunchServices grants Word access to the new fixture without changing
  // the user's active window or asking for access to unrelated directories.
  execFileSync('open', ['-g', '-a', 'Microsoft Word', filename]);
  return execFileSync('osascript', [script, action, filename, basename(filename)], {
    encoding: 'utf8',
    timeout: 180_000,
  }).trim();
}
const sha = (data) => createHash('sha256').update(data).digest('hex');
const text = [
  'SECRET',
  '(U) Synthetic pagination test',
  '(S) Example text.',
  'Classified By: Example Reviewer',
  'Derived From: Example Guide',
  'Declassify On: 20450101',
  '(U) End of synthetic example.',
  'SECRET',
].join('\n');
const documentId = randomUUID();
function readSavedFile() {
  const revision = sha(readFileSync(filename));
  const rows = word('read')
    .split('\n')
    .map((row) => row.split('\t').map(Number));
  assert.equal(sha(readFileSync(filename)), revision, 'file changed during the read');
  assert.equal(rows.length, 3);
  const identity = { source_id: documentId, revision_id: revision, contribution_id: 'body' };
  const target = {
    document_id: documentId,
    revision_id: revision,
    contribution_id: 'body',
    scope_locator: [0, Buffer.byteLength(text)],
  };
  const layout_revision = randomUUID(); // Unique to this fresh, repaginated read.
  const discovery = wasm.inspect_cab_placement(
    text,
    JSON.stringify({
      identity,
      layout_revision,
      bindings: [],
      observations: [],
    }),
  );
  const discovered = discoverWordCabBindings(
    discovery,
    { ownership: 'exclusive', target, face_page: 1 },
    Buffer.byteLength(text),
  );
  assert.ok(discovered);
  const { bindings, labels } = discovered;
  assert.equal(bindings.length, 3);
  const observations = bindings.map(({ face_page, ...binding }, index) => {
    const [from, to, first, last] = rows[index];
    // The fixture is ASCII: Word character offsets and engine byte offsets coincide.
    assert.deepEqual([from, to], [binding.label_span[0], binding.value_span[1]]);
    assert.ok(first >= 1 && last >= first && last <= 2);
    return { ...binding, layout_revision, pages: first === last ? [first] : [first, last] };
  });
  return { request: { identity, layout_revision, bindings, observations }, labels };
}

function inspect(request, labels) {
  const wire = wasm.inspect_cab_placement(text, JSON.stringify(request));
  const result = JSON.parse(wire);
  if (result.status === 'complete') {
    const display = readWordCabInspection(wire, request, request.observations, labels);
    assert.ok(display && !display.incomplete, 'pane rejected the engine placement');
    assert.equal(display.split_group, result.groups[0].placement === 'split_page');
    assert.deepEqual(
      display.fields.map((f) => f.label_kind),
      ['classified_by', 'derived_from', 'declassify_on'],
    );
    assert.deepEqual(
      display.fields.map((f) => f.pages),
      request.observations.map((o) => o.pages),
    );
    assert.ok(display.fields.every((f) => f.face_page === 1));
  }
  return result;
}

try {
  copyFileSync(new URL('fixture.docx', import.meta.url), filename);
  const { request: before, labels: beforeLabels } = readSavedFile();
  const first = inspect(before, beforeLabels);
  assert.equal(first.status, 'complete');
  assert.deepEqual(
    first.fields.map((field) => field.placement),
    ['on_face', 'on_face', 'on_face'],
  );
  assert.equal(first.groups[0].placement, 'on_face');
  assert.equal(word('split'), 'saved');
  const { request: after, labels: afterLabels } = readSavedFile();
  const second = inspect(after, afterLabels);
  assert.equal(second.status, 'complete');
  assert.notEqual(before.identity.revision_id, after.identity.revision_id);
  assert.deepEqual(
    before.bindings.map((b) => b.value_span),
    after.bindings.map((b) => b.value_span),
  );
  assert.deepEqual(
    second.fields.map((field) => field.placement),
    ['on_face', 'on_face', 'off_face'],
  );
  assert.equal(second.groups[0].placement, 'split_page');
  assert.equal(second.groups[0].complete, true);
  const stale = inspect({ ...after, observations: before.observations }, afterLabels);
  assert.deepEqual(
    stale.fields.map((field) => field.placement),
    ['unknown', 'unknown', 'unknown'],
  );
  const staleLayout = inspect({ ...after, layout_revision: randomUUID() }, afterLabels);
  assert.deepEqual(
    staleLayout.fields.map((field) => field.placement),
    ['unknown', 'unknown', 'unknown'],
  );
  console.log(
    JSON.stringify(
      {
        body_sha256: sha(text),
        before: {
          revision: before.identity.revision_id,
          pages: before.observations.map((o) => o.pages),
          placement: first.groups[0].placement,
        },
        after: {
          revision: after.identity.revision_id,
          pages: after.observations.map((o) => o.pages),
          placement: second.groups[0].placement,
        },
        old_revision: stale.fields.map((f) => f.placement),
        old_layout: staleLayout.fields.map((f) => f.placement),
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
