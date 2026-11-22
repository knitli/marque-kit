// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { afterEach, expect, test, vi } from 'vite-plus/test';
import { mountOrdinaryCabWorkspace } from '../../../../apps/office-addin/src/ordinary-cab-workspace.ts';
import type {
  OfficeNativeWordSession,
  OfficeOrdinaryCabConfirmationGrant,
  OfficeOrdinaryCabGrant,
  OfficeOrdinaryCabMemberScope,
  OfficeOrdinaryCabSourceLinkGrant,
  OfficeWordHost,
} from '../../../../apps/office-addin/src/workspace.ts';
import fixture from './fixtures/ordinary-successor-171.json' with { type: 'json' };
import snapshotFixture from './fixtures/ordinary-cab-basis-161.json' with { type: 'json' };

const receipt = `blake3:${'a'.repeat(64)}`;
const fingerprint = `blake3:${'b'.repeat(64)}`;
const confirmationReceipt = `blake3:${'c'.repeat(64)}`;
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});

type Member = typeof fixture.original.request.member;
type Question = { chain: string; serial: string; revision: string; field: string };
type QuestionSnapshot = { evaluation: { findings: { items: { question: Question | null }[] } } };
function scope(member: Member): OfficeOrdinaryCabMemberScope {
  return {
    documentId: member.identity.document_id,
    revisionId: member.identity.revision_id,
    contributionId: member.identity.contribution_id,
    scopeLocator: member.cab_inspection.target.scope_locator as [number, number],
    text: member.source,
    layoutRevision: member.cab_inspection.layout_revision,
    facePage: member.cab_inspection.face_page,
    owner: {
      role: member.owner.role as 'transmittal' | 'attachment',
      parentDocumentId: member.owner.parent_document_id,
      intrinsicClassificationLocator: member.owner.intrinsic_classification_locator as [number, number],
    },
  };
}

function makeGrant(
  options: {
    linked?: boolean;
    different?: boolean;
    snapshot?: QuestionSnapshot;
    receipt?: string;
    fingerprint?: string;
    confirmationReceipt?: string;
  } = {},
) {
  const original = options.linked ? fixture.linked : fixture.original;
  const linkedSource = options.linked ? fixture.linked.sourceLink : undefined;
  const successor = options.linked
    ? fixture.linkedSuccessor
    : options.different
      ? fixture.different
      : fixture.successor;
  const member = successor.request.member;
  const face = member.cab_inspection;
  const issued = (options.snapshot ?? snapshotFixture).evaluation.findings.items.flatMap((item) =>
    item.question ? [item.question] : [],
  );
  const answers = issued.map((q) => ({
    question: { chain: q.chain, serial: q.serial, revision: q.revision, field: q.field },
    answer_id: `accepted-${q.field}`,
    value_reference: q.field === 'classified_by' ? 'private-accepted-classifier' : 'private-accepted-reason',
    occurrence_locator: face.fields.find((field) => field.field === q.field)!.occurrence!.value,
  }));
  const receiptValue = options.receipt ?? receipt;
  const fingerprintValue = options.fingerprint ?? fingerprint;
  const preview = {
    mode: 'apply',
    question_request: original.request,
    source_examination: original.examination,
    ...(linkedSource ? { source_link: linkedSource } : {}),
    preview_receipt: receiptValue,
    answers,
  };
  const accepted = {
    target: original.request.member.cab_inspection.target,
    preview_receipt: receiptValue,
    preview_fingerprint: fingerprintValue,
    observations: answers.map((answer) => ({
      question: answer.question,
      answer_id: answer.answer_id,
      value_reference: answer.value_reference,
      locator: `private-acceptance-${answer.question.field}`,
    })),
  };
  const valueIdentities = {
    target: face.target,
    candidate: face.candidate,
    layout_revision: face.layout_revision,
    observations: face.fields.map((field) => ({
      field: field.field,
      occurrence: field.occurrence,
      value_reference:
        field.field === 'classified_by'
          ? options.different
            ? 'private-observed-other'
            : 'private-accepted-classifier'
          : field.field === 'classification_reason'
            ? 'private-accepted-reason'
            : `private-${field.field}`,
      locator: `private-observation-${field.field}`,
    })),
  };
  const mapping = {
    target_id: 'document-face',
    target_revision_id: original.request.member.identity.revision_id,
    successor_source_id: member.identity.document_id,
    successor_revision_id: member.identity.revision_id,
    successor_contribution: member.identity.contribution_id,
  };
  const grant: OfficeOrdinaryCabConfirmationGrant = {
    documentId: 'synthetic-target',
    chain: 'neutral-chain-159',
    viewerId: 'private-viewer',
    grantId: 'private-confirmation-grant',
    permissionRevision: 'confirmation-permission-1',
    authorizeRawInput: true,
    authorizeRawOutput: true,
    authorizeGroupOutcome: true,
    base: scope(original.request.member),
    successor: scope(member),
    logicalTargetId: mapping.target_id,
    expectedReceipt: receiptValue,
    expectedPreviewFingerprint: fingerprintValue,
    expectedConfirmationReceipt: options.confirmationReceipt ?? confirmationReceipt,
    acceptedPreviewJson: JSON.stringify(preview),
    acceptedValueIdentitiesJson: JSON.stringify(accepted),
    successorMemberJson: JSON.stringify(member),
    successorExaminationJson: JSON.stringify(successor.examination),
    successorValueIdentitiesJson: JSON.stringify(valueIdentities),
    correspondenceJson: JSON.stringify(mapping),
    ...('directUse' in successor ? { successorDirectUseJson: JSON.stringify(successor.directUse) } : {}),
    ...(options.linked ? { sourceLinkGrantId: 'private-linked-source-grant' } : {}),
    disclosedFields: ['classified_by'],
  };
  let source: OfficeOrdinaryCabSourceLinkGrant | null = null;
  if (linkedSource) {
    source = {
      documentId: grant.documentId,
      chain: grant.chain,
      viewerId: grant.viewerId,
      grantId: grant.sourceLinkGrantId!,
      permissionRevision: 'source-permission-1',
      authorizeRawInput: true,
      authorizeRawOutput: true,
      current: scope(linkedSource.member),
      sourceLinkJson: JSON.stringify(linkedSource),
    };
  }
  return { grant, source, preview, accepted, member, valueIdentities, mapping };
}

function response(status: 'confirmed' | 'different' | 'unavailable' = 'confirmed', bound = confirmationReceipt) {
  return JSON.stringify({
    schema: 'marque.ordinary-cab-confirmation.v1',
    status: 'available',
    reason: null,
    confirmation_receipt: bound,
    confirmation: {
      schema: 'knitli.native-cab-field-confirmation.v1',
      version: 1,
      status,
      fields: status === 'confirmed' ? ['classified_by', 'classification_reason'] : null,
    },
  });
}

function setup(
  options: {
    grant?: OfficeOrdinaryCabConfirmationGrant | null;
    source?: OfficeOrdinaryCabSourceLinkGrant | null;
    execute?: (input: string) => Promise<string>;
    evaluate?: (input: string) => Promise<string>;
    questionGrant?: OfficeOrdinaryCabGrant;
    beforeConfirmationRead?: () => Promise<void>;
    confirmationReader?: boolean;
  } = {},
) {
  const root = document.createElement('div');
  document.body.append(root);
  const apply = vi.fn();
  const evaluate = vi.fn(options.evaluate ?? (async () => 'unused'));
  const confirm = vi.fn(options.execute ?? (async () => response()));
  const session: OfficeNativeWordSession = {
    kind: 'native_cab',
    documentId: 'synthetic-target',
    chain: 'neutral-chain-159',
    nativeCab: { documentId: 'synthetic-target', chain: 'neutral-chain-159', wire: '' },
    ordinaryCab: { viewerId: 'private-viewer', evaluate, confirm },
  };
  let current = options.grant === undefined ? makeGrant().grant : options.grant;
  let source = options.source ?? null;
  let activeDocument = session.documentId;
  let invalidate = () => {};
  const readConfirmation = vi.fn(async () => {
    await options.beforeConfirmationRead?.();
    return current && structuredClone(current);
  });
  const readSource = vi.fn(async () => source && structuredClone(source));
  const host: OfficeWordHost = {
    activeDocumentId: async () => activeDocument,
    applyCommitted: apply,
    readOrdinaryCabGrant: options.questionGrant ? async () => structuredClone(options.questionGrant!) : undefined,
    readOrdinaryCabConfirmationGrant: options.confirmationReader === false ? undefined : readConfirmation,
    readOrdinaryCabSourceLinkGrant: readSource,
    watchOrdinaryCabInvalidation: (_document, _chain, _viewer, notify) => {
      invalidate = notify;
      return () => {};
    },
  };
  const pane = mountOrdinaryCabWorkspace(root, session, host, 1_048_576);
  cleanups.push(() => pane.destroy());
  return {
    root,
    pane,
    session,
    confirm,
    evaluate,
    apply,
    readConfirmation,
    readSource,
    setGrant(value: OfficeOrdinaryCabConfirmationGrant | null) {
      current = value;
    },
    setSource(value: OfficeOrdinaryCabSourceLinkGrant | null) {
      source = value;
    },
    setDocument(value: string) {
      activeDocument = value;
    },
    invalidate() {
      invalidate();
    },
  };
}

function clickConfirmation(root: HTMLElement) {
  const button = [...root.querySelectorAll('button')].find((item) => item.textContent === 'Check accepted answers');
  expect(button).toBeDefined();
  button!.click();
}

function noPrivate(root: HTMLElement) {
  for (const value of [
    'Synthetic target',
    'Example Analyst',
    'Another Analyst',
    'Example Office',
    '20500101',
    '1.4(c)',
    'synthetic-target',
    'neutral-chain-159',
    'private-',
    'blake3:',
    'ALPHA-PRIVATE',
    'source-document-a',
  ])
    expect(root.outerHTML).not.toContain(value);
}
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('a confirmation-only viewer sees only the independently disclosed confirmed field', async () => {
  const data = makeGrant();
  const f = setup({ grant: data.grant });
  await f.pane.ready;
  clickConfirmation(f.root);
  await vi.waitFor(() => expect(f.root.textContent).toContain('Accepted answers checked'));
  expect(f.confirm).toHaveBeenCalledOnce();
  const input = JSON.parse(f.confirm.mock.calls[0]![0]);
  expect(input.preview).toEqual(data.preview);
  expect(input.accepted_value_identities).toEqual(data.accepted);
  expect(input.successor.member).toEqual(data.member);
  expect(input.successor.value_identities).toEqual(data.valueIdentities);
  expect(input.correspondence).toEqual(data.mapping);
  expect(f.root.textContent).toContain('Classified by: matches.');
  expect(f.root.textContent).not.toContain('Classification reason: matches.');
  expect(f.evaluate).not.toHaveBeenCalled();
  expect(f.apply).not.toHaveBeenCalled();
  noPrivate(f.root);
});

test('whole-group outcome permission is separate from an empty field-label grant', async () => {
  const data = makeGrant();
  data.grant.disclosedFields = [];
  const f = setup({ grant: data.grant });
  await f.pane.ready;
  clickConfirmation(f.root);
  await vi.waitFor(() => expect(f.root.textContent).toContain('Accepted answers checked'));
  expect(f.root.textContent).not.toContain(': matches.');
  noPrivate(f.root);
});

test('write capability does not grant a confirmation read', async () => {
  const f = setup({ grant: null });
  await f.pane.ready;
  clickConfirmation(f.root);
  await vi.waitFor(() => expect(f.readConfirmation).toHaveBeenCalled());
  await settled();
  expect(f.confirm).not.toHaveBeenCalled();
  expect(f.root.textContent).toContain('could not be checked');
  expect(f.apply).not.toHaveBeenCalled();
  noPrivate(f.root);
  const noReader = setup({ confirmationReader: false });
  await noReader.pane.ready;
  expect(noReader.root.querySelector('button')).toBeNull();
});

test('a linked confirmation requires and forwards its separately current source', async () => {
  const data = makeGrant({ linked: true });
  const f = setup({ grant: data.grant, source: data.source });
  await f.pane.ready;
  clickConfirmation(f.root);
  await vi.waitFor(() => expect(f.root.textContent).toContain('Accepted answers checked'));
  const input = JSON.parse(f.confirm.mock.calls[0]![0]);
  expect(input.preview.source_link).toEqual(JSON.parse(data.source!.sourceLinkJson));
  expect(input.successor.direct_use).toEqual(JSON.parse(data.grant.successorDirectUseJson!));
  expect(f.readSource.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(f.apply).not.toHaveBeenCalled();
  noPrivate(f.root);
});

test.each(['different', 'unavailable'] as const)('reports %s without claiming confirmation', async (status) => {
  const f = setup({ execute: async () => response(status) });
  await f.pane.ready;
  clickConfirmation(f.root);
  await vi.waitFor(() => expect(f.confirm).toHaveBeenCalledOnce());
  await settled();
  expect(f.root.textContent).toContain(status === 'different' ? 'do not match' : 'could not be checked');
  expect(f.root.textContent).not.toContain('Accepted answers checked');
  noPrivate(f.root);
});

test.each([
  'input',
  'output',
  'group outcome',
  'viewer',
  'document',
  'chain',
  'grant',
  'permission',
  'preview receipt',
  'preview fingerprint',
  'confirmation receipt',
  'accepted group',
  'base identity',
  'same revision',
  'successor identity',
  'successor layout',
  'successor face',
  'successor owner',
  'successor text',
  'successor readback',
  'successor value scope',
  'successor occurrence',
  'mapping',
  'invalid JSON',
  'oversized JSON',
] as const)('withholds the executor for an invalid confirmation grant: %s', async (denial) => {
  const grant = makeGrant().grant;
  if (denial === 'input') (grant as unknown as { authorizeRawInput: boolean }).authorizeRawInput = false;
  if (denial === 'output') (grant as unknown as { authorizeRawOutput: boolean }).authorizeRawOutput = false;
  if (denial === 'group outcome')
    (grant as unknown as { authorizeGroupOutcome: boolean }).authorizeGroupOutcome = false;
  if (denial === 'viewer') grant.viewerId = 'another-viewer';
  if (denial === 'document') grant.documentId = 'another-document';
  if (denial === 'chain') grant.chain = 'another-chain';
  if (denial === 'grant') grant.grantId = '';
  if (denial === 'permission') grant.permissionRevision = '';
  if (denial === 'preview receipt') grant.expectedReceipt = `blake3:${'d'.repeat(64)}`;
  if (denial === 'preview fingerprint') grant.expectedPreviewFingerprint = `blake3:${'d'.repeat(64)}`;
  if (denial === 'confirmation receipt') grant.expectedConfirmationReceipt = 'invalid';
  if (denial === 'accepted group') {
    const accepted = JSON.parse(grant.acceptedValueIdentitiesJson);
    accepted.observations[0].value_reference = 'different-accepted-value';
    grant.acceptedValueIdentitiesJson = JSON.stringify(accepted);
  }
  if (denial === 'base identity') grant.base.contributionId = 'different-contribution';
  if (denial === 'same revision') grant.successor.revisionId = grant.base.revisionId;
  if (denial === 'successor identity') grant.successor.documentId = 'another-document';
  if (denial === 'successor layout') grant.successor.layoutRevision = 'same-text-reflow';
  if (denial === 'successor face') grant.successor.facePage++;
  if (denial === 'successor owner') grant.successor.owner.intrinsicClassificationLocator = [2, 3];
  if (denial === 'successor text') grant.successor.text += ' changed';
  if (denial === 'successor readback') {
    const member = JSON.parse(grant.successorMemberJson);
    member.cab_inspection.fields[0].readback.layout_revision = 'different-layout';
    grant.successorMemberJson = JSON.stringify(member);
  }
  if (denial === 'successor value scope' || denial === 'successor occurrence') {
    const identities = JSON.parse(grant.successorValueIdentitiesJson);
    if (denial === 'successor value scope') identities.target.revision_id = 'stale-revision';
    else identities.observations[0].occurrence.value = [0, 1];
    grant.successorValueIdentitiesJson = JSON.stringify(identities);
  }
  if (denial === 'mapping') {
    const mapping = JSON.parse(grant.correspondenceJson);
    mapping.successor_revision_id = 'stale-revision';
    grant.correspondenceJson = JSON.stringify(mapping);
  }
  if (denial === 'invalid JSON') grant.successorMemberJson = '{';
  if (denial === 'oversized JSON') grant.successorMemberJson = 'x'.repeat(1_048_577);
  const f = setup({ grant });
  await f.pane.ready;
  clickConfirmation(f.root);
  await vi.waitFor(() => expect(f.readConfirmation).toHaveBeenCalled());
  await settled();
  expect(f.confirm).not.toHaveBeenCalled();
  expect(f.root.textContent).toContain('could not be checked');
  expect(f.apply).not.toHaveBeenCalled();
  noPrivate(f.root);
});

test.each(['missing', 'permission', 'revision', 'link', 'direct use'] as const)(
  'does not forward a linked confirmation without exact source authority: %s',
  async (denial) => {
    const data = makeGrant({ linked: true });
    if (denial === 'permission') (data.source as unknown as { authorizeRawOutput: boolean }).authorizeRawOutput = false;
    if (denial === 'revision') data.source!.current.revisionId = 'another-revision';
    if (denial === 'link') {
      const link = JSON.parse(data.source!.sourceLinkJson);
      link.source_examination.protected_value_observations[0].reference = 'another-source-value';
      data.source!.sourceLinkJson = JSON.stringify(link);
    }
    if (denial === 'direct use') data.grant.successorDirectUseJson = undefined;
    const f = setup({ grant: data.grant, source: denial === 'missing' ? null : data.source });
    await f.pane.ready;
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(f.readConfirmation).toHaveBeenCalled());
    await settled();
    expect(f.confirm).not.toHaveBeenCalled();
    expect(f.root.textContent).toContain('could not be checked');
    noPrivate(f.root);
  },
);

test.each(['receipt', 'schema', 'extra field', 'missing field', 'duplicate field', 'fields on different'] as const)(
  'does not display an unbound or inconsistent confirmation response: %s',
  async (problem) => {
    const execute = async () => {
      const value = JSON.parse(response());
      if (problem === 'receipt') value.confirmation_receipt = `blake3:${'d'.repeat(64)}`;
      if (problem === 'schema') value.confirmation.schema = 'unknown';
      if (problem === 'extra field') value.confirmation.fields.push('declassify_on');
      if (problem === 'missing field') value.confirmation.fields.pop();
      if (problem === 'duplicate field') value.confirmation.fields[1] = value.confirmation.fields[0];
      if (problem === 'fields on different') value.confirmation.status = 'different';
      return JSON.stringify(value);
    };
    const f = setup({ execute });
    await f.pane.ready;
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(f.confirm).toHaveBeenCalledOnce());
    await settled();
    expect(f.root.textContent).toContain('could not be checked');
    expect(f.root.textContent).not.toContain('Accepted answers checked');
    noPrivate(f.root);
  },
);

test.each(['confirmed', 'different'] as const)(
  'a cached %s for a different group with the same field names is not shown',
  async (status) => {
    const current = makeGrant().grant;
    current.expectedConfirmationReceipt = `blake3:${'d'.repeat(64)}`;
    const f = setup({ grant: current, execute: async () => response(status, confirmationReceipt) });
    await f.pane.ready;
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(f.confirm).toHaveBeenCalledOnce());
    await settled();
    expect(f.root.textContent).toContain('could not be checked');
    expect(f.root.textContent).not.toContain('Accepted answers checked');
    expect(f.root.textContent).not.toContain('do not match');
    noPrivate(f.root);
  },
);

test('invalidation during a delayed grant read prevents raw input disclosure', async () => {
  let release: (() => void) | undefined;
  const f = setup({
    beforeConfirmationRead: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  await f.pane.ready;
  clickConfirmation(f.root);
  await vi.waitFor(() => expect(release).toBeDefined());
  f.invalidate();
  release!();
  await settled();
  expect(f.confirm).not.toHaveBeenCalled();
  noPrivate(f.root);
});

test.each([
  'revision',
  'layout',
  'actual identity',
  'answers',
  'permission',
  'viewer',
  'viewer session',
  'provider',
  'executor',
  'document',
  'source',
] as const)('discards a delayed result after a current %s change', async (change) => {
  const data = makeGrant({ linked: change === 'source' });
  let release: (() => void) | undefined;
  const f = setup({
    grant: data.grant,
    source: data.source,
    execute: () =>
      new Promise((resolve) => {
        release = () => resolve(response());
      }),
  });
  await f.pane.ready;
  clickConfirmation(f.root);
  await vi.waitFor(() => expect(release).toBeDefined());
  const changed = structuredClone(data.grant);
  if (change === 'revision') changed.successor.revisionId = 'r3';
  if (change === 'layout') changed.successor.layoutRevision = 'same-text-reflow';
  if (change === 'actual identity') {
    const values = JSON.parse(changed.successorValueIdentitiesJson);
    values.observations[0].value_reference = 'different-actual-identity';
    changed.successorValueIdentitiesJson = JSON.stringify(values);
  }
  if (change === 'answers') {
    const accepted = JSON.parse(changed.acceptedPreviewJson);
    accepted.answers[0].value_reference = 'new-accepted-value';
    changed.acceptedPreviewJson = JSON.stringify(accepted);
  }
  if (change === 'permission') changed.permissionRevision = 'confirmation-permission-2';
  if (change === 'viewer') changed.viewerId = 'another-viewer';
  if (change === 'viewer session') f.session.ordinaryCab!.viewerId = 'another-viewer';
  if (change === 'provider')
    (f.session as { ordinaryCab?: OfficeNativeWordSession['ordinaryCab'] }).ordinaryCab = {
      ...f.session.ordinaryCab!,
    };
  if (change === 'executor') f.session.ordinaryCab!.confirm = async () => response();
  if (change === 'document') f.setDocument('another-document');
  if (change === 'source') {
    const newer = structuredClone(data.source!);
    newer.current.revisionId = 'new-source-revision';
    f.setSource(newer);
  }
  f.setGrant(changed);
  release!();
  await settled();
  expect(f.root.textContent).not.toContain('Accepted answers checked');
  expect(f.apply).not.toHaveBeenCalled();
  noPrivate(f.root);
});

test('source invalidation removes a completed confirmation immediately', async () => {
  const data = makeGrant({ linked: true });
  const f = setup({ grant: data.grant, source: data.source });
  await f.pane.ready;
  clickConfirmation(f.root);
  await vi.waitFor(() => expect(f.root.textContent).toContain('Accepted answers checked'));
  f.invalidate();
  expect(f.root.textContent).not.toContain('Accepted answers checked');
  noPrivate(f.root);
});

type Engine = {
  evaluate_ordinary_cab_questions(input: string): string;
  evaluate_ordinary_cab_preview(input: string): string;
  evaluate_ordinary_cab_confirmation(input: string): string;
  inspect_cab_package(input: string): string;
};

function confirmationInput(grant: OfficeOrdinaryCabConfirmationGrant) {
  return JSON.stringify({
    preview: JSON.parse(grant.acceptedPreviewJson),
    accepted_value_identities: JSON.parse(grant.acceptedValueIdentitiesJson),
    successor: {
      member: JSON.parse(grant.successorMemberJson),
      source_examination: grant.successorExaminationJson === null ? null : JSON.parse(grant.successorExaminationJson),
      value_identities: JSON.parse(grant.successorValueIdentitiesJson),
      ...(grant.successorDirectUseJson === undefined ? {} : { direct_use: JSON.parse(grant.successorDirectUseJson) }),
    },
    correspondence: JSON.parse(grant.correspondenceJson),
  });
}

// The test host independently qualifies the exact bytes; it does not trust the engine's returned receipt.
function qualifyConfirmation(grant: OfficeOrdinaryCabConfirmationGrant) {
  const payload = Buffer.from(confirmationInput(grant), 'utf8');
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(payload.length));
  const input = Buffer.concat([Buffer.from('marque.ordinary-cab-confirmation.receipt.v1\0', 'utf8'), length, payload]);
  if (!process.env.MARQUE_170_BLAKE3) throw new Error('MARQUE_170_BLAKE3 must name an independent BLAKE3 executable');
  const check = spawnSync(process.env.MARQUE_170_BLAKE3, [], { input, encoding: 'utf8' });
  if (check.status !== 0 || !/^[0-9a-f]{64}\n$/.test(check.stdout)) throw new Error('independent BLAKE3 failed');
  grant.expectedConfirmationReceipt = `blake3:${check.stdout.trim()}`;
}

function realGrants(wasm: Engine, options: { linked?: boolean; different?: boolean; single?: boolean } = {}) {
  const original = options.linked ? fixture.linked : fixture.original;
  const prepared = JSON.parse(
    wasm.evaluate_ordinary_cab_preview(
      JSON.stringify({
        mode: 'prepare',
        question_request: original.request,
        source_examination: original.examination,
        ...(options.linked ? { source_link: fixture.linked.sourceLink } : {}),
      }),
    ),
  );
  expect(prepared.status).toBe('available');
  const selectedSnapshot = structuredClone(prepared.snapshot) as QuestionSnapshot;
  if (options.single) {
    selectedSnapshot.evaluation.findings.items = selectedSnapshot.evaluation.findings.items.filter(
      (item) => item.question?.field === 'classified_by',
    );
  }
  const partial = makeGrant({ ...options, snapshot: selectedSnapshot, receipt: prepared.preview_receipt });
  const applied = JSON.parse(wasm.evaluate_ordinary_cab_preview(partial.grant.acceptedPreviewJson));
  expect(applied.status).toBe('available');
  expect(applied.preview.status).toBe('complete');
  const data = makeGrant({
    ...options,
    snapshot: selectedSnapshot,
    receipt: prepared.preview_receipt,
    fingerprint: applied.preview_fingerprint,
  });
  qualifyConfirmation(data.grant);
  const current = options.linked ? fixture.linkedSuccessor : options.different ? fixture.different : fixture.successor;
  const question = JSON.parse(wasm.evaluate_ordinary_cab_questions(JSON.stringify(current.request)));
  expect(question.status).toBe('available');
  const questionGrant: OfficeOrdinaryCabGrant = {
    documentId: data.grant.documentId,
    chain: data.grant.chain,
    viewerId: data.grant.viewerId,
    grantId: 'private-current-question-grant',
    permissionRevision: 'question-permission-1',
    layoutRevision: current.request.member.cab_inspection.layout_revision,
    authorizeRawInput: true,
    authorizeRawOutput: true,
    requestJson: JSON.stringify(current.request),
    current: {
      kind: 'cab_snapshot',
      operation: 'base',
      target: question.snapshot.evaluation.artifacts[0].target,
      profile: question.snapshot.evaluation.basis.basis.profile,
      currentBasisJson: JSON.stringify(question.snapshot.evaluation.basis),
    },
    disclosedFields: ['classified_by'],
  };
  return { ...data, questionGrant };
}

test.skipIf(!process.env.MARQUE_170_WASM).each([false, true])(
  'the real engine confirms a current accepted group in the normal pane (linked: %s)',
  async (linked) => {
    const wasm = createRequire(import.meta.url)(process.env.MARQUE_170_WASM!) as Engine;
    const data = realGrants(wasm, { linked });
    let output: any;
    const f = setup({
      grant: data.grant,
      source: data.source,
      questionGrant: data.questionGrant,
      evaluate: async (input) => wasm.evaluate_ordinary_cab_questions(input),
      execute: async (input) => {
        expect(input).toBe(confirmationInput(data.grant));
        const result = wasm.evaluate_ordinary_cab_confirmation(input);
        output = JSON.parse(result);
        return result;
      },
    });
    await f.pane.ready;
    expect(f.root.textContent).toContain('Authority block questions');
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(f.root.textContent).toContain('Accepted answers checked'));
    expect(output).toMatchObject({
      status: 'available',
      confirmation_receipt: data.grant.expectedConfirmationReceipt,
      confirmation: { status: 'confirmed' },
    });
    expect(f.root.textContent).toContain('Classified by: matches.');
    expect(f.root.textContent).not.toContain('Classification reason: matches.');
    expect(f.apply).not.toHaveBeenCalled();
    noPrivate(f.root);
  },
);

test.skipIf(!process.env.MARQUE_170_WASM)(
  'the real engine confirms only the selected single-answer group',
  async () => {
    const wasm = createRequire(import.meta.url)(process.env.MARQUE_170_WASM!) as Engine;
    const data = realGrants(wasm, { single: true });
    let output: any;
    const f = setup({
      grant: data.grant,
      execute: async (input) => {
        const result = wasm.evaluate_ordinary_cab_confirmation(input);
        output = JSON.parse(result);
        return result;
      },
    });
    await f.pane.ready;
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(f.root.textContent).toContain('Accepted answers checked'));
    expect(output.confirmation.fields).toEqual(['classified_by']);
    expect(f.root.textContent).toContain('Classified by: matches.');
    expect(f.root.textContent).not.toContain('Classification reason: matches.');
    noPrivate(f.root);
  },
);

test.skipIf(!process.env.MARQUE_170_WASM)(
  'a same-text split clears confirmation until a fresh on-face readback',
  async () => {
    const wasm = createRequire(import.meta.url)(process.env.MARQUE_170_WASM!) as Engine;
    const data = realGrants(wasm);
    const outputs: any[] = [];
    const f = setup({
      grant: data.grant,
      execute: async (input) => {
        const result = wasm.evaluate_ordinary_cab_confirmation(input);
        outputs.push(JSON.parse(result));
        return result;
      },
    });
    await f.pane.ready;
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(f.root.textContent).toContain('Accepted answers checked'));

    function freshReadback(layout: string, pages: number[]) {
      const next = structuredClone(data.grant);
      const member = JSON.parse(next.successorMemberJson);
      next.successor.layoutRevision = layout;
      member.cab_inspection.layout_revision = layout;
      for (const row of member.cab_inspection.fields) {
        row.readback.layout_revision = layout;
        if (row.field === 'classified_by') row.readback.pages = pages;
      }
      next.successorMemberJson = JSON.stringify(member);
      const identities = JSON.parse(next.successorValueIdentitiesJson);
      identities.layout_revision = layout;
      next.successorValueIdentitiesJson = JSON.stringify(identities);
      qualifyConfirmation(next);
      return { next, member };
    }

    const split = freshReadback('layout-split', [1, 2]);
    expect(split.next.successor.text).toBe(data.grant.successor.text);
    const placement = JSON.parse(
      wasm.inspect_cab_package(JSON.stringify({ inventory_complete: true, members: [split.member] })),
    );
    expect(
      placement.members[0].cab_inspection.fields.find((row: { field: string }) => row.field === 'classified_by'),
    ).toMatchObject({ placement: 'split_page', target_state: 'unknown' });
    f.setGrant(split.next);
    f.invalidate();
    expect(f.root.textContent).not.toContain('Accepted answers checked');
    await f.pane.refresh();
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(outputs).toHaveLength(2));
    await settled();
    expect(outputs[1]).toMatchObject({ status: 'unavailable', confirmation: null, confirmation_receipt: null });
    expect(f.root.textContent).toContain('could not be checked');

    const face = freshReadback('layout-L2', [1]);
    expect(face.next.successor.text).toBe(split.next.successor.text);
    f.setGrant(face.next);
    f.invalidate();
    await f.pane.refresh();
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(f.root.textContent).toContain('Accepted answers checked'));
    expect(outputs[2]).toMatchObject({
      status: 'available',
      confirmation_receipt: face.next.expectedConfirmationReceipt,
      confirmation: { status: 'confirmed' },
    });
    expect(f.apply).not.toHaveBeenCalled();
    noPrivate(f.root);
  },
);

test.skipIf(!process.env.MARQUE_170_WASM)(
  'the real engine reports independently observed different value identity without a write',
  async () => {
    const wasm = createRequire(import.meta.url)(process.env.MARQUE_170_WASM!) as Engine;
    const data = realGrants(wasm, { different: true });
    let output: any;
    const f = setup({
      grant: data.grant,
      execute: async (input) => {
        const result = wasm.evaluate_ordinary_cab_confirmation(input);
        output = JSON.parse(result);
        return result;
      },
    });
    await f.pane.ready;
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(f.root.textContent).toContain('do not match'));
    expect(output).toMatchObject({
      status: 'available',
      confirmation_receipt: data.grant.expectedConfirmationReceipt,
      confirmation: { status: 'different', fields: null },
    });
    expect(f.apply).not.toHaveBeenCalled();
    noPrivate(f.root);
  },
);

test.skipIf(!process.env.MARQUE_170_WASM)(
  'the real engine reports an incomplete successor comparison as unavailable',
  async () => {
    const wasm = createRequire(import.meta.url)(process.env.MARQUE_170_WASM!) as Engine;
    const data = realGrants(wasm);
    data.grant.successorExaminationJson = null;
    qualifyConfirmation(data.grant);
    let output: any;
    const f = setup({
      grant: data.grant,
      execute: async (input) => {
        const result = wasm.evaluate_ordinary_cab_confirmation(input);
        output = JSON.parse(result);
        return result;
      },
    });
    await f.pane.ready;
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(f.confirm).toHaveBeenCalledOnce());
    await settled();
    expect(output).toMatchObject({ status: 'unavailable', confirmation: null, confirmation_receipt: null });
    expect(f.root.textContent).toContain('could not be checked');
    expect(f.apply).not.toHaveBeenCalled();
    noPrivate(f.root);
  },
);

test.skipIf(!process.env.MARQUE_170_WASM)(
  'the real linked request is withheld without its independent source grant',
  async () => {
    const wasm = createRequire(import.meta.url)(process.env.MARQUE_170_WASM!) as Engine;
    const data = realGrants(wasm, { linked: true });
    const f = setup({
      grant: data.grant,
      source: null,
      execute: async (input) => wasm.evaluate_ordinary_cab_confirmation(input),
    });
    await f.pane.ready;
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(f.readSource).toHaveBeenCalled());
    await settled();
    expect(f.confirm).not.toHaveBeenCalled();
    expect(f.root.textContent).toContain('could not be checked');
    noPrivate(f.root);
  },
);

test.skipIf(!process.env.MARQUE_170_WASM)(
  'a real cached positive for a different accepted group cannot be swapped in',
  async () => {
    const wasm = createRequire(import.meta.url)(process.env.MARQUE_170_WASM!) as Engine;
    const data = realGrants(wasm);
    const cached = wasm.evaluate_ordinary_cab_confirmation(confirmationInput(data.grant));
    expect(JSON.parse(cached).reason).toBeNull();
    expect(JSON.parse(cached)).toMatchObject({ status: 'available', confirmation: { status: 'confirmed' } });
    const current = structuredClone(data.grant);
    const preview = JSON.parse(current.acceptedPreviewJson);
    preview.answers[0].answer_id = 'another-accepted-answer';
    current.acceptedPreviewJson = JSON.stringify(preview);
    const applied = JSON.parse(wasm.evaluate_ordinary_cab_preview(current.acceptedPreviewJson));
    expect(applied).toMatchObject({ status: 'available', preview: { status: 'complete' } });
    current.expectedPreviewFingerprint = applied.preview_fingerprint;
    const accepted = JSON.parse(current.acceptedValueIdentitiesJson);
    accepted.preview_fingerprint = applied.preview_fingerprint;
    accepted.observations[0].answer_id = preview.answers[0].answer_id;
    current.acceptedValueIdentitiesJson = JSON.stringify(accepted);
    qualifyConfirmation(current);
    expect(current.expectedConfirmationReceipt).not.toBe(data.grant.expectedConfirmationReceipt);
    const actual = JSON.parse(wasm.evaluate_ordinary_cab_confirmation(confirmationInput(current)));
    expect(actual).toMatchObject({
      status: 'available',
      confirmation_receipt: current.expectedConfirmationReceipt,
      confirmation: { status: 'confirmed', fields: JSON.parse(cached).confirmation.fields },
    });
    const f = setup({ grant: current, execute: async () => cached });
    await f.pane.ready;
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(f.confirm).toHaveBeenCalledOnce());
    await settled();
    expect(f.root.textContent).toContain('could not be checked');
    expect(f.root.textContent).not.toContain('Accepted answers checked');
    noPrivate(f.root);
  },
);

test.skipIf(!process.env.MARQUE_170_WASM).each(['revision', 'layout', 'actual identity'] as const)(
  'a real delayed response is discarded after a same-text %s change',
  async (change) => {
    const wasm = createRequire(import.meta.url)(process.env.MARQUE_170_WASM!) as Engine;
    const data = realGrants(wasm);
    let release: (() => void) | undefined;
    const f = setup({
      grant: data.grant,
      execute: (input) => {
        const output = wasm.evaluate_ordinary_cab_confirmation(input);
        expect(JSON.parse(output)).toMatchObject({ status: 'available', confirmation: { status: 'confirmed' } });
        return new Promise((resolve) => {
          release = () => resolve(output);
        });
      },
    });
    await f.pane.ready;
    clickConfirmation(f.root);
    await vi.waitFor(() => expect(release).toBeDefined());
    const changed = structuredClone(data.grant);
    if (change === 'revision') changed.successor.revisionId = 'r3';
    if (change === 'layout') changed.successor.layoutRevision = 'same-text-reflow';
    if (change === 'actual identity') {
      const values = JSON.parse(changed.successorValueIdentitiesJson);
      values.observations[0].value_reference = 'another-observed-identity';
      changed.successorValueIdentitiesJson = JSON.stringify(values);
    }
    expect(changed.successor.text).toBe(data.grant.successor.text);
    f.setGrant(changed);
    release!();
    await settled();
    expect(f.root.textContent).not.toContain('Accepted answers checked');
    expect(f.apply).not.toHaveBeenCalled();
    noPrivate(f.root);
  },
);
