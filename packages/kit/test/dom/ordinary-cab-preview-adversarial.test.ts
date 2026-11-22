// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createRequire } from 'node:module';
import { afterEach, expect, test, vi } from 'vite-plus/test';
import { mountOrdinaryCabWorkspace } from '../../../../apps/office-addin/src/ordinary-cab-workspace.ts';
import type {
  OfficeNativeWordSession,
  OfficeOrdinaryCabGrant,
  OfficeOrdinaryCabPreviewGrant,
  OfficeWordHost,
} from '../../../../apps/office-addin/src/workspace.ts';
import requestFixture from './fixtures/ordinary-cab-161.json' with { type: 'json' };
import snapshotFixture from './fixtures/ordinary-cab-basis-161.json' with { type: 'json' };

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

type PreviewRequest = {
  mode: 'prepare' | 'apply';
  question_request: unknown;
  source_examination: unknown;
  preview_receipt?: string;
  answers?: typeof answers;
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
) {
  const root = document.createElement('div');
  document.body.append(root);
  const evaluate = vi.fn(async () =>
    JSON.stringify({ schema: 'marque.ordinary-cab-questions.v1', status: 'available', reason: null, snapshot }),
  );
  const preview = vi.fn(execute);
  const session: OfficeNativeWordSession = {
    kind: 'native_cab',
    documentId: 'synthetic-target',
    chain: 'neutral-chain-159',
    nativeCab: { documentId: 'synthetic-target', chain: 'neutral-chain-159', wire: '' },
    ordinaryCab: { viewerId: 'private-viewer', evaluate, preview },
  };
  let base = baseGrant();
  let permission = initial;
  let documentId = session.documentId;
  let invalidate = () => {};
  const apply = vi.fn();
  const readPreviewGrant = vi.fn(async () => (permission ? structuredClone(permission) : null));
  const host: OfficeWordHost = {
    activeDocumentId: async () => documentId,
    applyCommitted: apply,
    readOrdinaryCabGrant: async () => structuredClone(base),
    readOrdinaryCabPreviewGrant: readPreviewGrant,
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
    evaluate,
    preview,
    apply,
    readPreviewGrant,
    setBase(value: OfficeOrdinaryCabGrant) {
      base = value;
    },
    setPermission(value: OfficeOrdinaryCabPreviewGrant | null) {
      permission = value;
    },
    setDocument(value: string) {
      documentId = value;
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
      if (denial === 'input') Object.assign(grant, { authorizeRawInput: false });
      if (denial === 'output') Object.assign(grant, { authorizeRawOutput: false });
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
  'invalid answers',
  'empty answers',
  'invalid examination',
  'wrong examination target',
  'wrong examination classification locator',
] as const)('requires a separate current preview grant: %s', async (denial) => {
  const grant = previewGrant();
  if (denial === 'input') Object.assign(grant, { authorizeRawInput: false });
  if (denial === 'output') Object.assign(grant, { authorizeRawOutput: false });
  if (denial === 'viewer') grant.viewerId = 'another-viewer';
  if (denial === 'document') grant.documentId = 'another-document';
  if (denial === 'chain') grant.chain = 'another-chain';
  if (denial === 'invalid answers') grant.answersJson = '{';
  if (denial === 'empty answers') grant.answersJson = '[]';
  if (denial === 'invalid examination') grant.sourceExaminationJson = '{';
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
