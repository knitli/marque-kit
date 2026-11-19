// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readCabSnapshot } from '../src/native-cab.ts';
import { parseNativeJson } from '../src/native-wire.ts';
import type { NativeTargetLocator } from '../src/native-wire.ts';
import { effectiveReady } from '../src/state.ts';
import type { Doc } from '../src/types.ts';

const maxBytes = 1_048_576;
const v2 = JSON.parse(readFileSync(new URL('./fixtures/native-v2-funded.fixture', import.meta.url), 'utf8'));
const payload = (locator: NativeTargetLocator) => {
  const raw = structuredClone(v2);
  raw.schema = 'knitli.native-cab-findings.v3';
  raw.version = 3;
  return JSON.parse(JSON.stringify(raw, (key, value: unknown) => (key === 'scope_locator' ? locator : value)));
};
const setup = (raw: unknown) => {
  const wire = parseNativeJson(JSON.stringify(raw), maxBytes);
  if (wire.version !== 3) throw new Error('expected v3');
  const doc: Doc = { findings: [], document: { blocking: [], artifacts: [], native_evaluation: wire } };
  const request = {
    kind: 'cab_snapshot' as const,
    operation: 'base' as const,
    expectedChain: wire.evaluation.chain!,
    target: structuredClone(wire.evaluation.artifacts[0]!.target),
    profile: wire.evaluation.basis!.basis.profile!,
    currentBasisJson: JSON.stringify(wire.evaluation.basis),
    maxBasisBytes: maxBytes,
  };
  return { doc, request, wire };
};

void test('actual v3 serializer output parses but an intentionally mixed target is not current', () => {
  const input = readFileSync(new URL('./fixtures/native-v3-mixed-target.fixture', import.meta.url), 'utf8');
  const { wire, doc, request } = setup(JSON.parse(input));
  assert.deepEqual(wire.evaluation.basis!.basis.field_revisions[0]!.target.scope_locator, {
    kind: 'text',
    value: { start: '2', end: '9' },
  });
  assert.deepEqual(wire.evaluation.artifacts[0]!.target.scope_locator, { kind: 'typed', value: 'cab-scope' });
  assert.equal(readCabSnapshot(doc, request), null);
  assert.equal(effectiveReady(doc), false);
});

void test('v3 reads separately supplied typed and text targets without conflating them', () => {
  for (const locator of [
    { kind: 'typed', value: '1..2' },
    { kind: 'text', value: { start: '1', end: '2' } },
  ] as const) {
    const { doc, request, wire } = setup(payload(locator));
    assert.ok(readCabSnapshot(doc, request));
    assert.deepEqual(wire.evaluation.artifacts[0]!.target.scope_locator, locator);
    assert.equal(readCabSnapshot(doc, { ...request, expectedChain: 'wrong' }), null);
    const collision =
      locator.kind === 'typed'
        ? ({ kind: 'text', value: { start: '1', end: '2' } } as const)
        : ({ kind: 'typed', value: '1..2' } as const);
    assert.equal(readCabSnapshot(doc, { ...request, target: { ...request.target, scope_locator: collision } }), null);
    assert.equal(readCabSnapshot(doc, { ...request, target: { ...request.target, scope_locator: '1..2' } }), null);
    assert.equal(
      readCabSnapshot(doc, {
        ...request,
        target: { ...request.target, scope_locator: { kind: 'text', value: null } as unknown as NativeTargetLocator },
      }),
      null,
    );
    const stale = JSON.parse(request.currentBasisJson);
    stale.basis.field_revisions[0].target.scope_locator = collision;
    assert.equal(readCabSnapshot(doc, { ...request, currentBasisJson: JSON.stringify(stale) }), null);
  }
});

void test('v3 rejects invalid or legacy target encodings in every target-bearing lane', () => {
  const raw = payload({ kind: 'typed', value: '1..2' });
  const target = raw.evaluation.artifacts[0].target;
  raw.evaluation.basis.accepted_answers.push({
    question_chain: 'chain',
    question_serial: '1',
    question_revision: '1',
    target: structuredClone(target),
    field: 'classified_by',
    value_reference: 'ref',
    occurrence_locator: { kind: 'typed', value: 'occurrence' },
  });
  raw.evaluation.host_work.rows.push({
    target: structuredClone(target),
    proposal: null,
    field: null,
    placement: null,
    evidence_ref: null,
    status: 'pending',
  });
  const targets = [
    (x: typeof raw) => x.evaluation.basis.basis.field_revisions[0].target,
    (x: typeof raw) => x.evaluation.basis.accepted_answers[0].target,
    (x: typeof raw) => x.evaluation.artifacts[0].target,
    (x: typeof raw) => x.evaluation.artifacts[0].basis.field_revisions[0].target,
    (x: typeof raw) => x.evaluation.artifacts[0].fields[0].basis.field_revisions[0].target,
    (x: typeof raw) => x.evaluation.host_work.rows[0].target,
    (x: typeof raw) => x.evaluation.findings.items[0].question.basis.field_revisions[0].target,
  ];
  for (const getTarget of targets) {
    const changed = structuredClone(raw);
    getTarget(changed).scope_locator = '1..2';
    assert.throws(() => parseNativeJson(JSON.stringify(changed), maxBytes), TypeError);
  }
  for (const locator of [
    null,
    [],
    {},
    { kind: 'unlocated' },
    { kind: 'typed', value: 1 },
    { kind: 'typed', value: '' },
    { kind: 'typed', value: '\ud800' },
    { kind: 'typed', value: 'x', extra: true },
    { kind: 'text', start: 1, end: 2 },
    { kind: 'text', value: { start: 1, end: 2 } },
    { kind: 'text', value: { start: '-1', end: '2' } },
    { kind: 'text', value: { start: '2', end: '1' } },
    { kind: 'text', value: { start: '1', end: '1' } },
    { kind: 'text', value: { start: '1.5', end: '2' } },
    { kind: 'text', value: { start: '01', end: '2' } },
    { kind: 'text', value: { start: '0', end: '9007199254740992' } },
    { kind: 'text', value: { start: '1', end: '2', extra: true } },
  ]) {
    const changed = structuredClone(raw);
    changed.evaluation.artifacts[0].target.scope_locator = locator;
    assert.throws(() => parseNativeJson(JSON.stringify(changed), maxBytes), TypeError);
  }
  const wrongVersion = structuredClone(v2);
  wrongVersion.evaluation.artifacts[0].target.scope_locator = { kind: 'typed', value: '1..2' };
  assert.throws(() => parseNativeJson(JSON.stringify(wrongVersion), maxBytes), TypeError);
  assert.equal(parseNativeJson(JSON.stringify(v2), maxBytes).version, 2);
});

void test('v3 rejects a mismatched tagged target or finding basis even when each shape is valid', () => {
  for (const change of [
    (x: ReturnType<typeof payload>) => {
      x.evaluation.artifacts[0].target.scope_locator = { kind: 'text', value: { start: '1', end: '2' } };
    },
    (x: ReturnType<typeof payload>) => {
      x.evaluation.findings.items[0].question.basis.field_revisions[0].target.scope_locator = {
        kind: 'text',
        value: { start: '1', end: '2' },
      };
    },
  ]) {
    const raw = payload({ kind: 'typed', value: '1..2' });
    change(raw);
    const { doc, request } = setup(raw);
    assert.equal(readCabSnapshot(doc, request), null);
  }
});

void test('v3 still permits empty text placements and occurrences', () => {
  const raw = payload({ kind: 'typed', value: 'scope' });
  const empty = { kind: 'text', value: { start: '2', end: '2' } };
  raw.evaluation.artifacts[0].fields[0].placement = empty;
  raw.evaluation.artifacts[0].fields[1].placement = { kind: 'typed', value: '' };
  raw.evaluation.basis.accepted_answers.push({
    question_chain: 'chain',
    question_serial: '1',
    question_revision: '1',
    target: structuredClone(raw.evaluation.artifacts[0].target),
    field: 'classified_by',
    value_reference: 'ref',
    occurrence_locator: empty,
  });
  const wire = parseNativeJson(JSON.stringify(raw), maxBytes);
  assert.deepEqual(wire.evaluation.artifacts[0]!.fields[0]!.placement, empty);
  assert.deepEqual(wire.evaluation.artifacts[0]!.fields[1]!.placement, { kind: 'typed', value: '' });
  assert.deepEqual(wire.evaluation.basis!.accepted_answers[0]!.occurrence_locator, empty);
});
