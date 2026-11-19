// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import type { NativeSourceMarkingBinding } from '@knitli/marque-kit-core/native-wire';
import { installSourceMarkingSession, renderSourceMarkingView } from '@knitli/marque-kit/marking';
/** Separately installed capability; source, viewer and document ownership remain with the host. */
export interface OfficeSourceMarkingInstallation {
  readonly maxBytes: number;
  activeDocumentId(): Promise<string | null>;
  open(): Promise<OfficeSourceMarkingSession | null>;
}
export interface OfficeSourceMarkingSession {
  readonly documentId: string;
  readonly binding: Readonly<NativeSourceMarkingBinding>;
  currentBinding(): Promise<Readonly<NativeSourceMarkingBinding> | null>;
  isCurrent(): boolean;
  /** Fires before document, source, scope, viewer or permission changes can be shown. */
  watchInvalidation(invalidate: () => void): () => void;
  read(): Promise<string>;
}
const keys = ['chain_id', 'source_id', 'revision_id', 'contribution_id', 'scope_id', 'viewer_id'] as const;
function sameBinding(a: Readonly<NativeSourceMarkingBinding> | null, b: Readonly<NativeSourceMarkingBinding>): boolean {
  return !!a && keys.every((key) => typeof a[key] === 'string' && a[key].length > 0 && a[key] === b[key]);
}
/** Read-only source view; invalid or absent capability leaves the view unavailable. */
export function mountOfficeSourceMarking(
  root: HTMLElement,
  installation: OfficeSourceMarkingInstallation,
): { readonly ready: Promise<void>; refresh(): Promise<void>; destroy(): void } {
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const display = document.createElement('div');
  const refreshButton = document.createElement('button');
  refreshButton.type = 'button';
  refreshButton.textContent = 'Refresh source marking';
  root.replaceChildren(status, display, refreshButton);
  let generation = 0;
  let disposed = false;
  let unwatch: (() => void) | undefined;
  let revoke: (() => void) | undefined;
  const clear = () => {
    generation++;
    revoke?.();
    revoke = undefined;
    display.replaceChildren();
    status.textContent = 'Source marking unavailable.';
  };
  const invalidate = () => {
    if (!disposed) clear();
  };
  async function refresh(): Promise<void> {
    clear();
    try {
      unwatch?.();
    } catch {
      /* already cleared */
    }
    unwatch = undefined;
    const attempt = generation;
    const valid = () => !disposed && generation === attempt;
    if (!Number.isSafeInteger(installation.maxBytes) || installation.maxBytes < 1) return;
    try {
      const session = await installation.open();
      if (!valid() || !session || !session.documentId || !session.isCurrent()) return;
      const binding = { ...session.binding };
      if (!sameBinding(binding, binding)) return;
      const stop = session.watchInvalidation(invalidate);
      if (typeof stop !== 'function') return;
      if (!valid()) {
        stop();
        return;
      }
      unwatch = stop;
      const capability = installSourceMarkingSession(binding, installation.maxBytes, {
        async isCurrent() {
          if (!valid() || !session.isCurrent()) return false;
          const current = await session.currentBinding();
          if (!valid() || !session.isCurrent() || !sameBinding(current, binding)) return false;
          const documentId = await installation.activeDocumentId();
          return valid() && session.isCurrent() && documentId === session.documentId;
        },
        async load() {
          return session.read();
        },
      });
      revoke = () => capability.revoke();
      const mark = await renderSourceMarkingView(capability);
      if (!valid() || !(await capability.isCurrent()) || !valid()) {
        capability.revoke();
        return;
      }
      display.replaceChildren(mark);
      status.textContent = 'Source marking';
    } catch {
      if (valid()) clear();
    }
  }
  refreshButton.addEventListener('click', () => void refresh());
  status.textContent = 'Source marking unavailable.';
  const ready = refresh();
  return {
    ready,
    refresh,
    destroy() {
      if (disposed) return;
      clear();
      disposed = true;
      try {
        unwatch?.();
      } catch {
        /* detached */
      }
      root.replaceChildren();
    },
  };
}
