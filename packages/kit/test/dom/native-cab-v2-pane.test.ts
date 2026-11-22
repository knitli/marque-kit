// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vite-plus/test';
import { parseNativeJson } from '@knitli/marque-kit-core/native-wire';
import { readCabSnapshot } from '@knitli/marque-kit-core/native-cab';
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
        x.evaluation.findings.items[0].subject.chain = 'wrong';
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
    original.evaluation.findings.items[0].subject.serial = '9007199254740992';
    expect(() => parse(JSON.stringify(original))).toThrow();
  });
  test('Office provider handles actual v2 refresh and revokes mismatched chain without writes', async () => {
    const first = setup(raw('funded'));
    const next = setup(raw('partial'));
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
    const host = { activeDocumentId: async () => session.documentId, applyCommitted: write } as OfficeWordHost;
    const pane = mountNativeWorkspace(root, session, host, 1_048_576);
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
  test.each(['subject-serial-max', 'result-serial-max'])('retains real allocated rows at %s', (name) => {
    const { doc, request } = setup(raw(name));
    expect(readCabSnapshot(doc, request)).not.toBeNull();
    const root = document.createElement('div');
    const pane = mount(root, { doc, nativeCabRequest: request });
    expect(root.textContent).toContain('Additional information is needed.');
    if (name === 'result-serial-max') expect(root.textContent).toContain('Result identity is unavailable.');
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
    overWatermark.evaluation.findings.items[0].subject.serial = '5';
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
  test('actual fully exhausted subject allocation retains requirements without findings', () => {
    const { e, doc, request } = setup(raw('subject-exhausted-no-findings'));
    expect(e.evaluation.findings.items).toHaveLength(0);
    expect(e.evaluation.requirements).toHaveLength(4);
    expect(readCabSnapshot(doc, request)).not.toBeNull();
    const root = document.createElement('div');
    const pane = mount(root, { doc, nativeCabRequest: request });
    expect(root.textContent).toContain('Classified by');
    expect(root.textContent).not.toContain('Additional information is needed.');
    pane.destroy();
  });
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
  test('rejects zero and reused represented identifiers', () => {
    const original = JSON.parse(raw('funded'));
    for (const mutate of [
      (x: typeof original) => {
        x.evaluation.findings.items[0].subject.serial = '0';
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
        a[1].subject.serial = a[0].subject.serial;
        a[1].question.subject.serial = a[0].subject.serial;
        a[1].result.subject_serial = a[0].subject.serial;
      },
    ]) {
      const x = structuredClone(original);
      mutate(x);
      const { doc, request } = setup(JSON.stringify(x));
      expect(readCabSnapshot(doc, request)).toBeNull();
    }
  });
});
