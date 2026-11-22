// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createRequire } from 'node:module';
import { afterEach, expect, test, vi } from 'vite-plus/test';
import { mountOrdinaryCabWorkspace } from '../../../../apps/office-addin/src/ordinary-cab-workspace.ts';
import type {
  OfficeNativeWordSession,
  OfficeOrdinaryCabGrant,
  OfficeOrdinaryCabPreviewGrant,
  OfficeOrdinaryCabSourceLinkGrant,
  OfficeWordHost,
} from '../../../../apps/office-addin/src/workspace.ts';
import requestFixture from './fixtures/ordinary-cab-161.json' with { type: 'json' };
import snapshotFixture from './fixtures/ordinary-cab-basis-161.json' with { type: 'json' };
import linkedFixture from './fixtures/ordinary-source-link-166.json' with { type: 'json' };

const snapshot = structuredClone(snapshotFixture);
const target = snapshot.evaluation.artifacts[0]!.target as OfficeOrdinaryCabGrant['current']['target'];
const receipt = `blake3:${'a'.repeat(64)}`;
const fingerprint = `blake3:${'b'.repeat(64)}`;
const sourceExamination = {
  target: requestFixture.member.cab_inspection.target,
  intrinsic_classification_locator: requestFixture.member.owner.intrinsic_classification_locator,
  regime: { coverage: 'complete', locator: 'exam:regime', inventory: 'enumerated' },
  mode: { coverage: 'complete', locator: 'exam:mode', inventory: 'enumerated' },
  system: { coverage: 'complete', locator: 'exam:system', inventory: 'enumerated' },
  instruction: { coverage: 'complete', locator: 'exam:instruction', inventory: 'examined_empty' },
  protected_values: { coverage: 'complete', locator: 'exam:protected', inventory: 'examined_empty' },
};
const answers = [
  {
    question: { chain: 'neutral-chain-159', serial: '1', revision: '1', field: 'classified_by' },
    answer_id: 'private-answer-id',
    value_reference: 'private-classifier-value',
    occurrence_locator: [100, 115],
  },
  {
    question: { chain: 'neutral-chain-159', serial: '2', revision: '2', field: 'classification_reason' },
    answer_id: 'private-reason-id',
    value_reference: 'private-reason-value',
    occurrence_locator: [120, 126],
  },
];

function baseGrant(): OfficeOrdinaryCabGrant {
  return {
    documentId: 'synthetic-target',
    chain: 'neutral-chain-159',
    viewerId: 'private-viewer',
    grantId: 'private-base-grant',
    permissionRevision: 'private-base-permission',
    layoutRevision: 'layout-1',
    authorizeRawInput: true,
    authorizeRawOutput: true,
    requestJson: JSON.stringify(requestFixture),
    current: {
      kind: 'cab_snapshot',
      operation: 'base',
      target,
      profile: snapshot.evaluation.basis.basis.profile as OfficeOrdinaryCabGrant['current']['profile'],
      currentBasisJson: JSON.stringify(snapshot.evaluation.basis),
    },
    disclosedFields: ['classified_by'],
  };
}

function previewGrant(): OfficeOrdinaryCabPreviewGrant {
  return {
    documentId: 'synthetic-target',
    chain: 'neutral-chain-159',
    viewerId: 'private-viewer',
    grantId: 'private-preview-grant',
    permissionRevision: 'private-preview-permission',
    authorizeRawInput: true,
    authorizeRawOutput: true,
    answersJson: JSON.stringify(answers),
    sourceExaminationJson: JSON.stringify(sourceExamination),
    expectedReceipt: receipt,
    expectedPreviewFingerprint: fingerprint,
    disclosedFields: ['classification_reason'],
  };
}

function sourceLinkGrant(): OfficeOrdinaryCabSourceLinkGrant {
  const member = structuredClone(requestFixture.member);
  member.identity.document_id = 'private-source-document';
  member.owner.document_id = member.identity.document_id;
  member.cab_inspection.basis.document_id = member.identity.document_id;
  member.cab_inspection.target.document_id = member.identity.document_id;
  for (const row of member.cab_inspection.fields) row.readback.target.document_id = member.identity.document_id;
  const sourceLink = {
    member,
    source_examination: { ...structuredClone(sourceExamination), target: member.cab_inspection.target },
    target_use: {
      target: requestFixture.member.cab_inspection.target,
      reference: 'private-source-reference',
      revision: 'r1',
      reference_span: [0, 1],
      revision_span: [1, 2],
      group_span: [0, 2],
      coverage: 'complete',
    },
    material: {
      reference: 'private-source-reference',
      kind: 'source_document',
      source: member.cab_inspection.target,
    },
  };
  return {
    documentId: 'synthetic-target',
    chain: 'neutral-chain-159',
    viewerId: 'private-viewer',
    grantId: 'private-source-grant',
    permissionRevision: 'source-permission-1',
    authorizeRawInput: true,
    authorizeRawOutput: true,
    current: {
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
    },
    sourceLinkJson: JSON.stringify(sourceLink),
  };
}

type PreviewRequest = {
  mode: 'prepare' | 'apply';
  question_request: unknown;
  source_examination: unknown;
  preview_receipt?: string;
  answers?: typeof answers;
  source_link?: unknown;
};

function responseFor(input: string): string {
  const request = JSON.parse(input) as PreviewRequest;
  const prepared = {
    schema: 'marque.ordinary-cab-preview.v1',
    status: 'available',
    reason: null,
    snapshot: structuredClone(snapshot),
    preview_receipt: receipt,
    preview: null as null | object,
    preview_fingerprint: null as null | string,
  };
  if (request.mode === 'apply') {
    const submitted = request.answers!;
    prepared.preview_fingerprint = fingerprint;
    prepared.preview = {
      schema: 'knitli.native-cab-joint-preview.v1',
      version: 1,
      status: 'complete',
      reason: null,
      cutoff: null,
      accepted_questions: submitted.map(({ question }) => ({
        question_chain: question.chain,
        question_serial: question.serial,
        question_revision: question.revision,
        field: question.field,
        target: structuredClone(target),
      })),
      hypothetical_fields: submitted.map(({ question }) => ({
        field: question.field,
        applicability: 'required',
        coverage: 'present',
        satisfaction: 'satisfied',
      })),
    };
  }
  return JSON.stringify(prepared);
}

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const destroy of cleanup.splice(0)) destroy();
  document.body.replaceChildren();
});

function setup(
  execute: (input: string) => Promise<string> = async (input) => responseFor(input),
  initial: OfficeOrdinaryCabPreviewGrant | null = previewGrant(),
  initialSource: OfficeOrdinaryCabSourceLinkGrant | null = null,
  currentBase: OfficeOrdinaryCabGrant = baseGrant(),
  evaluateRequest?: (input: string) => string,
) {
  const root = document.createElement('div');
  document.body.append(root);
  const evaluate = vi.fn(async (input: string) =>
    evaluateRequest
      ? evaluateRequest(input)
      : JSON.stringify({ schema: 'marque.ordinary-cab-questions.v1', status: 'available', reason: null, snapshot }),
  );
  const preview = vi.fn(execute);
  const session: OfficeNativeWordSession = {
    kind: 'native_cab',
    documentId: 'synthetic-target',
    chain: 'neutral-chain-159',
    nativeCab: { documentId: 'synthetic-target', chain: 'neutral-chain-159', wire: '' },
    ordinaryCab: { viewerId: 'private-viewer', evaluate, preview },
  };
  let base = currentBase;
  let permission = initial;
  let sourceGrant = initialSource;
  let documentId = session.documentId;
  let readDocument = async () => documentId;
  let invalidate = () => {};
  const apply = vi.fn();
  const readPreviewGrant = vi.fn(async () => (permission ? structuredClone(permission) : null));
  const readSourceGrant = vi.fn(async () => (sourceGrant ? structuredClone(sourceGrant) : null));
  const host: OfficeWordHost = {
    activeDocumentId: () => readDocument(),
    applyCommitted: apply,
    readOrdinaryCabGrant: async () => structuredClone(base),
    readOrdinaryCabPreviewGrant: readPreviewGrant,
    readOrdinaryCabSourceLinkGrant: readSourceGrant,
    watchOrdinaryCabInvalidation: (_document, _chain, _viewer, notify) => {
      invalidate = notify;
      return () => {};
    },
  };
  const pane = mountOrdinaryCabWorkspace(root, session, host, 1_048_576);
  cleanup.push(() => pane.destroy());
  return {
    root,
    pane,
    session,
    evaluate,
    preview,
    apply,
    readPreviewGrant,
    readSourceGrant,
    setBase(value: OfficeOrdinaryCabGrant) {
      base = value;
    },
    setPermission(value: OfficeOrdinaryCabPreviewGrant | null) {
      permission = value;
    },
    setSourceGrant(value: OfficeOrdinaryCabSourceLinkGrant | null) {
      sourceGrant = value;
    },
    removeSourceReader() {
      delete host.readOrdinaryCabSourceLinkGrant;
    },
    setDocument(value: string) {
      documentId = value;
    },
    setDocumentReader(read: () => Promise<string>) {
      readDocument = read;
    },
    invalidate() {
      invalidate();
    },
  };
}

function clickPreview(root: HTMLElement): void {
  const button = [...root.querySelectorAll('button')].find((item) => item.textContent === 'Preview answers');
  expect(button).toBeDefined();
  button!.click();
}

function noPrivateValues(root: HTMLElement): void {
  for (const value of [
    'Synthetic target',
    '20500101',
    'Example Office',
    'synthetic-target',
    'neutral-chain-159',
    'private-viewer',
    'private-base-grant',
    'private-preview-grant',
    'private-base-permission',
    'private-preview-permission',
    'private-source-document',
    'private-source-reference',
    'private-source-grant',
    'source-permission-1',
    'ALPHA-PRIVATE',
    'source-document-a',
    'Synthetic source.',
    'REV-1',
    '20400101',
    '20440229',
    'EVENT-CHARLIE',
    'CLASSIFIER-ALPHA',
    'opaque-external-cab-date',
    'opaque-source-classifier-a',
    'private-answer-id',
    'private-reason-id',
    'private-classifier-value',
    'private-reason-value',
    'exam:regime',
    'exam:mode',
    'exam:system',
    'exam:instruction',
    'exam:protected',
    'blake3:',
    receipt,
    fingerprint,
  ])
    expect(root.outerHTML).not.toContain(value);
}

const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('previews the independently disclosed field without exposing opaque inputs or claiming a write', async () => {
  const f = setup();
  await f.pane.ready;
  expect(f.root.textContent).toContain('Provide Classified by.');
  expect(f.root.textContent).not.toContain('Classification reason');
  clickPreview(f.root);
  await vi.waitFor(() => expect(f.root.textContent).toContain('Hypothetical authority block'));
  expect(f.preview).toHaveBeenCalledTimes(2);
  const prepare = JSON.parse(f.preview.mock.calls[0]![0]) as PreviewRequest;
  const apply = JSON.parse(f.preview.mock.calls[1]![0]) as PreviewRequest;
  expect(prepare).toEqual({ mode: 'prepare', question_request: requestFixture, source_examination: sourceExamination });
  expect(apply).toEqual({
    mode: 'apply',
    question_request: requestFixture,
    source_examination: sourceExamination,
    preview_receipt: receipt,
    answers,
  });
  expect(f.root.textContent).toContain('Provide Classified by.');
  const hypothetical = [...f.root.querySelectorAll('h2')]
    .find((heading) => heading.textContent === 'Hypothetical authority block')
    ?.closest('section');
  expect(hypothetical?.textContent).toContain('Classification reason');
  expect(hypothetical?.textContent).not.toContain('Classified by');
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.root.querySelector('input, textarea, a')).toBeNull();
  expect(f.readSourceGrant).not.toHaveBeenCalled();
  noPrivateValues(f.root);
});

test('forwards a separately granted current source to both preview stages', async () => {
  const source = sourceLinkGrant();
  const permission = { ...previewGrant(), sourceLinkGrantId: source.grantId };
  const f = setup(undefined, permission, source);
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(f.root.textContent).toContain('Hypothetical authority block'));
  expect(f.preview).toHaveBeenCalledTimes(2);
  for (const [input] of f.preview.mock.calls) {
    expect((JSON.parse(input) as PreviewRequest).source_link).toEqual(JSON.parse(source.sourceLinkJson));
  }
  expect(f.readSourceGrant.mock.calls.length).toBeGreaterThanOrEqual(4);
  expect(f.apply).not.toHaveBeenCalled();
  noPrivateValues(f.root);
});

test.each([
  'missing reader',
  'missing source',
  'raw input',
  'raw output',
  'viewer',
  'target document',
  'chain',
  'grant',
  'permission',
  'same document',
  'source identity',
  'source revision',
  'source contribution',
  'source bytes',
  'source scope',
  'source owner missing',
  'source owner role',
  'source owner parent',
  'source owner selector',
  'changed owner and examination',
  'source layout',
  'source face',
  'source readback',
  'source examination',
  'material',
  'target use',
  'invalid link',
  'oversized source',
  'oversized link',
] as const)('refuses to forward an unqualified linked source: %s', async (denial) => {
  const source = sourceLinkGrant();
  const permission = { ...previewGrant(), sourceLinkGrantId: source.grantId };
  const link = JSON.parse(source.sourceLinkJson);
  if (denial === 'raw input') (source as unknown as { authorizeRawInput: boolean }).authorizeRawInput = false;
  if (denial === 'raw output') (source as unknown as { authorizeRawOutput: boolean }).authorizeRawOutput = false;
  if (denial === 'viewer') source.viewerId = 'another-viewer';
  if (denial === 'target document') source.documentId = 'another-target';
  if (denial === 'chain') source.chain = 'another-chain';
  if (denial === 'grant') source.grantId = 'another-source-grant';
  if (denial === 'permission') source.permissionRevision = '';
  if (denial === 'same document') source.current.documentId = 'synthetic-target';
  if (denial === 'source identity') source.current.documentId = 'another-source';
  if (denial === 'source revision') source.current.revisionId = 'another-revision';
  if (denial === 'source contribution') source.current.contributionId = 'another-contribution';
  if (denial === 'source bytes') source.current.text += ' altered';
  if (denial === 'source scope') source.current.scopeLocator[1]--;
  if (denial === 'source owner missing') delete (source.current as Partial<typeof source.current>).owner;
  if (denial === 'source owner role') source.current.owner.role = 'attachment';
  if (denial === 'source owner parent') source.current.owner.parentDocumentId = 'another-parent';
  if (denial === 'source owner selector') source.current.owner.intrinsicClassificationLocator = [2, 3];
  if (denial === 'changed owner and examination') {
    link.member.owner.intrinsic_classification_locator = [2, 3];
    link.source_examination.intrinsic_classification_locator = [2, 3];
  }
  if (denial === 'source layout') source.current.layoutRevision = 'another-layout';
  if (denial === 'source face') source.current.facePage++;
  if (denial === 'source readback') link.member.cab_inspection.fields[0].readback.face_page++;
  if (denial === 'source examination') link.source_examination.target.revision_id = 'another-revision';
  if (denial === 'material') link.material.source.document_id = 'another-source';
  if (denial === 'target use') link.target_use.target.revision_id = 'another-revision';
  if (denial === 'oversized source') source.current.text = 'x'.repeat(262_145);
  source.sourceLinkJson =
    denial === 'invalid link' ? '{' : denial === 'oversized link' ? 'x'.repeat(1_048_577) : JSON.stringify(link);
  const f = setup(undefined, permission, denial === 'missing source' ? null : source);
  if (denial === 'missing reader') f.removeSourceReader();
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(f.readPreviewGrant).toHaveBeenCalled());
  await settled();
  expect(f.preview).not.toHaveBeenCalled();
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  expect(f.apply).not.toHaveBeenCalled();
  noPrivateValues(f.root);
});

function reissueSource(source: OfficeOrdinaryCabSourceLinkGrant, change: 'document' | 'revision', id?: string) {
  const link = JSON.parse(source.sourceLinkJson);
  const key = change === 'document' ? 'document_id' : 'revision_id';
  const value = id ?? (change === 'document' ? 'new-source-document' : 'new-source-revision');
  if (change === 'document') source.current.documentId = value;
  else source.current.revisionId = value;
  link.member.identity[key] = value;
  link.member.owner[key] = value;
  link.member.cab_inspection.basis[key] = value;
  link.member.cab_inspection.target[key] = value;
  for (const field of link.member.cab_inspection.fields) field.readback.target[key] = value;
  link.source_examination.target[key] = value;
  link.material.source[key] = value;
  source.sourceLinkJson = JSON.stringify(link);
}

test.each(['__proto__', 'constructor', 'toString'])(
  'accepts the opaque source identifier %s as ordinary data',
  async (identifier) => {
    const source = sourceLinkGrant();
    reissueSource(source, 'document', identifier);
    const f = setup(undefined, { ...previewGrant(), sourceLinkGrantId: source.grantId }, source);
    await f.pane.ready;
    clickPreview(f.root);
    await vi.waitFor(() => expect(f.root.textContent).toContain('Hypothetical authority block'));
    expect(f.preview).toHaveBeenCalledTimes(2);
    noPrivateValues(f.root);
  },
);

test.each([
  ['prepare', 'document'],
  ['prepare', 'revision'],
  ['apply', 'document'],
  ['apply', 'revision'],
] as const)('withholds delayed %s when the source %s changes without changing its text', async (phase, change) => {
  let release: (() => void) | undefined;
  const source = sourceLinkGrant();
  const permission = { ...previewGrant(), sourceLinkGrantId: source.grantId };
  const f = setup(
    (input) => {
      const output = responseFor(input);
      if ((JSON.parse(input) as PreviewRequest).mode !== phase) return Promise.resolve(output);
      return new Promise((resolve) => {
        release = () => resolve(output);
      });
    },
    permission,
    source,
  );
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(release).toBeDefined());
  const changed = structuredClone(source);
  reissueSource(changed, change);
  expect(changed.current.text).toBe(source.current.text);
  f.setSourceGrant(changed);
  release!();
  await settled();
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  if (phase === 'prepare') expect(f.preview).toHaveBeenCalledTimes(1);
  expect(f.apply).not.toHaveBeenCalled();
  noPrivateValues(f.root);
});

test.each(['prepare', 'apply'] as const)(
  'a source invalidation cancels a delayed %s provider result',
  async (phase) => {
    let release: (() => void) | undefined;
    const source = sourceLinkGrant();
    const f = setup(
      (input) => {
        const output = responseFor(input);
        if ((JSON.parse(input) as PreviewRequest).mode !== phase) return Promise.resolve(output);
        return new Promise((resolve) => {
          release = () => resolve(output);
        });
      },
      { ...previewGrant(), sourceLinkGrantId: source.grantId },
      source,
    );
    await f.pane.ready;
    clickPreview(f.root);
    await vi.waitFor(() => expect(release).toBeDefined());
    f.setSourceGrant(null);
    f.invalidate();
    release!();
    await settled();
    expect(f.root.textContent).not.toContain('Hypothetical authority block');
    if (phase === 'prepare') expect(f.preview).toHaveBeenCalledTimes(1);
    noPrivateValues(f.root);
  },
);

test('a linked-source invalidation immediately removes a displayed preview', async () => {
  const source = sourceLinkGrant();
  const f = setup(undefined, { ...previewGrant(), sourceLinkGrantId: source.grantId }, source);
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(f.root.textContent).toContain('Hypothetical authority block'));
  f.setSourceGrant(null);
  f.invalidate();
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  noPrivateValues(f.root);
});

test.each([
  ['prepare', 1],
  ['display', 3],
] as const)('does not %s after a provider change during the final document read', async (stage, holdAt) => {
  let release: (() => void) | undefined;
  let reads = 0;
  const source = sourceLinkGrant();
  const f = setup(undefined, { ...previewGrant(), sourceLinkGrantId: source.grantId }, source);
  await f.pane.ready;
  f.setDocumentReader(() => {
    if (++reads !== holdAt) return Promise.resolve('synthetic-target');
    return new Promise((resolve) => {
      release = () => resolve('synthetic-target');
    });
  });
  clickPreview(f.root);
  await vi.waitFor(() => expect(release).toBeDefined());
  f.session.ordinaryCab!.viewerId = 'changed-viewer';
  release!();
  await settled();
  expect(f.preview).toHaveBeenCalledTimes(stage === 'prepare' ? 0 : 2);
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  noPrivateValues(f.root);
});

type LinkedEngine = {
  evaluate_ordinary_cab_questions(input: string): string;
  evaluate_ordinary_cab_preview(input: string): string;
};

function realLinkedGrants(wasm: LinkedEngine, inputFixture = linkedFixture) {
  const fixture = structuredClone(inputFixture);
  const question = JSON.parse(wasm.evaluate_ordinary_cab_questions(JSON.stringify(fixture.question_request)));
  expect(question.status).toBe('available');
  const request = { ...fixture, mode: 'prepare' };
  const prepared = JSON.parse(wasm.evaluate_ordinary_cab_preview(JSON.stringify(request)));
  expect(prepared.status).toBe('available');
  const issued = prepared.snapshot.evaluation.findings.items.filter((item: { question: unknown }) => item.question);
  expect(issued).toHaveLength(2);
  const answerGroup = issued.map(({ question: q }: { question: (typeof answers)[number]['question'] }) => ({
    question: { chain: q.chain, serial: q.serial, revision: q.revision, field: q.field },
    answer_id: `accepted-${q.field}`,
    value_reference: q.field === 'classified_by' ? 'opaque-answer-classifier' : 'opaque-answer-reason',
    occurrence_locator: q.field === 'classified_by' ? [100, 115] : [120, 126],
  }));
  const applied = JSON.parse(
    wasm.evaluate_ordinary_cab_preview(
      JSON.stringify({ ...fixture, mode: 'apply', preview_receipt: prepared.preview_receipt, answers: answerGroup }),
    ),
  );
  expect(applied.status).toBe('available');
  expect(applied.preview?.status).toBe('complete');
  const base = baseGrant();
  base.requestJson = JSON.stringify(fixture.question_request);
  base.current.target = question.snapshot.evaluation.artifacts[0].target;
  base.current.profile = question.snapshot.evaluation.basis.basis.profile;
  base.current.currentBasisJson = JSON.stringify(question.snapshot.evaluation.basis);
  const source = sourceLinkGrant();
  const member = fixture.source_link.member;
  source.current = {
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
  source.sourceLinkJson = JSON.stringify(fixture.source_link);
  const permission: OfficeOrdinaryCabPreviewGrant = {
    ...previewGrant(),
    sourceLinkGrantId: source.grantId,
    sourceExaminationJson: JSON.stringify(fixture.source_examination),
    answersJson: JSON.stringify(answerGroup),
    expectedReceipt: prepared.preview_receipt,
    expectedPreviewFingerprint: applied.preview_fingerprint,
  };
  return { fixture, base, source, permission };
}

test.skipIf(!process.env.MARQUE_166_WASM)(
  'a linked source is previewed by the real engine without display leaks',
  async () => {
    const wasm = createRequire(import.meta.url)(process.env.MARQUE_166_WASM!) as LinkedEngine;
    const { fixture, base, source, permission } = realLinkedGrants(wasm);
    const f = setup(
      async (input) => wasm.evaluate_ordinary_cab_preview(input),
      permission,
      source,
      base,
      (input) => wasm.evaluate_ordinary_cab_questions(input),
    );
    await f.pane.ready;
    clickPreview(f.root);
    await vi.waitFor(() => expect(f.root.textContent).toContain('Hypothetical authority block'));
    expect(f.preview).toHaveBeenCalledTimes(2);
    for (const [input] of f.preview.mock.calls)
      expect((JSON.parse(input) as PreviewRequest).source_link).toEqual(fixture.source_link);
    expect(f.apply).not.toHaveBeenCalled();
    noPrivateValues(f.root);
  },
);

test.skipIf(!process.env.MARQUE_166_WASM).each(['__proto__', 'constructor', 'toString'])(
  'the real engine accepts opaque source identifier %s',
  async (identifier) => {
    const wasm = createRequire(import.meta.url)(process.env.MARQUE_166_WASM!) as LinkedEngine;
    const fixture = structuredClone(linkedFixture);
    const changed = sourceLinkGrant();
    changed.sourceLinkJson = JSON.stringify(fixture.source_link);
    reissueSource(changed, 'document', identifier);
    fixture.source_link = JSON.parse(changed.sourceLinkJson);
    const { base, source, permission } = realLinkedGrants(wasm, fixture);
    const f = setup(
      async (input) => wasm.evaluate_ordinary_cab_preview(input),
      permission,
      source,
      base,
      (input) => wasm.evaluate_ordinary_cab_questions(input),
    );
    await f.pane.ready;
    clickPreview(f.root);
    await vi.waitFor(() => expect(f.root.textContent).toContain('Hypothetical authority block'));
    expect(f.preview).toHaveBeenCalledTimes(2);
    noPrivateValues(f.root);
  },
);

test.skipIf(!process.env.MARQUE_166_WASM)('the real engine receives no linked source without its grant', async () => {
  const wasm = createRequire(import.meta.url)(process.env.MARQUE_166_WASM!) as LinkedEngine;
  const { base, permission } = realLinkedGrants(wasm);
  const f = setup(
    async (input) => wasm.evaluate_ordinary_cab_preview(input),
    permission,
    null,
    base,
    (input) => wasm.evaluate_ordinary_cab_questions(input),
  );
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(f.readSourceGrant).toHaveBeenCalled());
  await settled();
  expect(f.preview).not.toHaveBeenCalled();
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  noPrivateValues(f.root);
});

test.skipIf(!process.env.MARQUE_166_WASM).each([
  ['prepare', 'document'],
  ['prepare', 'revision'],
  ['apply', 'document'],
  ['apply', 'revision'],
] as const)('a real delayed %s cannot outlive a changed source %s with the same text', async (phase, change) => {
  const wasm = createRequire(import.meta.url)(process.env.MARQUE_166_WASM!) as LinkedEngine;
  const { base, source, permission } = realLinkedGrants(wasm);
  let release: (() => void) | undefined;
  const f = setup(
    (input) => {
      const output = wasm.evaluate_ordinary_cab_preview(input);
      if ((JSON.parse(input) as PreviewRequest).mode !== phase) return Promise.resolve(output);
      return new Promise((resolve) => {
        release = () => resolve(output);
      });
    },
    permission,
    source,
    base,
    (input) => wasm.evaluate_ordinary_cab_questions(input),
  );
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(release).toBeDefined());
  const changed = structuredClone(source);
  reissueSource(changed, change);
  expect(changed.current.text).toBe(source.current.text);
  f.setSourceGrant(changed);
  release!();
  await settled();
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  if (phase === 'prepare') expect(f.preview).toHaveBeenCalledTimes(1);
  expect(f.apply).not.toHaveBeenCalled();
  noPrivateValues(f.root);
});

test.skipIf(!process.env.MARQUE_166_WASM)('the pane withholds a real refused source link', async () => {
  const wasm = createRequire(import.meta.url)(process.env.MARQUE_166_WASM!) as LinkedEngine;
  const { base, source, permission } = realLinkedGrants(wasm);
  const link = JSON.parse(source.sourceLinkJson);
  link.target_use.reference_span = link.target_use.revision_span;
  source.sourceLinkJson = JSON.stringify(link);
  const results: { status: string; reason: string }[] = [];
  const f = setup(
    async (input) => {
      const output = wasm.evaluate_ordinary_cab_preview(input);
      results.push(JSON.parse(output));
      return output;
    },
    permission,
    source,
    base,
    (input) => wasm.evaluate_ordinary_cab_questions(input),
  );
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(f.preview).toHaveBeenCalledTimes(1));
  await settled();
  expect(results[0]).toMatchObject({ status: 'unavailable', reason: 'source_link_unresolved' });
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  noPrivateValues(f.root);
});

function realEngine(): { evaluate_ordinary_cab_preview(input: string): string } {
  return createRequire(import.meta.url)(process.env.MARQUE_163_WASM!) as {
    evaluate_ordinary_cab_preview(input: string): string;
  };
}

function independentlyQualifiedGrant(wasm: ReturnType<typeof realEngine>): OfficeOrdinaryCabPreviewGrant {
  const prepared = JSON.parse(
    wasm.evaluate_ordinary_cab_preview(
      JSON.stringify({ mode: 'prepare', question_request: requestFixture, source_examination: sourceExamination }),
    ),
  );
  const applied = JSON.parse(
    wasm.evaluate_ordinary_cab_preview(
      JSON.stringify({
        mode: 'apply',
        question_request: requestFixture,
        source_examination: sourceExamination,
        preview_receipt: prepared.preview_receipt,
        answers,
      }),
    ),
  );
  expect(prepared.status).toBe('available');
  expect(applied.preview?.status).toBe('complete');
  return {
    ...previewGrant(),
    expectedReceipt: prepared.preview_receipt,
    expectedPreviewFingerprint: applied.preview_fingerprint,
  };
}

test.skipIf(!process.env.MARQUE_163_WASM)('previews authorized answers with the real engine', async () => {
  const wasm = realEngine();
  const f = setup(async (input) => wasm.evaluate_ordinary_cab_preview(input), independentlyQualifiedGrant(wasm));
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(f.root.textContent).toContain('Hypothetical authority block'));
  expect(f.preview).toHaveBeenCalledTimes(2);
  expect(f.root.textContent).toContain('Provide Classified by.');
  expect(f.root.textContent).toContain('Classification reason');
  expect(f.apply).not.toHaveBeenCalled();
  noPrivateValues(f.root);
});

test.skipIf(!process.env.MARQUE_163_WASM)(
  'real engine receives no raw data without an independent preview grant',
  async () => {
    const wasm = realEngine();
    for (const denial of ['none', 'input', 'output', 'viewer'] as const) {
      const grant = independentlyQualifiedGrant(wasm);
      if (denial === 'input') (grant as unknown as { authorizeRawInput: boolean }).authorizeRawInput = false;
      if (denial === 'output') (grant as unknown as { authorizeRawOutput: boolean }).authorizeRawOutput = false;
      if (denial === 'viewer') grant.viewerId = 'another-viewer';
      const f = setup(async (input) => wasm.evaluate_ordinary_cab_preview(input), denial === 'none' ? null : grant);
      await f.pane.ready;
      clickPreview(f.root);
      await vi.waitFor(() => expect(f.readPreviewGrant).toHaveBeenCalled());
      await settled();
      expect(f.preview, denial).not.toHaveBeenCalled();
      expect(f.root.textContent, denial).not.toContain('Hypothetical authority block');
      expect(f.apply, denial).not.toHaveBeenCalled();
      noPrivateValues(f.root);
    }
  },
);

test.skipIf(!process.env.MARQUE_163_WASM)(
  'real engine results are withheld for stale or unqualified host input',
  async () => {
    const wasm = realEngine();
    for (const change of ['stale question', 'changed answer', 'unsupported source'] as const) {
      const grant = independentlyQualifiedGrant(wasm);
      if (change === 'stale question') {
        const modified = structuredClone(answers);
        modified[0]!.question.revision = '99';
        grant.answersJson = JSON.stringify(modified);
      }
      if (change === 'changed answer') {
        const modified = structuredClone(answers);
        modified[0]!.value_reference = 'another-opaque-value';
        grant.answersJson = JSON.stringify(modified);
      }
      if (change === 'unsupported source') {
        const modified = structuredClone(sourceExamination);
        modified.instruction.inventory = 'unknown_or_present';
        grant.sourceExaminationJson = JSON.stringify(modified);
      }
      const f = setup(async (input) => wasm.evaluate_ordinary_cab_preview(input), grant);
      await f.pane.ready;
      clickPreview(f.root);
      await vi.waitFor(() => expect(f.preview).toHaveBeenCalledTimes(change === 'changed answer' ? 2 : 1));
      await settled();
      expect(f.root.textContent, change).not.toContain('Hypothetical authority block');
      expect(f.apply, change).not.toHaveBeenCalled();
      noPrivateValues(f.root);
    }
  },
);

test.skipIf(!process.env.MARQUE_163_WASM)('pending real engine results cannot survive a scope change', async () => {
  const wasm = realEngine();
  for (const phase of ['prepare', 'apply'] as const) {
    for (const change of ['layout', 'viewer', 'answers'] as const) {
      let release: (() => void) | undefined;
      const grant = independentlyQualifiedGrant(wasm);
      const f = setup((input) => {
        const response = wasm.evaluate_ordinary_cab_preview(input);
        if ((JSON.parse(input) as PreviewRequest).mode !== phase) return Promise.resolve(response);
        return new Promise((resolve) => {
          release = () => resolve(response);
        });
      }, grant);
      await f.pane.ready;
      clickPreview(f.root);
      await vi.waitFor(() => expect(release).toBeDefined());
      const base = baseGrant();
      if (change === 'layout') base.layoutRevision = 'layout-2';
      if (change === 'viewer') grant.viewerId = 'another-viewer';
      if (change === 'answers') {
        const modified = structuredClone(answers);
        modified[0]!.value_reference = 'changed-opaque-value';
        grant.answersJson = JSON.stringify(modified);
      }
      f.setBase(base);
      f.setPermission(grant);
      release!();
      await settled();
      expect(f.root.textContent, `${phase}: ${change}`).not.toContain('Hypothetical authority block');
      if (phase === 'prepare') expect(f.preview, change).toHaveBeenCalledTimes(1);
      expect(f.apply, change).not.toHaveBeenCalled();
      noPrivateValues(f.root);
    }
  }
});

test.each([
  'none',
  'input',
  'output',
  'viewer',
  'document',
  'chain',
  'invalid source selector',
  'invalid answers',
  'oversized answers',
  'empty answers',
  'invalid examination',
  'oversized examination',
  'wrong examination target',
  'wrong examination classification locator',
] as const)('requires a separate current preview grant: %s', async (denial) => {
  const grant = previewGrant();
  if (denial === 'input') (grant as unknown as { authorizeRawInput: boolean }).authorizeRawInput = false;
  if (denial === 'output') (grant as unknown as { authorizeRawOutput: boolean }).authorizeRawOutput = false;
  if (denial === 'viewer') grant.viewerId = 'another-viewer';
  if (denial === 'document') grant.documentId = 'another-document';
  if (denial === 'chain') grant.chain = 'another-chain';
  if (denial === 'invalid source selector') grant.sourceLinkGrantId = '';
  if (denial === 'invalid answers') grant.answersJson = '{';
  if (denial === 'oversized answers') grant.answersJson = 'x'.repeat(1_048_577);
  if (denial === 'empty answers') grant.answersJson = '[]';
  if (denial === 'invalid examination') grant.sourceExaminationJson = '{';
  if (denial === 'oversized examination') grant.sourceExaminationJson = 'x'.repeat(1_048_577);
  if (denial === 'wrong examination target') {
    const examination = structuredClone(sourceExamination);
    examination.target.revision_id = 'another-revision';
    grant.sourceExaminationJson = JSON.stringify(examination);
  }
  if (denial === 'wrong examination classification locator') {
    const examination = structuredClone(sourceExamination);
    examination.intrinsic_classification_locator = [2, 3];
    grant.sourceExaminationJson = JSON.stringify(examination);
  }
  const f = setup(undefined, denial === 'none' ? null : grant);
  await f.pane.ready;
  expect(f.root.textContent).toContain('Provide Classified by.');
  clickPreview(f.root);
  await vi.waitFor(() => expect(f.readPreviewGrant).toHaveBeenCalled());
  await settled();
  expect(f.preview).not.toHaveBeenCalled();
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  expect(f.apply).not.toHaveBeenCalled();
  noPrivateValues(f.root);
});

test('does not disclose a result for an answer whose question was not issued by the current snapshot', async () => {
  const grant = previewGrant();
  const stale = structuredClone(answers);
  stale[0]!.question.revision = '99';
  grant.answersJson = JSON.stringify(stale);
  const f = setup(undefined, grant);
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(f.readPreviewGrant).toHaveBeenCalled());
  await settled();
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  expect(f.apply).not.toHaveBeenCalled();
  noPrivateValues(f.root);
});

test.each(['receipt', 'fingerprint', 'target', 'question', 'extra field', 'missing field', 'partial'] as const)(
  'withholds an inconsistent preview response: %s',
  async (bad) => {
    const execute = async (input: string) => {
      const response = JSON.parse(responseFor(input));
      if ((JSON.parse(input) as PreviewRequest).mode === 'apply') {
        if (bad === 'receipt') response.preview_receipt = `blake3:${'c'.repeat(64)}`;
        if (bad === 'fingerprint') response.preview_fingerprint = `blake3:${'c'.repeat(64)}`;
        if (bad === 'target') response.preview.accepted_questions[0].target.document_id = 'wrong-target';
        if (bad === 'question') response.preview.accepted_questions[0].question_revision = '99';
        if (bad === 'extra field')
          response.preview.hypothetical_fields.push({
            field: 'declassify_on',
            applicability: 'required',
            coverage: 'present',
            satisfaction: 'satisfied',
          });
        if (bad === 'missing field') response.preview.hypothetical_fields.pop();
        if (bad === 'partial') response.preview.status = 'partial';
      }
      return JSON.stringify(response);
    };
    const f = setup(execute);
    await f.pane.ready;
    clickPreview(f.root);
    await vi.waitFor(() => expect(f.preview).toHaveBeenCalledTimes(2));
    await settled();
    expect(f.root.textContent).not.toContain('Hypothetical authority block');
    expect(f.apply).not.toHaveBeenCalled();
    noPrivateValues(f.root);
  },
);

test.each(['prepare', 'apply'] as const)(
  'withholds a pending %s response when current scope changes silently',
  async (phase) => {
    for (const change of ['layout', 'viewer', 'grant', 'permission', 'answers', 'examination', 'document'] as const) {
      let release: (() => void) | undefined;
      const f = setup((input) => {
        const response = responseFor(input);
        if ((JSON.parse(input) as PreviewRequest).mode !== phase) return Promise.resolve(response);
        return new Promise((resolve) => {
          release = () => resolve(response);
        });
      });
      await f.pane.ready;
      clickPreview(f.root);
      await vi.waitFor(() => expect(release).toBeDefined());
      const newerBase = baseGrant();
      const newerPermission = previewGrant();
      if (change === 'layout') newerBase.layoutRevision = 'layout-2';
      if (change === 'viewer') newerPermission.viewerId = 'another-viewer';
      if (change === 'grant') newerPermission.grantId = 'another-grant';
      if (change === 'permission') newerPermission.permissionRevision = 'another-permission';
      if (change === 'answers') {
        const modified = structuredClone(answers);
        modified[0]!.value_reference = 'changed-value';
        newerPermission.answersJson = JSON.stringify(modified);
      }
      if (change === 'examination') {
        const modified = structuredClone(sourceExamination);
        modified.regime.locator = 'updated-examination';
        newerPermission.sourceExaminationJson = JSON.stringify(modified);
      }
      if (change === 'document') f.setDocument('another-document');
      f.setBase(newerBase);
      f.setPermission(newerPermission);
      release!();
      await settled();
      expect(f.root.textContent, change).not.toContain('Hypothetical authority block');
      if (phase === 'prepare') expect(f.preview, change).toHaveBeenCalledTimes(1);
      expect(f.apply, change).not.toHaveBeenCalled();
      noPrivateValues(f.root);
    }
  },
);

test('a notification immediately revokes a pending preview response', async () => {
  let release: (() => void) | undefined;
  const f = setup((input) => {
    const response = responseFor(input);
    if ((JSON.parse(input) as PreviewRequest).mode === 'prepare') return Promise.resolve(response);
    return new Promise((resolve) => {
      release = () => resolve(response);
    });
  });
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(release).toBeDefined());
  f.invalidate();
  expect(f.root.textContent).not.toContain('Classified by');
  release!();
  await settled();
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  expect(f.apply).not.toHaveBeenCalled();
  noPrivateValues(f.root);
});

test('a notification immediately removes an already displayed preview', async () => {
  const f = setup();
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(f.root.textContent).toContain('Hypothetical authority block'));
  f.invalidate();
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  expect(f.root.textContent).not.toContain('Classification reason');
  noPrivateValues(f.root);
});

test('a late prior response cannot replace a newer preview grant', async () => {
  let release: (() => void) | undefined;
  let held = false;
  const f = setup((input) => {
    const response = responseFor(input);
    if ((JSON.parse(input) as PreviewRequest).mode !== 'apply' || held) return Promise.resolve(response);
    held = true;
    return new Promise((resolve) => {
      release = () => resolve(response);
    });
  });
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(release).toBeDefined());
  const newer = previewGrant();
  newer.grantId = 'new-preview-grant';
  newer.disclosedFields = ['classified_by'];
  f.setPermission(newer);
  f.invalidate();
  await f.pane.refresh();
  clickPreview(f.root);
  await vi.waitFor(() => expect(f.root.textContent).toContain('Hypothetical authority block'));
  const displayed = f.root.textContent;
  expect(displayed).toContain('Classified by: projected present.');
  expect(displayed).not.toContain('Classification reason');
  release!();
  await settled();
  expect(f.root.textContent).toBe(displayed);
  expect(f.apply).not.toHaveBeenCalled();
  noPrivateValues(f.root);
});

test('destroying the pane prevents a pending response from rendering', async () => {
  let release: (() => void) | undefined;
  const f = setup((input) => {
    const response = responseFor(input);
    return new Promise((resolve) => {
      release = () => resolve(response);
    });
  });
  await f.pane.ready;
  clickPreview(f.root);
  await vi.waitFor(() => expect(release).toBeDefined());
  f.pane.destroy();
  release!();
  await settled();
  expect(f.root.textContent).toBe('');
  expect(f.apply).not.toHaveBeenCalled();
});
