// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { readCabSnapshot } from '@knitli/marque-kit-core/native-cab';
import { parseNativeBasisJson, parseNativeJson } from '@knitli/marque-kit-core/native-wire';
import type { NativeField } from '@knitli/marque-kit-core/native-wire';
import type { Doc } from '@knitli/marque-kit-core/types';
import { isSameWordDocument } from './workspace.ts';
import type { OfficeNativeWordSession, OfficeOrdinaryCabGrant, OfficeWordHost } from './workspace.ts';

const fields: readonly NativeField[] = [
  'classified_by',
  'agency_and_office_of_origin',
  'classification_reason',
  'derived_from',
  'declassify_on',
];
const labels: Record<NativeField, string> = {
  classified_by: 'Classified by',
  agency_and_office_of_origin: 'Agency and office of origin',
  classification_reason: 'Classification reason',
  derived_from: 'Derived from',
  declassify_on: 'Declassify on',
};
const encoder = new TextEncoder();
const id = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 256;

/** Validate host-granted exact member before exposing any input to the executor. */
function checkedGrant(
  grant: OfficeOrdinaryCabGrant | null,
  session: OfficeNativeWordSession,
  maxBytes: number,
): string | null {
  const viewer = session.ordinaryCab?.viewerId;
  if (
    !grant ||
    !id(viewer) ||
    grant.viewerId !== viewer ||
    grant.documentId !== session.documentId ||
    grant.chain !== session.chain ||
    !id(grant.grantId) ||
    !id(grant.permissionRevision) ||
    !id(grant.layoutRevision) ||
    grant.authorizeRawInput !== true ||
    grant.authorizeRawOutput !== true ||
    !Array.isArray(grant.disclosedFields) ||
    grant.disclosedFields.length > fields.length ||
    new Set(grant.disclosedFields).size !== grant.disclosedFields.length ||
    grant.disclosedFields.some((f) => !fields.includes(f)) ||
    typeof grant.requestJson !== 'string' ||
    grant.requestJson.length > Math.min(maxBytes, 1_048_576) ||
    encoder.encode(grant.requestJson).length > Math.min(maxBytes, 1_048_576) ||
    !grant.current
  )
    return null;
  try {
    if (grant.current.kind !== 'cab_snapshot' || grant.current.operation !== 'base') return null;
    const basis = parseNativeBasisJson(grant.current.currentBasisJson, maxBytes, 3);
    const expectedProfile = grant.current.profile;
    if (
      !expectedProfile ||
      basis.basis.operation !== 'base' ||
      basis.basis.profile?.profile !== expectedProfile.profile ||
      basis.basis.profile?.declaration_id !== expectedProfile.declaration_id ||
      basis.basis.profile?.declaration_version !== expectedProfile.declaration_version ||
      !basis.basis.source_revisions.some(
        (revision) =>
          revision.source_id === grant.current.target.document_id &&
          revision.revision_id === grant.current.target.revision_id &&
          revision.contribution_id === grant.current.target.contribution_id,
      )
    )
      return null;
    const request = JSON.parse(grant.requestJson) as {
      chain_id?: unknown;
      profile?: unknown;
      member?: {
        format?: unknown;
        source?: unknown;
        identity?: { document_id?: unknown; revision_id?: unknown; contribution_id?: unknown };
        cab_inspection?: {
          basis?: unknown;
          target?: unknown;
          layout_revision?: unknown;
          face_page?: unknown;
          fields?: { readback?: { layout_revision?: unknown; face_page?: unknown; target?: unknown } | null }[];
        };
      };
    };
    const member = request.member;
    const target = grant.current.target;
    const face = member?.cab_inspection;
    const matchesTarget = (input: unknown): boolean => {
      if (!input || typeof input !== 'object') return false;
      const value = input as {
        document_id?: unknown;
        revision_id?: unknown;
        contribution_id?: unknown;
        scope_locator?: unknown;
      };
      const range = target?.scope_locator;
      return (
        value?.document_id === target?.document_id &&
        value?.revision_id === target?.revision_id &&
        value?.contribution_id === target?.contribution_id &&
        Array.isArray(value?.scope_locator) &&
        value.scope_locator.length === 2 &&
        value.scope_locator.every(Number.isSafeInteger) &&
        typeof range === 'object' &&
        range?.kind === 'text' &&
        String(value.scope_locator[0]) === range.value.start &&
        String(value.scope_locator[1]) === range.value.end
      );
    };
    if (
      request.chain_id !== session.chain ||
      !member ||
      member.format !== 'document_content' ||
      typeof member.source !== 'string' ||
      member.source.length > 262_144 ||
      encoder.encode(member.source).length > 262_144 ||
      member.identity?.document_id !== session.documentId ||
      member.identity?.document_id !== target?.document_id ||
      member.identity?.revision_id !== target?.revision_id ||
      member.identity?.contribution_id !== target?.contribution_id ||
      !face ||
      !matchesTarget(face.basis) ||
      !matchesTarget(face.target) ||
      face.layout_revision !== grant.layoutRevision ||
      typeof face.face_page !== 'number' ||
      !Number.isSafeInteger(face.face_page) ||
      face.face_page < 1 ||
      !Array.isArray(face.fields) ||
      face.fields.some(
        (row) =>
          row?.readback &&
          (row.readback.layout_revision !== grant.layoutRevision ||
            row.readback.face_page !== face.face_page ||
            !matchesTarget(row.readback.target)),
      ) ||
      (request.profile === 'original_us_nsi'
        ? grant.current.profile?.profile !== 'original_us_nsi_cab_required_field_missing_after_examination'
        : request.profile === 'derivative_us_nsi'
          ? grant.current.profile?.profile !== 'derivative_us_nsi_cab_required_field_missing_after_examination'
          : true)
    )
      return null;
    return JSON.stringify(grant);
  } catch {
    return null;
  }
}

/** Read a trusted provider with an independently current basis and host grants. */
export function mountOrdinaryCabWorkspace(
  root: HTMLElement,
  session: OfficeNativeWordSession,
  host: OfficeWordHost,
  maxBytes: number | undefined,
): { readonly ready: Promise<void>; refresh(): Promise<void>; destroy(): void } {
  let generation = 0;
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  const revoke = () => {
    generation++;
    root.textContent = 'The current authority block questions are unavailable.';
  };
  const provider = session.ordinaryCab;
  const viewerId = provider?.viewerId;
  if (
    provider &&
    host.watchOrdinaryCabInvalidation &&
    host.readOrdinaryCabGrant &&
    Number.isSafeInteger(maxBytes) &&
    maxBytes! > 0
  ) {
    try {
      unsubscribe = host.watchOrdinaryCabInvalidation(session.documentId, session.chain, viewerId!, revoke);
    } catch {
      /* unavailable */
    }
  }
  async function refresh() {
    revoke();
    const attempt = generation;
    if (!provider || typeof unsubscribe !== 'function' || !host.readOrdinaryCabGrant || !maxBytes) return;
    try {
      if (!(await isSameWordDocument(host, session)) || disposed || attempt !== generation) return;
      const grant = await host.readOrdinaryCabGrant(session.documentId, session.chain, viewerId!);
      const fingerprint = checkedGrant(grant, session, maxBytes);
      if (
        !fingerprint ||
        !grant ||
        disposed ||
        attempt !== generation ||
        session.ordinaryCab !== provider ||
        provider.viewerId !== viewerId
      )
        return;
      const authorized = JSON.parse(fingerprint) as OfficeOrdinaryCabGrant;
      const responseText = await provider.evaluate(authorized.requestJson);
      if (
        typeof responseText !== 'string' ||
        responseText.length > Math.min(maxBytes, 1_048_576) ||
        encoder.encode(responseText).length > Math.min(maxBytes, 1_048_576) ||
        disposed ||
        attempt !== generation
      )
        return;
      const response = JSON.parse(responseText);
      if (
        response?.schema !== 'marque.ordinary-cab-questions.v1' ||
        response.status !== 'available' ||
        response.reason !== null ||
        !response.snapshot
      )
        return;
      const native = parseNativeJson(JSON.stringify(response.snapshot), maxBytes);
      const doc: Doc = { findings: [], document: { blocking: [], artifacts: [], native_evaluation: native } };
      const evaluated = readCabSnapshot(doc, {
        ...authorized.current,
        expectedChain: session.chain,
        maxBasisBytes: maxBytes,
      });
      if (!evaluated || !('findings' in evaluated)) return;
      const latest = await host.readOrdinaryCabGrant(session.documentId, session.chain, viewerId!);
      if (
        checkedGrant(latest, session, maxBytes) !== fingerprint ||
        !(await isSameWordDocument(host, session)) ||
        disposed ||
        attempt !== generation ||
        session.ordinaryCab !== provider ||
        provider.viewerId !== viewerId
      )
        return;
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = 'Authority block questions';
      section.append(heading);
      for (const finding of evaluated.findings.items) {
        if (finding.requirement.status !== 'resolved') continue;
        const requirement = evaluated.requirements[Number(finding.requirement.index)];
        const field = requirement?.field;
        if (
          !field ||
          !authorized.disclosedFields.includes(field) ||
          !finding.question ||
          finding.question.field !== field
        )
          continue;
        const row = document.createElement('p');
        row.textContent = `Provide ${labels[field]}.`;
        section.append(row);
      }
      root.replaceChildren(section);
    } catch {
      /* keep revoked */
    }
  }
  const ready = refresh();
  return {
    ready,
    refresh,
    destroy() {
      disposed = true;
      revoke();
      try {
        unsubscribe?.();
      } catch {
        /* revoked */
      }
      root.replaceChildren();
    },
  };
}
