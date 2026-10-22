// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

// The rung function (docs/DERIVATION.md, Table 2) and the kit's state layer
// (src/state.js), run against the memo under plain node (no DOM).
// `node test/state.test.js`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rung, sections } from '../src/render.js';
import { empty, record, see, linted, snapshot, view, docView, ACTS } from '../src/state.js';

/* Table 2, row by row. */
const T = [
  ['none', 'never', 'editing', 'quiet'],
  ['optional', 'never', 'editing', 'advisory'],
  ['optional', 'never', 'finalize', 'advisory'],
  ['optional', 'finalize', 'editing', 'advisory'],
  ['optional', 'finalize', 'finalize', 'blocking'],
  ['required', 'finalize', 'editing', 'action'],
  ['required', 'finalize', 'finalize', 'blocking'],
  ['required', 'finalize', 'send', 'blocking'],
  ['required', 'now', 'editing', 'blocking'],
  ['required', 'now', 'finalize', 'blocking'],
];
for (const [needs_person, blocks, moment, want] of T) {
  assert.equal(rung({ needs_person, blocks }, moment), want, `${needs_person} × ${blocks} × ${moment}`);
}
// Noticeable while a visible change is unseen; seen only quiets; whitespace isn't visible.
const comma = { needs_person: 'none', blocks: 'never', marking: { as_written: { text: '(S//REL TO USA FVEY)' } }, outcome: { result: { text: '(S//REL TO USA, FVEY)' } } };
assert.equal(rung(comma), 'noticeable');
assert.equal(rung({ ...comma, seen: true }), 'quiet');
assert.equal(rung({ ...comma, outcome: { result: { text: '(S//REL TO  USA FVEY)' } } }), 'quiet');

/* The memo. */
const doc = JSON.parse(readFileSync(new URL('../fixtures/memo.findings.json', import.meta.url)));
const id = (x) => x.id;
const P3 = 'f-p3-ownership', P4 = 'f-p4-portion-mark-absent', P5 = 'f-p5-noforn-rel-conflict', P2 = 'f-p2-rel-to-separator';
const f = (k) => doc.findings.find((x) => x.id === k);

let g = sections(docView(doc, empty()), 'editing');
assert.deepEqual(g.must.map(id), [P3]);
assert.deepEqual(g.can.map(id), [P5, 'a-banner'], 'the derived banner is a card, not a receipt line');
assert.deepEqual(g.later.map(id), [P4, 'a-cab'], 'absent mark and CAB wait for finalize');
g = sections(docView(doc, empty()), 'finalize');
assert.deepEqual(g.must.map(id), [P3, P4, 'a-cab'], 'at finalize they all block');
// Artifacts follow Table 2 like findings: optional + finalize blocks at the gate; blocks: now blocks while editing.
const withBanner = (b) => ({ ...doc, document: { ...doc.document, artifacts: doc.document.artifacts.map((a) => a.id === 'a-banner' ? { ...a, ...b } : a) } });
assert.ok(sections(withBanner({ needs_person: 'optional', blocks: 'finalize' }), 'finalize').must.some((a) => a.id === 'a-banner'));
assert.ok(sections(withBanner({ needs_person: 'optional', blocks: 'finalize' }), 'editing').can.some((a) => a.id === 'a-banner'));
assert.ok(sections(withBanner({ needs_person: 'required', blocks: 'now' }), 'editing').must.some((a) => a.id === 'a-banner'));

/* Acts. */
assert.throws(() => record(empty(), P3, 'undo'), /Unknown act/);
assert.deepEqual(ACTS, ['answered', 'changed', 'kept_as_written', 'deferred', 'declined']);

// Answer ¶3: no longer needs a person, the answer is kept, the log is append-only.
const reading = f(P3).outcome.readings[0];
let s = record(empty(), P3, 'answered', { reading, index: 0 }, 't1');
let v = view(f(P3), s);
assert.equal(v.needs_person, 'none');
assert.equal(v.outcome.result.text, reading.result.text);
assert.equal(v.asks, null);
assert.ok(v.asked, 'the original question travels with the answer');
// Change my answer: back to the question, both lines in the log.
s = record(s, P3, 'changed', null, 't2');
assert.equal(view(f(P3), s).needs_person, 'required');
assert.equal(view(f(P3), s).history.length, 2);

// Deferred stays open and moves to "Before you finalize" while editing.
s = record(empty(), P3, 'deferred');
g = sections(docView(doc, s), 'editing');
assert.ok(g.later.some((x) => x.id === P3) && !g.must.some((x) => x.id === P3));
assert.ok(docView(doc, s).document.blocking.includes(P3), 'deferral never answers for the person');
// Declined ("not my call") is still open too, and stays in Needs you for whoever gets it.
assert.ok(docView(doc, record(empty(), P3, 'declined')).document.blocking.includes(P3));
assert.ok(sections(docView(doc, record(empty(), P3, 'declined')), 'editing').must.some((x) => x.id === P3));

// Taking ¶5's alternative moves the banner (if_taken); undo moves it back.
s = record(empty(), P5, 'changed', { reading: f(P5).outcome.readings[0], index: 0 });
let banner = docView(doc, s).document.artifacts.find((a) => a.id === 'a-banner');
assert.equal(banner.derived_value.text, 'SECRET//FGI AUS GBR//REL TO USA, GBR');
assert.equal(banner.if_taken, null);
s = record(s, P5, 'changed', null);
banner = docView(doc, s).document.artifacts.find((a) => a.id === 'a-banner');
assert.equal(banner.derived_value.text, 'SECRET//FGI AUS GBR//NOFORN');

// Keep as written is an override: recorded, reported, never hidden.
s = record(empty(), P2, 'kept_as_written');
v = view(f(P2), s);
assert.equal(v.overridden, true);
assert.equal(v.outcome.result.text, f(P2).marking.as_written.text);
assert.equal(v.history[0].act, 'kept_as_written');

// Seen only quiets.
assert.equal(rung(view(f(P2), see(empty(), f(P2)))), 'quiet');
assert.equal(rung(view(f(P3), see(empty(), f(P3)))), 'action', 'seen never touches a required finding');
// A new result under the same id is unseen again.
const p2b = { ...f(P2), outcome: { ...f(P2).outcome, result: { text: '(S//REL TO USA, FVEY, NZL)' } } };
assert.equal(rung(view(p2b, see(empty(), f(P2)))), 'noticeable');

// The CAB: Derived From filled → Declassify On opens → both filled → no longer blocks.
const cab = doc.document.artifacts.find((a) => a.id === 'a-cab');
s = record(empty(), 'a-cab', 'answered', { fields: { derived_from: 'DIA SCG 2024-01, 20240115' } });
v = view(cab, s);
assert.equal(v.fields.derived_from.state, 'known');
assert.equal(v.fields.declassify_on.state, 'blank', 'a field waiting on a filled one becomes fillable');
assert.equal(v.needs_person, 'required');
s = record(s, 'a-cab', 'answered', { fields: { declassify_on: '20490115' } });
assert.equal(view(cab, s).needs_person, 'none');

// Ready only when everything the engine listed is settled.
s = empty();
s = record(s, P3, 'answered', { reading, index: 0 });
s = record(s, P4, 'answered', { free: '(U)' });
assert.equal(docView(doc, s).document.ready, false);
assert.ok(sections(docView(doc, s), 'editing').done.some((x) => x.id === P4), 'an answered missing mark is done, not waiting');
s = record(s, 'a-cab', 'answered', { fields: { derived_from: 'Multiple Sources', declassify_on: '20490115' } });
let done = docView(doc, s);
assert.deepEqual(done.document.blocking, []);
assert.deepEqual(done.document.pending, [P3, P4, 'a-cab'], 'answered is not applied');
assert.equal(done.document.ready, false, 'not ready until the host applies the answers and re-lints');
// The host re-lints: the new findings carry the answers; the old ones are never replayed.
const strip = ({ person, history, ...x }) => x;
const relint = { ...done, findings: done.findings.map(strip), document: { ...done.document, artifacts: done.document.artifacts.map(strip) } };
s = linted(s);
done = docView(relint, s);
assert.deepEqual(done.document.pending, []);
assert.equal(done.document.ready, true);
// A same-id finding that asks again after the lint is not settled by the old answer.
assert.equal(view(f(P3), s).needs_person, 'required', 'an answer before the lint is the engine\'s to report');
assert.ok(docView(doc, s).document.blocking.includes(P3));
// The engine's document is untouched.
assert.equal(doc.document.ready, false);
assert.equal(f(P3).needs_person, 'required');

// Every edit waits for the lint, not only blockers.
s = record(empty(), P5, 'changed', { reading: f(P5).outcome.readings[0], index: 0 });
assert.deepEqual(docView(doc, s).document.pending, [P5]);
// Applying the derived banner is an edit too; the host writes it.
s = record(empty(), 'a-banner', 'answered', { apply: true });
assert.equal(docView(doc, s).document.artifacts.find((a) => a.id === 'a-banner').applying, true);
assert.deepEqual(docView(doc, s).document.pending, ['a-banner']);
// A typed answer to a prose question is not a marking.
v = view(f(P3), record(empty(), P3, 'answered', { free: 'The UK alone' }));
assert.notEqual(v.outcome.result?.text, 'The UK alone');
assert.equal(view(f(P4), record(empty(), P4, 'answered', { free: '(U)' })).outcome.result.text, '(U)');

// A lint covers only the acts made before it began.
s = record(empty(), P3, 'answered', { reading, index: 0 });
s = record(s, P5, 'changed', { reading: f(P5).outcome.readings[0], index: 0 });
s = linted(s, 1);
assert.deepEqual(docView(doc, s).document.pending, [P5], 'an edit made during the lint is still pending');
assert.equal(view(f(P3), s).person, null, 'an answer the lint reflects is no longer the current act');
assert.equal(view(f(P3), s).history.length, 1, 'but stays in the audit');
assert.equal(linted(s, 0).linted, 1, 'the checkpoint never moves back');
// Any artifact takes artifact handling, fields or not.
const notice = { id: 'a-notice', kind: 'notice', state: 'absent_but_required', fixability: 'fixable', needs_person: 'none', blocks: 'never' };
assert.equal(view(notice, record(empty(), 'a-notice', 'answered', { apply: true })).applying, true);
const extra = { ...notice, state: 'present_not_required' };
assert.ok(sections({ ...doc, document: { ...doc.document, artifacts: [extra] } }, 'editing').can.some((a) => a.id === 'a-notice'));

// Acts on a finding a later lint withdrew stay for the receipt.
s = record(empty(), P3, 'declined');
const lessDoc = { ...doc, findings: doc.findings.filter((x) => x.id !== P3) };
assert.deepEqual(docView(lessDoc, s).document.withdrawn.map((x) => x.history[0].act), ['declined']);
assert.deepEqual(docView(doc, s).document.withdrawn, []);
// An artifact's seen is of its value: a new value under the same id is unseen again.
const ban = doc.document.artifacts.find((a) => a.id === 'a-banner');
s = see(empty(), ban);
assert.equal(view(ban, s).seen, true);
assert.equal(view({ ...ban, derived_value: { text: 'SECRET//NOFORN' } }, s).seen, false);

// Undoing a written answer is a write; undoing an unwritten one cancels it.
s = record(empty(), P5, 'changed', { reading: f(P5).outcome.readings[0], index: 0 });
assert.deepEqual(docView(doc, record(s, P5, 'changed', null)).document.pending, [], 'cancelled before any lint');
assert.deepEqual(docView(doc, record(linted(s), P5, 'changed', null)).document.pending, [P5], 'reversing a written edit waits for the lint');
// An override holds only for the marking and fix it was taken on.
s = record(empty(), P2, 'kept_as_written', null, 't', snapshot(f(P2)));
assert.equal(view(f(P2), s).overridden, true);
const p2new = { ...f(P2), marking: { ...f(P2).marking, as_written: { text: '(S//REL TO USA FVEY NZL)' } } };
assert.equal(view(p2new, s).overridden, undefined, 'a changed marking under the same id is open again');
// Taking back a written answer reopens the question it answered.
s = record(empty(), P3, 'answered', { reading, index: 0 }, 't1', snapshot(f(P3)));
s = linted(s);
const writtenP3 = { ...view(f(P3), record(empty(), P3, 'answered', { reading, index: 0 })), person: undefined, history: undefined, asks: null, outcome: { ...f(P3).outcome, kind: 'applied', result: reading.result } };
s = record(s, P3, 'changed', null, 't2', snapshot(writtenP3));
v = view(writtenP3, s);
assert.equal(v.asks.text, f(P3).asks.text);
assert.equal(v.needs_person, 'required');
assert.equal(v.outcome.kind, 'choices');
assert.deepEqual(docView({ ...doc, findings: doc.findings.map((x) => x.id === P3 ? writtenP3 : x) }, s).document.pending, [P3]);
// A write to a withdrawn finding is not pending; its acts stay in withdrawn.
s = record(empty(), P3, 'answered', { reading, index: 0 });
const gone = docView({ ...doc, findings: doc.findings.filter((x) => x.id !== P3) }, s);
assert.deepEqual(gone.document.pending, []);
assert.equal(gone.document.withdrawn[0].id, P3);

// An answer taken on a different question under the same id doesn't carry over.
s = record(empty(), P3, 'answered', { reading, index: 0 }, 't', snapshot(f(P3)));
const reworded = { ...f(P3), asks: { ...f(P3).asks, text: 'Who owns paragraph 3?' } };
assert.equal(view(reworded, s).needs_person, 'required');
assert.deepEqual(docView({ ...doc, findings: doc.findings.map((x) => x.id === P3 ? reworded : x) }, s).document.pending, []);
// A snapshot is a copy.
const src = structuredClone(f(P3)); const snap = snapshot(src); src.asks.text = 'changed in place';
assert.equal(snap.asks.text, f(P3).asks.text);

// A withdrawn finding keeps what it was about.
s = record(empty(), P3, 'declined', null, 't', snapshot(f(P3)));
const w = docView({ ...doc, findings: doc.findings.filter((x) => x.id !== P3) }, s).document.withdrawn[0];
assert.equal(w.about.rule, `${f(P3).rule.scheme}:${f(P3).rule.predicate}`);
assert.equal(w.about.as_written, f(P3).marking.as_written.text);

// A derived field counts as filled.
const derivedCab = { ...cab, fields: { ...cab.fields, derived_from: { state: 'derived', value: 'DIA SCG 2024-01' } } };
assert.equal(view(derivedCab, empty()).fields.declassify_on.state, 'blank');
assert.equal(view(derivedCab, record(empty(), 'a-cab', 'answered', { fields: { declassify_on: '20490115' } })).needs_person, 'none');

// A reading picked that the finding no longer offers doesn't carry over.
{
  const s = record(empty(), P3, 'answered', { reading: f(P3).outcome.readings[0], index: 0 }, undefined, snapshot(f(P3)));
  assert.equal(view(f(P3), s).needs_person, 'none');
  const moved = { ...f(P3), outcome: { ...f(P3).outcome, readings: f(P3).outcome.readings.slice(1) } };
  assert.equal(view(moved, s).stale, true);
  assert.deepEqual(docView({ ...doc, findings: doc.findings.map((x) => (x.id === P3 ? moved : x)) }, s).document.pending, []);
}
// Seen is of the result shown: taking the alternative after opening the card is a new, unseen result.
{
  const s = record(see(empty(), f(P5)), P5, 'changed', { reading: f(P5).outcome.readings[0], index: 0 });
  assert.equal(view(f(P5), see(empty(), f(P5))).seen, true);
  assert.equal(view(f(P5), s).seen, false);
  assert.equal(rung(view(f(P5), s)), 'noticeable');
}

// An override a lint invalidated isn't pending: there is nothing to write.
{
  const p2 = f(P2);
  const s = record(empty(), P2, 'kept_as_written', null, undefined, snapshot(p2));
  const moved = { ...p2, marking: { ...p2.marking, as_written: { text: '(S//REL TO USA, FVEY)' } } };
  const d = docView({ ...doc, findings: doc.findings.map((x) => (x.id === P2 ? moved : x)) }, s);
  assert.deepEqual(d.document.pending, []);
  assert.equal(d.findings.find((x) => x.id === P2).overridden, undefined);
}
// A take-back of a written answer on a finding that has since changed restores nothing and isn't pending.
{
  let s = record(empty(), P3, 'answered', { reading: f(P3).outcome.readings[0], index: 0 }, undefined, snapshot(f(P3)));
  s = linted(s);
  const written = { ...f(P3), asks: null, needs_person: 'none', blocks: 'never', marking: { ...f(P3).marking, as_written: f(P3).outcome.readings[0].result } };
  s = record(s, P3, 'changed', null, undefined, snapshot(written));
  const later = { ...written, marking: { ...written.marking, as_written: { text: '(S//NF)' } } };
  const d = docView({ ...doc, findings: doc.findings.map((x) => (x.id === P3 ? later : x)) }, s);
  assert.deepEqual(d.document.pending, []);
  assert.equal(d.findings.find((x) => x.id === P3).asks, null, 'the old question is not restored');
}
// An apply taken on one banner value doesn't carry over to a new one.
{
  const ban = doc.document.artifacts.find((a) => a.id === 'a-banner');
  const s = record(empty(), 'a-banner', 'answered', { apply: true }, undefined, snapshot(ban));
  assert.equal(view(ban, s).applying, true);
  const next = { ...ban, derived_value: { text: 'SECRET//NOFORN' } };
  assert.equal(view(next, s).applying, undefined);
  assert.deepEqual(docView({ ...doc, document: { ...doc.document, artifacts: doc.document.artifacts.map((a) => (a.id === 'a-banner' ? next : a)) } }, s).document.pending, []);
}

// An answer to a question whose field changed doesn't carry over, even with the same words.
{
  const s = record(empty(), P4, 'answered', { free: 'U' }, undefined, snapshot(f(P4)));
  const now = { ...f(P4), asks: { ...f(P4).asks, field: { ...f(P4).asks.field, type: 'prose' } } };
  assert.equal(view(now, s).stale, true);
}
// A typed field on a field that changed or went away doesn't carry over.
{
  const s = record(empty(), 'a-cab', 'answered', { fields: { derived_from: 'Multiple Sources' } }, undefined, snapshot(cab));
  assert.equal(view(cab, s).fields.derived_from.value, 'Multiple Sources');
  const { derived_from, ...rest } = cab.fields;
  assert.equal(view({ ...cab, fields: rest }, s).stale, true);
  assert.equal(view({ ...cab, fields: { ...cab.fields, derived_from: { ...derived_from, hint: 'a source list' } } }, s).stale, true);
}
// A correction to a filled field is of the value the lint gave; a new value there drops it.
{
  const s = record(empty(), 'a-cab', 'answered', { fields: { classified_by: 'J Roe' } }, undefined, snapshot(cab));
  assert.equal(view(cab, s).fields.classified_by.value, 'J Roe');
  const moved = { ...cab, fields: { ...cab.fields, classified_by: { ...cab.fields.classified_by, value: 'Jane Roe' } } };
  assert.equal(view(moved, s).stale, true);
}
// A field opened by an earlier local act is checked against the lint's own state, not the overlay.
{
  let s = record(empty(), 'a-cab', 'answered', { fields: { derived_from: 'Multiple Sources' } }, undefined, snapshot(cab));
  s = record(s, 'a-cab', 'answered', { fields: { declassify_on: '20490115' } }, undefined, snapshot(view(cab, s)));
  const v = view(cab, s);
  assert.notEqual(v.stale, true);
  assert.equal(v.fields.declassify_on.value, '20490115');
}
// A deferral, or an answer, on another question or rule under the same id doesn't carry over.
{
  const p3 = f(P3);
  const s = record(empty(), p3.id, 'deferred', null, undefined, snapshot(p3));
  assert.equal(view(p3, s).deferred, 'deferred');
  const asked = { ...p3, asks: { ...p3.asks, text: 'Which countries own this information?' } };
  assert.equal(view(asked, s).stale, true);
  assert.equal(view(asked, s).deferred, undefined);
  const a = record(empty(), p3.id, 'answered', { reading: p3.outcome.readings[0] }, undefined, snapshot(p3));
  assert.equal(view({ ...p3, rule: { ...p3.rule, predicate: 'another' } }, a).stale, true);
}
// A host editing a view doesn't edit the log.
{
  const s = record(empty(), 'a-cab', 'answered', { fields: { derived_from: 'Multiple Sources' } });
  const v = view(cab, s);
  v.history[0].value.fields.derived_from = 'changed'; v.person.act = 'declined';
  assert.equal(s.log[0].value.fields.derived_from, 'Multiple Sources');
  assert.equal(s.log[0].act, 'answered');
}
// A block filled in to the last field waits to be written; one still open doesn't yet.
{
  let s = record(empty(), 'a-cab', 'answered', { fields: { derived_from: 'Multiple Sources' } }, undefined, snapshot(cab));
  assert.equal(view(cab, s).applying, undefined);
  s = record(s, 'a-cab', 'answered', { fields: { declassify_on: '20490115' } }, undefined, snapshot(cab));
  assert.equal(view(cab, s).applying, true);
  assert.equal(view(cab, linted(s)).applying, undefined);
}
// A stale later field leaves an earlier one that still holds: shown, and still waiting to be written.
{
  let s = record(empty(), 'a-cab', 'answered', { fields: { derived_from: 'Multiple Sources' } }, undefined, snapshot(cab));
  s = record(s, 'a-cab', 'answered', { fields: { declassify_on: '20490115' } }, undefined, snapshot(cab));
  const now = { ...cab, fields: { ...cab.fields, declassify_on: { ...cab.fields.declassify_on, hint: 'eight digits' } } };
  const v = view(now, s);
  assert.notEqual(v.stale, true);
  assert.equal(v.fields.derived_from.value, 'Multiple Sources');
  assert.notEqual(v.fields.declassify_on.source, 'person');
  const d = { ...doc, document: { ...doc.document, artifacts: doc.document.artifacts.map((a) => (a.id === 'a-cab' ? now : a)) } };
  assert.ok(docView(d, s).document.pending.includes('a-cab'));
}

// A reading whose label or assertions changed under the same marking is a different reading.
{
  const r0 = f(P3).outcome.readings[0];
  const s = record(empty(), P3, 'answered', { reading: r0, index: 0 }, undefined, snapshot(f(P3)));
  const now = { ...f(P3), outcome: { ...f(P3).outcome, readings: [{ ...r0, asserts: { ...r0.asserts, owners: ['AUS'] } }, ...f(P3).outcome.readings.slice(1)] } };
  assert.equal(view(now, s).stale, true);
}
// A take-back of a written answer is stale once the engine's result moved, too.
{
  let s = record(empty(), P3, 'answered', { reading: f(P3).outcome.readings[0], index: 0 }, undefined, snapshot(f(P3)));
  s = linted(s);
  const written = { ...f(P3), asks: null, needs_person: 'none', blocks: 'never', outcome: { ...f(P3).outcome, result: f(P3).outcome.readings[0].result } };
  s = record(s, P3, 'changed', null, undefined, snapshot(written));
  assert.equal(view(written, s).stale, undefined);
  assert.equal(view({ ...written, outcome: { ...written.outcome, result: { text: '(S//NF)' } } }, s).stale, true);
}
// The log owns its values.
{
  const reading = structuredClone(f(P3).outcome.readings[0]);
  const s = record(empty(), P3, 'answered', { reading, index: 0 });
  reading.reading = 'edited in place';
  assert.notEqual(s.log[0].value.reading.reading, 'edited in place');
}

// "Fix it after all" on a written override stays pending: the host has the fix to apply.
{
  let s = record(empty(), P2, 'kept_as_written', null, undefined, snapshot(f(P2)));
  s = linted(s);
  const kept = view(f(P2), s);
  assert.equal(kept.overridden, true);
  s = record(s, P2, 'changed', null, undefined, snapshot(kept));
  const d = docView(doc, s);
  assert.deepEqual(d.document.pending, [P2]);
  assert.equal(d.findings.find((x) => x.id === P2).stale, undefined);
}

// A choice from the question's own options holds: ¶4 lists them in asks.options, not outcome.readings.
{
  const o = f(P4).asks.options[0];
  const s = record(empty(), P4, 'answered', { reading: o, index: 0 }, undefined, snapshot(f(P4)));
  assert.equal(view(f(P4), s).needs_person, 'none');
  assert.deepEqual(docView(doc, s).document.pending, [P4]);
}
// "Change my answer" doesn't need a round trip: an answer to the reopened question holds while the take-back waits.
{
  let s = record(empty(), P3, 'answered', { reading: f(P3).outcome.readings[0], index: 0 }, undefined, snapshot(f(P3)));
  s = linted(s);
  const written = { ...f(P3), asks: null, needs_person: 'none', blocks: 'never', outcome: { ...f(P3).outcome, result: f(P3).outcome.readings[0].result } };
  s = record(s, P3, 'changed', null, undefined, snapshot(written));
  const reopened = view(written, s);
  assert.equal(reopened.asks.text, f(P3).asks.text);
  s = record(s, P3, 'answered', { reading: reopened.outcome.readings[1], index: 1 }, undefined, snapshot(reopened));
  const now = view(written, s);
  assert.equal(now.stale, undefined);
  assert.equal(now.outcome.result.text, f(P3).outcome.readings[1].result.text);
}
// A stale answer moves no artifact: the banner keeps its own value.
{
  const r0 = f(P5).outcome.readings[0];
  const s = record(empty(), P5, 'changed', { reading: r0, index: 0 }, undefined, snapshot(f(P5)));
  const ban = (d) => d.document.artifacts.find((a) => a.id === 'a-banner').derived_value.text;
  const base = ban(doc);
  assert.notEqual(ban(docView(doc, s)), base);
  const moved = { ...f(P5), outcome: { ...f(P5).outcome, readings: [{ ...r0, reading: 'something else' }] } };
  assert.equal(ban(docView({ ...doc, findings: doc.findings.map((x) => (x.id === P5 ? moved : x)) }, s)), base);
}

// Deferring or declining a reopened question keeps it reopened, and the take-back still waits to be written.
for (const act of ['deferred', 'declined']) {
  let s = record(empty(), P3, 'answered', { reading: f(P3).outcome.readings[0], index: 0 }, undefined, snapshot(f(P3)));
  s = linted(s);
  const written = { ...f(P3), asks: null, needs_person: 'none', blocks: 'never', outcome: { ...f(P3).outcome, result: f(P3).outcome.readings[0].result } };
  s = record(s, P3, 'changed', null, undefined, snapshot(written));
  s = record(s, P3, act, null, undefined, snapshot(view(written, s)));
  const d = docView({ ...doc, findings: doc.findings.map((x) => (x.id === P3 ? written : x)) }, s);
  const v = d.findings.find((x) => x.id === P3);
  assert.equal(v.asks?.text, f(P3).asks.text, act);
  assert.equal(v.needs_person, f(P3).needs_person, act);
  assert.ok(d.document.pending.includes(P3), act);
  assert.equal(d.document.ready, false, act);
}

// A marking given as a plain string is a marking result, not typed content.
{
  const a = { id: 'x', kind: 'front_marking', state: 'absent_but_required', derived_value: 'SECRET' };
  const snap = snapshot(a);
  assert.equal(snap.result, 'SECRET');
  assert.equal(snap.content, undefined);
}

// An answer taken on one paragraph doesn't carry to another under the same id; a moved span does.
{
  const p3 = f(P3);
  const s = record(empty(), p3.id, 'answered', { reading: p3.outcome.readings[0], index: 0 }, undefined, snapshot(p3));
  assert.equal(view({ ...p3, anchor: { ...p3.anchor, portion: 4 } }, s).stale, true);
  assert.notEqual(view({ ...p3, anchor: { ...p3.anchor, span: [0, 1] } }, s).stale, true);
}
// A field filled after a local answer to the one it waits on goes when that answer does.
{
  let s = record(empty(), 'a-cab', 'answered', { fields: { derived_from: 'Multiple Sources' } }, undefined, snapshot(cab));
  s = record(s, 'a-cab', 'answered', { fields: { declassify_on: '20490115' } }, undefined, snapshot(view(cab, s)));
  const reasked = { ...cab, fields: { ...cab.fields, derived_from: { ...cab.fields.derived_from, hint: 'a source list' } } };
  const v = view(reasked, s);
  assert.equal(v.stale, true);
}
// The same text with other masks is a new result: seen again.
{
  const p2 = f('f-p2-rel-to-separator');
  const s = see(empty(), p2);
  assert.equal(view(p2, s).seen, true);
  const masked = { ...p2, outcome: { ...p2.outcome, result: { ...p2.outcome.result, masks: [{ kind: 'concealed', start: 0, end: 1 }] } } };
  assert.equal(view(masked, s).seen, false);
}

console.log('state: ok');
