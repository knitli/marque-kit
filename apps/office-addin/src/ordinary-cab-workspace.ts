// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { readCabSnapshot } from '@knitli/marque-kit-core/native-cab';
import { canon } from '@knitli/marque-kit-core/state';
import { parseNativeBasisJson, parseNativeJson } from '@knitli/marque-kit-core/native-wire';
import type { NativeEvaluationV2, NativeField } from '@knitli/marque-kit-core/native-wire';
import type { Doc } from '@knitli/marque-kit-core/types';
import {
  appliedPreview,
  executePreview,
  issuedAnswers,
  matchesSourceExamination,
  preparedPreview,
  projectedRows,
  validDigest,
} from './ordinary-cab-preview.ts';
import { isSameWordDocument } from './workspace.ts';
import type {
  OfficeNativeWordSession,
  OfficeOrdinaryCabGrant,
  OfficeOrdinaryCabPreviewGrant,
  OfficeOrdinaryCabSourceLinkGrant,
  OfficeWordHost,
} from './workspace.ts';

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

/** Bind the separately granted source bytes, identity, face and layout to the link. */
function checkedSourceLinkGrant(
  grant: OfficeOrdinaryCabSourceLinkGrant | null,
  session: OfficeNativeWordSession,
  grantId: string,
  target: unknown,
  maxBytes: number,
): string | null {
  if (
    !grant ||
    grant.documentId !== session.documentId ||
    grant.chain !== session.chain ||
    grant.viewerId !== session.ordinaryCab?.viewerId ||
    grant.grantId !== grantId ||
    !id(grant.grantId) ||
    !id(grant.permissionRevision) ||
    grant.authorizeRawInput !== true ||
    grant.authorizeRawOutput !== true ||
    typeof grant.sourceLinkJson !== 'string' ||
    grant.sourceLinkJson.length > Math.min(maxBytes, 1_048_576) ||
    encoder.encode(grant.sourceLinkJson).length > Math.min(maxBytes, 1_048_576) ||
    !grant.current
  )
    return null;
  try {
    const current = grant.current;
    if (
      !id(current.documentId) ||
      current.documentId === session.documentId ||
      !id(current.revisionId) ||
      !id(current.contributionId) ||
      !id(current.layoutRevision) ||
      !Number.isSafeInteger(current.facePage) ||
      current.facePage < 1 ||
      typeof current.text !== 'string' ||
      current.text.length > 262_144 ||
      !current.owner ||
      !['transmittal', 'attachment'].includes(current.owner.role) ||
      (current.owner.parentDocumentId !== null && !id(current.owner.parentDocumentId)) ||
      !Array.isArray(current.owner.intrinsicClassificationLocator) ||
      current.owner.intrinsicClassificationLocator.length !== 2 ||
      !current.owner.intrinsicClassificationLocator.every(Number.isSafeInteger) ||
      current.owner.intrinsicClassificationLocator[0] < 0 ||
      current.owner.intrinsicClassificationLocator[1] <= current.owner.intrinsicClassificationLocator[0] ||
      !Array.isArray(current.scopeLocator) ||
      current.scopeLocator.length !== 2 ||
      !current.scopeLocator.every(Number.isSafeInteger) ||
      current.scopeLocator[0] < 0 ||
      current.scopeLocator[1] < current.scopeLocator[0]
    )
      return null;
    const sourceBytes = encoder.encode(current.text).length;
    if (
      sourceBytes > 262_144 ||
      current.scopeLocator[1] > sourceBytes ||
      current.owner.intrinsicClassificationLocator[1] > sourceBytes
    )
      return null;
    const link = JSON.parse(grant.sourceLinkJson) as {
      member?: {
        identity?: unknown;
        format?: unknown;
        source?: unknown;
        owner?: {
          document_id?: unknown;
          revision_id?: unknown;
          contribution_id?: unknown;
          role?: unknown;
          parent_document_id?: unknown;
          intrinsic_classification_locator?: unknown;
        };
        cab_inspection?: {
          basis?: unknown;
          target?: unknown;
          layout_revision?: unknown;
          face_page?: unknown;
          fields?: { readback?: { target?: unknown; layout_revision?: unknown; face_page?: unknown } | null }[];
        };
      };
      source_examination?: unknown;
      target_use?: { target?: unknown };
      material?: { kind?: unknown; source?: unknown };
    };
    const member = link?.member;
    const face = member?.cab_inspection;
    const identity = {
      document_id: current.documentId,
      revision_id: current.revisionId,
      contribution_id: current.contributionId,
    };
    const sourceTarget = { ...identity, scope_locator: current.scopeLocator };
    const sameIdentity = (value: unknown) => {
      const owner = value as Partial<typeof identity> | null;
      return (
        owner?.document_id === identity.document_id &&
        owner.revision_id === identity.revision_id &&
        owner.contribution_id === identity.contribution_id
      );
    };
    const sameTarget = (value: unknown) => canon(value) === canon(sourceTarget);
    if (
      !member ||
      !sameIdentity(member.identity) ||
      !sameIdentity(member.owner) ||
      member.owner?.role !== current.owner.role ||
      member.owner.parent_document_id !== current.owner.parentDocumentId ||
      canon(member.owner.intrinsic_classification_locator) !== canon(current.owner.intrinsicClassificationLocator) ||
      member.format !== 'document_content' ||
      member.source !== current.text ||
      !face ||
      !sameTarget(face.basis) ||
      !sameTarget(face.target) ||
      face.layout_revision !== current.layoutRevision ||
      face.face_page !== current.facePage ||
      !Array.isArray(face.fields) ||
      face.fields.some(
        (row) =>
          row?.readback &&
          (!sameTarget(row.readback.target) ||
            row.readback.layout_revision !== current.layoutRevision ||
            row.readback.face_page !== current.facePage),
      ) ||
      !matchesSourceExamination({ member }, link.source_examination) ||
      !target ||
      canon(link.target_use?.target) !== canon(target) ||
      link.material?.kind !== 'source_document' ||
      !sameTarget(link.material.source)
    )
      return null;
    return JSON.stringify(grant);
  } catch {
    return null;
  }
}

/** Check preview permission separately from the questions grant. */
function checkedPreviewGrant(
  grant: OfficeOrdinaryCabPreviewGrant | null,
  session: OfficeNativeWordSession,
  maxBytes: number,
): string | null {
  if (
    !grant ||
    grant.documentId !== session.documentId ||
    grant.chain !== session.chain ||
    grant.viewerId !== session.ordinaryCab?.viewerId ||
    !id(grant.viewerId) ||
    !id(grant.grantId) ||
    !id(grant.permissionRevision) ||
    !validDigest(grant.expectedReceipt) ||
    !validDigest(grant.expectedPreviewFingerprint) ||
    grant.authorizeRawInput !== true ||
    grant.authorizeRawOutput !== true ||
    (grant.sourceLinkGrantId !== undefined && !id(grant.sourceLinkGrantId)) ||
    typeof grant.sourceExaminationJson !== 'string' ||
    grant.sourceExaminationJson.length > Math.min(maxBytes, 1_048_576) ||
    encoder.encode(grant.sourceExaminationJson).length > Math.min(maxBytes, 1_048_576) ||
    typeof grant.answersJson !== 'string' ||
    grant.answersJson.length > Math.min(maxBytes, 1_048_576) ||
    encoder.encode(grant.answersJson).length > Math.min(maxBytes, 1_048_576) ||
    !Array.isArray(grant.disclosedFields) ||
    grant.disclosedFields.length > fields.length ||
    new Set(grant.disclosedFields).size !== grant.disclosedFields.length ||
    grant.disclosedFields.some((field) => !fields.includes(field))
  )
    return null;
  try {
    const answers: unknown = JSON.parse(grant.answersJson);
    if (!Array.isArray(answers) || answers.length < 1 || answers.length > 16) return null;
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
  let displayedGrant: string | null = null;
  let unsubscribe: (() => void) | undefined;
  const revoke = () => {
    generation++;
    displayedGrant = null;
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
      if (provider.preview && host.readOrdinaryCabPreviewGrant) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Preview answers';
        button.addEventListener('click', () => void preview());
        section.append(button);
      }
      displayedGrant = fingerprint;
      root.replaceChildren(section);
    } catch {
      /* keep revoked */
    }
  }
  async function preview() {
    const originalGrant = displayedGrant;
    const original = root.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    original?.querySelector('button')?.remove();
    displayedGrant = null;
    const attempt = ++generation;
    root.textContent = 'The authority block preview is unavailable.';
    if (
      !provider?.preview ||
      !host.readOrdinaryCabGrant ||
      !host.readOrdinaryCabPreviewGrant ||
      typeof unsubscribe !== 'function' ||
      !maxBytes
    )
      return;
    const previewOperation = provider.preview;
    try {
      const base = await host.readOrdinaryCabGrant(session.documentId, session.chain, viewerId!);
      const baseKey = checkedGrant(base, session, maxBytes);
      const permission = await host.readOrdinaryCabPreviewGrant(session.documentId, session.chain, viewerId!);
      const permissionKey = checkedPreviewGrant(permission, session, maxBytes);
      if (!baseKey || baseKey !== originalGrant || !original || !permissionKey || !base || !permission) return;
      const authorized = JSON.parse(baseKey) as OfficeOrdinaryCabGrant;
      const previewGrant = JSON.parse(permissionKey) as OfficeOrdinaryCabPreviewGrant;
      const questionRequest: unknown = JSON.parse(authorized.requestJson);
      const sourceExamination: unknown = JSON.parse(previewGrant.sourceExaminationJson);
      if (!matchesSourceExamination(questionRequest, sourceExamination)) return;
      const target = (questionRequest as { member: { cab_inspection: { target: unknown } } }).member.cab_inspection
        .target;
      const sourceId = previewGrant.sourceLinkGrantId;
      let sourceKey: string | null = null;
      if (sourceId) {
        if (!host.readOrdinaryCabSourceLinkGrant) return;
        const source = await host.readOrdinaryCabSourceLinkGrant(session.documentId, session.chain, viewerId!);
        sourceKey = checkedSourceLinkGrant(source, session, sourceId, target, maxBytes);
        if (!sourceKey) return;
      }
      const sourceLink: unknown = sourceKey
        ? JSON.parse((JSON.parse(sourceKey) as OfficeOrdinaryCabSourceLinkGrant).sourceLinkJson)
        : undefined;
      const current = async () =>
        !disposed &&
        attempt === generation &&
        session.ordinaryCab === provider &&
        provider.viewerId === viewerId &&
        provider.preview === previewOperation &&
        checkedGrant(
          await host.readOrdinaryCabGrant!(session.documentId, session.chain, viewerId!),
          session,
          maxBytes,
        ) === baseKey &&
        checkedPreviewGrant(
          await host.readOrdinaryCabPreviewGrant!(session.documentId, session.chain, viewerId!),
          session,
          maxBytes,
        ) === permissionKey &&
        (!sourceId ||
          (!!host.readOrdinaryCabSourceLinkGrant &&
            checkedSourceLinkGrant(
              await host.readOrdinaryCabSourceLinkGrant(session.documentId, session.chain, viewerId!),
              session,
              sourceId,
              target,
              maxBytes,
            ) === sourceKey)) &&
        (await isSameWordDocument(host, session)) &&
        !disposed &&
        attempt === generation &&
        session.ordinaryCab === provider &&
        provider.viewerId === viewerId &&
        provider.preview === previewOperation;
      if (!(await current())) return;
      const validSnapshot = (snapshot: unknown) => {
        try {
          const native = parseNativeJson(JSON.stringify(snapshot), maxBytes);
          const doc: Doc = { findings: [], document: { blocking: [], artifacts: [], native_evaluation: native } };
          return readCabSnapshot(doc, {
            ...authorized.current,
            expectedChain: session.chain,
            maxBasisBytes: maxBytes,
          });
        } catch {
          return null;
        }
      };
      const prepared = await executePreview(
        previewOperation,
        {
          mode: 'prepare',
          question_request: questionRequest,
          source_examination: sourceExamination,
          ...(sourceLink ? { source_link: sourceLink } : {}),
        },
        maxBytes,
      );
      if (
        !(await current()) ||
        !preparedPreview(prepared, previewGrant.expectedReceipt) ||
        !validSnapshot(prepared.snapshot)
      )
        return;
      const currentBase = validSnapshot(prepared.snapshot);
      if (!currentBase || !('findings' in currentBase)) return;
      const answers: unknown = JSON.parse(previewGrant.answersJson);
      if (!issuedAnswers(currentBase as NativeEvaluationV2, answers)) return;
      const applied = await executePreview(
        previewOperation,
        {
          mode: 'apply',
          question_request: questionRequest,
          source_examination: sourceExamination,
          ...(sourceLink ? { source_link: sourceLink } : {}),
          preview_receipt: prepared.preview_receipt,
          answers,
        },
        maxBytes,
      );
      if (
        !(await current()) ||
        !appliedPreview(applied, prepared, previewGrant.expectedPreviewFingerprint) ||
        !validSnapshot(applied.snapshot)
      )
        return;
      const rows = projectedRows(applied.preview, answers, authorized.current.target, session.chain);
      if (!rows) return;
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = 'Hypothetical authority block';
      section.append(heading);
      const note = document.createElement('p');
      note.textContent =
        'This preview shows field presence only. Values and authority have not been verified; no changes were written.';
      section.append(note);
      for (const row of rows) {
        if (!previewGrant.disclosedFields.includes(row.field)) continue;
        const line = document.createElement('p');
        const outcome = row.satisfaction === 'satisfied' ? 'projected present' : row.satisfaction.replaceAll('_', ' ');
        line.textContent = `${labels[row.field]}: ${outcome}.`;
        section.append(line);
      }
      root.replaceChildren(original, section);
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
