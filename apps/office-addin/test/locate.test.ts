// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

// locate() against the memo: every span the fixture names lands on the marking it quotes,
// in the paragraph Word will have once the memo is inserted.
// `node --conditions=source --test test/*.test.ts`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Doc } from '@marque/kit-core/types';
import { locate, paragraphAt } from '../src/locate.ts';

const read = (f: string): string => readFileSync(new URL(`../../../fixtures/${f}`, import.meta.url), 'utf8');
const doc = JSON.parse(read('memo.findings.json')) as Doc;
const paragraphs = read('memo.txt').replace(/\n$/, '').split('\n');

for (const f of doc.findings) {
  const a = f.anchor;
  if (!a?.span) continue;
  const at = locate(paragraphs, a.span);
  assert.ok(at, `${f.id}: lands in one paragraph`);
  assert.equal(paragraphAt(paragraphs, a.span[0]), at.paragraph, `${f.id}: the same paragraph either way`);
  if (f.marking?.as_written) assert.equal(at.text, f.marking.as_written.text, `${f.id}: the marking as written`);
  assert.equal(at.nth, 0, `${f.id}: the first of its text in the paragraph`);
}

// Which occurrence: the second "(S)" in a paragraph is nth 1.
assert.deepEqual(locate(['(S) a (S) b'], [6, 9]), { paragraph: 0, text: '(S)', nth: 1 });
// Bytes, not characters: é is two bytes, and the span after it still lands.
assert.deepEqual(locate(['café (S)'], [6, 9]), { paragraph: 0, text: '(S)', nth: 0 });
// A span across the "\n" between paragraphs, or through the middle of a character, is not a place.
assert.equal(locate(['ab', 'cd'], [1, 4]), null);
assert.equal(locate(['é'], [1, 2]), null);
// An empty span is a place with nothing written: where a missing mark goes.
assert.deepEqual(locate(['ab', 'cd'], [3, 3]), { paragraph: 1, text: '', nth: 0 });
console.log('locate: ok');
