// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { isSameWordDocument } from './workspace.ts';
import type {
  OfficeNativeSelectedAudienceSession,
  OfficeSelectedAudienceIdentity,
  OfficeSelectedAudienceScope,
  OfficeWordHost,
} from './workspace.ts';
import { readSelectedAudience } from './selected-audience-wire.ts';
import type { AudienceAxis, SelectedAudienceResult } from './selected-audience-wire.ts';
import {
  SELECTED_AUDIENCE_ENGINE_SHA256,
  SELECTED_AUDIENCE_VOCABULARY_SHA256,
} from './selected-audience-vocabulary.ts';

const MAX_REQUEST = 1_048_576;
const MAX_SOURCE = 262_144;
const MAX_RESPONSE = 65_536;
const encoder = new TextEncoder();

interface CurrentScope {
  request: string;
  fingerprint: string;
  documents: number;
  selections: number;
}

function wellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function id(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    wellFormed(value) &&
    encoder.encode(value).length <= 256
  );
}

function identity(value: OfficeSelectedAudienceIdentity | null | undefined): OfficeSelectedAudienceIdentity | null {
  if (!value || !id(value.source_id) || !id(value.revision_id) || !id(value.contribution_id)) return null;
  return { source_id: value.source_id, revision_id: value.revision_id, contribution_id: value.contribution_id };
}

function key(value: OfficeSelectedAudienceIdentity): string {
  return JSON.stringify([value.source_id, value.revision_id, value.contribution_id]);
}

function checkedSelections(
  input: OfficeSelectedAudienceScope['selections'],
  sources: Map<string, Uint8Array>,
): OfficeSelectedAudienceScope['selections'] | null {
  const seen = new Set<string>();
  const selections: OfficeSelectedAudienceScope['selections'] = [];
  for (const selection of input) {
    const owner = identity(selection?.identity);
    if (!owner || !Array.isArray(selection.span) || selection.span.length !== 2) return null;
    const [start, end] = selection.span;
    const bytes = sources.get(key(owner));
    if (
      !bytes ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= end ||
      end > bytes.length ||
      (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) ||
      (end < bytes.length && (bytes[end]! & 0xc0) === 0x80)
    )
      return null;
    const selectionKey = JSON.stringify([key(owner), start, end]);
    if (seen.has(selectionKey)) return null;
    seen.add(selectionKey);
    selections.push({ identity: owner, span: [start, end] });
  }
  return selections;
}

function currentScope(
  value: OfficeSelectedAudienceScope | null,
  documentId: string,
  viewerId: string,
  maxBytes: number,
): CurrentScope | null {
  if (
    !value ||
    value.documentId !== documentId ||
    value.viewerId !== viewerId ||
    value.engineArtifactSha256 !== SELECTED_AUDIENCE_ENGINE_SHA256 ||
    value.recipientVocabularySha256 !== SELECTED_AUDIENCE_VOCABULARY_SHA256 ||
    !id(value.permissionRevision) ||
    !id(value.selectionRevision) ||
    !id(value.grantId) ||
    !value.disclosure ||
    !Array.isArray(value.documents) ||
    value.documents.length < 1 ||
    value.documents.length > 32 ||
    !Array.isArray(value.selections) ||
    value.selections.length < 1 ||
    value.selections.length > 128
  )
    return null;
  const disclosure = value.disclosure;
  if (
    [
      disclosure.foreign_receive,
      disclosure.foreign_show,
      disclosure.foreign_display_only,
      disclosure.implied_usa,
      disclosure.coverage,
    ].some((item) => item !== true)
  )
    return null;
  const sources = new Map<string, Uint8Array>();
  const contributions = new Set<string>();
  const documents: { identity: OfficeSelectedAudienceIdentity; source: string }[] = [];
  let sourceBytes = 0;
  for (const document of value.documents) {
    const owner = identity(document?.identity);
    const source = document?.source;
    if (!owner || typeof source !== 'string' || source.length > MAX_SOURCE || !wellFormed(source)) return null;
    const bytes = encoder.encode(source);
    sourceBytes += bytes.length;
    const sourceKey = key(owner);
    if (
      bytes.length > MAX_SOURCE ||
      sourceBytes > maxBytes ||
      sources.has(sourceKey) ||
      contributions.has(owner.contribution_id)
    )
      return null;
    sources.set(sourceKey, bytes);
    contributions.add(owner.contribution_id);
    documents.push({ identity: owner, source });
  }
  const selections = checkedSelections(value.selections, sources);
  if (!selections) return null;
  const request = JSON.stringify({ documents, selections });
  if (request.length > maxBytes || encoder.encode(request).length > maxBytes) return null;
  return {
    request,
    fingerprint: JSON.stringify([
      documentId,
      viewerId,
      value.engineArtifactSha256,
      value.recipientVocabularySha256,
      value.permissionRevision,
      value.selectionRevision,
      value.grantId,
      request,
    ]),
    documents: documents.length,
    selections: selections.length,
  };
}

function title(value: string): string {
  switch (value) {
    case 'complete':
      return 'Complete';
    case 'partial':
      return 'Partial';
    case 'exact':
      return 'Exact';
    case 'bounded':
      return 'Bounded';
    case 'not_applicable':
      return 'Not applicable';
    case 'not_requested':
      return 'Not requested';
    case 'participating':
      return 'participates';
    case 'nonparticipating':
      return 'does not participate';
    case 'unresolved':
      return 'participation unresolved';
    default:
      return 'Unavailable';
  }
}

function axisText<T extends string[] | boolean>(label: string, result: AudienceAxis<T>): string {
  if (result.status === 'not_applicable' || result.status === 'not_requested') {
    return `${label}: ${title(result.status)}.`;
  }
  if (result.status === 'unavailable' && result.participation === 'unresolved') {
    return `${label}: Unavailable.`;
  }
  let value = '';
  if (result.value !== null) {
    value =
      typeof result.value === 'boolean'
        ? result.value
          ? 'Yes'
          : 'No'
        : result.value.length
          ? result.value.join(', ')
          : result.status === 'bounded'
            ? 'None established'
            : 'None';
  }
  const state = `${title(result.status)}; ${title(result.participation)}`;
  return `${label}: ${value ? `${value} (${state})` : state}.`;
}

function render(root: HTMLElement, result: SelectedAudienceResult): void {
  const lines = [
    axisText('Foreign receive', result.foreignReceive),
    axisText('Foreign show', result.foreignShow),
    axisText('Display only', result.foreignDisplayOnly),
    axisText('Implied USA', result.impliedUsa),
    `Selected query: ${title(result.status)}.`,
    `Selected query coverage: ${title(result.query)}.`,
    `Source evidence coverage: ${title(result.source)}.`,
    `Document scan coverage: ${title(result.scan)}.`,
    `Selected markings recognized: ${result.selected} of ${result.selections}.`,
  ];
  if (result.cutoff) lines.push('The evaluation reached a limit.');
  if (
    result.foreignReceive.status === 'bounded' ||
    result.foreignShow.status === 'bounded' ||
    result.foreignDisplayOnly.status === 'bounded' ||
    result.impliedUsa.status === 'bounded'
  ) {
    lines.push('A bounded result may change as more evidence is examined.');
  }
  const entries = lines.map((line) => {
    const item = document.createElement('p');
    item.textContent = line;
    return item;
  });
  const note = document.createElement('p');
  note.textContent = 'This assessment does not authorize release or establish document readiness.';
  root.replaceChildren(...entries, note);
}

/** A read-only result is shown only while its independently granted selection remains current. */
export function mountSelectedAudienceWorkspace(
  root: HTMLElement,
  session: OfficeNativeSelectedAudienceSession,
  host: OfficeWordHost,
  maxBytes: number | undefined,
): { readonly ready: Promise<void>; refresh(): Promise<void>; destroy(): void } {
  const section = document.createElement('section');
  const heading = document.createElement('h2');
  heading.textContent = 'Selected audience';
  const display = document.createElement('div');
  display.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Refresh selected audience';
  section.append(heading, display, button);
  root.replaceChildren(section);
  let disposed = false;
  let generation = 0;
  let busy = false;
  let unsubscribe: (() => void) | undefined;
  const unavailable = () => {
    display.textContent = 'The selected audience is unavailable.';
  };
  const invalidate = () => {
    if (!disposed) {
      generation++;
      unavailable();
    }
  };
  unavailable();
  async function obtain(): Promise<void> {
    const attempt = ++generation;
    unavailable();
    const valid = () =>
      !disposed &&
      generation === attempt &&
      session.engineArtifactSha256 === SELECTED_AUDIENCE_ENGINE_SHA256 &&
      session.recipientVocabularySha256 === SELECTED_AUDIENCE_VOCABULARY_SHA256;
    if (
      !Number.isSafeInteger(maxBytes) ||
      !maxBytes ||
      maxBytes < 1 ||
      !id(session.documentId) ||
      !id(session.viewerId) ||
      !host.watchNativeSelectedAudienceInvalidation ||
      !host.readNativeSelectedAudienceScope ||
      typeof session.evaluateSelectedAudience !== 'function'
    )
      return;
    const requestLimit = Math.min(maxBytes, MAX_REQUEST);
    try {
      if (typeof unsubscribe !== 'function') {
        unsubscribe = host.watchNativeSelectedAudienceInvalidation(session.documentId, session.viewerId, invalidate);
      }
      if (typeof unsubscribe !== 'function' || !valid()) return;
      if (!(await isSameWordDocument(host, session)) || !valid()) return;
      const initial = currentScope(
        await host.readNativeSelectedAudienceScope(session.documentId, session.viewerId),
        session.documentId,
        session.viewerId,
        requestLimit,
      );
      if (!initial || !valid()) return;
      const current = async (): Promise<boolean> => {
        const next = currentScope(
          await host.readNativeSelectedAudienceScope!(session.documentId, session.viewerId),
          session.documentId,
          session.viewerId,
          requestLimit,
        );
        const same = await isSameWordDocument(host, session);
        if (!valid()) return false;
        if (!same || !next || next.fingerprint !== initial.fingerprint) {
          invalidate();
          return false;
        }
        return true;
      };
      if (!(await current())) return;
      const wire = await session.evaluateSelectedAudience(initial.request);
      if (!valid() || !(await current())) return;
      const result = readSelectedAudience(
        wire,
        Math.min(maxBytes, MAX_RESPONSE),
        initial.documents,
        initial.selections,
      );
      if (result && valid()) render(display, result);
    } catch {
      if (valid()) unavailable();
    }
  }
  async function refresh(): Promise<void> {
    if (disposed || busy) return;
    busy = true;
    button.disabled = true;
    try {
      await obtain();
    } finally {
      busy = false;
      if (!disposed) button.disabled = false;
    }
  }
  button.addEventListener('click', () => void refresh());
  const ready = refresh();
  return {
    ready,
    refresh,
    destroy() {
      if (disposed) return;
      disposed = true;
      generation++;
      try {
        unsubscribe?.();
      } catch {
        /* the view is already revoked */
      }
      root.replaceChildren();
    },
  };
}
