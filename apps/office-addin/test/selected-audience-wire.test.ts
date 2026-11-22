// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSelectedAudience } from '../src/selected-audience-wire.ts';

const exact = (value: string[]) => ({ status: 'exact', participation: 'participating', value });
const response = () => ({
  status: 'complete',
  requested_documents: 2,
  completed_documents: 2,
  scan_completeness: 'complete',
  source_completeness: 'partial',
  query_completeness: 'complete',
  refusal: null,
  selections: [
    { status: 'selected', reason: null },
    { status: 'selected', reason: null },
  ],
  foreign_receive: exact(['GBR']),
  foreign_show: exact(['AFG', 'CAN', 'GBR']),
  foreign_display_only: exact(['AFG', 'CAN']),
  implied_usa: { status: 'exact', participation: 'nonparticipating', value: true },
  cutoff: null,
});
const read = (value: unknown) => readSelectedAudience(JSON.stringify(value), 65_536, 2, 2);

void test('keeps the selected result and whole-source coverage separate', () => {
  const result = read(response());
  assert.equal(result?.query, 'complete');
  assert.equal(result?.source, 'partial');
  assert.deepEqual(result?.foreignReceive.value, ['GBR']);
  assert.deepEqual(result?.foreignShow.value, ['AFG', 'CAN', 'GBR']);
  assert.equal(result?.impliedUsa.participation, 'nonparticipating');
});

void test('keeps an uncertain audience distinct from an examined empty set', () => {
  const value = response();
  value.status = 'partial';
  value.query_completeness = 'partial';
  value.foreign_receive = { status: 'bounded', participation: 'participating', value: [] };
  const result = read(value);
  assert.equal(result?.foreignReceive.status, 'bounded');
  assert.deepEqual(result?.foreignReceive.value, []);
  assert.equal(read(response())?.foreignReceive.status, 'exact');
});

void test('retains the engine recipient spelling, including registered organizations', () => {
  const value = response();
  value.foreign_receive = exact(['EU', 'ACGU', 'NATO', 'AX2', 'AUSTRALIA_GROUP']);
  assert.deepEqual(read(value)?.foreignReceive.value, ['EU', 'ACGU', 'NATO', 'AX2', 'AUSTRALIA_GROUP']);
});

void test('rejects content, inconsistent completion, wrong counts, and oversized responses', () => {
  assert.equal(read({ ...response(), source: 'private source text' }), null);
  assert.equal(read({ ...response(), foreign_receive: exact(['PRIVATE SOURCE']) }), null);
  assert.equal(read({ ...response(), foreign_receive: exact(['PRIVATE_SECRET']) }), null);
  assert.equal(read({ ...response(), query_completeness: 'partial' }), null);
  assert.equal(read({ ...response(), completed_documents: 1 }), null);
  assert.equal(read({ ...response(), selections: [{ status: 'selected', reason: null }] }), null);
  assert.equal(read({ ...response(), foreign_receive: { ...exact(['GBR']), status: 'unavailable' } }), null);
  assert.equal(readSelectedAudience(JSON.stringify(response()), 20, 2, 2), null);
});
