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
import seed from './fixtures/ordinary-cab-161.json' with { type: 'json' };

const content = ' Independent source observations: 20440229 EVENT-CHARLIE CLASSIFIER-ALPHA';
const privateValues = [
  'Synthetic target.',
  'Example Office',
  '20440229',
  'EVENT-CHARLIE',
  'CLASSIFIER-ALPHA',
  'opaque-source-date-alpha',
  'opaque-source-event-alpha',
  'opaque-source-classifier-alpha',
  'opaque-source-unknown',
  'opaque-answer-classifier',
  'opaque-answer-reason',
];
const wasmPath = process.env.MARQUE_165_WASM;
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});

function sourceFixture() {
  const request = structuredClone(seed);
  const old = '(S) Synthetic target.';
  request.member.source = request.member.source.replace(old, old + content);
  const shift = new TextEncoder().encode(content).length;
  request.member.cab_inspection.candidate = request.member.cab_inspection.candidate.map((n) => n + shift);
  for (const row of request.member.cab_inspection.fields) {
    if (row.occurrence) {
      row.occurrence.candidate = row.occurrence.candidate.map((n) => n + shift);
      row.occurrence.label = row.occurrence.label.map((n) => n + shift);
      row.occurrence.value = row.occurrence.value.map((n) => n + shift);
    }
  }
  const end = new TextEncoder().encode(request.member.source).length;
  request.member.cab_inspection.basis.scope_locator = [0, end];
  request.member.cab_inspection.target.scope_locator = [0, end];
  for (const row of request.member.cab_inspection.fields) row.readback.target.scope_locator = [0, end];
  return request;
}

type Engine = {
  evaluate_ordinary_cab_questions(input: string): string;
  evaluate_ordinary_cab_preview(input: string): string;
};
function getEngine(): Engine {
  return createRequire(import.meta.url)(wasmPath!) as Engine;
}

function makeHost(wasm: Engine, request: ReturnType<typeof sourceFixture>, examination: object) {
  const questionText = wasm.evaluate_ordinary_cab_questions(JSON.stringify(request));
  const questionOutput = JSON.parse(questionText);
  expect(questionOutput.status).toBe('available');
  const snapshot = questionOutput.snapshot;
  const found = snapshot.evaluation.findings.items.filter((item: { question: unknown }) => item.question);
  expect(found).toHaveLength(2);
  const answers = found.map(
    ({ question }: { question: { chain: string; serial: string; revision: string; field: string } }) => ({
      question: { chain: question.chain, serial: question.serial, revision: question.revision, field: question.field },
      answer_id: `answer-${question.field}`,
      value_reference: question.field === 'classified_by' ? 'opaque-answer-classifier' : 'opaque-answer-reason',
      occurrence_locator: question.field === 'classified_by' ? [100, 115] : [120, 126],
    }),
  );
  const prepared = JSON.parse(
    wasm.evaluate_ordinary_cab_preview(
      JSON.stringify({ mode: 'prepare', question_request: request, source_examination: examination }),
    ),
  );
  const applied =
    prepared.status === 'available'
      ? JSON.parse(
          wasm.evaluate_ordinary_cab_preview(
            JSON.stringify({
              mode: 'apply',
              question_request: request,
              source_examination: examination,
              preview_receipt: prepared.preview_receipt,
              answers,
            }),
          ),
        )
      : null;
  const session: OfficeNativeWordSession = {
    kind: 'native_cab',
    documentId: 'synthetic-target',
    chain: 'neutral-chain-159',
    nativeCab: { documentId: 'synthetic-target', chain: 'neutral-chain-159', wire: '' },
    ordinaryCab: {
      viewerId: 'viewer-165',
      evaluate: async () => questionText,
      preview: async (input) => wasm.evaluate_ordinary_cab_preview(input),
    },
  };
  const base: OfficeOrdinaryCabGrant = {
    documentId: session.documentId,
    chain: session.chain,
    viewerId: 'viewer-165',
    grantId: 'base-165',
    permissionRevision: 'permission-1',
    layoutRevision: 'layout-1',
    authorizeRawInput: true,
    authorizeRawOutput: true,
    requestJson: JSON.stringify(request),
    current: {
      kind: 'cab_snapshot',
      operation: 'base',
      target: snapshot.evaluation.artifacts[0].target,
      profile: snapshot.evaluation.basis.basis.profile,
      currentBasisJson: JSON.stringify(snapshot.evaluation.basis),
    },
    disclosedFields: ['classified_by', 'classification_reason'],
  };
  let grant: OfficeOrdinaryCabPreviewGrant | null = {
    documentId: session.documentId,
    chain: session.chain,
    viewerId: 'viewer-165',
    grantId: 'preview-165',
    permissionRevision: 'permission-1',
    authorizeRawInput: true,
    authorizeRawOutput: true,
    sourceExaminationJson: JSON.stringify(examination),
    answersJson: JSON.stringify(answers),
    expectedReceipt: prepared.preview_receipt ?? `blake3:${'a'.repeat(64)}`,
    expectedPreviewFingerprint: applied?.preview_fingerprint ?? `blake3:${'b'.repeat(64)}`,
    disclosedFields: ['classified_by', 'classification_reason'],
  };
  let invalidate = () => {};
  const execute = vi.fn(session.ordinaryCab!.preview!);
  session.ordinaryCab!.preview = execute;
  const host: OfficeWordHost = {
    activeDocumentId: async () => session.documentId,
    applyCommitted: vi.fn(),
    readOrdinaryCabGrant: async () => structuredClone(base),
    readOrdinaryCabPreviewGrant: async () => grant && structuredClone(grant),
    watchOrdinaryCabInvalidation: (_d, _c, _v, notify) => {
      invalidate = notify;
      return () => {};
    },
  };
  const root = document.createElement('div');
  document.body.append(root);
  const pane = mountOrdinaryCabWorkspace(root, session, host, 1_048_576);
  cleanups.push(() => pane.destroy());
  return {
    root,
    pane,
    execute,
    prepared,
    applied,
    answers,
    invalidate,
    setGrant(value: OfficeOrdinaryCabPreviewGrant | null) {
      grant = value;
    },
    grant,
  };
}

function noPrivate(root: HTMLElement) {
  for (const value of privateValues) expect(root.textContent).not.toContain(value);
}

function examinationFor(
  request: ReturnType<typeof sourceFixture>,
  kind: 'date' | 'event' | 'unknown-instruction' | 'unknown-protected',
) {
  const source = request.member.source;
  const span = (text: string) => {
    const start = new TextEncoder().encode(source.slice(0, source.indexOf(text))).length;
    expect(source.indexOf(text)).toBeGreaterThanOrEqual(0);
    return [start, start + new TextEncoder().encode(text).length];
  };
  const group = span('(S) Synthetic target.' + content);
  const unknown = (text: string) => ({
    kind: 'unknown',
    reason: 'unavailable_evidence',
    protected_reference: 'opaque-source-unknown',
    locator: span(text),
    group_locator: group,
  });
  const instruction =
    kind === 'unknown-instruction'
      ? unknown('20440229')
      : kind === 'event'
        ? {
            kind: 'event',
            reference: 'opaque-source-event-alpha',
            locator: span('EVENT-CHARLIE'),
            group_locator: group,
          }
        : { kind: 'date', reference: 'opaque-source-date-alpha', locator: span('20440229'), group_locator: group };
  const protectedValue =
    kind === 'unknown-protected'
      ? unknown('CLASSIFIER-ALPHA')
      : {
          kind: 'value',
          field: 'classifier_identity',
          reference: 'opaque-source-classifier-alpha',
          locator: span('CLASSIFIER-ALPHA'),
          group_locator: group,
        };
  return {
    target: structuredClone(request.member.cab_inspection.target),
    intrinsic_classification_locator: [...request.member.owner.intrinsic_classification_locator],
    regime: { coverage: 'complete', locator: 'exam:regime', inventory: 'enumerated' },
    mode: { coverage: 'complete', locator: 'exam:mode', inventory: 'enumerated' },
    system: { coverage: 'complete', locator: 'exam:system', inventory: 'enumerated' },
    instruction: { coverage: 'complete', locator: 'exam:instruction', inventory: 'enumerated' },
    protected_values: { coverage: 'complete', locator: 'exam:protected', inventory: 'enumerated' },
    instruction_observations: [instruction],
    protected_value_observations: [protectedValue],
  };
}

function assertNoContent(output: unknown) {
  const text = JSON.stringify(output);
  for (const value of privateValues) expect(text).not.toContain(value);
}

test.skipIf(!wasmPath).each(['date', 'event'] as const)(
  'real Word pane previews with separate source %s and protected observation',
  async (kind) => {
    const wasm = getEngine();
    const request = sourceFixture();
    const examination = examinationFor(request, kind);
    const f = makeHost(wasm, request, examination);
    expect(f.prepared.status).toBe('available');
    expect(f.applied?.preview?.status).toBe('complete');
    assertNoContent(f.prepared);
    assertNoContent(f.applied);
    const rows = f.prepared.snapshot.evaluation.artifacts[0].fields as { field: string; satisfaction: string }[];
    for (const field of ['classified_by', 'classification_reason'])
      expect(rows.find((row) => row.field === field)?.satisfaction).toBe('missing');
    await f.pane.ready;
    expect(f.root.textContent).toContain('Provide Classified by.');
    const button = [...f.root.querySelectorAll('button')].find((row) => row.textContent === 'Preview answers');
    expect(button).toBeDefined();
    button!.click();
    await vi.waitFor(() => expect(f.root.textContent).toContain('Hypothetical authority block'));
    expect(f.root.textContent).toContain('Classified by: projected present.');
    expect(f.root.textContent).toContain('Classification reason: projected present.');
    expect(f.execute).toHaveBeenCalledTimes(2);
    noPrivate(f.root);
  },
);

test.skipIf(!wasmPath).each(['unknown-instruction', 'unknown-protected'] as const)(
  'real Word pane withholds unknown %s source evidence',
  async (kind) => {
    const wasm = getEngine();
    const request = sourceFixture();
    const f = makeHost(wasm, request, examinationFor(request, kind));
    expect(f.prepared.status).toBe('unavailable');
    expect(f.prepared.reason).toBe('source_evidence_unresolved');
    expect(f.prepared.snapshot).toBeTruthy();
    expect(f.prepared.preview_receipt).toBeNull();
    expect(f.applied).toBeNull();
    assertNoContent(f.prepared);
    assertNoContent(f.applied);
    await f.pane.ready;
    const button = [...f.root.querySelectorAll('button')].find((row) => row.textContent === 'Preview answers');
    expect(button).toBeDefined();
    button!.click();
    await vi.waitFor(() => expect(f.execute).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.root.textContent).not.toContain('Hypothetical authority block');
    noPrivate(f.root);
  },
);

test.skipIf(!wasmPath)('source grant revocation clears a real completed preview immediately', async () => {
  const wasm = getEngine();
  const request = sourceFixture();
  const f = makeHost(wasm, request, examinationFor(request, 'date'));
  await f.pane.ready;
  const button = [...f.root.querySelectorAll('button')].find((row) => row.textContent === 'Preview answers');
  expect(button).toBeDefined();
  button!.click();
  await vi.waitFor(() => expect(f.root.textContent).toContain('Hypothetical authority block'));
  f.setGrant(null);
  f.invalidate();
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  noPrivate(f.root);
});

test.skipIf(!wasmPath)('a stale source grant cannot display a delayed real preview', async () => {
  const wasm = getEngine();
  const request = sourceFixture();
  const f = makeHost(wasm, request, examinationFor(request, 'date'));
  let release: (() => void) | undefined;
  f.execute.mockImplementation((input: string) => {
    const output = wasm.evaluate_ordinary_cab_preview(input);
    if ((JSON.parse(input) as { mode: string }).mode !== 'apply') return Promise.resolve(output);
    return new Promise<string>((resolve) => {
      release = () => resolve(output);
    });
  });
  await f.pane.ready;
  const button = [...f.root.querySelectorAll('button')].find((row) => row.textContent === 'Preview answers');
  expect(button).toBeDefined();
  button!.click();
  await vi.waitFor(() => expect(release).toBeDefined());
  const changed = structuredClone(f.grant!);
  const evidence = JSON.parse(changed.sourceExaminationJson);
  evidence.protected_value_observations[0].reference = 'changed-source-reference';
  changed.sourceExaminationJson = JSON.stringify(evidence);
  f.setGrant(changed);
  f.invalidate();
  release!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(f.root.textContent).not.toContain('Hypothetical authority block');
  noPrivate(f.root);
});
