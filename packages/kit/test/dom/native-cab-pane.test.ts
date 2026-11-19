// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vite-plus/test';
import { appendAct, empty } from '@knitli/marque-kit-core/state';
import type { ActAppendRequest, AppendActResult } from '@knitli/marque-kit-core/types';
import { parseNativeJson } from '@knitli/marque-kit-core/native-wire';
import type { NativeEnvelopeV1 } from '@knitli/marque-kit-core/native-wire';
import type { NativeCabRequest } from '@knitli/marque-kit-core/native-cab';
import type { Doc } from '@knitli/marque-kit-core/types';
import { mount } from '../../src/render.ts';
import { mountNativeWorkspace } from '../../../../apps/office-addin/src/native-workspace.ts';
import type {
  OfficeWordHost,
  OfficeNativeWordSession,
  OfficeNativeCabSnapshot,
} from '../../../../apps/office-addin/src/workspace.ts';

const fixture = (name: string): NativeEnvelopeV1 => {
  const parsed = parseNativeJson(
    readFileSync(join(import.meta.dirname, `../../../core/test/fixtures/native-${name}.fixture`), 'utf8'),
    1_048_576,
  );
  if (parsed.version !== 1) throw new Error('expected v1 fixture');
  return parsed;
};
const documentFor = (envelope: NativeEnvelopeV1): Doc => {
  const doc = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../../../fixtures/memo.findings.json'), 'utf8'),
  ) as Doc;
  doc.findings[0]!.says.text = 'LEGACY-CARD-SENTINEL';
  doc.document.native_evaluation = envelope;
  return doc;
};
const requestFor = (envelope: NativeEnvelopeV1): NativeCabRequest => ({
  kind: 'cab_snapshot',
  operation: 'base',
  target: envelope.evaluation.artifacts[0]!.target,
  profile: envelope.evaluation.basis!.basis.profile!,
  currentBasisJson: JSON.stringify(envelope.evaluation.basis),
  maxBasisBytes: 1_048_576,
});
const root = () => {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 360 });
  document.body.append(el);
  return el;
};

describe('native CAB pane', () => {
  test('actual complete, partial and plain outputs render only scoped current results', () => {
    const a = fixture('cab'),
      b = fixture('partial'),
      plain = fixture('plain');
    const n = root();
    const onAppend = vi.fn();
    const p = mount(n, { doc: documentFor(a), nativeCabRequest: requestFor(a), onAppend });
    expect(n.textContent).toContain('Authority block evaluation is incomplete.');
    expect(n.textContent).toContain('Source coverage is complete.');
    expect(n.textContent).toContain('Agency and office of origin');
    expect(n.textContent).toContain('unresolved');
    expect(n.textContent).not.toContain('LEGACY-CARD-SENTINEL');
    expect(n.querySelectorAll('button, input, form')).toHaveLength(0);
    expect(n.querySelector('h2')?.textContent).toBe('Classification Authority Block');
    for (const artifact of a.evaluation.artifacts)
      for (const field of artifact.fields)
        if (field.value_reference) expect(n.outerHTML).not.toContain(field.value_reference);
    p.update({ doc: documentFor(b), nativeCabRequest: requestFor(b) });
    expect(n.textContent).toContain('Source coverage is partial.');
    expect(n.textContent).toContain('unsatisfied');
    p.update({ doc: documentFor(plain), nativeCabRequest: requestFor(a) });
    expect(n.textContent).toContain('current authority block evaluation is unavailable');
    expect(n.textContent).not.toContain('Source coverage is partial');
    expect(n.textContent).not.toContain('LEGACY-CARD-SENTINEL');
    expect(onAppend).not.toHaveBeenCalled();
    p.destroy();
    n.remove();
  });
  test('a stale current basis or an unaccompanied refresh clears prior rows', () => {
    const a = fixture('cab');
    const n = root();
    const r = requestFor(a);
    const p = mount(n, { doc: documentFor(a), nativeCabRequest: r });
    expect(n.textContent).toContain('Classified by');
    const stale = JSON.parse(r.currentBasisJson);
    stale.basis.source_revisions[0].revision_id = 'stale';
    p.update({ nativeCabRequest: { ...r, currentBasisJson: JSON.stringify(stale) } });
    expect(n.textContent).not.toContain('Classified by');
    expect(n.textContent).toContain('unavailable');
    p.update({ doc: documentFor(a), nativeCabRequest: r });
    p.update({ doc: documentFor(a) });
    expect(n.textContent).not.toContain('Classified by');
    p.destroy();
    n.remove();
  });
  test('Office provider refresh revokes before the read and ignores switched documents', async () => {
    const a = fixture('cab'),
      b = fixture('partial'),
      n = root();
    const req = requestFor(a);
    let active = req.target.document_id;
    let resolve!: (value: OfficeNativeCabSnapshot) => void;
    const pending = new Promise<OfficeNativeCabSnapshot>((done) => {
      resolve = done;
    });
    const readNativeCab = vi.fn(() => pending);
    const session = {
      documentId: active,
      chain: 'chain',
      kind: 'native_cab',
      nativeCab: { documentId: active, chain: 'chain', wire: JSON.stringify(a), request: req },
      readNativeCab,
    } as unknown as OfficeNativeWordSession;
    const host = { activeDocumentId: async () => active } as OfficeWordHost;
    const pane = mountNativeWorkspace(n, session, host, 1_048_576);
    expect(n.textContent).toContain('Source coverage is complete.');
    const refresh = pane.refresh();
    expect(n.textContent).not.toContain('Classified by');
    expect(n.textContent).toContain('unavailable');
    active = 'different-document';
    resolve({ documentId: session.documentId, chain: 'chain', wire: JSON.stringify(b), request: requestFor(b) });
    await refresh;
    expect(n.textContent).not.toContain('Source coverage is partial');
    expect(n.querySelectorAll('button')).toHaveLength(1); // refresh is read-only
    pane.destroy();
    n.remove();
  });
  test('Office refresh replaces and then revokes a scoped result without writes', async () => {
    const a = fixture('cab'),
      b = fixture('partial'),
      n = root();
    const request = requestFor(a);
    const write = vi.fn();
    const read = vi.fn<() => Promise<OfficeNativeCabSnapshot>>();
    const session = {
      documentId: request.target.document_id,
      chain: 'chain',
      kind: 'native_cab',
      nativeCab: { documentId: request.target.document_id, chain: 'chain', wire: JSON.stringify(a), request },
      readNativeCab: read,
      applyCommitted: write,
    } as unknown as OfficeNativeWordSession;
    const host = { activeDocumentId: async () => session.documentId, applyCommitted: write } as OfficeWordHost;
    const pane = mountNativeWorkspace(n, session, host, 1_048_576);
    read.mockResolvedValueOnce({
      documentId: session.documentId,
      chain: session.chain,
      wire: JSON.stringify(b),
      request: requestFor(b),
    });
    await pane.refresh();
    expect(n.textContent).toContain('Source coverage is partial.');
    expect(n.textContent).toContain('unsatisfied');
    read.mockResolvedValueOnce({ documentId: session.documentId, chain: session.chain, wire: JSON.stringify(b) });
    await pane.refresh();
    expect(n.textContent).toContain('unavailable');
    expect(n.textContent).not.toContain('unsatisfied');
    expect(write).not.toHaveBeenCalled();
    pane.destroy();
    n.remove();
  });
  test('a slower refresh cannot restore an older scoped result', async () => {
    const a = fixture('cab'),
      b = fixture('partial'),
      n = root(),
      request = requestFor(a);
    let finishFirst!: (value: OfficeNativeCabSnapshot) => void;
    const first = new Promise<OfficeNativeCabSnapshot>((resolve) => {
      finishFirst = resolve;
    });
    const read = vi.fn<() => Promise<OfficeNativeCabSnapshot>>();
    const session = {
      documentId: request.target.document_id,
      chain: 'chain',
      kind: 'native_cab',
      nativeCab: { documentId: request.target.document_id, chain: 'chain', wire: JSON.stringify(a), request },
      readNativeCab: read,
    } as unknown as OfficeNativeWordSession;
    const host = { activeDocumentId: async () => session.documentId } as OfficeWordHost;
    read.mockReturnValueOnce(first).mockResolvedValueOnce({
      documentId: session.documentId,
      chain: session.chain,
      wire: JSON.stringify(b),
      request: requestFor(b),
    });
    const pane = mountNativeWorkspace(n, session, host, 1_048_576);
    const older = pane.refresh();
    await Promise.resolve();
    await Promise.resolve();
    await pane.refresh();
    expect(n.textContent).toContain('Source coverage is partial.');
    finishFirst({
      documentId: session.documentId,
      chain: session.chain,
      wire: JSON.stringify(a),
      request,
    });
    await older;
    expect(n.textContent).toContain('Source coverage is partial.');
    expect(n.textContent).not.toContain('Source coverage is complete.');
    pane.destroy();
    n.remove();
  });
  test('a committed legacy append survives a switch without triggering a native write', async () => {
    const a = fixture('cab'),
      n = root();
    const legacy = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../../../fixtures/memo.findings.json'), 'utf8'),
    ) as Doc;
    let finish!: (value: AppendActResult) => void;
    let request!: ActAppendRequest;
    const onAppend = vi.fn((r: ActAppendRequest) => {
      request = r;
      return new Promise<AppendActResult>((resolve) => {
        finish = resolve;
      });
    });
    const onChange = vi.fn();
    const p = mount(n, {
      doc: legacy,
      state: empty(),
      actBinding: { documentId: 'doc', chain: 'chain' },
      onAppend,
      onChange,
    });
    const subject = p.view()!.findings.find((f) => f.id === 'f-p2-rel-to-separator')!;
    p.host.onAct!(subject, 'kept_as_written', null);
    expect(onAppend).toHaveBeenCalledTimes(1);
    p.update({ doc: documentFor(a), nativeCabRequest: requestFor(a) });
    const committed = appendAct(empty(), request);
    expect(committed.status).toBe('committed');
    finish(committed);
    await vi.waitFor(() => expect(p.state.log).toHaveLength(1));
    expect(onChange.mock.calls.every((call) => call[1] === null)).toBe(true);
    expect(n.querySelectorAll('button, input, form')).toHaveLength(0);
    p.destroy();
    n.remove();
  });
  test('a switch to read-only prevents a newly started append', () => {
    const n = root();
    const legacy = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../../../fixtures/memo.findings.json'), 'utf8'),
    ) as Doc;
    const onAppend = vi.fn();
    const p = mount(n, { doc: legacy, onAppend });
    const subject = p.view()!.findings.find((f) => f.id === 'f-p2-rel-to-separator')!;
    p.update({ readOnly: true });
    p.host.onAct!(subject, 'kept_as_written', null);
    expect(onAppend).not.toHaveBeenCalled();
    p.destroy();
    n.remove();
  });
});
