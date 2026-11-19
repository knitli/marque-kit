// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { mount } from '@knitli/marque-kit';
import { isNativeSemanticResultsRequest } from '@knitli/marque-kit-core/native-results';
import { parseNativeSemanticResultsJson } from '@knitli/marque-kit-core/native-wire';
import type { Doc } from '@knitli/marque-kit-core/types';
import { isSameWordDocument } from './workspace.ts';
import type {
  OfficeNativeSemanticResultsSession,
  OfficeNativeSemanticResultsSnapshot,
  OfficeWordHost,
} from './workspace.ts';

function snapshotDoc(snapshot: OfficeNativeSemanticResultsSnapshot | undefined, maxBytes: number | undefined): Doc {
  let native;
  try {
    if (!Number.isSafeInteger(maxBytes) || maxBytes! < 1) throw new Error();
    native = parseNativeSemanticResultsJson(snapshot?.wire ?? '', maxBytes!);
  } catch {
    // A malformed or unavailable projection cannot fall through to a legacy evaluation.
  }
  return { findings: [], document: { blocking: [], artifacts: [], native_semantic_results: native } };
}

/** Read-only restricted route. This session accepts sanitized results bytes only. */
export function mountNativeSemanticResultsWorkspace(
  root: HTMLElement,
  session: OfficeNativeSemanticResultsSession,
  wordHost: OfficeWordHost,
  maxBytes: number | undefined,
): { readonly ready: Promise<void>; refresh(): Promise<void>; destroy(): void } {
  const container = document.createElement('div');
  const controls = document.createElement('div');
  root.replaceChildren(container, controls);
  const pane = mount(container, {
    doc: snapshotDoc(undefined, maxBytes),
    nativeSemanticResultsRequest: undefined,
    readOnly: true,
  });
  let generation = 0;
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  const stopWatching = (): void => {
    try {
      unsubscribe?.();
    } catch {
      // A failing host cleanup must not leave the previous view mounted.
    }
    unsubscribe = undefined;
  };
  const invalidate = () => {
    if (disposed) return;
    generation++;
    pane.update({ nativeSemanticResultsRequest: null, doc: snapshotDoc(undefined, maxBytes) });
  };
  const eligible =
    Number.isSafeInteger(maxBytes) &&
    maxBytes! > 0 &&
    !!session.documentId &&
    !!session.viewerId &&
    !!wordHost.watchNativeSemanticResultsInvalidation &&
    !!wordHost.readNativeSemanticResultsRequest;
  async function obtain(initial: boolean): Promise<void> {
    const attempt = ++generation;
    pane.update({ nativeSemanticResultsRequest: null, doc: snapshotDoc(undefined, maxBytes) });
    if (!eligible || !wordHost.readNativeSemanticResultsRequest) return;
    try {
      const sameDocument = await isSameWordDocument(wordHost, session);
      if (disposed || attempt !== generation) return;
      if (!sameDocument) {
        stopWatching();
        return;
      }
      if (typeof unsubscribe !== 'function') {
        try {
          unsubscribe = wordHost.watchNativeSemanticResultsInvalidation!(
            session.documentId,
            session.viewerId,
            invalidate,
          );
        } catch {
          unsubscribe = undefined;
        }
      }
      if (typeof unsubscribe !== 'function') return;
      const next = initial ? session.nativeSemanticResults : await session.readNativeSemanticResults?.();
      if (
        !next ||
        disposed ||
        attempt !== generation ||
        next.documentId !== session.documentId ||
        !session.documentId ||
        !session.viewerId
      )
        return;
      const currentRequest = await wordHost.readNativeSemanticResultsRequest(session.documentId, session.viewerId);
      const stillBound = await isSameWordDocument(wordHost, session);
      if (disposed || attempt !== generation) return;
      if (!stillBound) {
        stopWatching();
        return;
      }
      if (!isNativeSemanticResultsRequest(currentRequest)) return;
      const current = currentRequest.current;
      if (
        current.documentId !== session.documentId ||
        current.viewerId !== session.viewerId ||
        !session.documentId ||
        !session.viewerId
      )
        return;
      const doc = snapshotDoc(next, maxBytes);
      pane.update({
        doc,
        currentDisclosureRevision: current.principalRevision,
        nativeSemanticResultsRequest: currentRequest,
      });
    } catch {
      // Missing current context remains revoked until an authorized refresh.
    }
  }
  const ready = obtain(true);
  if (session.readNativeSemanticResults) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Refresh evaluation results';
    button.addEventListener('click', () => void obtain(false));
    controls.append(button);
  }
  return {
    ready,
    refresh: () => obtain(false),
    destroy() {
      disposed = true;
      generation++;
      pane.destroy();
      stopWatching();
      root.replaceChildren();
    },
  };
}
