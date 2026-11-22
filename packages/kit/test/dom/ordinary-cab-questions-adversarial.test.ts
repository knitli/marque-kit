// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createRequire } from 'node:module';
import { describe, expect, test, vi } from 'vite-plus/test';
import { mountOrdinaryCabWorkspace } from '../../../../apps/office-addin/src/ordinary-cab-workspace.ts';
import type {
  OfficeNativeWordSession,
  OfficeOrdinaryCabGrant,
  OfficeWordHost,
} from '../../../../apps/office-addin/src/workspace.ts';
import requestFixture from './fixtures/ordinary-cab-161.json' with { type: 'json' };
import snapshotFixture from './fixtures/ordinary-cab-basis-161.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const describeWasm = process.env.MARQUE_159_WASM ? describe : describe.skip;

function actualWasm(): { evaluate_ordinary_cab_questions(input: string): string } {
  return require('./artifacts/candidate/marque_wasm.js') as {
    evaluate_ordinary_cab_questions(input: string): string;
  };
}

function grant(): OfficeOrdinaryCabGrant {
  return {
    documentId: 'synthetic-target',
    chain: 'neutral-chain-159',
    viewerId: 'synthetic-viewer',
    grantId: 'synthetic-grant-1',
    permissionRevision: 'permission-1',
    layoutRevision: 'layout-1',
    authorizeRawInput: true,
    authorizeRawOutput: true,
    requestJson: JSON.stringify(requestFixture),
    current: {
      kind: 'cab_snapshot',
      operation: 'base',
      target: structuredClone(
        snapshotFixture.evaluation.artifacts[0]!.target,
      ) as OfficeOrdinaryCabGrant['current']['target'],
      profile: structuredClone(
        snapshotFixture.evaluation.basis.basis.profile,
      ) as OfficeOrdinaryCabGrant['current']['profile'],
      currentBasisJson: JSON.stringify(snapshotFixture.evaluation.basis),
    },
    disclosedFields: ['classified_by'],
  };
}

function setup(
  evaluate: (input: string) => Promise<string>,
  initial: OfficeOrdinaryCabGrant | null = grant(),
  watcher = true,
) {
  const root = document.createElement('div');
  document.body.append(root);
  const session: OfficeNativeWordSession = {
    kind: 'native_cab',
    documentId: 'synthetic-target',
    chain: 'neutral-chain-159',
    nativeCab: { documentId: 'synthetic-target', chain: 'neutral-chain-159', wire: '' },
    ordinaryCab: { viewerId: 'synthetic-viewer', evaluate },
  };
  let current = initial;
  let currentDocument = session.documentId;
  let invalidate = () => {};
  const apply = vi.fn();
  const stop = vi.fn();
  const read = vi.fn(async () => (current ? structuredClone(current) : null));
  const host: OfficeWordHost = {
    activeDocumentId: async () => currentDocument,
    applyCommitted: apply,
    readOrdinaryCabGrant: read,
    ...(watcher
      ? {
          watchOrdinaryCabInvalidation: (_document: string, _chain: string, _viewer: string, notify: () => void) => {
            invalidate = notify;
            return stop;
          },
        }
      : {}),
  };
  const pane = mountOrdinaryCabWorkspace(root, session, host, 1_048_576);
  return {
    root,
    pane,
    apply,
    read,
    stop,
    setGrant(value: OfficeOrdinaryCabGrant | null) {
      current = value;
    },
    setDocument(value: string) {
      currentDocument = value;
    },
    invalidate() {
      invalidate();
    },
    destroy() {
      pane.destroy();
      root.remove();
    },
  };
}

function assertNoDisclosure(root: HTMLElement): void {
  for (const hidden of [
    'Synthetic target',
    '20500101',
    'Example Office',
    'synthetic-target',
    'neutral-chain-159',
    'synthetic-viewer',
    'synthetic-grant-1',
    'permission-1',
    'layout-1',
  ])
    expect(root.outerHTML).not.toContain(hidden);
  expect(root.querySelector('button, input, textarea, a')).toBeNull();
  expect(root.textContent?.toLowerCase()).not.toMatch(/\b(ready|done|approved|applied)\b/);
}

describeWasm('ordinary CAB host boundary with actual #159 WASM', () => {
  test('denies raw input and output before invoking the executor', async () => {
    for (const denial of ['input', 'output', 'viewer', 'target', 'layout', 'none', 'watcher'] as const) {
      const value = grant();
      if (denial === 'input') Object.assign(value, { authorizeRawInput: false });
      if (denial === 'output') Object.assign(value, { authorizeRawOutput: false });
      if (denial === 'viewer') value.viewerId = 'another-viewer';
      if (denial === 'target') value.current.target.revision_id = 'another-revision';
      if (denial === 'layout') value.layoutRevision = 'layout-2';
      const evaluate = vi.fn(async (input: string) => actualWasm().evaluate_ordinary_cab_questions(input));
      const f = setup(evaluate, denial === 'none' ? null : value, denial !== 'watcher');
      await f.pane.ready;
      expect(evaluate, denial).not.toHaveBeenCalled();
      expect(f.root.textContent).toContain('unavailable');
      expect(f.apply).not.toHaveBeenCalled();
      assertNoDisclosure(f.root);
      f.destroy();
    }
  });

  test('reveals only the separately granted question and no act or readiness', async () => {
    const evaluate = vi.fn(async (input: string) => actualWasm().evaluate_ordinary_cab_questions(input));
    const f = setup(evaluate);
    await f.pane.ready;
    expect(evaluate).toHaveBeenCalledOnce();
    expect(f.root.textContent).toContain('Provide Classified by.');
    expect(f.root.textContent).not.toContain('Classification reason');
    expect(f.apply).not.toHaveBeenCalled();
    assertNoDisclosure(f.root);
    f.destroy();
    expect(f.stop).toHaveBeenCalledOnce();
  });

  test('same-text reflow cannot reuse old layout receipts', async () => {
    const evaluate = vi.fn(async (input: string) => actualWasm().evaluate_ordinary_cab_questions(input));
    const f = setup(evaluate);
    await f.pane.ready;
    expect(f.root.textContent).toContain('Provide Classified by.');
    const newer = grant();
    newer.layoutRevision = 'layout-2';
    f.setGrant(newer);
    f.invalidate();
    expect(f.root.textContent).not.toContain('Classified by');
    await f.pane.refresh();
    expect(evaluate).toHaveBeenCalledOnce();
    expect(f.root.textContent).toContain('unavailable');
    assertNoDisclosure(f.root);

    const relocated = structuredClone(requestFixture);
    relocated.member.cab_inspection.layout_revision = 'layout-2';
    for (const row of relocated.member.cab_inspection.fields) row.readback.layout_revision = 'layout-2';
    newer.requestJson = JSON.stringify(relocated);
    f.setGrant(newer);
    f.invalidate();
    await f.pane.refresh();
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(f.root.textContent).toContain('Provide Classified by.');
    assertNoDisclosure(f.root);
    f.destroy();
  });

  test.each(['layout', 'permission', 'grant', 'viewer', 'document'] as const)(
    'withholds an old WASM result after %s changes during its evaluation',
    async (change) => {
      let deliver: (() => void) | undefined;
      const evaluate = vi.fn((input: string) => {
        const response = actualWasm().evaluate_ordinary_cab_questions(input);
        return new Promise<string>((resolve) => {
          deliver = () => resolve(response);
        });
      });
      const f = setup(evaluate);
      await vi.waitFor(() => expect(evaluate).toHaveBeenCalledOnce());
      const newer = grant();
      if (change === 'layout') newer.layoutRevision = 'layout-2';
      if (change === 'permission')
        Object.assign(newer, { authorizeRawInput: false, permissionRevision: 'permission-2' });
      if (change === 'grant') newer.grantId = 'synthetic-grant-2';
      if (change === 'viewer') newer.viewerId = 'another-viewer';
      if (change === 'document') f.setDocument('another-document');
      f.setGrant(newer);
      f.invalidate();
      deliver!();
      await f.pane.ready;
      expect(f.root.textContent).toContain('unavailable');
      expect(f.root.textContent).not.toContain('Classified by');
      expect(f.apply).not.toHaveBeenCalled();
      assertNoDisclosure(f.root);
      f.destroy();
    },
  );

  test('a late previous result cannot replace a newer viewer grant', async () => {
    let deliverOld: (() => void) | undefined;
    const evaluate = vi.fn((input: string) => {
      const response = actualWasm().evaluate_ordinary_cab_questions(input);
      if (deliverOld) return Promise.resolve(response);
      return new Promise<string>((resolve) => {
        deliverOld = () => resolve(response);
      });
    });
    const f = setup(evaluate);
    await vi.waitFor(() => expect(evaluate).toHaveBeenCalledOnce());
    const newer = grant();
    newer.grantId = 'synthetic-grant-2';
    newer.disclosedFields = ['classification_reason'];
    f.setGrant(newer);
    f.invalidate();
    await f.pane.refresh();
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(f.root.textContent).toContain('Provide Classification reason.');
    expect(f.root.textContent).not.toContain('Classified by');
    deliverOld!();
    await f.pane.ready;
    expect(f.root.textContent).toContain('Provide Classification reason.');
    expect(f.root.textContent).not.toContain('Classified by');
    expect(f.apply).not.toHaveBeenCalled();
    assertNoDisclosure(f.root);
    f.destroy();
  });

  test.each(['layout', 'grant', 'viewer'] as const)(
    'rechecks %s before showing an old result even without a notification',
    async (change) => {
      let deliver: (() => void) | undefined;
      const evaluate = vi.fn((input: string) => {
        const response = actualWasm().evaluate_ordinary_cab_questions(input);
        return new Promise<string>((resolve) => {
          deliver = () => resolve(response);
        });
      });
      const f = setup(evaluate);
      await vi.waitFor(() => expect(evaluate).toHaveBeenCalledOnce());
      const newer = grant();
      if (change === 'layout') newer.layoutRevision = 'layout-2';
      if (change === 'grant') newer.grantId = 'synthetic-grant-2';
      if (change === 'viewer') newer.viewerId = 'another-viewer';
      f.setGrant(newer);
      deliver!();
      await f.pane.ready;
      expect(f.root.textContent).toContain('unavailable');
      expect(f.root.textContent).not.toContain('Classified by');
      assertNoDisclosure(f.root);
      f.destroy();
    },
  );

  test('does not render a forged prompt even when the field is permitted', async () => {
    const evaluate = vi.fn(async (input: string) => {
      const response = JSON.parse(actualWasm().evaluate_ordinary_cab_questions(input)) as {
        snapshot: { evaluation: { findings: { items: { question: { field: string; prompt: string } | null }[] } } };
      };
      for (const finding of response.snapshot.evaluation.findings.items) {
        if (finding.question?.field === 'classified_by') finding.question.prompt = 'PRIVATE SOURCE TEXT';
      }
      return JSON.stringify(response);
    });
    const f = setup(evaluate);
    await f.pane.ready;
    expect(evaluate).toHaveBeenCalledOnce();
    expect(f.root.textContent).toContain('Provide Classified by.');
    expect(f.root.textContent).not.toContain('PRIVATE SOURCE TEXT');
    expect(f.root.textContent).not.toContain('Classification reason');
    assertNoDisclosure(f.root);
    f.destroy();
  });
});
