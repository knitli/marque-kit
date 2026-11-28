// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { empty, record } from '@knitli/marque-kit-core/state';
import { withChoices } from '../../../packages/core/test/choices-doc.ts';
import type { Doc, State } from '@knitli/marque-kit-core/types';
import { written } from '../src/locate.ts';
import { edits, made, undoneSubject } from '../src/write.ts';

void test('Word undo matches one restored layout without issuing an act', () => {
  const read = (name: string) => readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url), 'utf8');
  const doc = withChoices(JSON.parse(read('memo.findings.json')) as Doc);
  const memo = read('memo.txt');
  const text = (state: State) => written(memo, edits(made(doc, state), memo)).text;
  const id = 'f-p4-portion-mark-absent';
  const answered = record(empty(), id, 'answered', { free: '(U)' });
  const state = { ...record(answered, 'f-p3-ownership', 'deferred', null), actSequence: Number.MAX_SAFE_INTEGER };
  const saved = structuredClone(state);
  assert.notEqual(text(state), text(empty()));
  assert.equal(undoneSubject(state, doc.findings, (candidate) => text(candidate) === text(empty()))?.id, id);
  assert.equal(
    undoneSubject(state, doc.findings, () => true),
    null,
    'two matching candidates are ambiguous',
  );
  assert.deepEqual(state, saved);
});
