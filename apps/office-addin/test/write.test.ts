// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

// What the host writes, against the memo: Marque's fixes at the start, then each answer, its
// take-back, and the banner. The document is the memo with the edits in.
// `node --conditions=source --test test/*.test.ts`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { docView, empty, linted, record, snapshot } from '@marque/kit-core/state';
import type { Act, ActValue, Doc, State } from '@marque/kit-core/types';
import { written } from '../src/locate.ts';
import { banner, edits, relint } from '../src/write.ts';

const read = (f: string): string => readFileSync(new URL(`../../../fixtures/${f}`, import.meta.url), 'utf8');
const memo = read('memo.txt');
const doc = JSON.parse(read('memo.findings.json')) as Doc;
const P3 = 'f-p3-ownership',
  P4 = 'f-p4-portion-mark-absent',
  P5 = 'f-p5-noforn-rel-conflict';

/** The text the document carries for this view. */
const text = (d: Doc, s: State): string => written(memo, edits(docView(d, s), memo)).text;
/** An act as the pane records it, with what it was about. */
const act = (d: Doc, s: State, id: string, a: Act, value: ActValue | null): State => {
  const f = [...docView(d, s).findings, ...docView(d, s).document.artifacts].find((x) => x.id === id)!;
  return record(s, id, a, value, undefined, snapshot(f));
};

// At the start: Marque's fixes are in (¶2 and ¶6 applied, ¶5's safe reading), nothing else.
let s = empty();
assert.equal(edits(docView(doc, s), memo).length, 3);
assert.ok(text(doc, s).includes('2. (S//REL TO USA, FVEY)') && text(doc, s).includes('5. (S//NF) British'));
assert.equal(banner(docView(doc, s)), null, 'no banner until it is applied');

// ¶3: the reading the person picks is written in its place.
const r0 = doc.findings.find((f) => f.id === P3)!.outcome!.readings![0]!;
s = act(doc, s, P3, 'answered', { reading: r0 });
assert.ok(text(doc, s).includes(`3. ${r0.result!.text} A joint`), '¶3 says what was chosen');

// ¶4: the typed mark goes in after the paragraph's number.
s = act(doc, s, P4, 'answered', { free: '(U)' });
assert.ok(text(doc, s).includes('4. (U) Analysts'), '¶4 has its mark');

// The re-lint keeps both; taking ¶3 back puts the marking as written back, and the question with it.
let applied = relint(doc, s);
s = linted(s); // as mount() does on update({ doc })
assert.ok(text(applied, s).includes(`3. ${r0.result!.text} A joint`));
s = act(applied, s, P3, 'changed', null);
assert.ok(text(applied, s).includes('3. (//JOINT S AUS GBR//REL TO USA, GBR) A joint'), '¶3 back as written');
assert.ok(docView(applied, s).findings.find((f) => f.id === P3)!.asks, 'and asked again');
assert.ok(text(applied, s).includes('4. (U) Analysts'), '¶4 untouched');

// The banner: Marque's derived value once applied; REL TO once ¶5's alternative is taken.
s = act(applied, s, 'a-banner', 'answered', { apply: true });
assert.equal(banner(docView(applied, s)), 'SECRET//FGI AUS GBR//NOFORN');
applied = relint(applied, s);
s = linted(s);
assert.equal(banner(docView(applied, s)), 'SECRET//FGI AUS GBR//NOFORN', 'still there after the re-lint');
const alt = doc.findings.find((f) => f.id === P5)!.outcome!.readings!.find((r) => r.result?.text.includes('REL TO'))!;
s = act(applied, s, P5, 'answered', { reading: alt });
assert.ok(text(applied, s).includes(`5. ${alt.result!.text} British`), '¶5 takes REL TO back');
assert.equal(banner(docView(applied, s)), 'SECRET//FGI AUS GBR//REL TO USA, GBR', 'and the banner follows');
console.log('write: ok');
