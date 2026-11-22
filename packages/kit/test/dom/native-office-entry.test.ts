// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vite-plus/test';
import { parseNativeJson } from '@knitli/marque-kit-core/native-wire';
import type { OfficeWordHost, OfficeNativeWordSession } from '../../../../apps/office-addin/src/workspace.ts';

test('Office startup opens the provider native scope without falling back to sample or creating writes', async () => {
  const wire = parseNativeJson(
    readFileSync(join(import.meta.dirname, '../../../core/test/fixtures/native-cab.fixture'), 'utf8'),
    1_048_576,
  );
  const target = wire.evaluation.artifacts[0]!.target;
  const basis = wire.evaluation.basis!;
  const request = {
    kind: 'cab_snapshot' as const,
    operation: 'base' as const,
    target,
    profile: basis.basis.profile!,
    currentBasisJson: JSON.stringify(basis),
    maxBasisBytes: 1_048_576,
  };
  const write = vi.fn();
  const session = {
    documentId: target.document_id,
    chain: 'chain',
    kind: 'native_cab',
    nativeCab: { documentId: target.document_id, chain: 'chain', wire: JSON.stringify(wire), request },
  } as unknown as OfficeNativeWordSession;
  const wordHost = { activeDocumentId: async () => target.document_id, applyCommitted: write } as OfficeWordHost;
  document.body.innerHTML = '<div id="pane"></div><div id="note"></div><div id="sample"></div>';
  window.marqueOfficeWorkspace = { provider: { openWord: async () => session }, wordHost, nativeMaxBytes: 1_048_576 };
  let start!: (info: { host: string }) => Promise<void>;
  vi.stubGlobal('Office', {
    HostType: { Word: 'Word' },
    onReady: (callback: typeof start) => {
      start = callback;
    },
  });
  await import('../../../../apps/office-addin/src/taskpane.ts');
  await start({ host: 'Word' });
  expect(document.querySelector('#pane')?.textContent).toContain('Authority block evaluation is incomplete.');
  expect(document.querySelector('#pane')?.textContent).not.toContain('Needs you');
  expect(document.querySelector('#pane')?.querySelectorAll('button, input, form')).toHaveLength(0);
  expect(write).not.toHaveBeenCalled();
  delete window.marqueOfficeWorkspace;
  vi.unstubAllGlobals();
});
