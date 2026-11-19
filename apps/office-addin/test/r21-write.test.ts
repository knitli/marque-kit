// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { disclosedActValue, empty, record, snapshot } from '@knitli/marque-kit-core/state';
import type { Doc, MarkingInput } from '@knitli/marque-kit-core/types';
import { banner, edits, held } from '../src/write.ts';
const read = (n: string): string => readFileSync(new URL(`../../../fixtures/${n}`, import.meta.url), 'utf8');
const doc = JSON.parse(read('memo.findings.json')) as Doc;
const memo = read('memo.txt');
const finding = doc.findings.find((f) => f.outcome.readings?.length && f.anchor?.span)!;
const concealedText = 'WORD_SECRET_4783';
const text = `(S//${concealedText})`;
const masked: MarkingInput = { text, masks: [{ kind: 'concealed', span: [4, 4 + concealedText.length] }] };
const direct = structuredClone(doc);
direct.findings = [{ ...finding, outcome: { ...finding.outcome, result: masked } }];
assert.deepEqual(edits(direct, memo), [], 'masked output must not become an edit');
direct.findings[0] = { ...finding, marking: { as_written: masked } };
assert.deepEqual(edits(direct, memo), [], 'masked input must not authorize an overwrite');
const reading = { reading: 'masked', result: masked };
const state = record(empty(), finding.id, 'answered', disclosedActValue({ reading }), 't', snapshot(finding));
assert.ok(held(doc, state).has(finding.id), 'masked answer remains held');
const front = doc.document.artifacts.find((a) => a.kind === 'front_marking')!;
const linted = structuredClone(doc);
linted.document.artifacts = [{ ...front, state: 'present', derived_value: masked }];
assert.equal(banner(linted), null, 'masked banner is not physical text');
assert.ok(edits(doc, memo).length > 0, 'ordinary unmasked edits still work');
