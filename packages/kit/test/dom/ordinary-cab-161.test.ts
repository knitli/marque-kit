// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { createRequire } from 'node:module';
import { expect, test, vi } from 'vite-plus/test';
import { mountOrdinaryCabWorkspace } from '../../../../apps/office-addin/src/ordinary-cab-workspace.ts';
import type {
  OfficeNativeWordSession,
  OfficeOrdinaryCabGrant,
  OfficeWordHost,
} from '../../../../apps/office-addin/src/workspace.ts';

import requestFixture from './fixtures/ordinary-cab-161.json' with { type: 'json' };
import snapshotFixture from './fixtures/ordinary-cab-basis-161.json' with { type: 'json' };

const requestJson = JSON.stringify(requestFixture);
const snapshot = JSON.parse(JSON.stringify(snapshotFixture));
const target = snapshot.evaluation.artifacts[0].target;
function setup(evaluate: (s: string) => Promise<string>) {
  const session: OfficeNativeWordSession = {
    kind: 'native_cab',
    documentId: 'synthetic-target',
    chain: 'neutral-chain-159',
    nativeCab: { documentId: 'synthetic-target', chain: 'neutral-chain-159', wire: '' },
    ordinaryCab: { viewerId: 'viewer', evaluate },
  };
  const grant: OfficeOrdinaryCabGrant = {
    documentId: session.documentId,
    chain: session.chain,
    viewerId: 'viewer',
    grantId: 'grant',
    permissionRevision: 'permission-1',
    layoutRevision: 'layout-1',
    authorizeRawInput: true,
    authorizeRawOutput: true,
    requestJson,
    current: {
      kind: 'cab_snapshot',
      operation: 'base',
      target,
      profile: snapshot.evaluation.basis.basis.profile,
      currentBasisJson: JSON.stringify(snapshot.evaluation.basis),
    },
    disclosedFields: ['classified_by'],
  };
  let current: OfficeOrdinaryCabGrant | null = grant;
  let invalidate = () => {};
  const host: OfficeWordHost = {
    activeDocumentId: async () => session.documentId,
    applyCommitted: vi.fn(),
    watchOrdinaryCabInvalidation: (_doc, _chain, _viewer, cb) => {
      invalidate = cb;
      return () => {};
    },
    readOrdinaryCabGrant: async () => current,
  };
  const root = document.createElement('div');
  const pane = mountOrdinaryCabWorkspace(root, session, host, 1_048_576);
  return {
    root,
    pane,
    grant,
    host,
    setGrant: (g: OfficeOrdinaryCabGrant | null) => {
      current = g;
    },
    invalidate,
  };
}
const wasmPath = process.env.MARQUE_159_WASM;
test.skipIf(!wasmPath)('real ordinary WASM grants only the selected question', async () => {
  const wasm = createRequire(import.meta.url)('./artifacts/candidate/marque_wasm.js');
  const evaluate = vi.fn(async (input: string) => wasm.evaluate_ordinary_cab_questions(input));
  const f = setup(evaluate);
  await f.pane.ready;
  expect(evaluate).toHaveBeenCalledOnce();
  expect(f.root.textContent).toContain('Classified by');
  expect(f.root.textContent).not.toContain('Classification reason');
  f.invalidate();
  expect(f.root.textContent).not.toContain('Classified by');
  f.grant.layoutRevision = 'layout-2';
  await f.pane.refresh();
  expect(f.root.textContent).not.toContain('Classified by');
  f.pane.destroy();
});
test('missing or stale permission revokes before evaluation or disclosure', async () => {
  const response = JSON.stringify({
    schema: 'marque.ordinary-cab-questions.v1',
    status: 'available',
    reason: null,
    snapshot,
  });
  const evaluate = vi.fn(async () => response);
  const f = setup(evaluate);
  await f.pane.ready;
  expect(f.root.textContent).toContain('Classified by');
  f.setGrant(null);
  f.invalidate();
  await f.pane.refresh();
  expect(evaluate).toHaveBeenCalledOnce();
  expect(f.root.textContent).not.toContain('Classified by');
  f.pane.destroy();
});

test('same-text reflow during evaluation revokes the old response', async () => {
  let resolve!: (value: string) => void;
  const evaluate = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  const f = setup(evaluate);
  while (!resolve) await Promise.resolve();
  f.grant.layoutRevision = 'layout-2';
  f.invalidate();
  resolve(JSON.stringify({ schema: 'marque.ordinary-cab-questions.v1', status: 'available', reason: null, snapshot }));
  await f.pane.ready;
  expect(f.root.textContent).not.toContain('Classified by');
  f.pane.destroy();
});

test('viewer mismatch, missing raw authorization, stale basis and chain withhold', async () => {
  const response = JSON.stringify({
    schema: 'marque.ordinary-cab-questions.v1',
    status: 'available',
    reason: null,
    snapshot,
  });
  const evaluate = vi.fn(async () => response);
  const f = setup(evaluate);
  await f.pane.ready;
  const baseline = evaluate.mock.calls.length;
  f.grant.viewerId = 'another-viewer';
  await f.pane.refresh();
  expect(evaluate.mock.calls.length).toBe(baseline);
  expect(f.root.textContent).not.toContain('Classified by');
  f.grant.viewerId = 'viewer';
  (f.grant as unknown as { authorizeRawOutput: boolean }).authorizeRawOutput = false;
  await f.pane.refresh();
  expect(evaluate.mock.calls.length).toBe(baseline);
  (f.grant as unknown as { authorizeRawOutput: boolean }).authorizeRawOutput = true;
  const basis = JSON.parse(f.grant.current.currentBasisJson);
  basis.basis.source_revisions[0].revision_id = 'stale';
  f.grant.current.currentBasisJson = JSON.stringify(basis);
  await f.pane.refresh();
  expect(f.root.textContent).not.toContain('Classified by');
  f.grant.current.currentBasisJson = JSON.stringify(snapshot.evaluation.basis);
  f.grant.chain = 'wrong';
  await f.pane.refresh();
  expect(f.root.textContent).not.toContain('Classified by');
  f.pane.destroy();
});
