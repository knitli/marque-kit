// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import { parseNativeSourceMarkingJson } from '@knitli/marque-kit-core/native-wire';
import { mountOfficeSourceMarking } from '../../../../apps/office-addin/src/source-marking.ts';

const payload = readFileSync(join(import.meta.dirname, '../fixtures/native-source-marking.fixture'), 'utf8');
const binding = parseNativeSourceMarkingJson(payload, 4096).binding;

describe('Office source marking sessions', () => {
  test('an old invalidation cannot clear a newer session, and destroy prevents refresh', async () => {
    const callbacks: Array<() => void> = [];
    let opens = 0;
    const root = document.createElement('div');
    const pane = mountOfficeSourceMarking(root, {
      maxBytes: 4096,
      activeDocumentId: async () => 'doc',
      open: async () => {
        opens++;
        return {
          documentId: 'doc',
          binding,
          currentBinding: async () => binding,
          isCurrent: () => true,
          watchInvalidation(callback) {
            callbacks.push(callback);
            return () => {};
          },
          read: async () => payload,
        };
      },
    });
    await pane.ready;
    expect(root.querySelector('.mq-mark')).not.toBeNull();
    await pane.refresh();
    expect(callbacks).toHaveLength(2);
    callbacks[0]!();
    expect(root.querySelector('.mq-mark')).not.toBeNull();
    callbacks[1]!();
    expect(root.querySelector('.mq-mark')).toBeNull();
    await pane.refresh();
    pane.destroy();
    await pane.refresh();
    expect(opens).toBe(3);
    expect(root.children).toHaveLength(0);
  });
});
