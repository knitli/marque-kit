// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

// The pure half of src/help.js against the vocabulary fixture, and every
// citation the memo uses against the manual slices.
// `node test/help.test.js`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { entry, answer, citation, hasTip, type Answer } from '../src/help.ts';
import type { Citation, Doc, Manual, Vocab } from '@knitli/marque-kit-core/types';

const load = <T>(f: string): T =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/${f}`, import.meta.url), 'utf8')) as T;
const vocab = load<Vocab>('memo.vocab.json'),
  manual = load<Manual>('memo.manual.json'),
  memo = load<Doc>('memo.findings.json');
/** The answer, as the kind the test expects: anything else fails here. */
const as = <K extends Answer['kind']>(a: Answer | null, kind: K): Extract<Answer, { kind: K }> => {
  assert.equal(a?.kind, kind);
  return a as Extract<Answer, { kind: K }>;
};

// Tier 1 exists only where there is something authored or registered to say.
assert.ok(hasTip(vocab, 'NF'));
assert.ok(hasTip(vocab, 'FVEY'));
assert.ok(hasTip(vocab, 'GBR'));
assert.ok(!hasTip(vocab, 'S'), 'S has a quote but no plain text: no tooltip');
assert.ok(!hasTip(vocab, 'REL TO'), 'no help entry for REL TO yet');

assert.deepEqual(citation('§H.8 p145', 'q'), { source: 'capco_2016', section: 'H.8', page: 145, short: 'q' });
assert.equal(entry(vocab, 'nf')?.kind, 'marking');

// Lookup: a group, a country, a marking, and misses that point somewhere.
const fvey = as(answer('FVEY', vocab), 'tetragraph');
assert.deepEqual(fvey.members.map((m) => m.code).sort(), ['AUS', 'CAN', 'GBR', 'NZL', 'USA']);
assert.ok(
  fvey.members.every((m) => m.name),
  'every member has its name',
);
const gbr = as(answer('gbr', vocab), 'trigraph');
assert.ok(gbr.member_of.some((t) => t.code === 'FVEY'));
assert.deepEqual(as(answer('swiss', vocab), 'miss').nearest, ['CHE']);
assert.ok(as(answer('GRB', vocab), 'miss').nearest.includes('GBR'), 'a swapped letter finds the code');
const far = as(answer('Switzerland', vocab), 'miss');
assert.ok(Array.isArray(far.nearest), 'a miss always says where to go, even if only to examples');
assert.equal(answer('  ', vocab), null);

// Every quote the memo shows lands in the section the manual view will open.
const flat = (t: string): string =>
  t
    .replace(/(^|\n)\s*-\s+/g, '$1')
    .replace(/[*_#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const cites = [...memo.findings, ...memo.document.artifacts]
  .flatMap((x) => [x.says.citation, ...(x.derivation || []).map((d) => d.citation)])
  .filter((c): c is Citation => !!c);
for (const c of cites) {
  const s = manual.sections.find((x) => x.section === c.section && x.pages[0] <= c.page && c.page <= x.pages[1]);
  assert.ok(s, `no section for §${c.section} p${c.page}`);
  for (const part of (c.short ?? '').split('…').filter((p) => p.trim())) {
    assert.ok(flat(s.text).includes(flat(part)), `§${c.section} p${c.page}: "${part.slice(0, 50)}…" not found`);
  }
}
console.log(`help: ok · ${cites.length} citations land`);
