// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { mount } from '@knitli/marque-kit';
import { parseNativeJson } from '@knitli/marque-kit-core/native-wire';
import type { Doc } from '@knitli/marque-kit-core/types';
import { isSameWordDocument } from './workspace.ts';
import type { OfficeNativeCabSnapshot, OfficeNativeWordSession, OfficeWordHost } from './workspace.ts';

/** Parse inside this bundle, under the installation's bound; retain a native route on failure. */
function snapshotDoc(snapshot: OfficeNativeCabSnapshot | undefined, maxBytes: number | undefined): Doc {
  let native;
  try {
    if (!Number.isSafeInteger(maxBytes) || maxBytes! < 1) throw new Error();
    native = parseNativeJson(snapshot?.wire ?? '', maxBytes!);
  } catch {
    // Invalid or unavailable input cannot fall through to legacy findings.
  }
  return { findings: [], document: { blocking: [], artifacts: [], native_evaluation: native } };
}
/** Read-only native result. Refresh revokes the prior scope before awaiting the provider. */
export function mountNativeWorkspace(
  root: HTMLElement,
  session: OfficeNativeWordSession,
  wordHost: OfficeWordHost,
  maxBytes: number | undefined,
) {
  const container = document.createElement('div');
  const controls = document.createElement('div');
  root.replaceChildren(container, controls);
  const pane = mount(container, {
    doc: snapshotDoc(undefined, maxBytes),
    nativeCabRequest: undefined,
    readOnly: true,
  });
  let generation = 0;
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  const invalidate = () => {
    if (disposed) return;
    generation++;
    pane.update({ nativeCabRequest: null });
  };
  const eligible =
    Number.isSafeInteger(maxBytes) &&
    maxBytes! > 0 &&
    !!wordHost.watchNativeCabInvalidation &&
    !!wordHost.readNativeCabScope;
  if (eligible) {
    try {
      unsubscribe = wordHost.watchNativeCabInvalidation!(session.documentId, session.chain, invalidate);
    } catch {
      unsubscribe = undefined;
    }
  }
  async function obtain(initial: boolean): Promise<void> {
    const attempt = ++generation;
    pane.update({ nativeCabRequest: null });
    if (typeof unsubscribe !== 'function' || !wordHost.readNativeCabScope || (!initial && !session.readNativeCab))
      return;
    try {
      if (!(await isSameWordDocument(wordHost, session)) || disposed || attempt !== generation) return;
      const next = initial ? session.nativeCab : await session.readNativeCab!();
      if (disposed || attempt !== generation || next.documentId !== session.documentId || next.chain !== session.chain)
        return;
      const scope = await wordHost.readNativeCabScope(session.documentId, session.chain);
      const stillBound = await isSameWordDocument(wordHost, session);
      if (
        !scope ||
        scope.target?.document_id !== session.documentId ||
        !stillBound ||
        disposed ||
        attempt !== generation
      )
        return;
      pane.update({
        doc: snapshotDoc(next, maxBytes),
        nativeCabRequest: { ...scope, expectedChain: session.chain, maxBasisBytes: maxBytes! },
      });
    } catch {
      // Unavailable scope remains revoked until a later authorized read.
    }
  }
  const ready = obtain(true);
  const refresh = () => obtain(false);

  if (session.readNativeCab) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Refresh authority block';
    button.addEventListener('click', () => void refresh());
    controls.append(button);
  }
  return {
    ready,
    refresh,
    destroy() {
      disposed = true;
      generation++;
      unsubscribe?.();
      pane.destroy();
      root.replaceChildren();
    },
  };
}
