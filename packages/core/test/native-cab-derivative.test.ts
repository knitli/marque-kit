// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readCabSnapshot } from '../src/native-cab.ts';
import { parseNativeJson } from '../src/native-wire.ts';
import { effectiveReady } from '../src/state.ts';
import type { Doc } from '../src/types.ts';

const maxBytes = 1_048_576;
const input = readFileSync(new URL('./fixtures/native-v2-derivative.fixture', import.meta.url), 'utf8');

void test('reads the real derivative CAB evaluation without claiming readiness', () => {
  const wire = parseNativeJson(input, maxBytes);
  assert.equal(wire.version, 2);
  if (wire.version !== 2) throw new Error('expected v2');
  const result = wire.evaluation;
  const doc: Doc = { findings: [], document: { blocking: [], artifacts: [], native_evaluation: wire } };
  const request = {
    kind: 'cab_snapshot' as const,
    operation: 'base' as const,
    expectedChain: result.chain!,
    target: structuredClone(result.artifacts[0]!.target),
    profile: result.basis!.basis.profile!,
    currentBasisJson: JSON.stringify(result.basis),
    maxBasisBytes: maxBytes,
  };
  assert.equal(request.profile.profile, 'derivative_us_nsi_cab_required_field_missing_after_examination');
  assert.deepEqual(
    result.requirements.map((row) => [row.field, row.state]),
    [
      ['classified_by', 'unsatisfied'],
      ['derived_from', 'unsatisfied'],
      ['declassify_on', 'unsatisfied'],
      ['agency_and_office_of_origin', 'unresolved'],
    ],
  );
  assert.deepEqual(
    result.artifacts[0]!.fields.map((row) => [row.field, row.coverage]),
    [
      ['classified_by', 'examined_absent'],
      ['derived_from', 'examined_absent'],
      ['declassify_on', 'examined_absent'],
      ['agency_and_office_of_origin', 'examined_absent'],
    ],
  );
  assert.equal(result.coverage.status, 'complete');
  assert.equal(result.readiness.kind, 'supported');
  if (result.readiness.kind !== 'supported') throw new Error('expected readiness');
  assert.equal(result.readiness.status, 'incomplete');
  assert.equal(result.host_work.coverage, 'unavailable');
  assert.equal(readCabSnapshot(doc, request), result);
  assert.equal(effectiveReady(doc), false);
  assert.equal(readCabSnapshot(doc, { ...request, target: { ...request.target, revision_id: 'old' } }), null);
  assert.equal(readCabSnapshot(doc, { ...request, expectedChain: 'other' }), null);
  assert.equal(readCabSnapshot(doc, { ...request, profile: { ...request.profile, declaration_id: 'unknown' } }), null);
});

void test('rejects unknown profiles, versions, and fields in the derivative wire', () => {
  const original = JSON.parse(input);
  for (const mutate of [
    (x: typeof original) => {
      x.evaluation.basis.basis.profile.profile = 'future_profile';
    },
    (x: typeof original) => {
      x.evaluation.readiness.profile.profile = 'future_profile';
    },
    (x: typeof original) => {
      x.evaluation.artifacts[0].basis.profile.profile = 'future_profile';
    },
    (x: typeof original) => {
      x.evaluation.basis.basis.profile.declaration_version = 2;
    },
    (x: typeof original) => {
      x.evaluation.requirements[1].field = 'future_field';
    },
    (x: typeof original) => {
      x.evaluation.artifacts[0].fields[1].field = 'future_field';
    },
    (x: typeof original) => {
      x.evaluation.basis.basis.field_revisions[1].field = 'future_field';
    },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(() => parseNativeJson(JSON.stringify(changed), maxBytes), TypeError);
  }
});
