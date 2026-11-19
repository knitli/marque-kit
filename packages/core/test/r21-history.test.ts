// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  appendAcknowledgementIssue,
  appendAct,
  canWriteAct,
  isDisclosedState,
  disclosedActValue,
  disclosedAppendRequest,
  empty,
  see,
  snapshot,
  view,
} from '../src/state.ts';
import type { ActAppendRequest, Doc, MarkingInput } from '../src/types.ts';
import { disclosedMarking } from '../src/marking.ts';

const doc = JSON.parse(readFileSync(new URL('../../../fixtures/memo.findings.json', import.meta.url), 'utf8')) as Doc;
const f = structuredClone(doc.findings.find((x) => x.outcome.readings?.length)!);
const secret = 'HISTORY_CONCEALED_CANARY_138';
const text = `(S//${secret})`;
const mark: MarkingInput = { text, masks: [{ kind: 'concealed', span: [4, 4 + secret.length] }] };
f.marking = { as_written: mark };
f.outcome = {
  ...f.outcome,
  result: mark,
  fallback: { result: mark, basis: 'safe-fallback-basis' },
  readings: [{ reading: 'candidate', asserts: { ref: 'opaque-ref' }, result: mark }],
};
f.asks = {
  kind: 'choose',
  text: 'choose',
  options: [{ reading: 'candidate', asserts: { ref: 'opaque-ref' }, result: mark }],
};
const basis = {
  sourceRevisions: { source: 'opaque-revision' },
  selectionRevision: 's',
  relationshipRevision: 'r',
  contextRevision: 'c',
  policyRevision: 'p',
  declarationsRevision: 'd',
  scope: 'scope',
  operation: 'op',
  evaluationContextRevision: 'e',
  targetProfile: 't',
  questionRevisions: {},
  artifactRevisions: {},
  replacements: { x: { kind: 'reading' as const, reading: f.outcome.readings![0]! } },
};
f.evaluationBasis = basis;
const about = snapshot(f);
assert.ok(!JSON.stringify(about).includes(secret));
assert.ok(about.marking && about.result_marking && about.outcome?.fallback && Array.isArray(about.asks?.options));
assert.equal(about.outcome.readings?.[0]?.asserts?.ref, 'opaque-ref');
assert.equal(about.outcome.fallback.basis, 'safe-fallback-basis');
assert.ok(!JSON.stringify(see(empty(), f)).includes(secret));
const selected = { reading: f.outcome.readings![0]!, index: 0 };
const value = disclosedActValue(selected)!;
assert.ok(!JSON.stringify(value).includes(secret));
assert.equal(value.reading?.asserts?.ref, 'opaque-ref');
assert.equal(canWriteAct(value), false);
const raw: ActAppendRequest = {
  requestId: 'id-1',
  id: f.id,
  act: 'answered',
  value: selected,
  about,
  binding: { payloadRef: 'opaque-binding', basis },
  at: 't',
};
assert.equal(appendAct(empty(), raw).status, 'refused');
const request = disclosedAppendRequest(raw);
const committed = appendAct(empty(), request);
assert.equal(committed.status, 'committed');
if (committed.status !== 'committed') throw Error('expected committed');
assert.ok(!JSON.stringify(committed).includes(secret));
assert.equal(committed.entry.binding?.payloadRef, 'opaque-binding');
assert.equal(committed.entry.binding?.basis?.sourceRevisions.source, 'opaque-revision');
assert.equal(appendAcknowledgementIssue(request, committed), null);
assert.equal(appendAct(committed.state, request).status, 'committed');
const changedRaw = structuredClone(raw);
changedRaw.value!.reading!.result!.text = text.replace(secret, 'DIFFERENT_CONCEALED_BYTES_13');
assert.equal(appendAct(committed.state, changedRaw).status, 'refused');
const kept: ActAppendRequest = { requestId: 'keep', id: f.id, act: 'kept_as_written', value: null, about, at: 't' };
const keptResult = appendAct(empty(), kept);
assert.equal(keptResult.status, 'committed');
if (keptResult.status === 'committed')
  assert.equal(view(f, keptResult.state).stale, true, 'redacted basis cannot establish currentness');
const withoutBasis = { ...f, evaluationBasis: undefined };
const simpleKeep: ActAppendRequest = { ...kept, requestId: 'keep-no-basis', about: snapshot(withoutBasis) };
const simple = appendAct(empty(), simpleKeep);
assert.equal(simple.status, 'committed');
if (simple.status === 'committed')
  assert.equal(view(withoutBasis, simple.state).stale, true, 'masked source without binding reopens');
const plain = { reading: { reading: 'plain', result: { text: '(S)' } } };
assert.equal(canWriteAct(plain), true);
assert.deepEqual(disclosedActValue(plain), plain);

// Unsafe legacy state never gets copied into a newly committed row or acknowledged.
const unsafeLegacy = structuredClone(committed.state);
unsafeLegacy.log[0]!.value = selected;
assert.equal(isDisclosedState(unsafeLegacy), false);
const newRequest: ActAppendRequest = { requestId: 'next', id: f.id, act: 'deferred', value: null, at: 't2' };
const unsafeRefusal = appendAct(unsafeLegacy, newRequest);
assert.equal(unsafeRefusal.status, 'refused');
if (unsafeRefusal.status === 'refused') {
  assert.equal(unsafeRefusal.reason, 'undisclosed-marking');
  assert.equal(unsafeRefusal.pending, undefined);
  assert.equal(appendAcknowledgementIssue(newRequest, unsafeRefusal), 'undisclosed-marking');
}
const inconsistent = structuredClone(committed.state);
inconsistent.log[0]!.about!.as_written = text;
assert.equal(isDisclosedState(inconsistent), false, 'legacy scalar text must agree with safe typed marking');
const rawRefusal = appendAct(empty(), raw);
assert.equal(rawRefusal.status, 'refused');
if (rawRefusal.status === 'refused') assert.equal(rawRefusal.reason, 'undisclosed-marking');
const conflicting = appendAct(committed.state, { ...request, value: { free: 'different' } });
assert.equal(conflicting.status, 'refused');
if (conflicting.status === 'refused') assert.equal(conflicting.reason, 'request-id-conflict');

// Identical masked displays never establish a relationship between hidden source identities.
const otherSecret = 'DIFFERENT_SECRET_CANARY_1234';
assert.equal(otherSecret.length, secret.length);
const otherMark: MarkingInput = { ...mark, text: text.replace(secret, otherSecret) };
const otherWithoutBasis = { ...withoutBasis, marking: { as_written: otherMark } };
if (simple.status === 'committed') {
  assert.equal(view(otherWithoutBasis, simple.state).stale, true);
  assert.equal(simple.state.log.length, 1, 'unknown currentness keeps the historical act');
}
const boundBasis = { ...basis, replacements: {} };
const bound = { ...f, evaluationBasis: boundBasis };
const boundReq: ActAppendRequest = { ...kept, requestId: 'bound-keep', about: snapshot(bound) };
const boundState = appendAct(empty(), boundReq);
assert.equal(boundState.status, 'committed');
if (boundState.status === 'committed') {
  assert.equal(view(bound, boundState.state).stale, undefined, 'one exact nonempty source basis binds the act');
  assert.equal(
    view(
      { ...bound, evaluationBasis: { ...boundBasis, sourceRevisions: { source: 'different-rev' } } },
      boundState.state,
    ).stale,
    true,
  );
  assert.equal(
    view({ ...bound, evaluationBasis: { ...boundBasis, sourceRevisions: {} } }, boundState.state).stale,
    true,
  );
  assert.equal(
    view({ ...bound, evaluationBasis: { ...boundBasis, sourceRevisions: { source: ' ' } } }, boundState.state).stale,
    true,
  );
  const safe = disclosedMarking(mark);
  const layer = safe.layers!.find((l) => l.tokens.some((t) => t.t.length > 1))!;
  const index = layer.tokens.findIndex((t) => t.t.length > 1);
  const token = layer.tokens[index]!;
  layer.tokens.splice(index, 1, { t: token.t.slice(0, 1) }, { t: token.t.slice(1) });
  assert.equal(
    view({ ...bound, marking: { as_written: safe } }, boundState.state).stale,
    undefined,
    'retokenization preserves a bound masked display',
  );
}
const answerNoBasis: ActAppendRequest = {
  ...request,
  requestId: 'answer-without-basis',
  about: snapshot(withoutBasis),
  binding: undefined,
};
const answerState = appendAct(empty(), answerNoBasis);
assert.equal(answerState.status, 'committed');
if (answerState.status === 'committed')
  assert.equal(view(withoutBasis, answerState.state).stale, true, 'masked reading without binding reopens');

// A masked selected reading requires a basis even when the displayed subject is plain.
const plainSubject = {
  ...withoutBasis,
  marking: { as_written: { text: '(S)' } },
  outcome: { ...withoutBasis.outcome, result: { text: '(S)' } },
};
const readingOnlyRequest: ActAppendRequest = {
  ...answerNoBasis,
  requestId: 'reading-only-mask',
  about: snapshot(plainSubject),
};
const readingOnly = appendAct(empty(), readingOnlyRequest);
assert.equal(readingOnly.status, 'committed');
if (readingOnly.status === 'committed') assert.equal(view(plainSubject, readingOnly.state).stale, true);
if (boundState.status === 'committed') {
  const multiBasis = { ...boundBasis, sourceRevisions: { source: 'opaque-revision', other: 'r2' } };
  const multi = { ...bound, evaluationBasis: multiBasis };
  const multiRequest: ActAppendRequest = { ...boundReq, requestId: 'multiple-sources', about: snapshot(multi) };
  const multiState = appendAct(empty(), multiRequest);
  assert.equal(multiState.status, 'committed');
  if (multiState.status === 'committed') assert.equal(view(multi, multiState.state).stale, true);
}
