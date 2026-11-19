// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, test } from 'vite-plus/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseNativeSourceMarkingJson } from '@knitli/marque-kit-core/native-wire';
import { installSourceMarkingSession, renderSourceMarkingView } from '../../src/marking.ts';

const payload = readFileSync(join(import.meta.dirname, '../fixtures/native-source-marking.fixture'), 'utf8');
const view = parseNativeSourceMarkingJson(payload, 4096);

describe('read-only source marking', () => {
  test('renders the producer ordered permission-allowed token and typed placeholders', () => {
    const mark = renderSourceMarkingView(
      view,
      installSourceMarkingSession(view.binding, () => true),
    );
    expect(mark.textContent).toContain('S');
    expect(mark.textContent).not.toContain('CANARY');
    expect(view.marking.text).toBe('S');
    expect(view.marking.layers[0]?.tokens.map((token) => token.mask?.kind ?? `visible:${token.t}`)).toEqual([
      'concealed',
      'visible:S',
      'concealed',
      'concealed',
      'concealed',
      'unidentified',
      'concealed',
      'unidentified',
      'concealed',
    ]);
    expect(mark.querySelector('.mq-conceal')?.textContent).toBe('█');
    expect(mark.querySelector('.mq-mask')?.textContent).toBe('_');
    expect(mark.getAttribute('aria-label')).toContain('Read-only source marking:');
    expect(mark.getAttribute('aria-label')).toContain('source concealed');
    expect(mark.getAttribute('aria-label')).toContain('not identified');
    expect(mark.getAttribute('aria-label')).not.toContain('0 characters');
    expect(mark.textContent).not.toContain('CANARY');
    expect(mark.querySelectorAll('button')).toHaveLength(0);
  });

  test('rejects a view for another source revision, scope or viewer', () => {
    for (const expected of [
      { ...view.binding, revision_id: 'r-3' },
      { ...view.binding, source_id: 'other-source' },
      { ...view.binding, scope_id: '1' },
      { ...view.binding, viewer_id: 'other-viewer' },
    ]) {
      expect(() =>
        renderSourceMarkingView(
          view,
          installSourceMarkingSession(expected, () => true),
        ),
      ).toThrow('source marking view session mismatch or expired');
    }
    const partialBinding = { scope_id: view.binding.scope_id } as unknown as typeof view.binding;
    expect(() =>
      renderSourceMarkingView(
        view,
        installSourceMarkingSession(partialBinding, () => true),
      ),
    ).toThrow('source marking view session mismatch or expired');
    const expired = installSourceMarkingSession(view.binding, () => true);
    expired.revoke();
    expect(() => renderSourceMarkingView(view, expired)).toThrow('source marking view session mismatch or expired');
    const invalidated = installSourceMarkingSession(view.binding, () => false);
    expect(() => renderSourceMarkingView(view, invalidated)).toThrow('source marking view session mismatch or expired');
    const forged = { binding: view.binding, isCurrent: () => true, revoke: () => undefined } as never;
    expect(() => renderSourceMarkingView(view, forged)).toThrow('source marking view session mismatch or expired');
  });
});
