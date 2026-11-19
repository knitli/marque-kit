// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { mount } from '@knitli/marque-kit';
import { parseNativeJson } from '@knitli/marque-kit-core/native-wire';
import type { NativeCabRequest } from '@knitli/marque-kit-core/native-cab';
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
function currentRequest(
  snapshot: OfficeNativeCabSnapshot | undefined,
  documentId: string,
  chain: string,
  maxBytes: number | undefined,
): NativeCabRequest | undefined {
  if (
    !snapshot ||
    snapshot.documentId !== documentId ||
    snapshot.chain !== chain ||
    snapshot.request?.target?.document_id !== documentId ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes! < 1
  )
    return undefined;
  return { ...snapshot.request, expectedChain: chain, maxBasisBytes: maxBytes! };
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
    doc: snapshotDoc(session.nativeCab, maxBytes),
    nativeCabRequest: currentRequest(session.nativeCab, session.documentId, session.chain, maxBytes),
    readOnly: true,
  });
  let generation = 0;
  let disposed = false;
  async function refresh(): Promise<void> {
    const attempt = ++generation;
    pane.update({ nativeCabRequest: null });
    if (!session.readNativeCab) return;
    try {
      if (!(await isSameWordDocument(wordHost, session)) || disposed || attempt !== generation) return;
      const next = await session.readNativeCab();
      const stillBound = await isSameWordDocument(wordHost, session);
      if (!stillBound || disposed || attempt !== generation) return;
      if (next.documentId !== session.documentId || next.chain !== session.chain) return;
      pane.update({
        doc: snapshotDoc(next, maxBytes),
        nativeCabRequest: currentRequest(next, session.documentId, session.chain, maxBytes) ?? null,
      });
    } catch {
      // The old scope was revoked before the failed read; a later refresh may restore it.
    }
  }
  if (session.readNativeCab) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Refresh authority block';
    button.addEventListener('click', () => void refresh());
    controls.append(button);
  }
  return {
    refresh,
    destroy() {
      disposed = true;
      generation++;
      pane.destroy();
      root.replaceChildren();
    },
  };
}
