// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { effectiveReady, writeConfirmationToken } from '../src/state.ts';
import type { Doc, EvaluationBasis } from '../src/types.ts';
const base: EvaluationBasis = {
  sourceRevisions: { id: 'opaque-r1' },
  selectionRevision: 's',
  relationshipRevision: 'r',
  contextRevision: 'c',
  policyRevision: 'p',
  declarationsRevision: 'd',
  scope: 'scope',
  operation: 'send',
  evaluationContextRevision: 'e',
  targetProfile: 't',
  questionRevisions: {},
  artifactRevisions: {},
  replacements: {},
};
const one: EvaluationBasis = {
  ...base,
  replacements: {
    x: {
      kind: 'reading',
      reading: {
        reading: 'candidate',
        result: { text: '(S//SECRET_A)', masks: [{ kind: 'concealed', span: [4, 12] }] },
      },
    },
  },
};
const two = structuredClone(one);
const replacement = two.replacements.x;
if (replacement?.kind !== 'reading' || !replacement.reading.result) throw Error('expected reading');
replacement.reading.result.text = '(S//SECRET_B)';
assert.equal(writeConfirmationToken('write', one), null);
assert.equal(writeConfirmationToken('write', two), null);
const inline = {
  ...base,
  replacements: {
    x: {
      kind: 'reading' as const,
      reading: {
        reading: 'masked',
        result: { text: '(S)', layers: [{ tokens: [{ t: '(S)' }, { t: '', mask: { kind: 'concealed' as const } }] }] },
      },
    },
  },
};
assert.equal(writeConfirmationToken('write', inline), null, 'redacted display cannot manufacture a token');
assert.ok(typeof writeConfirmationToken('write', base) === 'string');
const d: Doc = {
  findings: [],
  document: {
    blocking: [],
    artifacts: [],
    awaitingWrites: ['write'],
    evaluation: { basis: one, completion: 'complete', snapshotReady: true, requirements: [] },
  },
};
assert.equal(effectiveReady(d, { currentBasis: one, confirmedWrites: [] }), false);
assert.equal(effectiveReady(d, { currentBasis: one, confirmedWrites: ['write#null'] }), false);
const noWrites: Doc = { ...d, document: { ...d.document, awaitingWrites: [] } };
assert.equal(
  effectiveReady(noWrites, { currentBasis: one, requiredAcceptanceChecks: ['check'], acceptanceChecks: {} }),
  false,
);
const safe: Doc = { ...d, document: { ...d.document, evaluation: { ...d.document.evaluation!, basis: base } } };
const tok = writeConfirmationToken('write', base);
assert.ok(tok);
assert.equal(effectiveReady(safe, { currentBasis: base, confirmedWrites: [tok] }), true);

const metadataBasis = { ...base, sourceRevisions: { mask: 'opaque-handle' } };
assert.ok(
  typeof writeConfirmationToken('write', metadataBasis) === 'string',
  'opaque metadata keys do not become mask policy',
);
const malformed = {
  ...base,
  replacements: { x: { kind: 'reading', reading: { reading: 'bad', result: { text: 'x', masks: 'not-an-array' } } } },
};
assert.equal(writeConfirmationToken('write', malformed), null);
