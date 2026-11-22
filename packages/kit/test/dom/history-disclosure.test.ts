// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { docView, empty, record, snapshot } from '@knitli/marque-kit-core/state';
import { pane, receipt } from '../../src/render.ts';
import type { Doc, EvaluationBasis } from '@knitli/marque-kit-core/types';
import type { HistoryDisclosure, Session } from '../../src/render.ts';

const basis: EvaluationBasis = {
  sourceRevisions: { doc: 'v2' },
  selectionRevision: 's',
  relationshipRevision: 'r',
  contextRevision: 'c',
  policyRevision: 'p',
  declarationsRevision: 'd',
  scope: 'doc',
  operation: 'query',
  evaluationContextRevision: 'e',
  targetProfile: 'test',
  questionRevisions: {},
  artifactRevisions: {},
  replacements: {},
};
const context = {
  actBinding: { documentId: 'doc', chain: 'chain', basis },
  currentBasis: basis,
  currentDisclosureRevision: 'principal-v2',
};
function setup(withdrawn = false) {
  const doc = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../../../fixtures/memo.findings.json'), 'utf8'),
  ) as Doc;
  const f = doc.findings.find((x) => x.id === 'f-p2-rel-to-separator')!;
  f.marking!.as_written = { text: '(S//OLD-SECRET)', layers: [{ tokens: [{ t: '(S//OLD-SECRET)' }] }], masks: [] };
  const state = record(empty(), f.id, 'kept_as_written', null, 'TIME', snapshot(f));
  f.marking!.as_written = { ...f.marking!.as_written, masks: [{ kind: 'concealed', span: [4, 14] }] };
  doc.document.evaluation = { basis, completion: 'incomplete', requirements: [], snapshotReady: false };
  if (withdrawn) doc.findings = doc.findings.filter((x) => x.id !== f.id);
  state.log[0]!.binding = { documentId: 'doc', chain: 'chain', basis };
  const d = docView(doc, state),
    e = state.log[0]!;
  const projection: HistoryDisclosure = {
    documentId: 'doc',
    chain: 'chain',
    basis,
    disclosureRevision: 'principal-v2',
    entries: [
      {
        requestId: e.requestId!,
        sequence: e.sequence,
        subjectId: e.id,
        status: 'available',
        text: 'authorized summary',
        marking: {
          text: '(S//HIDDEN)',
          layers: [{ tokens: [{ t: '(S//HIDDEN)' }] }],
          masks: [{ kind: 'concealed', span: [4, 10] }],
        },
      },
    ],
  };
  return { d, e, projection };
}
for (const withdrawn of [false, true])
  test(`history receipt authorizes exact projection: withdrawn=${withdrawn}`, () => {
    const { d, e, projection } = setup(withdrawn);
    const raw = JSON.stringify(e);
    expect(raw).toContain('OLD-SECRET');
    const base = receipt(d);
    expect(base.outerHTML).not.toContain('OLD-SECRET');
    expect(base.textContent).toContain('kept as written');
    expect(base.textContent).toContain('TIME');
    const bound = receipt(d, { ...context, historyDisclosure: projection });
    expect(bound.textContent).toContain('authorized summary');
    expect(bound.textContent).toContain('(S//██████)');
    expect(bound.outerHTML).not.toContain('HIDDEN');
    expect(bound.outerHTML).toContain('source concealed');
    expect(bound.outerHTML).not.toContain('OLD-SECRET');
    const invalid: Session[] = [
      { ...context, currentDisclosureRevision: 'other', historyDisclosure: projection },
      { ...context, actBinding: { ...context.actBinding, documentId: 'other' }, historyDisclosure: projection },
      {
        ...context,
        historyDisclosure: { ...projection, entries: [{ ...projection.entries[0]!, sequence: e.sequence + 1 }] },
      },
      { ...context, historyDisclosure: { ...projection, entries: [projection.entries[0]!, projection.entries[0]!] } },
      {
        ...context,
        historyDisclosure: {
          ...projection,
          entries: [projection.entries[0]!, { ...projection.entries[0]!, subjectId: 'other' }],
        },
      },
      {
        ...context,
        historyDisclosure: {
          ...projection,
          entries: [projection.entries[0]!, { ...projection.entries[0]!, sequence: e.sequence + 1 }],
        },
      },
      {
        ...context,
        historyDisclosure: {
          ...projection,
          entries: [projection.entries[0]!, { ...projection.entries[0]!, requestId: 'other' }],
        },
      },
      {
        ...context,
        historyDisclosure: {
          ...projection,
          entries: [{ requestId: e.requestId!, sequence: e.sequence, subjectId: e.id, status: 'unavailable' }],
        },
      },
    ];
    for (const item of invalid) {
      const html = receipt(d, item).outerHTML;
      expect(html).not.toContain('OLD-SECRET');
      expect(html).not.toContain('authorized summary');
    }
  });
test('history pane does not disclose free prior answers without current binding', () => {
  const { d, e, projection } = setup();
  e.value = { free: 'OLD-SECRET' };
  e.act = 'answered';
  const d2 = structuredClone(d);
  const f = d2.findings.find((x) => x.id === e.id)!;
  f.person = e;
  const unbound = pane(d2, { tab: 'history', log: [e] });
  expect(unbound.outerHTML).not.toContain('OLD-SECRET');
  const bound = pane(d2, { tab: 'history', log: [e], ...context, historyDisclosure: projection });
  expect(bound.outerHTML).not.toContain('OLD-SECRET');
  expect(bound.textContent).toContain('authorized summary');
});
test('overlay result from a prior answer is not treated as a current disclosed projection', () => {
  const { d, e } = setup();
  const old = { text: '(S//OLD-SECRET)', layers: [{ tokens: [{ t: '(S//OLD-SECRET)' }] }], masks: [] };
  e.act = 'answered';
  e.value = { reading: { reading: 'synthetic', result: old } };
  const f = d.findings.find((x) => x.id === e.id)!;
  f.person = e;
  f.outcome.result = old;
  expect(pane(d, { tab: 'history', log: [e] }).outerHTML).not.toContain('OLD-SECRET');
  expect(receipt(d).outerHTML).not.toContain('OLD-SECRET');
});
