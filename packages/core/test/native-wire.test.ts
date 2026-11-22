// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseNativeJson, parseNativeSourceMarkingJson } from '../src/native-wire.ts';
import type { NativeEnvelopeV1 } from '../src/native-wire.ts';
import { readCabSnapshot } from '../src/native-cab.ts';
import { docView, effectiveReady, empty } from '../src/state.ts';
import type { Doc } from '../src/types.ts';

const text = readFileSync(new URL('./fixtures/native-cab.fixture', import.meta.url), 'utf8');
const wire = parseNativeJson(text, 1_048_576);
const basis = wire.evaluation.basis!;
const profile = basis.basis.profile!;
const target = wire.evaluation.artifacts[0]!.target;
const request = {
  kind: 'cab_snapshot' as const,
  operation: 'base' as const,
  target,
  profile,
  currentBasisJson: JSON.stringify(basis),
  maxBasisBytes: 1_048_576,
};
const doc: Doc = { findings: [], document: { blocking: [], artifacts: [], native_evaluation: wire } };

void test('source marking wire is read-only, offset-free and keeps mask kinds distinct', () => {
  const source = {
    schema: 'knitli.native-source-marking.v2',
    binding: {
      chain_id: 'review-chain',
      source_id: 'doc-1',
      revision_id: 'r-2',
      contribution_id: 'portion-1',
      scope_id: '0',
      viewer_id: 'authorized-reviewer',
    },
    marking: {
      text: 'S',
      layers: [
        {
          tokens: [{ t: '', mask: { kind: 'concealed' } }, { t: 'S' }, { t: '', mask: { kind: 'unidentified' } }],
        },
      ],
      masks: [],
    },
  };
  const parsed = parseNativeSourceMarkingJson(JSON.stringify(source), 4096);
  assert.equal(parsed.marking.text, 'S');
  assert.deepEqual(parsed.marking.layers[0]?.tokens, source.marking.layers[0]?.tokens);
  for (const mutate of [
    (value: typeof source) => ((value.marking.layers[0]!.tokens[0]!.mask as Record<string, unknown>)['span'] = [0, 1]),
    (value: typeof source) => ((value.marking.layers[0]!.tokens[0]!.mask as Record<string, unknown>)['len'] = 4),
    (value: typeof source) => (value.marking.text = 'S SECRET-CANARY'),
    (value: typeof source) => (value.binding.viewer_id = ''),
    (value: typeof source) => Object.assign(value, { authorization: 'host_authorized' }),
  ]) {
    const invalid = structuredClone(source);
    mutate(invalid);
    assert.throws(() => parseNativeSourceMarkingJson(JSON.stringify(invalid), 4096), TypeError);
  }
  assert.throws(() => parseNativeSourceMarkingJson(JSON.stringify(source), 16), TypeError);
});

void test('trusted source marking envelope carries no synthetic authorization claim', () => {
  const trustedText = readFileSync(new URL('./fixtures/native-source-marking-v2.fixture', import.meta.url), 'utf8');
  const trusted = parseNativeSourceMarkingJson(trustedText, 4096);
  assert.equal(trusted.schema, 'knitli.native-source-marking.v2');
  assert.equal(Object.hasOwn(trusted, 'authorization'), false);
  const syntheticText = readFileSync(
    new URL('./fixtures/native-source-marking-synthetic-v1.fixture', import.meta.url),
    'utf8',
  );
  assert.throws(() => parseNativeSourceMarkingJson(syntheticText, 4096), TypeError);
  const forged = JSON.parse(trustedText) as Record<string, unknown>;
  forged['authorization'] = 'host_authorized';
  assert.throws(() => parseNativeSourceMarkingJson(JSON.stringify(forged), 4096), TypeError);
});

void test('native evaluation crosses normal document view and explicit CAB read', () => {
  const view = docView(doc, empty());
  const snapshot = readCabSnapshot(view, request);
  assert.ok(snapshot);
  assert.equal(snapshot.coverage.status, 'complete');
  assert.equal(snapshot.readiness.kind, 'supported');
  if (snapshot.readiness.kind !== 'supported') throw new Error('expected native supported readiness');
  assert.equal(snapshot.readiness.status, 'incomplete');
  assert.equal(snapshot.requirements.length, 4);
  assert.equal(snapshot.artifacts.length, 1);
  assert.equal(snapshot.host_work.coverage, 'unavailable');
  assert.deepEqual(snapshot.readiness, wire.evaluation.readiness);
  assert.deepEqual(snapshot.requirements, wire.evaluation.requirements);
  assert.deepEqual(snapshot.artifacts, wire.evaluation.artifacts);
  assert.deepEqual(snapshot.host_work, wire.evaluation.host_work);
  assert.equal(effectiveReady(view), false);
  assert.ok(Object.isFrozen(wire.evaluation.artifacts[0]));
});
void test('stale basis, wrong scope and unparsed values do not disclose a snapshot', () => {
  const stale = structuredClone(basis);
  stale.basis.source_revisions[0]!.revision_id += '-changed';
  assert.equal(readCabSnapshot(doc, { ...request, currentBasisJson: JSON.stringify(stale) }), null);
  assert.equal(readCabSnapshot(doc, { ...request, target: { ...target, revision_id: 'wrong' } }), null);
  assert.equal(readCabSnapshot(doc, { ...request, profile: { ...profile, declaration_id: 'wrong' } }), null);
  assert.equal(readCabSnapshot(doc, { ...request, currentBasisJson: '{' }), null);
  assert.equal(
    readCabSnapshot({ ...doc, document: { ...doc.document, native_evaluation: structuredClone(wire) } }, request),
    null,
  );
});
void test('malformed native route cannot fall through to legacy document readiness', () => {
  const current = {
    sourceRevisions: { document: 'r1' },
    selectionRevision: 's',
    relationshipRevision: 'r',
    contextRevision: 'c',
    policyRevision: 'p',
    declarationsRevision: 'd',
    scope: 'document',
    operation: 'send',
    evaluationContextRevision: 'e',
    targetProfile: 't',
    questionRevisions: {},
    artifactRevisions: {},
    replacements: {},
  };
  const legacy = { completion: 'complete' as const, snapshotReady: true, requirements: [], basis: current };
  const withLegacy = { findings: [], document: { blocking: [], artifacts: [], evaluation: legacy } } as Doc;
  assert.equal(effectiveReady(withLegacy, { currentBasis: current }), true);
  assert.equal(
    effectiveReady({ ...withLegacy, document: { ...withLegacy.document, native_evaluation: null } } as unknown as Doc, {
      currentBasis: current,
    }),
    false,
  );
});
void test('parser rejects malformed values, unsafe integers, extra fields, and oversized input without echoing bytes', () => {
  const raw = JSON.parse(text) as NativeEnvelopeV1 & { case?: string };
  const mutations: ((x: typeof raw) => void)[] = [
    (x) => {
      (x as { version: number }).version = 2;
    },
    (x) => {
      (x as { schema: string }).schema = 'other';
    },
    (x) => {
      x.evaluation.basis!.basis.source_revisions[0]!.source_id = '\ud800';
    },
    (x) => {
      x.case = 'unexpected';
    },
    (x) => {
      (x.evaluation.readiness as { kind: string }).kind = 'unexpected';
    },
    (x) => {
      x.evaluation.basis!.basis.scopes[0]!.scope_id = '9007199254740992';
    },
    (x) => {
      x.evaluation.basis!.basis.scopes[0]!.scope_id = '9'.repeat(10000);
    },
  ];
  mutations.push((x) => {
    x.omitted_lanes.splice(0, 2, `${x.omitted_lanes[0]}\0${x.omitted_lanes[1]}`);
  });
  mutations.push((x) => {
    const record = x as unknown as Record<string, unknown>;
    record['schema\0version'] = record.schema;
    delete record.schema;
    delete record.version;
  });
  for (const mutate of mutations) {
    const value = structuredClone(raw);
    mutate(value);
    assert.throws(() => parseNativeJson(JSON.stringify(value), 1_048_576), TypeError);
  }
  assert.throws(() => parseNativeJson(' '.repeat(1_048_577), 1_048_576), TypeError);
  assert.throws(
    () => parseNativeJson('{sensitive-invalid-wire', 1_048_576),
    (error: Error) => !error.message.includes('sensitive-invalid-wire'),
  );
});

void test('wire keeps unresolved occurrence references distinct from authored support', () => {
  const raw = JSON.parse(text) as NativeEnvelopeV1;
  const supports = raw.evaluation.requirements[0]!.supports;
  supports.push({ kind: 'unresolved_occurrence', index: '3' });
  supports.push({ kind: 'eyes_receive_implies_show', index: '4' });
  const parsed = parseNativeJson(JSON.stringify(raw), 1_048_576);
  assert.deepEqual(parsed.evaluation.requirements[0]!.supports, supports);
  const unknownTag = JSON.stringify(raw).replace('"unresolved_occurrence"', '"unknown_spelling"');
  assert.throws(() => parseNativeJson(unknownTag, 1_048_576), TypeError);
});

void test('wire IDs use canonical unsigned decimal and text supports Unicode scalars', () => {
  const raw = JSON.parse(text) as NativeEnvelopeV1;
  const basis = raw.evaluation.basis!.basis;
  basis.source_revisions[0]!.source_id = 'doc-🌍';
  for (const id of ['0', '9007199254740991']) {
    basis.scopes[0]!.scope_id = id;
    assert.equal(parseNativeJson(JSON.stringify(raw), 1_048_576).evaluation.basis!.basis.scopes[0]!.scope_id, id);
  }
  for (const id of ['', '00', '-0', '-1', ' 1', '+1', '1e1', '1.0', '0x10', '9007199254740992']) {
    basis.scopes[0]!.scope_id = id;
    assert.throws(() => parseNativeJson(JSON.stringify(raw), 1_048_576), TypeError);
  }
});

void test('partial reads require a producer-bound target and matching source scope', () => {
  const partial = JSON.parse(text) as NativeEnvelopeV1;
  partial.evaluation.coverage.status = 'partial';
  partial.evaluation.artifacts = [];
  const fieldBound = parseNativeJson(JSON.stringify(partial), 1_048_576);
  const partialDoc = { ...doc, document: { ...doc.document, native_evaluation: fieldBound } };
  assert.equal(readCabSnapshot(partialDoc, request)?.coverage.status, 'partial');
  partial.evaluation.basis!.basis.field_revisions = [];
  const targetless = parseNativeJson(JSON.stringify(partial), 1_048_576);
  const noTargetDoc = { ...doc, document: { ...doc.document, native_evaluation: targetless } };
  const targetlessRequest = { ...request, currentBasisJson: JSON.stringify(targetless.evaluation.basis) };
  assert.equal(readCabSnapshot(noTargetDoc, targetlessRequest), null);
  assert.equal(targetless.evaluation.coverage.status, 'partial');
  const wrongScope = JSON.parse(text) as NativeEnvelopeV1;
  wrongScope.evaluation.basis!.basis.scopes[0]!.contribution_id = 'other';
  const wrong = parseNativeJson(JSON.stringify(wrongScope), 1_048_576);
  const wrongDoc = { ...doc, document: { ...doc.document, native_evaluation: wrong } };
  assert.equal(
    readCabSnapshot(wrongDoc, { ...request, currentBasisJson: JSON.stringify(wrong.evaluation.basis) }),
    null,
  );
  const ambiguous = JSON.parse(text) as NativeEnvelopeV1;
  ambiguous.evaluation.basis!.basis.scopes.push({ contribution_id: target.contribution_id, scope_id: '99' });
  const ambiguousWire = parseNativeJson(JSON.stringify(ambiguous), 1_048_576);
  const ambiguousDoc = { ...doc, document: { ...doc.document, native_evaluation: ambiguousWire } };
  assert.equal(
    readCabSnapshot(ambiguousDoc, { ...request, currentBasisJson: JSON.stringify(ambiguousWire.evaluation.basis) }),
    null,
  );
});

void test('actual plain and partial Rust outputs preserve their native status and scope', () => {
  const plain = parseNativeJson(
    readFileSync(new URL('./fixtures/native-plain.fixture', import.meta.url), 'utf8'),
    1_048_576,
  );
  assert.equal(plain.evaluation.readiness.kind, 'not_requested');
  assert.equal(plain.evaluation.coverage.status, 'complete');
  const plainDoc = docView({ ...doc, document: { ...doc.document, native_evaluation: plain } }, empty());
  assert.equal(readCabSnapshot(plainDoc, request), null);
  assert.equal(effectiveReady(plainDoc), false);
  const partial = parseNativeJson(
    readFileSync(new URL('./fixtures/native-partial.fixture', import.meta.url), 'utf8'),
    1_048_576,
  );
  assert.equal(partial.evaluation.coverage.status, 'partial');
  const partialBasis = partial.evaluation.basis!;
  const partialRequest = {
    ...request,
    target: partial.evaluation.artifacts[0]!.target,
    profile: partialBasis.basis.profile!,
    currentBasisJson: JSON.stringify(partialBasis),
  };
  const partialDoc = docView({ ...doc, document: { ...doc.document, native_evaluation: partial } }, empty());
  const view = readCabSnapshot(partialDoc, partialRequest);
  assert.ok(view);
  assert.equal(view.coverage.status, 'partial');
  assert.equal(view.readiness.kind, 'supported');
  if (view.readiness.kind !== 'supported') throw new Error('missing supported readiness');
  assert.equal(view.readiness.status, 'incomplete');
  assert.equal(effectiveReady(partialDoc), false);
});
