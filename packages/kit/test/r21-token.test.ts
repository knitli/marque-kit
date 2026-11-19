// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { Doc, EvaluationBasis } from '@knitli/marque-kit-core/types';
const win = new Window();
Object.assign(globalThis, { document: win.document, Node: win.Node, HTMLElement: win.HTMLElement });
const { status } = await import('../src/render.ts');
const b: EvaluationBasis = {
  sourceRevisions: {},
  selectionRevision: 's',
  relationshipRevision: 'r',
  contextRevision: 'c',
  policyRevision: 'p',
  declarationsRevision: 'd',
  scope: 's',
  operation: 'send',
  evaluationContextRevision: 'e',
  targetProfile: 't',
  questionRevisions: {},
  artifactRevisions: {},
  replacements: {
    x: {
      kind: 'reading',
      reading: { reading: 'x', result: { text: 'HIDDEN', masks: [{ kind: 'concealed', span: [0, 6] }] } },
    },
  },
};
const doc: Doc = {
  findings: [],
  document: {
    blocking: [],
    artifacts: [],
    awaitingWrites: ['write'],
    evaluation: { basis: b, completion: 'complete', snapshotReady: true, requirements: [] },
  },
};
const rendered = status(doc, {
  moment: 'finalize',
  currentBasis: b,
  confirmedWrites: [],
  requiredAcceptanceChecks: ['check'],
  acceptanceChecks: {},
});
const text = rendered.textContent ?? '';
assert.ok(!text.includes('HIDDEN'));
assert.ok(!/ready to (send|finalize)/i.test(text));
assert.match(text, /2/);
