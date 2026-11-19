// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import type { Doc } from './types.ts';
import { canon, sameBasis } from './state.ts';
import { isParsedNativeEnvelope, parseNativeBasisJson } from './native-wire.ts';
import type { NativeEvaluation, NativeEvaluationV2, NativeProfile, NativeTarget } from './native-wire.ts';

/** Host-supplied scope and currentness: this is a read of one CAB snapshot. */
export interface NativeCabRequest {
  kind: 'cab_snapshot';
  /** Independently supplied expected evaluation chain for v2 findings. */
  expectedChain?: string;
  operation: 'base';
  target: NativeTarget;
  profile: NativeProfile;
  /** JSON for the separately obtained current native evaluation basis. */
  currentBasisJson: string;
  /** Maximum UTF-8 bytes the host allows for the current basis. */
  maxBasisBytes: number;
}
const sameTarget = (a: NativeTarget, b: NativeTarget): boolean =>
  !!a &&
  !!b &&
  a.document_id === b.document_id &&
  a.revision_id === b.revision_id &&
  a.contribution_id === b.contribution_id &&
  a.scope_locator === b.scope_locator;
const sameProfile = (a: NativeProfile | null, b: NativeProfile): boolean =>
  !!a &&
  !!b &&
  a.profile === b.profile &&
  a.declaration_id === b.declaration_id &&
  a.declaration_version === b.declaration_version;

/** Read native statuses and rows only when the caller's exact CAB scope is current.
 * This is not a document/send readiness verdict and does not apply CAB policy. */
export function readCabSnapshot(doc: Doc, request: NativeCabRequest): NativeEvaluation | NativeEvaluationV2 | null {
  const envelope = doc.document.native_evaluation;
  if (
    !isParsedNativeEnvelope(envelope) ||
    !request?.target ||
    request.kind !== 'cab_snapshot' ||
    request.operation !== 'base'
  )
    return null;
  const e = envelope.evaluation;
  const basis = e.basis;
  if (!basis || basis.basis.operation !== 'base' || !sameProfile(basis.basis.profile, request.profile)) return null;
  let current;
  try {
    current = parseNativeBasisJson(request.currentBasisJson, request.maxBasisBytes);
  } catch {
    return null;
  }
  if (!sameBasis(basis, current)) return null;
  if (e.readiness.kind === 'supported' && !sameProfile(e.readiness.profile, request.profile)) return null;
  // Only producer-emitted artifact/field target bindings establish the evaluated
  // target. Host rows and accepted answers are not target provenance.
  if (e.artifacts.length === 0 && basis.basis.field_revisions.length === 0) return null;
  if (
    !basis.basis.source_revisions.some(
      (source) =>
        source.source_id === request.target.document_id &&
        source.revision_id === request.target.revision_id &&
        source.contribution_id === request.target.contribution_id,
    )
  )
    return null;
  const scopes = new Map<string, Set<string>>();
  for (const selected of basis.basis.scopes) {
    let ids = scopes.get(selected.contribution_id);
    if (!ids) {
      ids = new Set();
      scopes.set(selected.contribution_id, ids);
    }
    ids.add(selected.scope_id);
  }
  // The wire has no locator-to-scope mapping. Multiple selected scopes from
  // this contribution cannot be tied unambiguously to the requested target.
  if (scopes.get(request.target.contribution_id)?.size !== 1) return null;
  const basisKey = canon(basis.basis);
  if (
    e.artifacts.some(
      (a) =>
        !sameTarget(a.target, request.target) ||
        canon(a.basis) !== basisKey ||
        a.fields.some((f) => canon(f.basis) !== basisKey),
    )
  )
    return null;
  if (basis.basis.field_revisions.some((r) => !sameTarget(r.target, request.target))) return null;
  if (basis.accepted_answers.some((a) => !sameTarget(a.target, request.target))) return null;
  if (e.requirements.some((r) => r.scope && !scopes.get(r.scope.contribution_id)?.has(r.scope.scope_id))) return null;
  if (e.host_work.rows.some((r) => !sameTarget(r.target, request.target))) return null;
  if (envelope.version === 2) {
    const v = envelope.evaluation;
    if (!request.expectedChain || v.chain !== request.expectedChain) return null;
    const artifactIds = new Set<string>();
    for (const artifact of v.artifacts) {
      if (!artifact.id) continue;
      if (
        artifact.id.chain !== v.chain ||
        Number(artifact.id.serial) === 0 ||
        Number(artifact.id.serial) > Number(v.handles.last_artifact) ||
        artifactIds.has(artifact.id.serial)
      )
        return null;
      artifactIds.add(artifact.id.serial);
    }
    const questionIds = new Set<string>();
    const subjectIds = new Set<string>();
    for (const f of v.findings.items) {
      if (
        Number(f.subject.serial) === 0 ||
        subjectIds.has(f.subject.serial) ||
        Number(f.subject.serial) > Number(v.handles.last_subject) ||
        (f.question &&
          (Number(f.question.serial) === 0 ||
            Number(f.question.revision) === 0 ||
            questionIds.has(f.question.serial) ||
            Number(f.question.serial) > Number(v.handles.last_question) ||
            Number(f.question.revision) > Number(v.handles.last_question_revision))) ||
        (f.result_revision !== null &&
          (Number(f.result_revision) === 0 || Number(f.result_revision) > Number(v.handles.last_result_revision))) ||
        (f.result && Number(f.result.serial) === 0)
      )
        return null;
      if (
        f.subject.chain !== v.chain ||
        (f.result && (f.result.subject_chain !== f.subject.chain || f.result.subject_serial !== f.subject.serial))
      )
        return null;
      subjectIds.add(f.subject.serial);
      if (f.question) questionIds.add(f.question.serial);
      if (f.question && f.requested_action) return null;
      const meaning = f.question?.meaning ?? f.requested_action;
      if (
        f.question &&
        (f.question.chain !== v.chain ||
          f.question.subject.chain !== f.subject.chain ||
          f.question.subject.serial !== f.subject.serial ||
          canon(f.question.basis) !== basisKey)
      )
        return null;
      if (meaning?.scope && !scopes.get(meaning.scope.contribution_id)?.has(meaning.scope.scope_id)) return null;
      if (f.requirement.status === 'resolved') {
        const req = e.requirements[Number(f.requirement.index)];
        if (!req) return null;
        if (
          meaning &&
          ((req.scope !== null && canon(meaning.scope) !== canon(req.scope)) ||
            meaning.answer_kinds.some((k) => k.field !== req.field))
        )
          return null;
        if (f.question && f.question.field !== req.field) return null;
      }
      if (f.question && f.question.meaning.answer_kinds.some((k) => k.field !== f.question!.field)) return null;
    }
    return v;
  }
  return e;
}
