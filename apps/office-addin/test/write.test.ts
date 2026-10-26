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
import { banner, edits, held, made, relint } from '../src/write.ts';

const read = (f: string): string => readFileSync(new URL(`../../../fixtures/${f}`, import.meta.url), 'utf8');
const memo = read('memo.txt');
const doc = JSON.parse(read('memo.findings.json')) as Doc;
const P3 = 'f-p3-ownership',
  P4 = 'f-p4-portion-mark-absent',
  P5 = 'f-p5-noforn-rel-conflict',
  P2 = 'f-p2-rel-to-separator';

/** The text the document carries for these acts. */
const text = (s: State): string => written(memo, edits(made(doc, s), memo)).text;
/** The banner it carries. */
const top = (s: State): string | null => banner(relint(doc, s));
/** An act as the pane records it, on what the pane shows: the last re-lint with the acts since. */
const act = (shown: Doc, s: State, id: string, a: Act, value: ActValue | null): State => {
  const v = docView(shown, s);
  const f = [...v.findings, ...v.document.artifacts].find((x) => x.id === id)!;
  return record(s, id, a, value, undefined, snapshot(f));
};
/** The host wrote and re-linted: the pane takes the new lint, as mount() does on update({ doc }). */
const lint = (s: State): [Doc, State] => [relint(doc, s), linted(s)];
const asks = (shown: Doc, s: State, id: string): boolean => !!docView(shown, s).findings.find((f) => f.id === id)!.asks;

// At the start: Marque's fixes are in (¶2 and ¶6 applied, ¶5's safe reading), nothing else.
let s = empty(),
  shown = doc;
assert.equal(edits(made(doc, s), memo).length, 3);
assert.ok(text(s).includes('2. (S//REL TO USA, FVEY)') && text(s).includes('5. (S//NF) British'));
assert.equal(top(s), null, 'no banner until it is applied');

// ¶3: the reading the person picks is written in its place.
const r0 = doc.findings.find((f) => f.id === P3)!.outcome!.readings![0]!;
s = act(shown, s, P3, 'answered', { reading: r0 });
assert.ok(text(s).includes(`3. ${r0.result!.text} A joint`), '¶3 says what was chosen');

// ¶4: the typed mark goes in after the paragraph's number.
s = act(shown, s, P4, 'answered', { free: '(U)' });
assert.ok(text(s).includes('4. (U) Analysts'), '¶4 has its mark');

// The re-lint keeps both; taking ¶3 back puts the marking as written back, and the question with it.
[shown, s] = lint(s);
assert.ok(text(s).includes(`3. ${r0.result!.text} A joint`));
assert.ok(!asks(shown, s, P3), 'answered after the re-lint');
s = act(shown, s, P3, 'changed', null);
assert.ok(text(s).includes('3. (//JOINT S AUS GBR//REL TO USA, GBR) A joint'), '¶3 back as written');
assert.ok(asks(shown, s, P3), 'and asked again');
assert.ok(text(s).includes('4. (U) Analysts'), '¶4 untouched');
[shown, s] = lint(s);
assert.ok(asks(shown, s, P3), 'still asked after the re-lint');

// The banner: Marque's derived value once applied; REL TO once ¶5's alternative is taken.
s = act(shown, s, 'a-banner', 'answered', { apply: true });
assert.equal(top(s), 'SECRET//FGI AUS GBR//NOFORN');
[shown, s] = lint(s);
assert.equal(top(s), 'SECRET//FGI AUS GBR//NOFORN', 'still there after the re-lint');
const alt = doc.findings.find((f) => f.id === P5)!.outcome!.readings!.find((r) => r.result?.text.includes('REL TO'))!;
s = act(shown, s, P5, 'answered', { reading: alt });
assert.ok(text(s).includes(`5. ${alt.result!.text} British`), '¶5 takes REL TO back');
assert.equal(top(s), 'SECRET//FGI AUS GBR//REL TO USA, GBR', 'and the banner follows');
// Taken back after the re-lint wrote it: ¶5 and the banner go back to NOFORN.
[shown, s] = lint(s);
s = act(shown, s, P5, 'changed', null);
assert.ok(text(s).includes('5. (S//NF) British'), '¶5 NOFORN again');
assert.equal(top(s), 'SECRET//FGI AUS GBR//NOFORN', 'and so is the banner');
[shown, s] = lint(s);
assert.equal(top(s), 'SECRET//FGI AUS GBR//NOFORN', 'after the re-lint too');

// ¶2 kept as written, written, then fixed after all: the comma Marque added comes back.
s = act(shown, s, P2, 'kept_as_written', null);
assert.ok(text(s).includes('2. (S//REL TO USA FVEY)'), '¶2 as written');
[shown, s] = lint(s);
assert.ok(docView(shown, s).findings.find((f) => f.id === P2)!.overridden, 'the override shows after the re-lint');
s = act(shown, s, P2, 'changed', null);
assert.ok(text(s).includes('2. (S//REL TO USA, FVEY)'), '¶2 fixed after all');

// Answered and taken back before the first write lands: each write and re-lint is of the log as of
// its own act, so when the first lands the pane still shows the question, and the second leaves it.
s = act(shown, s, P4, 'changed', null);
[shown, s] = lint(s);
const first = act(shown, s, P4, 'answered', { free: '(C)' });
const second = act(shown, first, P4, 'changed', null);
shown = relint(doc, first);
s = linted(second, first.log.length);
assert.ok(asks(shown, s, P4), '¶4 asked again while the second write is under way');
[shown, s] = lint(s);
assert.ok(asks(shown, s, P4), 'and after it');
assert.ok(text(s).includes('4. Analysts'), '¶4 unmarked again');
// What the stand-in can't write stays a question: prose for ¶3, ¶4 above the banner, the authority block.
s = act(shown, s, P3, 'answered', { free: 'The UK alone' });
s = act(shown, s, P4, 'answered', { free: '(TS)' });
s = act(shown, s, 'a-cab', 'answered', { fields: { derived_from: 'Memo 12' } });
assert.deepEqual([...held(doc, s)].sort(), [P3, P4, 'a-cab'].sort());
assert.ok(
  text(s).includes('3. (//JOINT S AUS GBR//REL TO USA, GBR) A joint') && text(s).includes('4. Analysts'),
  'nothing written',
);
[shown, s] = lint(s);
assert.ok(asks(shown, s, P3) && asks(shown, s, P4), 'both asked again');
assert.ok(docView(shown, s).document.blocking.includes('a-cab'), 'the authority block still holds finalize');
// Sent again once the question is back: the earlier one doesn't come back in with it.
s = act(shown, s, P4, 'answered', { free: '(TS)' });
s = act(shown, s, P3, 'answered', { free: 'The UK alone' });
assert.ok(text(s).includes('4. Analysts') && text(s).includes('3. (//JOINT S AUS GBR//REL TO USA, GBR) A joint'));
[shown, s] = lint(s);
assert.ok(asks(shown, s, P3) && asks(shown, s, P4), 'still asked');
// A level after an owner prefix is read and held when above the banner; a typed mark with controls is
// held whatever its level (the banner would move); a bare level at or below the banner is written.
s = act(shown, s, P4, 'answered', { free: '(//JOINT TS AUS GBR USA//REL TO USA, AUS, GBR)' });
assert.ok(held(doc, s).has(P4) && text(s).includes('4. Analysts'), 'TS after JOINT held');
[shown, s] = lint(s);
s = act(shown, s, P4, 'answered', { free: '(S//NF)' });
assert.ok(held(doc, s).has(P4) && text(s).includes('4. Analysts'), 'NOFORN typed held');
[shown, s] = lint(s);
s = act(shown, s, P4, 'answered', { free: '(S)' });
assert.ok(!held(doc, s).has(P4) && text(s).includes('4. (S) Analysts'), 'a bare level written');
console.log('write: ok');
