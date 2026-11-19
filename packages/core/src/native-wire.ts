// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { hasUnpairedSurrogate } from './marking.ts';
import type { Layer, Marking, Mask, Token } from './types.ts';

export type NativeTarget = { document_id: string; revision_id: string; contribution_id: string; scope_locator: string };
export type NativeField = 'classified_by' | 'agency_and_office_of_origin' | 'classification_reason' | 'declassify_on';
export type NativeProfile = {
  profile: 'original_us_nsi_cab_required_field_missing_after_examination';
  declaration_id: string;
  declaration_version: number;
};
export type NativeScope = { contribution_id: string; scope_id: string };
export type NativeLocator =
  | { kind: 'text'; value: { start: string; end: string } }
  | { kind: 'typed'; value: string }
  | { kind: 'unlocated' };
export type NativeBasis = {
  source_revisions: {
    source_id: string;
    revision_id: string;
    contribution_id: string;
    answer_id: string | null;
    profile_id: string | null;
  }[];
  scopes: NativeScope[];
  operation: 'base' | 'preview';
  profile: NativeProfile | null;
  context_revision: string | null;
  field_revisions: { target: NativeTarget; field: NativeField; revision: string; placement: NativeLocator | null }[];
};
export type NativeAcceptedAnswer = {
  question_chain: string;
  question_serial: string;
  question_revision: string;
  target: NativeTarget;
  field: NativeField;
  value_reference: string;
  occurrence_locator: NativeLocator;
};
export type NativeEvaluationBasis = { basis: NativeBasis; accepted_answers: NativeAcceptedAnswer[] };
const SUPPORT_KINDS = [
  'authored',
  'unresolved_occurrence',
  'implied_usa',
  'examined_absence',
  'rel_receive_implies_show',
  'preview_answer',
  'cab_proof',
  'sci_proof',
  'default_policy_proof',
] as const;
export type NativeSupport = {
  kind: (typeof SUPPORT_KINDS)[number];
  index: string;
};
export type NativeRequirement = {
  id: string;
  scope: NativeScope | null;
  field: NativeField | null;
  state: 'satisfied' | 'unsatisfied' | 'unresolved' | 'not_applicable';
  supports: NativeSupport[];
  allowed_disposition: 'validated_answer' | 'host_confirmation' | null;
};
export type NativeArtifactField = {
  field: NativeField;
  applicability: 'required' | 'conditional_unresolved';
  coverage: 'no_evidence' | 'unexamined' | 'unavailable' | 'partial' | 'unknown' | 'present' | 'examined_absent';
  satisfaction: 'satisfied' | 'missing' | 'unverified' | 'not_applicable';
  value_reference: string | null;
  placement: NativeLocator | null;
  supports: NativeSupport[];
  revision: string;
  basis: NativeBasis;
};
export type NativeArtifact = {
  id: { chain: string; serial: string } | null;
  target: NativeTarget;
  obligation: 'required' | 'conditional_unresolved' | 'not_required';
  fields: NativeArtifactField[];
  basis: NativeBasis;
};
export type NativeHostWorkRow = {
  target: NativeTarget;
  proposal: { subject_chain: string; subject_serial: string; serial: string } | null;
  field: NativeField | null;
  placement: NativeLocator | null;
  evidence_ref: string | null;
  status: 'not_required' | 'pending' | 'written' | 'failed' | 'stale' | 'canceled' | 'unavailable';
};
export type NativeEvaluation = {
  basis: NativeEvaluationBasis | null;
  coverage: { status: 'complete' | 'partial' | 'unavailable'; reason: string | null };
  readiness:
    | { kind: 'not_requested' | 'not_applicable' | 'unsupported' | 'unavailable' }
    | { kind: 'supported'; profile: NativeProfile; status: 'ready' | 'not_ready' | 'incomplete' };
  requirements: NativeRequirement[];
  artifacts: NativeArtifact[];
  host_work: {
    coverage: 'not_requested' | 'complete' | 'partial' | 'unavailable';
    cause: string | null;
    rows: NativeHostWorkRow[];
  };
};
export type NativeEnvelopeV1 = {
  schema: 'knitli.native-evaluation.v1';
  version: 1;
  route_scope: 'cab_snapshot';
  whole_document_finalize: 'unsupported';
  omitted_lanes: string[];
  evaluation: NativeEvaluation;
};

export type NativeSubject = { chain: string; serial: string };
export type NativeMeaning = {
  requested_fact: string;
  scope: NativeScope | null;
  answer_kinds: { kind: 'cab_field_replacement'; field: NativeField }[];
  answer_effects: string[];
};
export type NativeFinding = {
  subject: NativeSubject;
  outcome: 'needs_fact' | 'unavailable';
  needs_person: 'none' | 'optional' | 'required';
  blocks: 'never' | 'finalize' | 'now';
  requirement: { status: 'resolved'; index: string } | { status: 'not_supplied' | 'unavailable' };
  question: {
    chain: string;
    serial: string;
    revision: string;
    subject: NativeSubject;
    field: NativeField;
    prompt: string;
    meaning: NativeMeaning;
    basis: NativeBasis;
  } | null;
  requested_action: NativeMeaning | null;
  result: { subject_chain: string; subject_serial: string; serial: string } | null;
  result_revision: string | null;
  readings: 'unavailable';
};
export type NativeEvaluationV2 = NativeEvaluation & {
  chain: string | null;
  handles: {
    last_subject: string;
    last_question: string;
    last_artifact: string;
    last_act_sequence: string;
    last_question_revision: string;
    last_result_revision: string;
  };
  findings: {
    unrepresented: string[];
    status: 'partial';
    coverage: NativeEvaluation['coverage'];
    items: NativeFinding[];
  };
};
export type NativeEnvelopeV2 = Omit<NativeEnvelopeV1, 'schema' | 'version' | 'evaluation'> & {
  schema: 'knitli.native-cab-findings.v2';
  version: 2;
  evaluation: NativeEvaluationV2;
};
export type NativeEnvelope = NativeEnvelopeV1 | NativeEnvelopeV2;

/** A read-only, permission-filtered source view. Mask runs carry no offsets or lengths. */
export type NativeSourceMarkingBinding = {
  chain_id: string;
  source_id: string;
  revision_id: string;
  contribution_id: string;
  scope_id: string;
  viewer_id: string;
};
type SourceMarkingBody = { marking: Marking };
export type NativeSourceMarkingView = SourceMarkingBody & {
  schema: 'knitli.native-source-marking.v2';
  binding: NativeSourceMarkingBinding;
};

const fail = (where: string): never => {
  throw new TypeError(`invalid native evaluation wire: ${where}`);
};
const object = (value: unknown, where: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail(where);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return fail(`${where} prototype`);
  return value as Record<string, unknown>;
};
const keys = (value: unknown, expected: string[], where: string): Record<string, unknown> => {
  const x = object(value, where);
  const got = Object.keys(x);
  if (got.length !== expected.length || expected.some((key) => !Object.hasOwn(x, key))) fail(`${where} keys`);
  return x;
};
const str = (x: unknown, where: string): string =>
  typeof x === 'string' && !hasUnpairedSurrogate(x) ? x : fail(where);
const nullableString = (x: unknown, where: string): string | null => (x === null ? null : str(x, where));
const arr = (x: unknown, where: string): unknown[] => (Array.isArray(x) ? x : fail(where));
const oneOf = <T extends string>(x: unknown, choices: readonly T[], where: string): T =>
  choices.includes(x as T) ? (x as T) : fail(`${where} tag`);
const safeDecimal = (x: unknown, where: string): string => {
  if (typeof x !== 'string' || x.length > 16) return fail(`${where} decimal`);
  const n = Number(x);
  if (!Number.isSafeInteger(n) || n < 0 || String(n) !== x) return fail(`${where} decimal`);
  return x;
};
const FIELD = ['classified_by', 'agency_and_office_of_origin', 'classification_reason', 'declassify_on'] as const;
const field = (x: unknown, where: string) => oneOf(x, FIELD, where);
function target(x: unknown, where: string): NativeTarget {
  const o = keys(x, ['document_id', 'revision_id', 'contribution_id', 'scope_locator'], where);
  return {
    document_id: str(o.document_id, where),
    revision_id: str(o.revision_id, where),
    contribution_id: str(o.contribution_id, where),
    scope_locator: str(o.scope_locator, where),
  };
}
function locator(x: unknown, where: string): NativeLocator {
  const o = object(x, where);
  const kind = oneOf(o.kind, ['text', 'typed', 'unlocated'] as const, `${where}.kind`);
  if (kind === 'text') {
    const value = keys(o.value, ['start', 'end'], where);
    keys(x, ['kind', 'value'], where);
    const start = safeDecimal(value.start, where);
    const end = safeDecimal(value.end, where);
    if (BigInt(start) > BigInt(end)) fail(`${where} span`);
    return { kind, value: { start, end } };
  }
  if (kind === 'typed') {
    keys(x, ['kind', 'value'], where);
    return { kind, value: str(o.value, where) };
  }
  keys(x, ['kind'], where);
  return { kind };
}
function scope(x: unknown, where: string): NativeScope {
  const o = keys(x, ['contribution_id', 'scope_id'], where);
  return { contribution_id: str(o.contribution_id, where), scope_id: safeDecimal(o.scope_id, where) };
}
function profile(x: unknown, where: string): NativeProfile {
  const o = keys(x, ['profile', 'declaration_id', 'declaration_version'], where);
  if (o.declaration_version !== 1) fail(`${where}.declaration_version`);
  return {
    profile: oneOf(
      o.profile,
      ['original_us_nsi_cab_required_field_missing_after_examination'] as const,
      `${where}.profile`,
    ),
    declaration_id: str(o.declaration_id, where),
    declaration_version: 1,
  };
}
function support(x: unknown, where: string): NativeSupport {
  const o = keys(x, ['kind', 'index'], where);
  return {
    kind: oneOf(o.kind, SUPPORT_KINDS, `${where}.kind`),
    index: safeDecimal(o.index, where),
  };
}
function basis(x: unknown, where: string): NativeBasis {
  const o = keys(
    x,
    ['source_revisions', 'scopes', 'operation', 'profile', 'context_revision', 'field_revisions'],
    where,
  );
  const sources = arr(o.source_revisions, where).map((v) => {
    const s = keys(v, ['source_id', 'revision_id', 'contribution_id', 'answer_id', 'profile_id'], where);
    return {
      source_id: str(s.source_id, where),
      revision_id: str(s.revision_id, where),
      contribution_id: str(s.contribution_id, where),
      answer_id: nullableString(s.answer_id, where),
      profile_id: nullableString(s.profile_id, where),
    };
  });
  const fields = arr(o.field_revisions, where).map((v) => {
    const f = keys(v, ['target', 'field', 'revision', 'placement'], where);
    return {
      target: target(f.target, where),
      field: field(f.field, where),
      revision: str(f.revision, where),
      placement: f.placement === null ? null : locator(f.placement, where),
    };
  });
  return {
    source_revisions: sources,
    scopes: arr(o.scopes, where).map((v) => scope(v, where)),
    operation: oneOf(o.operation, ['base', 'preview'] as const, where),
    profile: o.profile === null ? null : profile(o.profile, where),
    context_revision: nullableString(o.context_revision, where),
    field_revisions: fields,
  };
}
function artifactField(x: unknown, where: string): NativeArtifactField {
  const o = keys(
    x,
    [
      'field',
      'applicability',
      'coverage',
      'satisfaction',
      'value_reference',
      'placement',
      'supports',
      'revision',
      'basis',
    ],
    where,
  );
  return {
    field: field(o.field, where),
    applicability: oneOf(o.applicability, ['required', 'conditional_unresolved'] as const, where),
    coverage: oneOf(
      o.coverage,
      ['no_evidence', 'unexamined', 'unavailable', 'partial', 'unknown', 'present', 'examined_absent'] as const,
      where,
    ),
    satisfaction: oneOf(o.satisfaction, ['satisfied', 'missing', 'unverified', 'not_applicable'] as const, where),
    value_reference: nullableString(o.value_reference, where),
    placement: o.placement === null ? null : locator(o.placement, where),
    supports: arr(o.supports, where).map((v) => support(v, where)),
    revision: safeDecimal(o.revision, where),
    basis: basis(o.basis, where),
  };
}
function hostRow(x: unknown, where: string): NativeHostWorkRow {
  const o = keys(x, ['target', 'proposal', 'field', 'placement', 'evidence_ref', 'status'], where);
  let proposal: NativeHostWorkRow['proposal'] = null;
  if (o.proposal !== null) {
    const p = keys(o.proposal, ['subject_chain', 'subject_serial', 'serial'], where);
    proposal = {
      subject_chain: str(p.subject_chain, where),
      subject_serial: safeDecimal(p.subject_serial, where),
      serial: safeDecimal(p.serial, where),
    };
  }
  return {
    target: target(o.target, where),
    proposal,
    field: o.field === null ? null : field(o.field, where),
    placement: o.placement === null ? null : locator(o.placement, where),
    evidence_ref: nullableString(o.evidence_ref, where),
    status: oneOf(
      o.status,
      ['not_required', 'pending', 'written', 'failed', 'stale', 'canceled', 'unavailable'] as const,
      where,
    ),
  };
}
function evaluationBasis(x: unknown, where: string): NativeEvaluationBasis {
  const b = keys(x, ['basis', 'accepted_answers'], where);
  const answers = arr(b.accepted_answers, where).map((v) => {
    const a = keys(
      v,
      [
        'question_chain',
        'question_serial',
        'question_revision',
        'target',
        'field',
        'value_reference',
        'occurrence_locator',
      ],
      where,
    );
    return {
      question_chain: str(a.question_chain, where),
      question_serial: safeDecimal(a.question_serial, where),
      question_revision: safeDecimal(a.question_revision, where),
      target: target(a.target, where),
      field: field(a.field, where),
      value_reference: str(a.value_reference, where),
      occurrence_locator: locator(a.occurrence_locator, where),
    };
  });
  return { basis: basis(b.basis, where), accepted_answers: answers };
}
function evaluation(x: unknown, where: string, v2 = false): NativeEvaluation {
  const o = keys(
    x,
    v2
      ? ['basis', 'coverage', 'readiness', 'requirements', 'artifacts', 'host_work', 'findings', 'chain', 'handles']
      : ['basis', 'coverage', 'readiness', 'requirements', 'artifacts', 'host_work'],
    where,
  );
  let nativeBasis: NativeEvaluation['basis'] = null;
  if (o.basis !== null) {
    nativeBasis = evaluationBasis(o.basis, where);
  }
  const c = keys(o.coverage, ['status', 'reason'], where);
  const cv = oneOf(c.status, ['complete', 'partial', 'unavailable'] as const, where);
  const reason =
    c.reason === null
      ? null
      : oneOf(
          c.reason,
          [
            'unknown_target',
            'unknown_scope',
            'ambiguous_target',
            'duplicate_selection',
            'unsupported_groups',
            'multiple_rel_groups',
            'target_not_selected',
            'target_revision_not_in_basis',
            'group_membership_unqualified',
            'unsupported_control_combination',
            'widening_refused',
            'conflicting_target',
            'invalid_preview',
            'invalid_scope_selection',
            'scoped_preview_unsupported',
            'semantic_projection_unsupported',
            'budget',
          ] as const,
          where,
        );
  const r = object(o.readiness, where);
  const readinessKind = oneOf(
    r.kind,
    ['not_requested', 'not_applicable', 'unsupported', 'unavailable', 'supported'] as const,
    where,
  );
  let readiness: NativeEvaluation['readiness'];
  if (readinessKind === 'supported') {
    keys(r, ['kind', 'profile', 'status'], where);
    readiness = {
      kind: readinessKind,
      profile: profile(r.profile, where),
      status: oneOf(r.status, ['ready', 'not_ready', 'incomplete'] as const, where),
    };
  } else {
    keys(r, ['kind'], where);
    readiness = { kind: readinessKind };
  }
  const requirements = arr(o.requirements, where).map((v) => {
    const q = keys(v, ['id', 'scope', 'field', 'state', 'supports', 'allowed_disposition'], where);
    return {
      id: str(q.id, where),
      scope: q.scope === null ? null : scope(q.scope, where),
      field: q.field === null ? null : field(q.field, where),
      state: oneOf(q.state, ['satisfied', 'unsatisfied', 'unresolved', 'not_applicable'] as const, where),
      supports: arr(q.supports, where).map((s) => support(s, where)),
      allowed_disposition:
        q.allowed_disposition === null
          ? null
          : oneOf(q.allowed_disposition, ['validated_answer', 'host_confirmation'] as const, where),
    };
  });
  const artifacts = arr(o.artifacts, where).map((v) => {
    const a = keys(v, ['id', 'target', 'obligation', 'fields', 'basis'], where);
    let id: NativeArtifact['id'] = null;
    if (a.id !== null) {
      const i = keys(a.id, ['chain', 'serial'], where);
      id = { chain: str(i.chain, where), serial: safeDecimal(i.serial, where) };
    }
    return {
      id,
      target: target(a.target, where),
      obligation: oneOf(a.obligation, ['required', 'conditional_unresolved', 'not_required'] as const, where),
      fields: arr(a.fields, where).map((f) => artifactField(f, where)),
      basis: basis(a.basis, where),
    };
  });
  const h = keys(o.host_work, ['coverage', 'cause', 'rows'], where);
  const cause =
    h.cause === null
      ? null
      : oneOf(
          h.cause,
          [
            'input_bytes',
            'input_records',
            'input_members',
            'items',
            'support_edges',
            'work',
            'retained_bytes',
            'output_bytes',
          ] as const,
          where,
        );
  return {
    basis: nativeBasis,
    coverage: { status: cv, reason },
    readiness,
    requirements,
    artifacts,
    host_work: {
      coverage: oneOf(h.coverage, ['not_requested', 'complete', 'partial', 'unavailable'] as const, where),
      cause,
      rows: arr(h.rows, where).map((row) => hostRow(row, where)),
    },
  };
}
function subject(x: unknown): NativeSubject {
  const o = keys(x, ['chain', 'serial'], 'subject');
  return { chain: str(o.chain, 'subject'), serial: safeDecimal(o.serial, 'subject') };
}
function meaning(x: unknown): NativeMeaning {
  const o = keys(x, ['requested_fact', 'scope', 'answer_kinds', 'answer_effects'], 'meaning');
  return {
    requested_fact: str(o.requested_fact, 'meaning'),
    scope: o.scope === null ? null : scope(o.scope, 'meaning'),
    answer_kinds: arr(o.answer_kinds, 'meaning').map((x) => {
      const a = keys(x, ['kind', 'field'], 'answer kind');
      return {
        kind: oneOf(a.kind, ['cab_field_replacement'] as const, 'answer kind'),
        field: field(a.field, 'answer kind'),
      };
    }),
    answer_effects: arr(o.answer_effects, 'meaning').map((x) => str(x, 'answer effect')),
  };
}
function parseFindings(
  e: Record<string, unknown>,
  base: NativeEvaluation,
): Pick<NativeEvaluationV2, 'chain' | 'handles' | 'findings'> {
  const o = keys(e.findings, ['unrepresented', 'status', 'coverage', 'items'], 'findings');
  const omitted = arr(o.unrepresented, 'unrepresented');
  const expected = ['other_outcomes', 'readings', 'complete_finding_inventory'];
  if (omitted.length !== expected.length || omitted.some((x, i) => x !== expected[i])) fail('unrepresented');
  if (o.status !== 'partial') fail('finding status');
  const c = keys(o.coverage, ['status', 'reason'], 'finding coverage');
  if (c.status !== base.coverage.status || c.reason !== base.coverage.reason) fail('finding coverage');
  const items = arr(o.items, 'findings').map((v): NativeFinding => {
    const f = keys(
      v,
      [
        'subject',
        'outcome',
        'needs_person',
        'blocks',
        'requirement',
        'question',
        'requested_action',
        'result',
        'result_revision',
        'readings',
      ],
      'finding',
    );
    const r = object(f.requirement, 'requirement link');
    const status = oneOf(r.status, ['resolved', 'not_supplied', 'unavailable'] as const, 'requirement link');
    let requirement: NativeFinding['requirement'];
    if (status === 'resolved') {
      keys(r, ['status', 'index'], 'requirement link');
      const index = safeDecimal(r.index, 'requirement index');
      if (Number(index) >= base.requirements.length) fail('requirement index');
      requirement = { status, index };
    } else {
      keys(r, ['status'], 'requirement link');
      requirement = { status };
    }
    let question: NativeFinding['question'] = null;
    if (f.question !== null) {
      const q = keys(
        f.question,
        ['chain', 'serial', 'revision', 'subject', 'field', 'prompt', 'meaning', 'basis'],
        'question',
      );
      question = {
        chain: str(q.chain, 'question'),
        serial: safeDecimal(q.serial, 'question'),
        revision: safeDecimal(q.revision, 'question'),
        subject: subject(q.subject),
        field: field(q.field, 'question'),
        prompt: str(q.prompt, 'question'),
        meaning: meaning(q.meaning),
        basis: basis(q.basis, 'question'),
      };
    }
    let result: NativeFinding['result'] = null;
    if (f.result !== null) {
      const r = keys(f.result, ['subject_chain', 'subject_serial', 'serial'], 'result');
      result = {
        subject_chain: str(r.subject_chain, 'result'),
        subject_serial: safeDecimal(r.subject_serial, 'result'),
        serial: safeDecimal(r.serial, 'result'),
      };
    }
    return {
      subject: subject(f.subject),
      outcome: oneOf(f.outcome, ['needs_fact', 'unavailable'] as const, 'outcome'),
      needs_person: oneOf(f.needs_person, ['none', 'optional', 'required'] as const, 'needs person'),
      blocks: oneOf(f.blocks, ['never', 'finalize', 'now'] as const, 'blocks'),
      requirement,
      question,
      requested_action: f.requested_action === null ? null : meaning(f.requested_action),
      result,
      result_revision: f.result_revision === null ? null : safeDecimal(f.result_revision, 'result revision'),
      readings: oneOf(f.readings, ['unavailable'] as const, 'readings'),
    };
  });
  const h = keys(
    e.handles,
    [
      'last_subject',
      'last_question',
      'last_artifact',
      'last_act_sequence',
      'last_question_revision',
      'last_result_revision',
    ],
    'handles',
  );
  const handles = {
    last_subject: safeDecimal(h.last_subject, 'handles'),
    last_question: safeDecimal(h.last_question, 'handles'),
    last_artifact: safeDecimal(h.last_artifact, 'handles'),
    last_act_sequence: safeDecimal(h.last_act_sequence, 'handles'),
    last_question_revision: safeDecimal(h.last_question_revision, 'handles'),
    last_result_revision: safeDecimal(h.last_result_revision, 'handles'),
  };
  return {
    chain: e.chain === null ? null : str(e.chain, 'chain'),
    handles,
    findings: { unrepresented: expected, status: 'partial', coverage: base.coverage, items },
  };
}
const OMITTED = [
  'evaluation_chain',
  'handle_watermarks',
  'findings',
  'semantic_results',
  'prior_continuity',
  'continuity',
  'continuity_cause',
  'ambiguities',
  'joint_preview',
  'act_history',
  'act_history_cause',
  'acts',
  'pending_responses',
  'pending_responses_cause',
  'response_bindings',
];
// Only bounded JSON can enter the parser. A verified frozen object can then be
// safely shared with docView without re-parsing or copying every evaluation.
const accepted = new WeakSet<object>();
function parseJson(text: string, maxBytes: number): unknown {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return fail('invalid byte limit');
  if (typeof text !== 'string' || text.length > maxBytes) return fail('wire too large or not text');
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (
      c >= 0xd800 &&
      c <= 0xdbff &&
      i + 1 < text.length &&
      text.charCodeAt(i + 1) >= 0xdc00 &&
      text.charCodeAt(i + 1) <= 0xdfff
    ) {
      bytes += 4;
      i++;
    } else bytes += 3;
    if (bytes > maxBytes) return fail('wire too large');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fail('malformed JSON');
  }
}
function freezeTree(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freezeTree(child);
  Object.freeze(value);
}
export function isParsedNativeEnvelope(value: unknown): value is NativeEnvelope {
  return value !== null && typeof value === 'object' && accepted.has(value);
}
export function parseNativeJson(text: string, maxBytes: number): NativeEnvelope {
  const o = keys(
    parseJson(text, maxBytes),
    ['schema', 'version', 'route_scope', 'whole_document_finalize', 'omitted_lanes', 'evaluation'],
    'envelope',
  );
  const v2 = o.schema === 'knitli.native-cab-findings.v2' && o.version === 2;
  if (!v2 && !(o.schema === 'knitli.native-evaluation.v1' && o.version === 1)) fail('schema version');
  if (o.route_scope !== 'cab_snapshot' || o.whole_document_finalize !== 'unsupported') fail('scope');
  const omittedValues = arr(o.omitted_lanes, 'omitted_lanes');
  const expected = v2
    ? OMITTED.filter((lane) => lane !== 'findings' && lane !== 'evaluation_chain' && lane !== 'handle_watermarks')
    : OMITTED;
  if (omittedValues.length !== expected.length || omittedValues.some((value, i) => value !== expected[i]))
    fail('omitted lanes contract');
  const omitted = expected.slice();
  const common = {
    route_scope: 'cab_snapshot' as const,
    whole_document_finalize: 'unsupported' as const,
    omitted_lanes: omitted,
  };
  const base = evaluation(o.evaluation, 'evaluation', v2);
  const result: NativeEnvelope = v2
    ? {
        ...common,
        schema: 'knitli.native-cab-findings.v2',
        version: 2,
        evaluation: { ...base, ...parseFindings(object(o.evaluation, 'evaluation'), base) },
      }
    : { ...common, schema: 'knitli.native-evaluation.v1', version: 1, evaluation: base };
  freezeTree(result);
  accepted.add(result);
  return result;
}

const acceptedSourceViews = new WeakSet<object>();
export function isParsedNativeSourceMarkingView(value: unknown): value is NativeSourceMarkingView {
  return value !== null && typeof value === 'object' && acceptedSourceViews.has(value);
}

/** Parse a bounded read-only source view; offsets and mask lengths are rejected. */
export function parseNativeSourceMarkingJson(text: string, maxBytes: number): NativeSourceMarkingView {
  const o = keys(
    parseJson(text, maxBytes),
    ['schema', 'binding', 'marking'],
    'source marking envelope',
  );
  if (o.schema !== 'knitli.native-source-marking.v2') fail('source marking scope');
  const b = keys(
    o.binding,
    ['chain_id', 'source_id', 'revision_id', 'contribution_id', 'scope_id', 'viewer_id'],
    'source marking binding',
  );
  const binding = {
    chain_id: str(b.chain_id, 'binding.chain_id'),
    source_id: str(b.source_id, 'binding.source_id'),
    revision_id: str(b.revision_id, 'binding.revision_id'),
    contribution_id: str(b.contribution_id, 'binding.contribution_id'),
    scope_id: safeDecimal(b.scope_id, 'binding.scope_id'),
    viewer_id: str(b.viewer_id, 'binding.viewer_id'),
  };
  if (
    [binding.chain_id, binding.source_id, binding.revision_id, binding.contribution_id, binding.viewer_id].some(
      (value) => !value.trim(),
    )
  )
    fail('source marking binding values');
  const m = keys(o.marking, ['text', 'layers', 'masks'], 'source marking');
  const visibleText = str(m.text, 'source marking.text');
  const layersIn = arr(m.layers, 'source marking.layers');
  if (layersIn.length !== 1 || arr(m.masks, 'source marking.masks').length !== 0) fail('source marking shape');
  const layerIn = keys(layersIn[0], ['tokens'], 'source marking.layer');
  const tokens: Token[] = [];
  const visiblePieces: string[] = [];
  for (const [index, raw] of arr(layerIn.tokens, 'source marking.tokens').entries()) {
    const tokenObject = object(raw, `source marking.tokens[${index}]`);
    if (Object.hasOwn(tokenObject, 'mask')) {
      const token = keys(raw, ['t', 'mask'], `source marking.tokens[${index}]`);
      if (str(token.t, `source marking.tokens[${index}].t`) !== '') fail('source marking mask token');
      const maskObject = keys(token.mask, ['kind'], `source marking.tokens[${index}].mask`);
      const mask: Mask = { kind: oneOf(maskObject.kind, ['concealed', 'unidentified'] as const, 'mask.kind') };
      tokens.push({ t: '', mask });
    } else {
      const token = keys(raw, ['t'], `source marking.tokens[${index}]`);
      const value = str(token.t, `source marking.tokens[${index}].t`);
      if (!value) fail('source marking empty visible token');
      visiblePieces.push(value);
      tokens.push({ t: value });
    }
  }
  if (visiblePieces.join('') !== visibleText) fail('source marking visible text');
  const marking: Marking = {
    text: visibleText,
    layers: [{ tokens } as Layer],
    masks: [],
  };
  const result: NativeSourceMarkingView = { schema: 'knitli.native-source-marking.v2', binding, marking };
  freezeTree(result);
  acceptedSourceViews.add(result);
  return result;
}
/** Parse a separately supplied host currentness basis using the same schema. */
export function parseNativeBasisJson(text: string, maxBytes: number): NativeEvaluationBasis {
  return evaluationBasis(parseJson(text, maxBytes), 'current basis');
}
