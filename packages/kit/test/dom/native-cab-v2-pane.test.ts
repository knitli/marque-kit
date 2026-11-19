// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vite-plus/test';
import { parseNativeJson } from '@knitli/marque-kit-core/native-wire';
import { readCabSnapshot } from '@knitli/marque-kit-core/native-cab';
import { effectiveReady } from '@knitli/marque-kit-core/state';
import type { NativeCabRequest } from '@knitli/marque-kit-core/native-cab';
import type { Doc } from '@knitli/marque-kit-core/types';
import { mount } from '../../src/render.ts';
import { mountNativeWorkspace } from '../../../../apps/office-addin/src/native-workspace.ts';
import type { OfficeWordHost, OfficeNativeWordSession } from '../../../../apps/office-addin/src/workspace.ts';

const raw = (name: string) =>
  readFileSync(join(import.meta.dirname, `../../../core/test/fixtures/native-v2-${name}.fixture`), 'utf8');
const parse = (text: string) => parseNativeJson(text, 1_048_576);
const setup = (text: string) => {
  const e = parse(text);
  if (e.version !== 2) throw new Error('expected v2');
  const doc: Doc = { findings: [], document: { blocking: [], artifacts: [], native_evaluation: e } };
  const request: NativeCabRequest = {
    kind: 'cab_snapshot',
    operation: 'base',
    target: e.evaluation.artifacts[0]!.target,
    profile: e.evaluation.basis!.basis.profile!,
    currentBasisJson: JSON.stringify(e.evaluation.basis),
    maxBasisBytes: 1_048_576,
    expectedChain: e.evaluation.chain!,
  };
  return { e, doc, request };
};
describe('native v2 read-only pane', () => {
  test('renders v3 tagged targets and clears a differently tagged scope', () => {
    const rawV3 = JSON.parse(raw('funded'));
    rawV3.schema = 'knitli.native-cab-findings.v3';
    rawV3.version = 3;
    const encoded = JSON.stringify(rawV3, (key, value) =>
      key === 'scope_locator' ? { kind: 'typed', value: '1..2' } : value,
    );
    const e = parse(encoded);
    if (e.version !== 3) throw new Error('expected v3');
    const doc: Doc = { findings: [], document: { blocking: [], artifacts: [], native_evaluation: e } };
    const request: NativeCabRequest = {
      kind: 'cab_snapshot',
      operation: 'base',
      expectedChain: e.evaluation.chain!,
      target: structuredClone(e.evaluation.artifacts[0]!.target),
      profile: e.evaluation.basis!.basis.profile!,
      currentBasisJson: JSON.stringify(e.evaluation.basis),
      maxBasisBytes: 1_048_576,
    };
    const root = document.createElement('div');
    const pane = mount(root, { doc, nativeCabRequest: request });
    expect(root.textContent).toContain('Additional information is needed.');
    pane.update({
      nativeCabRequest: {
        ...request,
        target: { ...request.target, scope_locator: { kind: 'text', value: { start: '1', end: '2' } } },
      },
    });
    expect(root.textContent).toContain('evaluation is unavailable');
    expect(root.textContent).not.toContain('Additional information is needed.');
    pane.destroy();
  });
  test.each(['funded', 'partial'])('reads actual %s fixture and clears a stale scope', (name) => {
    const { doc, request } = setup(raw(name));
    expect(readCabSnapshot(doc, request)).not.toBeNull();
    const root = document.createElement('div');
    const pane = mount(root, { doc, nativeCabRequest: request });
    expect(root.textContent).toContain('Additional information is needed.');
    expect(root.querySelector('button')).toBeNull();
    pane.update({ nativeCabRequest: { ...request, expectedChain: 'different' } });
    expect(root.textContent).toContain('evaluation is unavailable');
    expect(root.textContent).not.toContain('Additional information is needed.');
    pane.destroy();
  });
  test('rejects mutated chain, subject, question basis, requirement and malformed ID', () => {
    const original = JSON.parse(raw('funded'));
    const mutations = [
      (x: typeof original) => {
        x.evaluation.findings.items[0].identity.subject.chain = 'wrong';
      },
      (x: typeof original) => {
        x.evaluation.findings.items[0].question.subject.serial = '2';
      },
      (x: typeof original) => {
        x.evaluation.findings.items[0].question.basis.context_revision = 'wrong';
      },
      (x: typeof original) => {
        x.evaluation.findings.items[0].requirement.index = '1';
      },
    ];
    for (const mutate of mutations) {
      const x = structuredClone(original);
      mutate(x);
      const { doc, request } = setup(JSON.stringify(x));
      expect(readCabSnapshot(doc, request)).toBeNull();
    }
    original.evaluation.findings.items[0].identity.subject.serial = '9007199254740992';
    expect(() => parse(JSON.stringify(original))).toThrow();
  });
  test('Office provider handles actual v2 refresh and revokes mismatched chain without writes', async () => {
    const first = setup(raw('funded'));
    const next = setup(raw('partial'));
    const unavailable = setup(raw('finding-identity-unavailable'));
    const root = document.createElement('div');
    const write = vi.fn();
    const read = vi.fn();
    const session = {
      kind: 'native_cab',
      documentId: first.request.target.document_id,
      chain: first.e.evaluation.chain!,
      nativeCab: {
        documentId: first.request.target.document_id,
        chain: first.e.evaluation.chain!,
        wire: raw('funded'),
        request: first.request,
      },
      readNativeCab: read,
    } as unknown as OfficeNativeWordSession;
    const host = {
      activeDocumentId: async () => session.documentId,
      applyCommitted: write,
      watchNativeCabInvalidation: () => () => {},
      readNativeCabScope: async () => first.request,
    } as OfficeWordHost;
    const pane = mountNativeWorkspace(root, session, host, 1_048_576);
    await pane.ready;
    expect(root.textContent).toContain('Source coverage is complete.');
    read.mockResolvedValueOnce({
      documentId: session.documentId,
      chain: session.chain,
      wire: raw('partial'),
      request: next.request,
    });
    await pane.refresh();
    expect(root.textContent).toContain('Source coverage is partial.');
    read.mockResolvedValueOnce({
      documentId: session.documentId,
      chain: session.chain,
      wire: raw('finding-identity-unavailable'),
      request: unavailable.request,
    });
    await pane.refresh();
    expect(root.textContent).toContain('Finding identity is unavailable.');
    expect(Array.from(root.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      'Refresh authority block',
    ]);
    expect(root.querySelector('.mq-history')).toBeNull();
    expect(write).not.toHaveBeenCalled();
    read.mockResolvedValueOnce({
      documentId: session.documentId,
      chain: 'wrong',
      wire: raw('funded'),
      request: first.request,
    });
    await pane.refresh();
    expect(root.textContent).toContain('evaluation is unavailable');
    expect(root.textContent).not.toContain('Additional information is needed.');
    expect(write).not.toHaveBeenCalled();
    pane.destroy();
  });
  test.each(['question-serial-max', 'question-revision-max'])(
    'retains issued question and action-only rows at %s',
    (name) => {
      const { e, doc, request } = setup(raw(name));
      expect(readCabSnapshot(doc, request)).not.toBeNull();
      expect(e.evaluation.findings.items.filter((f) => f.question)).toHaveLength(1);
      expect(e.evaluation.findings.items.filter((f) => f.requested_action && !f.question)).toHaveLength(2);
      const root = document.createElement('div');
      const pane = mount(root, { doc, nativeCabRequest: request });
      expect(root.textContent).toContain('Question identity is unavailable.');
      expect(root.textContent).toContain('Additional information is needed.');
      pane.destroy();
    },
  );
  test.each([
    ['subject-serial-below-max', 2],
    ['subject-serial-max', 1],
  ] as const)('retains each finding when the subject watermark reaches %s', (name, issued) => {
    const { e, doc, request } = setup(raw(name));
    expect(readCabSnapshot(doc, request)).not.toBeNull();
    const findings = e.evaluation.findings.items;
    expect(findings).toHaveLength(3);
    expect(findings.filter((row) => row.identity.status === 'issued')).toHaveLength(issued);
    for (const row of findings.slice(issued)) {
      expect(row.identity).toEqual({ status: 'unavailable', reason: 'subject_serial_exhausted' });
      expect(row.requirement.status).toBe('resolved');
      expect(row.requested_action?.requested_fact).toBeTruthy();
      expect([row.question, row.result, row.result_revision]).toEqual([null, null, null]);
    }
    const root = document.createElement('div');
    const pane = mount(root, { doc, nativeCabRequest: request });
    expect(root.textContent?.match(/Additional information is needed/g)).toHaveLength(3);
    expect(root.textContent?.match(/Finding identity is unavailable/g)).toHaveLength(3 - issued);
    expect(root.querySelector('button')).toBeNull();
    pane.destroy();
  });
  test('retains the issued result and reports exhausted result identities', () => {
    const { doc, request } = setup(raw('result-serial-max'));
    expect(readCabSnapshot(doc, request)).not.toBeNull();
    const root = document.createElement('div');
    const pane = mount(root, { doc, nativeCabRequest: request });
    expect(root.textContent).toContain('Additional information is needed.');
    expect(root.textContent).toContain('Result identity is unavailable.');
    pane.destroy();
  });
  test('independently missing result identities stay unresolved and invalid formats fail closed', () => {
    const original = JSON.parse(raw('funded'));
    for (const part of ['result', 'result_revision']) {
      const x = structuredClone(original);
      x.evaluation.findings.items[0][part] = null;
      const { doc, request } = setup(JSON.stringify(x));
      expect(readCabSnapshot(doc, request)).not.toBeNull();
      const root = document.createElement('div');
      const pane = mount(root, { doc, nativeCabRequest: request });
      expect(root.textContent).toContain('Result identity is unavailable.');
      pane.destroy();
    }
    const wrongSchema = structuredClone(original);
    wrongSchema.version = 3;
    expect(() => parse(JSON.stringify(wrongSchema))).toThrow();
    const overWatermark = structuredClone(original);
    overWatermark.evaluation.findings.items[0].identity.subject.serial = '5';
    const { doc, request } = setup(JSON.stringify(overWatermark));
    expect(readCabSnapshot(doc, request)).toBeNull();
  });
  test('an empty partial findings lane retains source requirement rows', () => {
    const synthetic = JSON.parse(raw('funded'));
    synthetic.evaluation.findings.items = [];
    const { doc, request } = setup(JSON.stringify(synthetic));
    expect(readCabSnapshot(doc, request)).not.toBeNull();
    const root = document.createElement('div');
    const pane = mount(root, { doc, nativeCabRequest: request });
    expect(root.textContent).toContain('Classified by');
    expect(root.textContent).toContain('Finding details are partial.');
    expect(root.textContent).not.toContain('Additional information is needed.');
    pane.destroy();
  });
  test.each(['question-action-fallback-serial', 'question-action-fallback-revision'])(
    'preserves real action-only rows for %s',
    (name) => {
      const { e, doc, request } = setup(raw(name));
      expect(readCabSnapshot(doc, request)).not.toBeNull();
      expect(e.evaluation.findings.items.length).toBeGreaterThan(0);
      expect(e.evaluation.findings.items.every((f) => !f.question && f.requested_action)).toBe(true);
      const root = document.createElement('div');
      const pane = mount(root, { doc, nativeCabRequest: request });
      expect(root.textContent).toContain('Question identity is unavailable.');
      pane.destroy();
    },
  );
  test('rejects contradictory requirement states and unbound artifact identities', () => {
    const original = JSON.parse(raw('funded'));
    for (const mutate of [
      (x: typeof original) => {
        x.evaluation.artifacts[0].id.chain = 'foreign';
      },
      (x: typeof original) => {
        x.evaluation.artifacts[0].id.serial = '9007199254740991';
      },
    ]) {
      const x = structuredClone(original);
      mutate(x);
      const { doc, request } = setup(JSON.stringify(x));
      expect(readCabSnapshot(doc, request)).toBeNull();
      const root = document.createElement('div');
      const pane = mount(root, { doc, nativeCabRequest: request });
      expect(root.textContent).not.toContain('Additional information is needed.');
      expect(root.textContent).toContain('evaluation is unavailable');
      pane.destroy();
    }
    const partial = structuredClone(original);
    partial.evaluation.requirements[0].state = 'unresolved';
    partial.evaluation.findings.items[0].result_revision = null;
    const { doc, request } = setup(JSON.stringify(partial));
    expect(readCabSnapshot(doc, request)).not.toBeNull();
  });
  test('preserves the finding alongside a separately reported satisfied requirement', () => {
    const x = JSON.parse(raw('funded'));
    x.evaluation.requirements[0].state = 'satisfied';
    const { doc, request } = setup(JSON.stringify(x));
    const root = document.createElement('div');
    const pane = mount(root, { doc, nativeCabRequest: request });
    expect(root.textContent).toContain('satisfied');
    expect(root.textContent?.match(/Finding reports: Additional information is needed/g)).toHaveLength(3);
    pane.destroy();
  });
  test('parses serializer-contract identity reasons and required resource while retaining content', () => {
    const { e, doc, request } = setup(raw('finding-identity-unavailable'));
    expect(e.evaluation.findings.items).toHaveLength(20);
    expect(e.evaluation.findings.items[0]?.identity).toEqual({
      status: 'unavailable',
      reason: 'prior_unexamined',
      resource: 'input_bytes',
    });
    expect(e.evaluation.findings.items[0]?.requirement.status).toBe('resolved');
    expect(e.evaluation.findings.items[0]?.outcome).toBe('needs_fact');
    const resourceTags = [
      'input_bytes',
      'input_records',
      'input_members',
      'items',
      'support_edges',
      'work',
      'retained_bytes',
      'output_bytes',
    ];
    for (const reason of ['prior_unexamined', 'resource']) {
      expect(
        e.evaluation.findings.items
          .filter((finding) => finding.identity.status === 'unavailable' && finding.identity.reason === reason)
          .map((finding) =>
            finding.identity.status === 'unavailable' && 'resource' in finding.identity
              ? finding.identity.resource
              : null,
          )
          .sort((a, b) => String(a).localeCompare(String(b))),
      ).toEqual([...resourceTags].sort((a, b) => a.localeCompare(b)));
    }
    expect(readCabSnapshot(doc, request)).not.toBeNull();
    expect(effectiveReady(doc)).toBe(false);
    const root = document.createElement('div');
    const pane = mount(root, { doc, nativeCabRequest: request });
    expect(root.textContent).toContain('Finding identity is unavailable.');
    expect(root.textContent).toContain('Additional information is needed.');
    expect(root.querySelector('button')).toBeNull();
    expect(root.querySelector('.mq-history')).toBeNull();
    pane.destroy();
  });
  test('consumer preserves a supplied answer action when an identity is unavailable', () => {
    const x = JSON.parse(raw('finding-identity-unavailable'));
    const actionOnly = JSON.parse(raw('question-action-fallback-serial'));
    x.evaluation.findings.items[0].requested_action = actionOnly.evaluation.findings.items[0].requested_action;
    x.evaluation.findings.items[0].question = null;
    x.evaluation.findings.items[0].result = null;
    x.evaluation.findings.items[0].result_revision = null;
    const { e, doc, request } = setup(JSON.stringify(x));
    expect(e.evaluation.findings.items[0]?.requested_action).toEqual(
      actionOnly.evaluation.findings.items[0]?.requested_action,
    );
    expect(e.evaluation.findings.items[0]?.identity.status).toBe('unavailable');
    expect(readCabSnapshot(doc, request)).not.toBeNull();
    const root = document.createElement('div');
    const pane = mount(root, { doc, nativeCabRequest: request });
    expect(root.textContent).toContain('Finding identity is unavailable.');
    expect(root.textContent).toContain(e.evaluation.findings.items[0]!.requested_action!.requested_fact);
    expect(root.querySelector('button')).toBeNull();
    expect(root.querySelector('.mq-history')).toBeNull();
    pane.destroy();
  });
  test('rejects unavailable identity carrying question or result handles', () => {
    const x = JSON.parse(raw('funded'));
    x.evaluation.findings.items[0].identity = {
      status: 'unavailable',
      reason: 'resource',
      resource: 'work',
    };
    const { doc, request } = setup(JSON.stringify(x));
    expect(readCabSnapshot(doc, request)).toBeNull();
  });
  test('rejects malformed finding identity variants instead of accepting legacy subjects', () => {
    const original = JSON.parse(raw('finding-identity-unavailable'));
    const mutations = [
      (x: typeof original) => {
        delete x.evaluation.findings.items[0].identity.resource;
      },
      (x: typeof original) => {
        x.evaluation.findings.items[0].identity.reason = 'other';
      },
      (x: typeof original) => {
        x.evaluation.findings.items[0].identity.resource = 'mystery';
      },
      (x: typeof original) => {
        x.evaluation.findings.items[0].identity.extra = 'unexpected';
      },
      (x: typeof original) => {
        x.evaluation.findings.items[16].identity.resource = 'work';
      },
      (x: typeof original) => {
        const finding = x.evaluation.findings.items[0];
        finding.subject = { chain: 'chain', serial: '1' };
        delete finding.identity;
      },
    ];
    for (const mutate of mutations) {
      const x = structuredClone(original);
      mutate(x);
      expect(() => parse(JSON.stringify(x))).toThrow(TypeError);
    }
  });
  test('rejects zero and reused represented identifiers', () => {
    const original = JSON.parse(raw('funded'));
    for (const mutate of [
      (x: typeof original) => {
        x.evaluation.findings.items[0].identity.subject.serial = '0';
      },
      (x: typeof original) => {
        x.evaluation.findings.items[0].question.serial = '0';
      },
      (x: typeof original) => {
        x.evaluation.findings.items[0].question.revision = '0';
      },
      (x: typeof original) => {
        x.evaluation.findings.items[0].result.serial = '0';
      },
      (x: typeof original) => {
        x.evaluation.findings.items[0].result_revision = '0';
      },
      (x: typeof original) => {
        x.evaluation.artifacts[0].id.serial = '0';
      },
      (x: typeof original) => {
        x.evaluation.findings.items[1].question.serial = x.evaluation.findings.items[0].question.serial;
      },
      (x: typeof original) => {
        const a = x.evaluation.findings.items;
        a[1].identity.subject.serial = a[0].identity.subject.serial;
        a[1].question.subject.serial = a[0].identity.subject.serial;
        a[1].result.subject_serial = a[0].identity.subject.serial;
      },
    ]) {
      const x = structuredClone(original);
      mutate(x);
      const { doc, request } = setup(JSON.stringify(x));
      expect(readCabSnapshot(doc, request)).toBeNull();
    }
  });
  test('trusted invalidation clears without refresh and stale reads cannot restore the pane', async () => {
    const { request, e } = setup(raw('funded'));
    const root = document.createElement('div');
    const write = vi.fn();
    let invalidate!: () => void;
    let finish!: (value: typeof session.nativeCab) => void;
    const delayed = new Promise<typeof session.nativeCab>((resolve) => {
      finish = resolve;
    });
    const session = {
      kind: 'native_cab',
      documentId: request.target.document_id,
      chain: e.evaluation.chain!,
      nativeCab: { documentId: request.target.document_id, chain: e.evaluation.chain!, wire: raw('funded') },
      readNativeCab: () => delayed,
    };
    let unsubscribed = false;
    const host = {
      activeDocumentId: async () => session.documentId,
      applyCommitted: write,
      watchNativeCabInvalidation: (_d: string, _c: string, cb: () => void) => {
        invalidate = cb;
        return () => {
          unsubscribed = true;
        };
      },
      readNativeCabScope: async () => request,
    } as OfficeWordHost;
    const pane = mountNativeWorkspace(root, session as unknown as OfficeNativeWordSession, host, 1_048_576);
    await pane.ready;
    expect(root.textContent).toContain('Additional information is needed.');
    invalidate();
    expect(root.textContent).not.toContain('Additional information is needed.');
    const pending = pane.refresh();
    await Promise.resolve();
    await Promise.resolve();
    invalidate();
    finish(session.nativeCab);
    await pending;
    expect(root.textContent).toContain('evaluation is unavailable');
    expect(root.textContent).not.toContain('Additional information is needed.');
    pane.destroy();
    expect(unsubscribed).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });
  test('without trusted invalidation and independent scope the native route stays unavailable', async () => {
    const { request, e } = setup(raw('funded'));
    const root = document.createElement('div');
    const session = {
      kind: 'native_cab',
      documentId: request.target.document_id,
      chain: e.evaluation.chain!,
      nativeCab: { documentId: request.target.document_id, chain: e.evaluation.chain!, wire: raw('funded'), request },
    } as unknown as OfficeNativeWordSession;
    const host = { activeDocumentId: async () => session.documentId } as OfficeWordHost;
    const pane = mountNativeWorkspace(root, session, host, 1_048_576);
    await pane.ready;
    expect(root.textContent).toContain('evaluation is unavailable');
    expect(root.textContent).not.toContain('Additional information is needed.');
    pane.destroy();
  });
  test('independently obtained host scope overrides a matching provider claim', async () => {
    const { request, e } = setup(raw('funded'));
    const stale = structuredClone(request);
    const basis = JSON.parse(stale.currentBasisJson);
    basis.basis.source_revisions[0].revision_id = 'changed-revision';
    stale.currentBasisJson = JSON.stringify(basis);
    const session = {
      kind: 'native_cab',
      documentId: request.target.document_id,
      chain: e.evaluation.chain!,
      nativeCab: { documentId: request.target.document_id, chain: e.evaluation.chain!, wire: raw('funded'), request },
    } as unknown as OfficeNativeWordSession;
    const root = document.createElement('div');
    const host = {
      activeDocumentId: async () => session.documentId,
      watchNativeCabInvalidation: () => () => {},
      readNativeCabScope: async () => stale,
    } as unknown as OfficeWordHost;
    const pane = mountNativeWorkspace(root, session, host, 1_048_576);
    await pane.ready;
    expect(root.textContent).toContain('evaluation is unavailable');
    expect(root.textContent).not.toContain('Additional information is needed.');
    pane.destroy();
  });
  test('shows the satisfied field and two remaining findings from the fresh producer revision', () => {
    const { e, doc, request } = setup(raw('post-write'));
    expect(request.target.revision_id).toBe('r2');
    expect(readCabSnapshot(doc, request)).not.toBeNull();
    expect(e.evaluation.requirements.find((r) => r.field === 'classified_by')?.state).toBe('satisfied');
    expect(e.evaluation.findings.items.some((f) => f.question?.field === 'classified_by')).toBe(false);
    const root = document.createElement('div');
    const pane = mount(root, { doc, nativeCabRequest: request });
    expect(root.textContent).toContain('satisfied');
    expect(root.textContent?.match(/Additional information is needed/g)).toHaveLength(2);
    pane.destroy();
  });
  test('pending or failed independent host scope cannot flash the initial provider data', async () => {
    const { request, e } = setup(raw('funded'));
    const root = document.createElement('div');
    let finish!: (scope: typeof request | null) => void;
    const pending = new Promise<typeof request | null>((resolve) => {
      finish = resolve;
    });
    const session = {
      kind: 'native_cab',
      documentId: request.target.document_id,
      chain: e.evaluation.chain!,
      nativeCab: { documentId: request.target.document_id, chain: e.evaluation.chain!, wire: raw('funded'), request },
    } as unknown as OfficeNativeWordSession;
    const host = {
      activeDocumentId: async () => session.documentId,
      watchNativeCabInvalidation: () => () => {},
      readNativeCabScope: () => pending,
    } as unknown as OfficeWordHost;
    const pane = mountNativeWorkspace(root, session, host, 1_048_576);
    await Promise.resolve();
    expect(root.textContent).toContain('evaluation is unavailable');
    expect(root.textContent).not.toContain('Additional information is needed.');
    finish(null);
    await pane.ready;
    expect(root.textContent).toContain('evaluation is unavailable');
    pane.destroy();
  });
  test('subscription failure leaves route unavailable', async () => {
    const { request, e } = setup(raw('funded'));
    const root = document.createElement('div');
    const session = {
      kind: 'native_cab',
      documentId: request.target.document_id,
      chain: e.evaluation.chain!,
      nativeCab: { documentId: request.target.document_id, chain: e.evaluation.chain!, wire: raw('funded') },
    } as unknown as OfficeNativeWordSession;
    const host = {
      activeDocumentId: async () => session.documentId,
      watchNativeCabInvalidation: () => {
        throw Error('subscription failed');
      },
      readNativeCabScope: async () => request,
    } as unknown as OfficeWordHost;
    const pane = mountNativeWorkspace(root, session, host, 1_048_576);
    await pane.ready;
    expect(root.textContent).toContain('evaluation is unavailable');
    expect(root.textContent).not.toContain('Additional information is needed.');
    pane.destroy();
  });
  test('failed subscription cleanup still clears the mounted view', async () => {
    const { request, e } = setup(raw('funded'));
    const root = document.createElement('div');
    const session = {
      kind: 'native_cab',
      documentId: request.target.document_id,
      chain: e.evaluation.chain!,
      nativeCab: { documentId: request.target.document_id, chain: e.evaluation.chain!, wire: raw('funded') },
    } as unknown as OfficeNativeWordSession;
    const host = {
      activeDocumentId: async () => session.documentId,
      watchNativeCabInvalidation: () => () => {
        throw Error('cleanup failed');
      },
      readNativeCabScope: async () => request,
    } as unknown as OfficeWordHost;
    const pane = mountNativeWorkspace(root, session, host, 1_048_576);
    await pane.ready;
    expect(root.textContent).toContain('Additional information is needed.');
    pane.destroy();
    expect(root.textContent).toBe('');
  });
  test('replays the Rust-produced subject-exhaustion fixture through the normal Word consumer', async () => {
    const wire = raw('subject-serial-exhausted');
    const { e, doc, request } = setup(wire);
    const findings = e.evaluation.findings.items;
    expect(findings).toHaveLength(3);
    expect(findings.map((finding) => finding.identity)).toEqual(
      Array.from({ length: 3 }, () => ({ status: 'unavailable', reason: 'subject_serial_exhausted' })),
    );
    expect(findings.map((finding) => finding.requirement)).toEqual([
      { status: 'resolved', index: '0' },
      { status: 'resolved', index: '1' },
      { status: 'resolved', index: '2' },
    ]);
    expect(findings.map((finding) => finding.requested_action?.requested_fact)).toEqual([
      'CAB required field ClassifiedBy',
      'CAB required field ClassificationReason',
      'CAB required field DeclassifyOn',
    ]);
    expect(findings.every((finding) => finding.requested_action !== null)).toBe(true);
    expect(
      findings.every(
        (finding) => finding.question === null && finding.result === null && finding.result_revision === null,
      ),
    ).toBe(true);
    expect(e.evaluation.readiness).toMatchObject({ kind: 'supported', status: 'incomplete' });
    expect(e.evaluation.host_work).toMatchObject({ coverage: 'unavailable', rows: [] });
    expect(readCabSnapshot(doc, request)).not.toBeNull();
    expect(effectiveReady(doc)).toBe(false);

    const root = document.createElement('div');
    const write = vi.fn();
    const session = {
      kind: 'native_cab',
      documentId: request.target.document_id,
      chain: e.evaluation.chain!,
      nativeCab: { documentId: request.target.document_id, chain: e.evaluation.chain!, wire, request },
      readNativeCab: vi
        .fn()
        .mockResolvedValue({ documentId: request.target.document_id, chain: e.evaluation.chain!, wire, request }),
    } as unknown as OfficeNativeWordSession;
    const host = {
      activeDocumentId: async () => session.documentId,
      applyCommitted: write,
      watchNativeCabInvalidation: () => () => {},
      readNativeCabScope: async () => request,
    } as OfficeWordHost;
    const pane = mountNativeWorkspace(root, session, host, 1_048_576);
    await pane.ready;
    expect(root.textContent).toContain('Finding identity is unavailable.');
    expect(root.textContent).toContain('Question identity is unavailable.');
    expect(root.textContent).toContain('Result identity is unavailable.');
    expect(root.textContent?.match(/Additional information is needed/g)).toHaveLength(3);
    for (const finding of findings) expect(root.textContent).toContain(finding.requested_action!.requested_fact);
    expect(root.querySelector('.mq-history')).toBeNull();
    expect(root.querySelectorAll('button')).toHaveLength(1);
    expect(root.querySelector('button')?.textContent).toBe('Refresh authority block');
    expect(write).not.toHaveBeenCalled();
    pane.destroy();
  });
});
