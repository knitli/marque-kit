// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import { mountCabPlacementWorkspace } from '../../../../apps/office-addin/src/cab-placement-workspace.ts';
import type {
  OfficeCabPlacementScope,
  OfficeNativeCabPlacementSession,
  OfficeWordHost,
} from '../../../../apps/office-addin/src/workspace.ts';

const text = 'Classified By: Adam';
const size = new TextEncoder().encode(text).length;
const target = {
  document_id: 'ordinary-document',
  revision_id: 'r1',
  contribution_id: 'body',
  scope_locator: [0, size] as [number, number],
};
function setup() {
  let pages = [1];
  let supported = true;
  let activeDocument = target.document_id;
  let invalidate = () => {};
  const placement: OfficeCabPlacementScope = {
    target: structuredClone(target),
    face_page: 1,
    text,
    ownership: 'exclusive',
    layout_revision: 'L1',
  };
  const range = {
    text,
    load() {
      return this;
    },
    expandTo() {
      return this;
    },
    get pages() {
      return {
        items: pages.map((index) => ({ index })),
        load() {
          return this;
        },
      };
    },
  };
  const paragraph = {
    text,
    search() {
      return {
        items: [range],
        load() {
          return this;
        },
      };
    },
  };
  const paragraphs = {
    items: [paragraph],
    load() {
      return this;
    },
  };
  const run = vi.fn(async (fn) => fn({ document: { body: { paragraphs } }, sync: async () => {} }));
  vi.stubGlobal('Word', { run });
  vi.stubGlobal('Office', { context: { requirements: { isSetSupported: () => supported } } });
  const inspect = vi.fn(async (_text: string, input: string) => {
    const request = JSON.parse(input);
    const binding = request.bindings[0];
    if (!binding)
      return JSON.stringify({
        status: 'partial',
        fields: [
          {
            candidate_span: [0, size],
            label_span: [0, 13],
            value_span: [15, 19],
            label_kind: 'classified_by',
            binding_index: null,
            placement: 'unknown',
            reason: 'unbound',
          },
        ],
        groups: [],
        unmatched_bindings: 0,
        unmatched_observations: 0,
      });
    const observed: number[] = request.observations[0]?.pages ?? [];
    const placement = !observed.length
      ? 'unknown'
      : observed.length > 1
        ? 'split_page'
        : observed[0] === binding.face_page
          ? 'on_face'
          : 'off_face';
    return JSON.stringify({
      status: observed.length ? 'complete' : 'partial',
      fields: [
        {
          candidate_span: binding.candidate_span,
          label_span: binding.label_span,
          value_span: binding.value_span,
          label_kind: 'classified_by',
          binding_index: 0,
          placement,
          reason: null,
        },
      ],
      groups: [
        {
          field_indices: [0],
          target_binding_index: 0,
          candidate_span: binding.candidate_span,
          face_page: binding.face_page,
          placement,
          complete: !!observed.length,
        },
      ],
      unmatched_bindings: 0,
      unmatched_observations: 0,
    });
  });
  const session: OfficeNativeCabPlacementSession = {
    kind: 'native_cab_placement',
    documentId: target.document_id,
    chain: 'ordinary-chain',
    inspectCabPlacement: inspect,
  };
  const write = vi.fn();
  const readScope = vi.fn(async () => structuredClone(placement));
  const host: OfficeWordHost = {
    activeDocumentId: async () => activeDocument,
    applyCommitted: write,
    watchNativeCabInvalidation: (_document, _chain, callback) => {
      invalidate = callback;
      return () => {};
    },
    readNativeCabPlacementScope: readScope,
  };
  return {
    session,
    host,
    placement,
    inspect,
    run,
    write,
    readScope,
    setPages(next: number[]) {
      pages = next;
    },
    setSupported(next: boolean) {
      supported = next;
    },
    switchDocument() {
      activeDocument = 'different';
    },
    invalidate() {
      invalidate();
    },
  };
}
afterEach(() => {
  delete window.marqueOfficeWorkspace;
  vi.unstubAllGlobals();
});

describe('Word native CAB placement route', () => {
  test('Office entry opens ordinary placement without a policy receipt or sample fallback', async () => {
    const fixture = setup();
    fixture.setPages([1, 2]);
    document.body.innerHTML = '<div id="pane"></div><div id="note"></div><div id="sample"></div>';
    window.marqueOfficeWorkspace = {
      provider: { openWord: async () => fixture.session },
      wordHost: fixture.host,
      nativeMaxBytes: 1_048_576,
    };
    let start!: (info: { host: string }) => Promise<void>;
    vi.stubGlobal('Office', {
      HostType: { Word: 'Word' },
      context: { requirements: { isSetSupported: () => true } },
      onReady: (callback: typeof start) => {
        start = callback;
      },
    });
    vi.resetModules();
    await import('../../../../apps/office-addin/src/taskpane.ts');
    await start({ host: 'Word' });
    await vi.waitFor(() => expect(document.querySelector('#pane')?.textContent).toContain('crosses pages'));
    expect(document.querySelector('#pane')?.textContent).not.toContain('Adam');
    expect(fixture.write).not.toHaveBeenCalled();
    expect(fixture.inspect).toHaveBeenCalledTimes(2);
    expect(document.querySelector('#pane')?.textContent).toContain(
      'Classified By spans pages 1, 2; its designated face is page 1.',
    );
  });
  test('Office entry denies an unbound ordinary session before any source read', async () => {
    const fixture = setup();
    fixture.switchDocument();
    document.body.innerHTML = '<div id="pane"></div><div id="note"></div><div id="sample"></div>';
    window.marqueOfficeWorkspace = {
      provider: { openWord: async () => fixture.session },
      wordHost: fixture.host,
      nativeMaxBytes: 1_048_576,
    };
    let start!: (info: { host: string }) => Promise<void>;
    vi.stubGlobal('Office', {
      HostType: { Word: 'Word' },
      context: { requirements: { isSetSupported: () => true } },
      onReady: (callback: typeof start) => {
        start = callback;
      },
    });
    vi.resetModules();
    await import('../../../../apps/office-addin/src/taskpane.ts');
    await start({ host: 'Word' });
    expect(document.querySelector('#pane')?.textContent).toContain('unavailable for the current document');
    expect(fixture.readScope).not.toHaveBeenCalled();
    expect(fixture.run).not.toHaveBeenCalled();
    expect(fixture.inspect).not.toHaveBeenCalled();
  });
  test('calls the inspector with observed pages and revokes a previous layout before reflow readback', async () => {
    const fixture = setup();
    const root = document.createElement('div');
    const pane = mountCabPlacementWorkspace(root, fixture.session, fixture.host, 1_048_576);
    await pane.ready;
    expect(root.textContent).toContain('inspected fields are on their owning face');
    expect(JSON.parse(fixture.inspect.mock.calls[0]![1]).bindings).toEqual([]);
    expect(JSON.parse(fixture.inspect.mock.calls[1]![1]).observations[0].pages).toEqual([1]);
    fixture.setPages([1, 2]);
    fixture.placement.layout_revision = 'L2';
    fixture.invalidate();
    expect(root.textContent).not.toContain('inspected fields are on their owning face');
    await pane.refresh();
    expect(root.textContent).toContain('crosses pages');
    expect(JSON.parse(fixture.inspect.mock.calls[3]![1]).observations[0]).toMatchObject({
      layout_revision: 'L2',
      pages: [1, 2],
    });
    pane.destroy();
  });
  test('will not inspect a different owner, unsupported Word, or a switched document', async () => {
    const foreign = setup();
    foreign.placement.target.document_id = 'foreign';
    const root = document.createElement('div');
    const pane = mountCabPlacementWorkspace(root, foreign.session, foreign.host, 1_048_576);
    await pane.ready;
    expect(foreign.inspect).not.toHaveBeenCalled();
    expect(foreign.run).not.toHaveBeenCalled();
    expect(root.textContent).toContain('current placement is unavailable');
    pane.destroy();

    const unsupported = setup();
    unsupported.setSupported(false);
    const other = mountCabPlacementWorkspace(root, unsupported.session, unsupported.host, 1_048_576);
    await other.ready;
    expect(root.textContent).toContain('cannot inspect page placement');
    expect(unsupported.inspect).toHaveBeenCalledTimes(1);
    unsupported.switchDocument();
    await other.refresh();
    expect(root.textContent).not.toContain('cannot inspect page placement');
    other.destroy();
  });
  test('shared ownership or a candidate outside the exclusively owned extent cannot become an on-face claim', async () => {
    const shared = setup();
    shared.placement.ownership = 'shared';
    const root = document.createElement('div');
    const first = mountCabPlacementWorkspace(root, shared.session, shared.host, 1_048_576);
    await first.ready;
    expect(shared.inspect).not.toHaveBeenCalled();
    expect(shared.run).not.toHaveBeenCalled();
    expect(root.textContent).toContain('current placement is unavailable');
    first.destroy();

    const outside = setup();
    outside.placement.target.scope_locator = [0, 13];
    const second = mountCabPlacementWorkspace(root, outside.session, outside.host, 1_048_576);
    await second.ready;
    expect(JSON.parse(outside.inspect.mock.calls[1]![1]).bindings).toEqual([]);
    expect(root.textContent).toContain('Some placement could not be established');
    expect(root.textContent).not.toContain('on their owning face');
    second.destroy();

    const invalidBoundary = setup();
    invalidBoundary.placement.text = `α${text}`;
    invalidBoundary.placement.target.scope_locator = [1, size];
    const third = mountCabPlacementWorkspace(root, invalidBoundary.session, invalidBoundary.host, 1_048_576);
    await third.ready;
    expect(invalidBoundary.inspect).not.toHaveBeenCalled();
    expect(root.textContent).toContain('current placement is unavailable');
    third.destroy();
  });
  test('names an off-face field and its observed and designated pages without its value', async () => {
    const fixture = setup();
    fixture.setPages([2]);
    const root = document.createElement('div');
    const pane = mountCabPlacementWorkspace(root, fixture.session, fixture.host, 1_048_576);
    await pane.ready;
    expect(root.textContent).toContain('Classified By is on page 2; its designated face is page 1.');
    expect(root.textContent).not.toContain('Adam');
    pane.destroy();
  });
  test('layout change during comparison revokes both current evaluation and placement', async () => {
    const fixture = setup();
    fixture.session.inspectCabPlacement = async () => {
      fixture.placement.layout_revision = 'L2';
      return '{}';
    };
    const root = document.createElement('div');
    const pane = mountCabPlacementWorkspace(root, fixture.session, fixture.host, 1_048_576);
    await pane.ready;
    expect(root.textContent).toContain('current placement is unavailable');
    pane.destroy();
  });
  test('late engine replies cannot restore an invalidated layout', async () => {
    const fixture = setup();
    let finish!: (wire: string) => void;
    let called!: () => void;
    const started = new Promise<void>((resolve) => {
      called = resolve;
    });
    fixture.session.inspectCabPlacement = () => {
      called();
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    const root = document.createElement('div');
    const pane = mountCabPlacementWorkspace(root, fixture.session, fixture.host, 1_048_576);
    await started;
    fixture.invalidate();
    finish('{}');
    await pane.ready;
    expect(root.textContent).toContain('current placement is unavailable');
    pane.destroy();
  });
});
