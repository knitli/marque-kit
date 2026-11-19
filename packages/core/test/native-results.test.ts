// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readNativeSemanticResults } from '../src/native-results.ts';
import { parseNativeSemanticResultsJson } from '../src/native-wire.ts';
import type { Doc } from '../src/types.ts';

const fixture = readFileSync(new URL('./fixtures/native-semantic-results.fixture', import.meta.url), 'utf8');
const current = {
  documentId: 'host-doc-1',
  revisionId: 'revision-9',
  viewerId: 'viewer-7',
  principalRevision: 'principal-revision-3',
  evaluationId: 'evaluation-revision-21',
};
const request = {
  current,
  grant: {
    ...current,
    grantId: 'f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1',
    rows: Array.from({ length: 4 }, () => ({ meaning: true, supportKinds: true, dependencies: true })),
    coverage: true,
  },
};
function docFrom(text: string): Doc {
  return {
    findings: [],
    document: {
      blocking: [],
      artifacts: [],
      native_semantic_results: parseNativeSemanticResultsJson(text, 4096),
    },
  };
}

void test('parses actual native bytes as a strict compact selected-results envelope', () => {
  const doc = docFrom(fixture);
  assert.equal(doc.document.native_semantic_results?.disclosure.items.length, 4);
  assert.equal(doc.document.native_semantic_results?.disclosure.items[0]?.meaning?.status, 'available');
  assert.equal(doc.document.native_semantic_results?.disclosure.items[3]?.meaning?.status, 'unavailable');
  assert.equal(
    readNativeSemanticResults(doc, request, current.principalRevision)?.disclosure.grant_id,
    request.grant.grantId,
  );
  assert.equal(readNativeSemanticResults(doc, undefined, current.principalRevision), null);
});

void test('grant must match current host document, evaluation, principal revision, rows, and every disclosed aspect', () => {
  const doc = docFrom(fixture);
  assert.equal(
    readNativeSemanticResults(
      doc,
      { ...request, current: { ...current, revisionId: 'other' } },
      current.principalRevision,
    ),
    null,
  );
  assert.equal(readNativeSemanticResults(doc, request, 'older-principal'), null);
  assert.equal(
    readNativeSemanticResults(
      doc,
      { ...request, current: { ...current, evaluationId: 'next-evaluation' } },
      current.principalRevision,
    ),
    null,
  );
  assert.equal(
    readNativeSemanticResults(
      doc,
      { ...request, grant: { ...request.grant, rows: request.grant.rows.slice(0, 3) } },
      current.principalRevision,
    ),
    null,
  );
  assert.equal(
    readNativeSemanticResults(
      doc,
      {
        ...request,
        grant: {
          ...request.grant,
          rows: request.grant.rows.map((row, index) => (index === 0 ? { ...row, meaning: false } : row)),
        },
      },
      current.principalRevision,
    ),
    null,
  );
  assert.equal(
    readNativeSemanticResults(
      doc,
      { ...request, grant: { ...request.grant, coverage: false } },
      current.principalRevision,
    ),
    null,
  );
});

void test('parser rejects hidden gaps, raw reference fields, unsafe edges, and unknown tags', () => {
  const cases = [
    fixture.replace('"ordinal":"2"', '"ordinal":"3"'),
    fixture.replace('"ordinal":"2"', '"ordinal":"2","source_id":"secret"'),
    fixture.replace('f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1', 'fixture-grant-001'),
    fixture.replace(
      '"dependencies":{"status":"available","items":[]}',
      '"dependencies":{"status":"available","items":[{"status":"resolved","row":"9"}]}',
    ),
    fixture.replace('"scope":"read_only_selected_results"', '"scope":"whole_document"'),
    fixture.replace('"cab_proof"', '"unknown_proof"'),
  ];
  for (const text of cases) assert.throws(() => parseNativeSemanticResultsJson(text, 4096));
});

void test('byte limits are enforced before parse and output never grants finalize', () => {
  assert.throws(() => parseNativeSemanticResultsJson(fixture, fixture.length - 1));
  assert.equal(docFrom(fixture).document.native_semantic_results?.whole_document_finalize, 'unsupported');
});
