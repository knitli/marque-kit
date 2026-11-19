// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vite-plus/test';
import { parseNativeSemanticResultsJson } from '@knitli/marque-kit-core/native-wire';
import { isNativeSemanticResultsRequest, readNativeSemanticResults } from '@knitli/marque-kit-core/native-results';
import type { NativeSemanticResultsRequest } from '@knitli/marque-kit-core/native-results';
import type { Doc } from '@knitli/marque-kit-core/types';
import { mountNativeSemanticResultsWorkspace } from '../../../../apps/office-addin/src/native-semantic-results-workspace.ts';
import type {
  OfficeNativeSemanticResultsSession,
  OfficeWordHost,
} from '../../../../apps/office-addin/src/workspace.ts';
import { mount } from '../../src/render.ts';

const raw = readFileSync(join(import.meta.dirname, '../fixtures/native-semantic-results.fixture'), 'utf8');
const parsed = () => parseNativeSemanticResultsJson(raw, 1_048_576);
const context = {
  documentId: 'word-doc-18',
  revisionId: 'revision-42',
  viewerId: 'principal-5',
  principalRevision: 'principal-revision-8',
  evaluationId: 'evaluation-revision-21',
};
const request: NativeSemanticResultsRequest = {
  current: context,
  grant: {
    ...context,
    grantId: 'f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1',
    rows: Array.from({ length: 4 }, () => ({ meaning: true, supportKinds: true, dependencies: true })),
    coverage: true,
  },
};
const doc = (): Doc => ({
  findings: [],
  document: { blocking: [], artifacts: [], native_semantic_results: parsed() },
});
const root = () => {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 360 });
  document.body.append(el);
  return el;
};

describe('native semantic results read-only pane', () => {
  test('renders actual Rust bytes as compact typed rows with no raw identifiers or write controls', () => {
    const n = root();
    const onAppend = vi.fn();
    const onAct = vi.fn();
    const pane = mount(n, {
      doc: doc(),
      currentDisclosureRevision: context.principalRevision,
      nativeSemanticResultsRequest: request,
      onAppend,
      onAct,
    });
    expect(pane.view()?.document.native_semantic_results).toEqual(parsed());
    expect(n.textContent).toContain('4 selected result rows');
    expect(n.textContent).toContain('Classified by');
    expect(n.textContent).toContain('Classification reason');
    expect(n.textContent).toContain('Declassify on');
    expect(n.textContent).toContain('Classification authority evidence');
    expect(n.textContent).toContain('Typed meaning is unavailable.');
    expect(n.textContent).toContain('No result dependencies were reported.');
    expect(n.textContent).toContain('Source values and identifiers are not shown.');
    expect(n.querySelectorAll('button, input, form')).toHaveLength(0);
    expect(n.textContent).not.toContain('wire-spike-source');
    expect(n.textContent).not.toContain('wire-spike-chain');
    expect(n.textContent).not.toContain('host-owned:');
    expect(onAppend).not.toHaveBeenCalled();
    expect(onAct).not.toHaveBeenCalled();
    pane.destroy();
    n.remove();
  });

  test('Office route uses the independent current grant and rejects stale same-context bytes', async () => {
    const n = root();
    let currentRequest = request;
    const session: OfficeNativeSemanticResultsSession = {
      kind: 'native_semantic_results',
      documentId: context.documentId,
      viewerId: context.viewerId,
      nativeSemanticResults: { documentId: context.documentId, wire: raw },
      readNativeSemanticResults: async () => ({ documentId: context.documentId, wire: raw }),
    };
    const applyCommitted = vi.fn(async () => {
      throw new Error('restricted results route cannot write');
    });
    const readNativeCabScope = vi.fn(async () => null);
    const wordHost: OfficeWordHost = {
      activeDocumentId: async () => context.documentId,
      applyCommitted,
      readNativeCabScope,
      watchNativeSemanticResultsInvalidation: () => () => {},
      readNativeSemanticResultsRequest: async () => currentRequest,
    };
    const workspace = mountNativeSemanticResultsWorkspace(n, session, wordHost, 1_048_576);
    await workspace.ready;
    expect(n.textContent).toContain('4 selected result rows');
    expect(n.textContent).toContain('Classified by');
    expect(n.textContent).not.toContain('wire-spike-source');
    expect(n.textContent).not.toContain('host-owned:');
    expect(n.querySelectorAll('button, input, form')).toHaveLength(1);
    expect(readNativeCabScope).not.toHaveBeenCalled();
    expect(applyCommitted).not.toHaveBeenCalled();
    currentRequest = {
      ...request,
      grant: { ...request.grant, grantId: 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2' },
    };
    await workspace.refresh();
    expect(n.textContent).toContain('current result disclosure is unavailable');
    expect(n.textContent).not.toContain('Classified by');
    expect(readNativeCabScope).not.toHaveBeenCalled();
    expect(applyCommitted).not.toHaveBeenCalled();
    workspace.destroy();
    n.remove();
  });

  test('wire grant token alone has no authority and stale principal or document grants clear rows', () => {
    const first = doc();
    expect(readNativeSemanticResults(first, undefined, context.principalRevision)).toBeNull();
    expect(readNativeSemanticResults(first, request, 'older-principal-revision')).toBeNull();
    const n = root();
    const pane = mount(n, {
      doc: first,
      currentDisclosureRevision: context.principalRevision,
      nativeSemanticResultsRequest: request,
    });
    expect(n.textContent).toContain('Classified by');
    pane.update({ currentDisclosureRevision: 'principal-revision-9' });
    expect(n.textContent).toContain('current result disclosure is unavailable');
    expect(n.textContent).not.toContain('Classified by');
    pane.update({ doc: doc(), currentDisclosureRevision: context.principalRevision });
    expect(n.textContent).toContain('current result disclosure is unavailable');
    expect(n.textContent).not.toContain('Classification authority evidence');
    pane.destroy();
    n.remove();
  });

  test('malformed host grant shape fails closed before reading row count', () => {
    const malformed = [
      { ...request, grant: { ...request.grant, rows: null } },
      { ...request, grant: { ...request.grant, rows: { length: 4 } } },
      { ...request, grant: { ...request.grant, coverage: 'true' } },
    ];
    for (const bad of malformed) {
      expect(isNativeSemanticResultsRequest(bad)).toBe(false);
      expect(() =>
        readNativeSemanticResults(doc(), bad as unknown as NativeSemanticResultsRequest, context.principalRevision),
      ).not.toThrow();
      expect(
        readNativeSemanticResults(doc(), bad as unknown as NativeSemanticResultsRequest, context.principalRevision),
      ).toBeNull();
    }
  });
});
