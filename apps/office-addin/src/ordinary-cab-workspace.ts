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
  OfficeOrdinaryCabConfirmationGrant,
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

type SourceCurrent = OfficeOrdinaryCabSourceLinkGrant['current'];
type SourceLink = {
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
      candidate?: unknown;
      layout_revision?: unknown;
      face_page?: unknown;
      fields?: {
        field?: unknown;
        occurrence?: unknown;
        readback?: { target?: unknown; layout_revision?: unknown; face_page?: unknown } | null;
      }[];
    };
  };
  source_examination?: unknown;
  target_use?: { target?: unknown };
  material?: { kind?: unknown; source?: unknown };
};

function hasSourcePermission(
  grant: OfficeOrdinaryCabSourceLinkGrant | null,
  session: OfficeNativeWordSession,
  grantId: string,
  maxBytes: number,
): grant is OfficeOrdinaryCabSourceLinkGrant {
  return (
    !!grant &&
    grant.documentId === session.documentId &&
    grant.chain === session.chain &&
    grant.viewerId === session.ordinaryCab?.viewerId &&
    grant.grantId === grantId &&
    id(grant.grantId) &&
    id(grant.permissionRevision) &&
    grant.authorizeRawInput === true &&
    grant.authorizeRawOutput === true &&
    typeof grant.sourceLinkJson === 'string' &&
    grant.sourceLinkJson.length <= Math.min(maxBytes, 1_048_576) &&
    encoder.encode(grant.sourceLinkJson).length <= Math.min(maxBytes, 1_048_576) &&
    !!grant.current
  );
}

function matchesMemberCurrent(current: SourceCurrent): boolean {
  if (
    !id(current.documentId) ||
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
    return false;
  const sourceBytes = encoder.encode(current.text).length;
  return (
    sourceBytes <= 262_144 &&
    current.scopeLocator[1] <= sourceBytes &&
    current.owner.intrinsicClassificationLocator[1] <= sourceBytes
  );
}

function matchesSourceFace(
  face: NonNullable<SourceLink['member']>['cab_inspection'],
  current: SourceCurrent,
  sourceTarget: unknown,
): boolean {
  const sameTarget = (value: unknown) => canon(value) === canon(sourceTarget);
  return (
    !!face &&
    sameTarget(face.basis) &&
    sameTarget(face.target) &&
    face.layout_revision === current.layoutRevision &&
    face.face_page === current.facePage &&
    Array.isArray(face.fields) &&
    !face.fields.some(
      (row) =>
        row?.readback &&
        (!sameTarget(row.readback.target) ||
          row.readback.layout_revision !== current.layoutRevision ||
          row.readback.face_page !== current.facePage),
    )
  );
}

function matchesMember(member: SourceLink['member'], current: SourceCurrent): boolean {
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
  return (
    !!member &&
    sameIdentity(member.identity) &&
    sameIdentity(member.owner) &&
    member.owner?.role === current.owner.role &&
    member.owner.parent_document_id === current.owner.parentDocumentId &&
    canon(member.owner.intrinsic_classification_locator) === canon(current.owner.intrinsicClassificationLocator) &&
    member.format === 'document_content' &&
    member.source === current.text &&
    matchesSourceFace(member.cab_inspection, current, sourceTarget)
  );
}

function matchesSourceLink(link: SourceLink, current: SourceCurrent, target: unknown): boolean {
  const member = link?.member;
  const sourceTarget = {
    document_id: current.documentId,
    revision_id: current.revisionId,
    contribution_id: current.contributionId,
    scope_locator: current.scopeLocator,
  };
  return (
    !!member &&
    matchesMember(member, current) &&
    matchesSourceExamination({ member }, link.source_examination) &&
    !!target &&
    canon(link.target_use?.target) === canon(target) &&
    link.material?.kind === 'source_document' &&
    canon(link.material.source) === canon(sourceTarget)
  );
}

/** Bind the separately granted source bytes, identity, face and layout to the link. */
function checkedSourceLinkGrant(
  grant: OfficeOrdinaryCabSourceLinkGrant | null,
  session: OfficeNativeWordSession,
  grantId: string,
  target: unknown,
  maxBytes: number,
): string | null {
  if (!hasSourcePermission(grant, session, grantId, maxBytes)) return null;
  try {
    if (grant.current.documentId === session.documentId || !matchesMemberCurrent(grant.current)) return null;
    const link = JSON.parse(grant.sourceLinkJson) as SourceLink;
    return matchesSourceLink(link, grant.current, target) ? JSON.stringify(grant) : null;
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

type ConfirmationPreview = {
  mode?: unknown;
  question_request?: { chain_id?: unknown; member?: SourceLink['member'] };
  source_examination?: unknown;
  preview_receipt?: unknown;
  answers?: unknown;
  source_link?: unknown;
};
type ConfirmationIdentities = {
  target?: unknown;
  preview_receipt?: unknown;
  preview_fingerprint?: unknown;
  candidate?: unknown;
  layout_revision?: unknown;
  observations?: unknown;
};
type ConfirmationMapping = {
  target_id?: unknown;
  target_revision_id?: unknown;
  successor_source_id?: unknown;
  successor_revision_id?: unknown;
  successor_contribution?: unknown;
};

function acceptedConfirmationFields(preview: ConfirmationPreview, identities: ConfirmationIdentities, chain: string) {
  if (!Array.isArray(preview.answers) || !Array.isArray(identities.observations)) return null;
  if (preview.answers.length < 1 || preview.answers.length > fields.length) return null;
  const accepted = new Set<string>();
  const selected = new Set<NativeField>();
  for (const value of preview.answers) {
    if (!value || typeof value !== 'object') return null;
    const answer = value as {
      question?: { chain?: unknown; serial?: unknown; revision?: unknown; field?: unknown };
      answer_id?: unknown;
      value_reference?: unknown;
    };
    const q = answer.question;
    if (
      !q ||
      q.chain !== chain ||
      !id(q.serial) ||
      !id(q.revision) ||
      !fields.includes(q.field as NativeField) ||
      selected.has(q.field as NativeField) ||
      !id(answer.answer_id) ||
      !id(answer.value_reference)
    )
      return null;
    selected.add(q.field as NativeField);
    accepted.add(canon([q, answer.answer_id, answer.value_reference]));
  }
  for (const value of identities.observations) {
    if (!value || typeof value !== 'object') return null;
    const row = value as { question?: unknown; answer_id?: unknown; value_reference?: unknown; locator?: unknown };
    if (!id(row.locator) || !accepted.delete(canon([row.question, row.answer_id, row.value_reference]))) return null;
  }
  return accepted.size === 0 ? [...selected] : null;
}

function matchesSuccessorIdentities(
  member: SourceLink['member'],
  current: SourceCurrent,
  value: ConfirmationIdentities,
) {
  const face = member?.cab_inspection;
  if (
    !face ||
    canon(value.target) !== canon(face.target) ||
    canon(value.candidate) !== canon(face.candidate) ||
    value.layout_revision !== current.layoutRevision ||
    !Array.isArray(value.observations) ||
    value.observations.length > fields.length
  )
    return false;
  const seen = new Set<unknown>();
  for (const observation of value.observations) {
    if (!observation || typeof observation !== 'object') return false;
    const row = observation as { field?: unknown; occurrence?: unknown; value_reference?: unknown; locator?: unknown };
    const matches = face.fields?.filter((field) => field.field === row.field);
    if (
      !fields.includes(row.field as NativeField) ||
      seen.has(row.field) ||
      !id(row.value_reference) ||
      !id(row.locator) ||
      matches?.length !== 1 ||
      canon(matches[0]?.occurrence) !== canon(row.occurrence)
    )
      return false;
    seen.add(row.field);
  }
  return true;
}

function hasConfirmationPermission(
  grant: OfficeOrdinaryCabConfirmationGrant | null,
  session: OfficeNativeWordSession,
  maxBytes: number,
) {
  if (
    !grant ||
    grant.documentId !== session.documentId ||
    grant.chain !== session.chain ||
    grant.viewerId !== session.ordinaryCab?.viewerId ||
    !id(grant.viewerId) ||
    !id(grant.grantId) ||
    !id(grant.permissionRevision) ||
    !id(grant.logicalTargetId) ||
    grant.authorizeRawInput !== true ||
    grant.authorizeRawOutput !== true ||
    grant.authorizeGroupOutcome !== true ||
    !validDigest(grant.expectedReceipt) ||
    !validDigest(grant.expectedPreviewFingerprint) ||
    !validDigest(grant.expectedConfirmationReceipt) ||
    (grant.sourceLinkGrantId !== undefined && !id(grant.sourceLinkGrantId)) ||
    !Array.isArray(grant.disclosedFields) ||
    grant.disclosedFields.length > fields.length ||
    new Set(grant.disclosedFields).size !== grant.disclosedFields.length ||
    grant.disclosedFields.some((field) => !fields.includes(field))
  )
    return false;
  const jsons = [
    grant.acceptedPreviewJson,
    grant.acceptedValueIdentitiesJson,
    grant.successorMemberJson,
    grant.successorValueIdentitiesJson,
    grant.correspondenceJson,
  ];
  if (grant.successorExaminationJson !== null) jsons.push(grant.successorExaminationJson);
  if (grant.successorDirectUseJson !== undefined) jsons.push(grant.successorDirectUseJson);
  const limit = Math.min(maxBytes, 1_048_576);
  if (jsons.some((value) => typeof value !== 'string' || value.length > limit)) return false;
  return jsons.reduce((total, value) => total + encoder.encode(value).length, 0) <= limit;
}

function checkedConfirmationGrant(
  grant: OfficeOrdinaryCabConfirmationGrant | null,
  session: OfficeNativeWordSession,
  maxBytes: number,
) {
  if (!grant || !hasConfirmationPermission(grant, session, maxBytes)) return null;
  try {
    if (
      !matchesMemberCurrent(grant.base) ||
      !matchesMemberCurrent(grant.successor) ||
      grant.base.documentId !== session.documentId ||
      grant.successor.documentId !== session.documentId ||
      grant.base.revisionId === grant.successor.revisionId
    )
      return null;
    const preview = JSON.parse(grant.acceptedPreviewJson) as ConfirmationPreview;
    const accepted = JSON.parse(grant.acceptedValueIdentitiesJson) as ConfirmationIdentities;
    const member = JSON.parse(grant.successorMemberJson) as SourceLink['member'];
    const examination: unknown =
      grant.successorExaminationJson === null ? null : JSON.parse(grant.successorExaminationJson);
    const identities = JSON.parse(grant.successorValueIdentitiesJson) as ConfirmationIdentities;
    const mapping = JSON.parse(grant.correspondenceJson) as ConfirmationMapping;
    const directUse: unknown =
      grant.successorDirectUseJson === undefined ? undefined : JSON.parse(grant.successorDirectUseJson);
    const baseMember = preview?.question_request?.member;
    const target = baseMember?.cab_inspection?.target;
    const successorTarget = member?.cab_inspection?.target;
    const linked = preview?.source_link !== undefined;
    if (
      preview?.mode !== 'apply' ||
      preview.question_request?.chain_id !== session.chain ||
      !matchesMember(baseMember, grant.base) ||
      !matchesSourceExamination(preview.question_request, preview.source_examination) ||
      preview.preview_receipt !== grant.expectedReceipt ||
      accepted?.preview_receipt !== grant.expectedReceipt ||
      accepted.preview_fingerprint !== grant.expectedPreviewFingerprint ||
      canon(accepted.target) !== canon(target) ||
      !matchesMember(member, grant.successor) ||
      (examination !== null && !matchesSourceExamination({ member }, examination)) ||
      !matchesSuccessorIdentities(member, grant.successor, identities) ||
      mapping?.target_id !== grant.logicalTargetId ||
      mapping.target_revision_id !== grant.base.revisionId ||
      mapping.successor_source_id !== grant.successor.documentId ||
      mapping.successor_revision_id !== grant.successor.revisionId ||
      mapping.successor_contribution !== grant.successor.contributionId ||
      linked !== !!grant.sourceLinkGrantId ||
      linked !== (directUse !== undefined) ||
      (directUse !== undefined && canon((directUse as { target?: unknown } | null)?.target) !== canon(successorTarget))
    )
      return null;
    const selected = acceptedConfirmationFields(preview, accepted, session.chain);
    if (!selected) return null;
    const successor = {
      member,
      source_examination: examination,
      value_identities: identities,
      ...(directUse === undefined ? {} : { direct_use: directUse }),
    };
    return {
      key: JSON.stringify(grant),
      selected,
      target,
      sourceLink: preview.source_link,
      request: { preview, accepted_value_identities: accepted, successor, correspondence: mapping },
    };
  } catch {
    return null;
  }
}

function confirmationResult(
  value: Record<string, unknown>,
  selected: NativeField[],
  expectedReceipt: string,
): { status: 'confirmed'; fields: NativeField[] } | { status: 'different' | 'unavailable' } | null {
  if (value.schema !== 'marque.ordinary-cab-confirmation.v1') return null;
  if (value.status === 'unavailable' && value.confirmation === null) return { status: 'unavailable' as const };
  if (
    value.status !== 'available' ||
    value.confirmation_receipt !== expectedReceipt ||
    value.reason !== null ||
    !value.confirmation ||
    typeof value.confirmation !== 'object'
  )
    return null;
  const result = value.confirmation as { schema?: unknown; version?: unknown; status?: unknown; fields?: unknown };
  if (result.schema !== 'knitli.native-cab-field-confirmation.v1' || result.version !== 1) return null;
  if ((result.status === 'different' || result.status === 'unavailable') && result.fields === null)
    return { status: result.status };
  if (result.status !== 'confirmed' || !Array.isArray(result.fields) || result.fields.length !== selected.length)
    return null;
  const expected = new Set(selected);
  for (const field of result.fields) if (!expected.delete(field as NativeField)) return null;
  return expected.size === 0 ? { status: 'confirmed' as const, fields: selected } : null;
}

function checkedSnapshot(
  snapshot: unknown,
  grant: OfficeOrdinaryCabGrant,
  session: OfficeNativeWordSession,
  maxBytes: number,
) {
  try {
    const native = parseNativeJson(JSON.stringify(snapshot), maxBytes);
    const doc: Doc = { findings: [], document: { blocking: [], artifacts: [], native_evaluation: native } };
    return readCabSnapshot(doc, { ...grant.current, expectedChain: session.chain, maxBasisBytes: maxBytes });
  } catch {
    return null;
  }
}

function questionSnapshot(
  responseText: unknown,
  grant: OfficeOrdinaryCabGrant,
  session: OfficeNativeWordSession,
  maxBytes: number,
) {
  const limit = Math.min(maxBytes, 1_048_576);
  if (typeof responseText !== 'string' || responseText.length > limit || encoder.encode(responseText).length > limit)
    return null;
  try {
    const response = JSON.parse(responseText);
    if (
      response?.schema !== 'marque.ordinary-cab-questions.v1' ||
      response.status !== 'available' ||
      response.reason !== null ||
      !response.snapshot
    )
      return null;
    return checkedSnapshot(response.snapshot, grant, session, maxBytes);
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
  const isCurrent = (attempt: number) =>
    !disposed && attempt === generation && session.ordinaryCab === provider && provider?.viewerId === viewerId;
  if (
    provider &&
    host.watchOrdinaryCabInvalidation &&
    (host.readOrdinaryCabGrant || host.readOrdinaryCabConfirmationGrant) &&
    Number.isSafeInteger(maxBytes) &&
    maxBytes! > 0
  ) {
    try {
      unsubscribe = host.watchOrdinaryCabInvalidation(session.documentId, session.chain, viewerId!, revoke);
    } catch {
      /* unavailable */
    }
  }
  function addConfirmationButton(section: HTMLElement) {
    if (!provider?.confirm || !host.readOrdinaryCabConfirmationGrant) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Check accepted answers';
    button.addEventListener('click', () => void confirm());
    section.append(button);
  }
  async function refresh() {
    revoke();
    const attempt = generation;
    if (!provider || typeof unsubscribe !== 'function' || !maxBytes) return;
    try {
      if (!(await isSameWordDocument(host, session)) || !isCurrent(attempt)) return;
      if (provider.confirm && host.readOrdinaryCabConfirmationGrant) {
        const section = document.createElement('section');
        const message = document.createElement('p');
        message.textContent = 'The current authority block questions are unavailable.';
        section.append(message);
        addConfirmationButton(section);
        root.replaceChildren(section);
      }
      if (!host.readOrdinaryCabGrant) return;
      const grant = await host.readOrdinaryCabGrant(session.documentId, session.chain, viewerId!);
      const fingerprint = checkedGrant(grant, session, maxBytes);
      if (!fingerprint || !grant || !isCurrent(attempt)) return;
      const authorized = JSON.parse(fingerprint) as OfficeOrdinaryCabGrant;
      const responseText = await provider.evaluate(authorized.requestJson);
      if (!isCurrent(attempt)) return;
      const snapshot = questionSnapshot(responseText, authorized, session, maxBytes);
      if (!snapshot || !('findings' in snapshot)) return;
      const evaluated = snapshot as NativeEvaluationV2;
      const latest = await host.readOrdinaryCabGrant(session.documentId, session.chain, viewerId!);
      if (
        checkedGrant(latest, session, maxBytes) !== fingerprint ||
        !(await isSameWordDocument(host, session)) ||
        !isCurrent(attempt)
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
      addConfirmationButton(section);
      displayedGrant = fingerprint;
      root.replaceChildren(section);
    } catch {
      /* keep revoked */
    }
  }
  async function preview() {
    const originalGrant = displayedGrant;
    const original = root.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    original?.querySelectorAll('button').forEach((button) => button.remove());
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
      if (!baseKey || baseKey !== originalGrant || !original || !permissionKey) return;
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
        isCurrent(attempt) &&
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
        isCurrent(attempt) &&
        provider.preview === previewOperation;
      if (!(await current())) return;
      const validSnapshot = (snapshot: unknown) => checkedSnapshot(snapshot, authorized, session, maxBytes);
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
      addConfirmationButton(section);
      root.replaceChildren(original, section);
    } catch {
      /* keep revoked */
    }
  }
  async function confirm() {
    displayedGrant = null;
    const attempt = ++generation;
    root.textContent = 'The accepted answers could not be checked.';
    if (!provider?.confirm || !host.readOrdinaryCabConfirmationGrant || typeof unsubscribe !== 'function' || !maxBytes)
      return;
    const operation = provider.confirm;
    try {
      const grant = await host.readOrdinaryCabConfirmationGrant(session.documentId, session.chain, viewerId!);
      const checked = checkedConfirmationGrant(grant, session, maxBytes);
      if (!grant || !checked) return;
      const authorized = JSON.parse(checked.key) as OfficeOrdinaryCabConfirmationGrant;
      const sourceId = authorized.sourceLinkGrantId;
      let sourceKey: string | null = null;
      if (sourceId) {
        if (!host.readOrdinaryCabSourceLinkGrant) return;
        const source = await host.readOrdinaryCabSourceLinkGrant(session.documentId, session.chain, viewerId!);
        sourceKey = checkedSourceLinkGrant(source, session, sourceId, checked.target, maxBytes);
        if (
          !sourceKey ||
          canon(JSON.parse((JSON.parse(sourceKey) as OfficeOrdinaryCabSourceLinkGrant).sourceLinkJson)) !==
            canon(checked.sourceLink)
        )
          return;
      }
      const current = async () =>
        isCurrent(attempt) &&
        provider.confirm === operation &&
        checkedConfirmationGrant(
          await host.readOrdinaryCabConfirmationGrant!(session.documentId, session.chain, viewerId!),
          session,
          maxBytes,
        )?.key === checked.key &&
        (!sourceId ||
          (!!host.readOrdinaryCabSourceLinkGrant &&
            checkedSourceLinkGrant(
              await host.readOrdinaryCabSourceLinkGrant(session.documentId, session.chain, viewerId!),
              session,
              sourceId,
              checked.target,
              maxBytes,
            ) === sourceKey)) &&
        (await isSameWordDocument(host, session)) &&
        isCurrent(attempt) &&
        provider.confirm === operation;
      if (!(await current())) return;
      const response = await executePreview(operation, checked.request, maxBytes);
      if (!(await current())) return;
      const result = confirmationResult(response, checked.selected, authorized.expectedConfirmationReceipt);
      if (!result || result.status === 'unavailable') return;
      if (result.status === 'different') {
        root.textContent = 'The accepted answers do not match the current authority block.';
        return;
      }
      if (result.status !== 'confirmed') return;
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = 'Accepted answers checked';
      section.append(heading);
      const note = document.createElement('p');
      note.textContent = 'These fields match the authority block in the checked revision.';
      section.append(note);
      for (const field of result.fields) {
        if (!authorized.disclosedFields.includes(field)) continue;
        const line = document.createElement('p');
        line.textContent = `${labels[field]}: matches.`;
        section.append(line);
      }
      root.replaceChildren(section);
    } catch {
      /* keep unavailable */
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
