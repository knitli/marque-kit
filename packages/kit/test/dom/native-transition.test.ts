// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vite-plus/test';
import { empty } from '@knitli/marque-kit-core/state';
import type { Doc, EvaluationBasis, LogEntry } from '@knitli/marque-kit-core/types';
import type { OfficeWordSession, OfficeWordHost, OfficeWriteAck } from '../../../../apps/office-addin/src/workspace.ts';

test('legacy recovery retains the issued write receipt and does not dispatch the next write after native transition', async () => {
  const basis: EvaluationBasis = {
    sourceRevisions: { doc: 'r1' },
    selectionRevision: 's',
    relationshipRevision: 'r',
    contextRevision: 'c',
    policyRevision: 'p',
    declarationsRevision: 'd',
    scope: 'doc',
    operation: 'query',
    evaluationContextRevision: 'e',
    targetProfile: 't',
    questionRevisions: {},
    artifactRevisions: {},
    replacements: {},
  };
  const doc = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../../../fixtures/memo.findings.json'), 'utf8'),
  ) as Doc;
  doc.document.evaluation = { basis, completion: 'incomplete', snapshotReady: false, requirements: [] };
  const native = structuredClone(doc);
  native.document.native_evaluation = undefined;
  const entries: LogEntry[] = [1, 2].map((sequence) => ({
    sequence,
    requestId: `req-${sequence}`,
    id: `subject-${sequence}`,
    act: 'changed',
    value: null,
    at: 'now',
    binding: { documentId: 'doc', chain: 'chain', basis },
  }));
  let finish!: (ack: OfficeWriteAck) => void;
  const physical = vi.fn(
    () =>
      new Promise<OfficeWriteAck>((resolve) => {
        finish = resolve;
      }),
  );
  const receipts: OfficeWriteAck[] = [];
  const host = { activeDocumentId: async () => 'doc', applyCommitted: physical } as OfficeWordHost;
  const session = {
    documentId: 'doc',
    chain: 'chain',
    doc,
    state: empty(),
    basis,
    vocab: {},
    requiredWrites: [],
    confirmedWrites: [],
    requiredAcceptanceChecks: [],
    acceptanceChecks: {},
    pendingWrites: async () => entries,
    applyCommitted: async (id: string, h: OfficeWordHost) => {
      const ack = await h.applyCommitted(
        entries.find((e) => e.requestId === id)!,
        'doc',
      );
      receipts.push(ack);
      return ack;
    },
    evaluateCurrent: async () => ({
      documentId: 'doc',
      chain: 'chain',
      doc: native,
      basis,
      currentDisclosureRevision: undefined,
      historyDisclosure: undefined,
      requiredWrites: [],
      requiredAcceptanceChecks: [],
      confirmedWrites: [],
      acceptanceChecks: {},
      confirmedWriteAcks: { 'req-1': 'ack-1' },
    }),
  } as unknown as OfficeWordSession;
  document.body.innerHTML = '<div id="pane"></div><div id="note"></div><div id="sample"></div>';
  window.marqueOfficeWorkspace = { provider: { openWord: async () => session }, wordHost: host };
  let start!: (info: { host: string }) => Promise<void>;
  vi.stubGlobal('Office', {
    HostType: { Word: 'Word' },
    onReady: (callback: typeof start) => {
      start = callback;
    },
  });
  await import('../../../../apps/office-addin/src/taskpane.ts');
  await start({ host: 'Word' });
  await vi.waitFor(() => expect(physical).toHaveBeenCalledTimes(1));
  finish({ requestId: 'req-1', documentId: 'doc', basis, acknowledgement: 'ack-1' });
  await vi.waitFor(() =>
    expect(document.querySelector('#pane')?.textContent).toContain('current authority block evaluation is unavailable'),
  );
  await new Promise((r) => setTimeout(r, 10));
  expect(physical).toHaveBeenCalledTimes(1);
  expect(receipts.map((ack) => ack.acknowledgement)).toEqual(['ack-1']);
  expect(document.querySelector('#note button:not([disabled])')).toBeNull();
  delete window.marqueOfficeWorkspace;
  vi.unstubAllGlobals();
});
