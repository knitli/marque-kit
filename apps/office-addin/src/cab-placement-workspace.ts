// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { canon } from '@knitli/marque-kit-core/state';
import { hasUnpairedSurrogate } from '@knitli/marque-kit-core/marking';
import { discoverWordCabBindings, readWordCabInspection, readWordCabPlacement } from './cab-placement.ts';
import { isSameWordDocument } from './workspace.ts';
import type { CabSpan, WordCabLabel } from './cab-placement.ts';
import type { OfficeCabPlacementScope, OfficeNativeCabPlacementSession, OfficeWordHost } from './workspace.ts';

/** The target and face are independent host grants, never candidate-derived. */
function currentScope(
  input: OfficeCabPlacementScope | null,
  documentId: string,
  maxBytes: number,
): OfficeCabPlacementScope | null {
  const limit = Math.min(maxBytes, 1_048_576);
  if (
    !input ||
    typeof input.text !== 'string' ||
    input.text.length > limit ||
    hasUnpairedSurrogate(input.text) ||
    new TextEncoder().encode(input.text).length > limit ||
    !input.target ||
    input.ownership !== 'exclusive' ||
    typeof input.layout_revision !== 'string' ||
    !input.layout_revision ||
    input.layout_revision.length > 256 ||
    !Number.isSafeInteger(input.face_page) ||
    input.face_page < 1
  )
    return null;
  const { target, face_page: facePage } = input;
  const pair = (value: CabSpan): boolean =>
    Array.isArray(value) && value.length === 2 && value.every((number) => Number.isSafeInteger(number) && number >= 0);
  if (
    !pair(target.scope_locator) ||
    target.scope_locator[0] >= target.scope_locator[1] ||
    target.scope_locator[1] > new TextEncoder().encode(input.text).length ||
    target.document_id !== documentId ||
    [target.document_id, target.revision_id, target.contribution_id].some(
      (value) => typeof value !== 'string' || !value || value.length > 256,
    )
  )
    return null;
  try {
    const bytes = new TextEncoder().encode(input.text);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(bytes.subarray(0, target.scope_locator[0]));
    decoder.decode(bytes.subarray(0, target.scope_locator[1]));
  } catch {
    return null;
  }
  const owner = {
    document_id: target.document_id,
    revision_id: target.revision_id,
    contribution_id: target.contribution_id,
    scope_locator: [...target.scope_locator] as CabSpan,
  };
  return {
    target: owner,
    face_page: facePage,
    ownership: 'exclusive',
    text: input.text,
    layout_revision: input.layout_revision,
  };
}

/** Authorized, read-only ordinary-document route; no CAB policy or readiness result is inferred. */
export function mountCabPlacementWorkspace(
  root: HTMLElement,
  session: OfficeNativeCabPlacementSession,
  host: OfficeWordHost,
  maxBytes: number | undefined,
): { readonly ready: Promise<void>; refresh(): Promise<void>; destroy(): void } {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  heading.className = 'mq-label';
  heading.textContent = 'Authority block placement';
  const message = document.createElement('p');
  message.className = 'mq-p';
  const refreshButton = document.createElement('button');
  refreshButton.type = 'button';
  refreshButton.textContent = 'Refresh authority block placement';
  section.append(heading, message, refreshButton);
  root.replaceChildren(section);
  let disposed = false;
  let generation = 0;
  let unsubscribe: (() => void) | undefined;
  const unavailable = (): void => {
    message.textContent = 'The current placement is unavailable.';
  };
  const invalidate = (): void => {
    if (disposed) return;
    generation++;
    unavailable();
  };
  unavailable();
  if (
    Number.isSafeInteger(maxBytes) &&
    maxBytes! > 0 &&
    session.documentId &&
    session.chain &&
    host.watchNativeCabInvalidation &&
    host.readNativeCabPlacementScope
  ) {
    try {
      unsubscribe = host.watchNativeCabInvalidation(session.documentId, session.chain, invalidate);
    } catch {
      /* unavailable */
    }
  }
  async function obtain(): Promise<void> {
    const attempt = ++generation;
    unavailable();
    if (
      typeof unsubscribe !== 'function' ||
      !host.readNativeCabPlacementScope ||
      !maxBytes ||
      !session.inspectCabPlacement
    )
      return;
    try {
      if (!(await isSameWordDocument(host, session)) || disposed || attempt !== generation) return;
      const initial = currentScope(
        await host.readNativeCabPlacementScope(session.documentId, session.chain),
        session.documentId,
        maxBytes,
      );
      if (!initial || disposed || attempt !== generation) return;
      const current = async (): Promise<boolean> => {
        const next = currentScope(
          await host.readNativeCabPlacementScope!(session.documentId, session.chain),
          session.documentId,
          maxBytes,
        );
        const bound = await isSameWordDocument(host, session);
        if (disposed || attempt !== generation) return false;
        if (!bound || !next || canon(next) !== canon(initial)) {
          invalidate();
          return false;
        }
        return true;
      };
      if (!(await current())) return;
      const request = {
        identity: {
          source_id: initial.target.document_id,
          revision_id: initial.target.revision_id,
          contribution_id: initial.target.contribution_id,
        },
        layout_revision: initial.layout_revision,
        bindings: [],
      };
      const discovered = await session.inspectCabPlacement(
        initial.text,
        JSON.stringify({ ...request, observations: [] }),
      );
      if (!(await current())) return;
      const found = discoverWordCabBindings(discovered, initial, new TextEncoder().encode(initial.text).length);
      if (!found) return;
      const boundRequest = { ...request, bindings: found.bindings };
      const observed = await readWordCabPlacement(initial.text, boundRequest);
      if (disposed || attempt !== generation) return;
      if (observed.status === 'stale') {
        invalidate();
        return;
      }
      if (!(await current())) return;
      if (observed.status === 'unsupported') {
        message.textContent = 'This version of Word cannot inspect page placement.';
        return;
      }
      const wire = await session.inspectCabPlacement(
        initial.text,
        JSON.stringify({ ...boundRequest, observations: observed.observations }),
      );
      if (!(await current())) return;
      const result = readWordCabInspection(wire, boundRequest, observed.observations, found.labels);
      if (!result) return;
      const names: Record<WordCabLabel, string> = {
        classified_by: 'Classified By',
        derived_by: 'Derived By',
        derived_from: 'Derived From',
        classification_reason: 'Classification Reason',
        declassify_on: 'Declassify On',
        agency_office: 'Agency and Office',
        ambiguous_classified: 'Classification field',
        ambiguous_derived: 'Derivation field',
      };
      const messages: string[] = [];
      const issues = result.fields.filter(
        (field) => field.placement === 'split_page' || field.placement === 'off_face',
      );
      for (const field of issues.slice(0, 10)) {
        const pages = field.pages.slice(0, 8).join(', ') + (field.pages.length > 8 ? ', and others' : '');
        messages.push(
          field.placement === 'split_page'
            ? `${names[field.label_kind]} spans pages ${pages}; its designated face is page ${field.face_page}.`
            : `${names[field.label_kind]} is on page ${pages}; its designated face is page ${field.face_page}.`,
        );
      }
      if (issues.length > 10) messages.push('Additional fields need review.');
      if (result.split_group) messages.push('The authority block crosses pages.');
      if (result.incomplete || observed.status === 'partial') messages.push('Some placement could not be established.');
      if (!messages.length && result.fields.some((field) => field.placement === 'on_face'))
        messages.push('The inspected fields are on their owning face.');
      message.textContent = messages.join(' ') || 'The current placement is unavailable.';
    } catch {
      if (!disposed && attempt === generation) unavailable();
    }
  }
  refreshButton.addEventListener('click', () => void obtain());
  const ready = obtain();
  return {
    ready,
    refresh: obtain,
    destroy() {
      disposed = true;
      generation++;
      try {
        unsubscribe?.();
      } catch {
        /* clear the view even if cleanup fails */
      }
      root.replaceChildren();
    },
  };
}
