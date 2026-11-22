// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, test } from 'vite-plus/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseNativeSourceMarkingJson } from '@knitli/marque-kit-core/native-wire';
import { installSourceMarkingSession, renderSourceMarkingView } from '../../src/marking.ts';

const payload = readFileSync(join(import.meta.dirname, '../fixtures/native-source-marking.fixture'), 'utf8');
const view = parseNativeSourceMarkingJson(payload, 4096);
const binding = view.binding;
const provider = (load: () => Promise<string | null>, isCurrent: () => boolean | Promise<boolean> = () => true) => ({
  isCurrent,
  load: async (_expected: typeof binding, maxBytes: number) => {
    expect(maxBytes).toBe(4096);
    return load();
  },
});

describe('read-only source marking session', () => {
  test('loads the provider response and renders only permitted tokens and typed masks', async () => {
    const session = installSourceMarkingSession(
      binding,
      4096,
      provider(async () => payload),
    );
    const mark = await renderSourceMarkingView(session);
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
    expect(mark.querySelectorAll('button')).toHaveLength(0);
  });

  test('rejects mismatched bindings and caller-supplied same-binding JSON', async () => {
    for (const expected of [
      { ...binding, revision_id: 'r-3' },
      { ...binding, source_id: 'other-source' },
      { ...binding, scope_id: '1' },
      { ...binding, viewer_id: 'other-viewer' },
    ]) {
      const session = installSourceMarkingSession(
        expected,
        4096,
        provider(async () => payload),
      );
      await expect(renderSourceMarkingView(session)).rejects.toThrow('source marking view session mismatch or expired');
    }
    expect(() =>
      installSourceMarkingSession(
        { scope_id: binding.scope_id } as never,
        4096,
        provider(async () => payload),
      ),
    ).toThrow('source marking session binding');
    await expect(renderSourceMarkingView(view as never)).rejects.toThrow(
      'source marking view session mismatch or expired',
    );
    const independent = JSON.stringify({ ...view, marking: { ...view.marking, text: 'S SECRET' } });
    await expect(renderSourceMarkingView(independent as never)).rejects.toThrow(
      'source marking view session mismatch or expired',
    );
  });

  test('rejects stale, revoked and invalidated sessions after an asynchronous load', async () => {
    let current = true;
    const staleAfterRead = installSourceMarkingSession(
      binding,
      4096,
      provider(
        async () => {
          current = false;
          return payload;
        },
        () => current,
      ),
    );
    await expect(renderSourceMarkingView(staleAfterRead)).rejects.toThrow(
      'source marking view session mismatch or expired',
    );

    let revoked!: ReturnType<typeof installSourceMarkingSession>;
    revoked = installSourceMarkingSession(
      binding,
      4096,
      provider(async () => {
        revoked.revoke();
        return payload;
      }),
    );
    await expect(renderSourceMarkingView(revoked)).rejects.toThrow('source marking view session mismatch or expired');

    let resolveCurrent!: (value: boolean) => void;
    let loads = 0;
    const pendingCurrent = installSourceMarkingSession(binding, 4096, {
      isCurrent: () =>
        new Promise<boolean>((resolve) => {
          resolveCurrent = resolve;
        }),
      load: async () => {
        loads += 1;
        return payload;
      },
    });
    const pendingRender = renderSourceMarkingView(pendingCurrent);
    pendingCurrent.revoke();
    resolveCurrent(true);
    await expect(pendingRender).rejects.toThrow('source marking view session mismatch or expired');
    expect(loads).toBe(0);
  });

  test('rejects synthetic v1 and enforces the install-time byte cap', async () => {
    const synthetic = readFileSync(
      join(import.meta.dirname, '../fixtures/native-source-marking-synthetic-v1.fixture'),
      'utf8',
    );
    const session = installSourceMarkingSession(
      binding,
      4096,
      provider(async () => synthetic),
    );
    await expect(renderSourceMarkingView(session)).rejects.toThrow(
      'invalid native evaluation wire: source marking envelope keys',
    );
    expect(() =>
      installSourceMarkingSession(
        binding,
        32_769,
        provider(async () => payload),
      ),
    ).toThrow('source marking byte cap');
  });
});
