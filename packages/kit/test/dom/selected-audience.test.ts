// SPDX-FileCopyrightText: 2026 Knitli Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, test, vi } from 'vite-plus/test';
import { mountSelectedAudienceWorkspace } from '../../../../apps/office-addin/src/selected-audience-workspace.ts';
import { readSelectedAudience } from '../../../../apps/office-addin/src/selected-audience-wire.ts';
import {
  SELECTED_AUDIENCE_ENGINE_SHA256,
  SELECTED_AUDIENCE_RECIPIENTS,
  SELECTED_AUDIENCE_VOCABULARY_SHA256,
} from '../../../../apps/office-addin/src/selected-audience-vocabulary.ts';
import type {
  OfficeNativeSelectedAudienceSession,
  OfficeSelectedAudienceScope,
  OfficeWordHost,
} from '../../../../apps/office-addin/src/workspace.ts';

const wasmPath = process.env.MARQUE_SELECTED_AUDIENCE_WASM;
const wasmSha256 =
  process.env.MARQUE_SELECTED_AUDIENCE_WASM_SHA256 ??
  '09809de846dce86f992a2ed074ce4ebb30321f43f22731446b0d790ac023f2f2';
const vocabularySha256 = '1872e6540573d7460d34a2375a0a12f6d77a92e4310e8e131d84de7588f60848';
const realWasm = wasmPath ? describe : describe.skip;

function engine(): { evaluate_selected_audience(input: string): string } {
  if (!wasmPath) throw new Error('set MARQUE_SELECTED_AUDIENCE_WASM to the packaged Node WASM entry');
  return createRequire(import.meta.url)(wasmPath) as { evaluate_selected_audience(input: string): string };
}

function engineRecipients(): string[] {
  const path = process.env.MARQUE_SELECTED_AUDIENCE_REGISTRY;
  if (!path) throw new Error('set MARQUE_SELECTED_AUDIENCE_REGISTRY to the engine-generated values.rs');
  const generated = readFileSync(path, 'utf8');
  const table = /^pub static TRIGRAPHS: &\[&str\] = &\[\n([\s\S]*?)^\];/m.exec(generated)?.[1];
  if (!table) throw new Error('engine-generated TRIGRAPHS was not found');
  const rows = table.trim().split('\n');
  const recipients = rows.map((row) => {
    const match = /^\s*"([A-Z0-9_]+)",$/.exec(row);
    if (!match) throw new Error('unexpected engine-generated TRIGRAPHS row');
    return match[1]!;
  });
  expect(recipients).toHaveLength(340);
  expect(
    createHash('sha256')
      .update(`${recipients.join('\n')}\n`)
      .digest('hex'),
  ).toBe('1872e6540573d7460d34a2375a0a12f6d77a92e4310e8e131d84de7588f60848');
  return recipients;
}

const markingA = '(S//REL TO USA, CAN, GBR//DISPLAY ONLY AFG)';
const markingB = '(S//REL TO USA, GBR, AFG//DISPLAY ONLY CAN)';

function scope(): OfficeSelectedAudienceScope {
  const documents = [markingA, markingB].map((source, index) => ({
    identity: {
      source_id: `private-source-${index}`,
      revision_id: `private-revision-${index}`,
      contribution_id: `private-contribution-${index}`,
    },
    source,
  }));
  return {
    documentId: 'private-current-document',
    viewerId: 'private-viewer',
    permissionRevision: 'private-permission-revision',
    selectionRevision: 'private-selection-revision',
    grantId: 'private-grant',
    engineArtifactSha256: wasmSha256,
    recipientVocabularySha256: vocabularySha256,
    disclosure: {
      foreign_receive: true,
      foreign_show: true,
      foreign_display_only: true,
      implied_usa: true,
      coverage: true,
    },
    documents,
    selections: documents.map((entry) => ({
      identity: { ...entry.identity },
      span: [0, new TextEncoder().encode(entry.source).length],
    })),
  };
}

function fixture(evaluate: OfficeNativeSelectedAudienceSession['evaluateSelectedAudience']) {
  const root = document.createElement('div');
  document.body.append(root);
  let current = scope();
  let invalidate: (() => void) | undefined;
  const read = vi.fn(async () => structuredClone(current));
  const stop = vi.fn();
  const write = vi.fn();
  const host = {
    activeDocumentId: vi.fn(async () => current.documentId),
    applyCommitted: write,
    readNativeSelectedAudienceScope: read,
    watchNativeSelectedAudienceInvalidation: vi.fn((_document: string, _viewer: string, notify: () => void) => {
      invalidate = notify;
      return stop;
    }),
  } as unknown as OfficeWordHost;
  const session: OfficeNativeSelectedAudienceSession = {
    kind: 'native_selected_audience',
    documentId: current.documentId,
    viewerId: current.viewerId,
    engineArtifactSha256: wasmSha256,
    recipientVocabularySha256: vocabularySha256,
    evaluateSelectedAudience: evaluate,
  };
  return {
    root,
    session,
    host,
    read,
    stop,
    write,
    current: () => current,
    set: (next: OfficeSelectedAudienceScope) => {
      current = next;
    },
    invalidate: () => invalidate?.(),
  };
}

function assertNoPrivateMaterial(root: HTMLElement, value: OfficeSelectedAudienceScope): void {
  const rendered = root.outerHTML;
  for (const item of [
    value.documentId,
    value.viewerId,
    value.permissionRevision,
    value.selectionRevision,
    value.grantId,
  ]) {
    expect(rendered).not.toContain(item);
  }
  for (const doc of value.documents) {
    expect(rendered).not.toContain(doc.source);
    for (const identity of Object.values(doc.identity)) expect(rendered).not.toContain(identity);
  }
}

const scopeChanges = [
  'second-selection',
  'second-revision',
  'authorization',
  'engine-artifact',
  'recipient-vocabulary',
] as const;
function changeScope(next: OfficeSelectedAudienceScope, change: (typeof scopeChanges)[number]): void {
  if (change === 'second-selection') next.selections[1]!.span = [0, 3];
  if (change === 'second-revision') {
    next.documents[1]!.identity.revision_id = 'private-revision-new';
    next.selections[1]!.identity.revision_id = 'private-revision-new';
  }
  if (change === 'authorization') {
    next.permissionRevision = 'private-permission-new';
    next.disclosure.foreign_receive = false;
  }
  if (change === 'engine-artifact') next.engineArtifactSha256 = '0'.repeat(64);
  if (change === 'recipient-vocabulary') next.recipientVocabularySha256 = '0'.repeat(64);
}

const bindingFields = ['engineArtifactSha256', 'recipientVocabularySha256'] as const;
const bindingChecks = (['scope', 'session'] as const).flatMap((owner) =>
  bindingFields.flatMap((field) => (['missing', 'mismatch'] as const).map((problem) => ({ owner, field, problem }))),
);

describe('selected audience provider boundary', () => {
  test.each(bindingChecks)('refuses $problem $owner $field before evaluation', async ({ owner, field, problem }) => {
    const evaluate = vi.fn(async () => 'not used');
    const f = fixture(evaluate);
    const binding = (owner === 'scope' ? f.current() : f.session) as unknown as Record<string, unknown>;
    if (problem === 'missing') delete binding[field];
    else binding[field] = '0'.repeat(64);
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await pane.ready;
    expect(evaluate).not.toHaveBeenCalled();
    expect(f.root.textContent).toContain('The selected audience is unavailable.');
    assertNoPrivateMaterial(f.root, f.current());
    pane.destroy();
    f.root.remove();
  });

  test('without a trusted watcher the view stays unavailable and never invokes the evaluator', async () => {
    const evaluate = vi.fn(async () => 'not used');
    const f = fixture(evaluate);
    f.host.watchNativeSelectedAudienceInvalidation = undefined;
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await pane.ready;
    expect(f.root.textContent).toContain('The selected audience is unavailable.');
    expect(f.root.textContent).not.toContain('Foreign receive:');
    expect(evaluate).not.toHaveBeenCalled();
    assertNoPrivateMaterial(f.root, f.current());
    pane.destroy();
    f.root.remove();
  });

  test.each(['missing-scope', 'throwing-watcher', 'throwing-scope', 'wrong-active-document'] as const)(
    '%s leaves the view unavailable before source text is sent',
    async (problem) => {
      const evaluate = vi.fn(async () => 'not used');
      const f = fixture(evaluate);
      if (problem === 'missing-scope') f.host.readNativeSelectedAudienceScope = undefined;
      if (problem === 'throwing-watcher') {
        f.host.watchNativeSelectedAudienceInvalidation = () => {
          throw new Error('private-watcher-error');
        };
      }
      if (problem === 'throwing-scope') {
        f.host.readNativeSelectedAudienceScope = async () => {
          throw new Error('private-scope-error');
        };
      }
      if (problem === 'wrong-active-document') f.host.activeDocumentId = async () => 'wrong-document';
      const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
      await pane.ready;
      expect(f.root.textContent).toContain('The selected audience is unavailable.');
      expect(f.root.textContent).not.toContain('private-');
      expect(evaluate).not.toHaveBeenCalled();
      assertNoPrivateMaterial(f.root, f.current());
      pane.destroy();
      f.root.remove();
    },
  );
});

realWasm('selected audience from the actual packaged WASM', () => {
  test.skipIf(wasmSha256 === SELECTED_AUDIENCE_ENGINE_SHA256)(
    'rejects an older actual WASM package with a mismatched artifact digest',
    async () => {
      const evaluate = vi.fn(async (request: string) => engine().evaluate_selected_audience(request));
      const f = fixture(evaluate);
      const { documents, selections } = f.current();
      const actual = JSON.parse(engine().evaluate_selected_audience(JSON.stringify({ documents, selections }))) as {
        foreign_receive: { value: string[] };
      };
      expect(actual.foreign_receive.value).toEqual(['GBR']);
      const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
      await pane.ready;
      expect(evaluate).not.toHaveBeenCalled();
      expect(f.root.textContent).toContain('The selected audience is unavailable.');
      assertNoPrivateMaterial(f.root, f.current());
      pane.destroy();
      f.root.remove();
    },
  );

  test('accepts every engine-register recipient on each audience axis', () => {
    const recipients = engineRecipients();
    expect(SELECTED_AUDIENCE_RECIPIENTS).toEqual(recipients);
    expect(SELECTED_AUDIENCE_VOCABULARY_SHA256).toBe(vocabularySha256);
    expect(SELECTED_AUDIENCE_ENGINE_SHA256).toBe(wasmSha256);
    const { documents, selections } = scope();
    const response = JSON.parse(engine().evaluate_selected_audience(JSON.stringify({ documents, selections }))) as {
      foreign_receive: { value: string[] };
      foreign_show: { value: string[] };
      foreign_display_only: { value: string[] };
    };
    for (const member of recipients) {
      response.foreign_receive.value = [member];
      response.foreign_show.value = [member];
      response.foreign_display_only.value = [member];
      const read = readSelectedAudience(JSON.stringify(response), 65_536, documents.length, selections.length);
      expect(read?.foreignReceive.value, `receive ${member}`).toEqual([member]);
      expect(read?.foreignShow.value, `show ${member}`).toEqual([member]);
      expect(read?.foreignDisplayOnly.value, `display-only ${member}`).toEqual([member]);
    }
  });

  test('R27 renders three exact axes while preserving distinct source and query coverage', async () => {
    const evaluate = vi.fn(async (request: string) => engine().evaluate_selected_audience(request));
    const f = fixture(evaluate);
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await pane.ready;
    expect(evaluate).toHaveBeenCalledTimes(1);
    const request = JSON.parse(evaluate.mock.calls[0]![0]) as {
      documents: OfficeSelectedAudienceScope['documents'];
      selections: OfficeSelectedAudienceScope['selections'];
    };
    expect(request).toEqual({ documents: f.current().documents, selections: f.current().selections });
    const text = f.root.textContent ?? '';
    expect(text).toContain('Foreign receive: GBR (Exact; participates).');
    expect(text).toContain('Foreign show: AFG, CAN, GBR (Exact; participates).');
    expect(text).toContain('Display only: AFG, CAN (Exact; participates).');
    expect(text).toContain('Implied USA: Yes (Exact; does not participate).');
    expect(text).toContain('Source evidence coverage: Partial');
    expect(text).toContain('Selected query coverage: Complete');
    expect(text).toContain('Document scan coverage: Complete');
    expect(text).toContain('This assessment does not authorize release or establish document readiness.');
    expect(Array.from(f.root.querySelectorAll('button'), (button) => button.textContent)).toEqual([
      'Refresh selected audience',
    ]);
    expect(text).not.toContain('ready to release');
    assertNoPrivateMaterial(f.root, f.current());
    pane.destroy();
    expect(f.stop).toHaveBeenCalledOnce();
    f.root.remove();
  });

  test('an unknown audience member stays bounded and does not become a displayed recipient', async () => {
    const evaluate = vi.fn(async (request: string) => engine().evaluate_selected_audience(request));
    const f = fixture(evaluate);
    const next = f.current();
    next.documents = [next.documents[0]!];
    next.documents[0]!.source = '(S//REL TO USA, GBR, XYZZY)';
    next.selections = [
      {
        identity: { ...next.documents[0]!.identity },
        span: [0, new TextEncoder().encode(next.documents[0]!.source).length],
      },
    ];
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await pane.ready;
    const text = f.root.textContent ?? '';
    expect(text).toContain('Foreign receive: GBR');
    expect(text).toContain('Bounded');
    expect(text).toContain('Selected query coverage: Partial');
    expect(text).not.toContain('XYZZY');
    assertNoPrivateMaterial(f.root, next);
    pane.destroy();
    f.root.remove();
  });

  test('a stale second-document revision cannot reuse the first document’s audience', async () => {
    const evaluate = vi.fn(async (request: string) => engine().evaluate_selected_audience(request));
    const f = fixture(evaluate);
    f.current().selections[1]!.identity.revision_id = 'private-stale-revision';
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await pane.ready;
    const stale = JSON.parse(
      engine().evaluate_selected_audience(
        JSON.stringify({
          documents: f.current().documents,
          selections: f.current().selections,
        }),
      ),
    ) as { refusal: string; selections: { reason: string | null }[] };
    expect(stale.refusal).toBe('selection_unavailable');
    expect(stale.selections[1]?.reason).toBe('unknown_identity');
    expect(evaluate).not.toHaveBeenCalled();
    expect(f.root.textContent).toContain('unavailable');
    expect(f.root.textContent).not.toContain('Foreign receive: GBR');
    expect(f.root.textContent).not.toContain('private-stale-revision');
    assertNoPrivateMaterial(f.root, f.current());
    pane.destroy();
    f.root.remove();
  });

  test.each(['foreign_receive', 'foreign_show', 'foreign_display_only', 'implied_usa', 'coverage'] as const)(
    'a denied %s prevents the raw WASM operation before any result is disclosed',
    async (field) => {
      const evaluate = vi.fn(async (request: string) => engine().evaluate_selected_audience(request));
      const f = fixture(evaluate);
      f.current().disclosure[field] = false;
      const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
      await pane.ready;
      expect(evaluate).not.toHaveBeenCalled();
      const text = f.root.textContent ?? '';
      expect(text).toContain('The selected audience is unavailable.');
      expect(text).not.toContain('GBR');
      expect(text).not.toContain('CAN');
      expect(text).not.toContain('AFG');
      expect(text).not.toContain('coverage:');
      assertNoPrivateMaterial(f.root, f.current());
      pane.destroy();
      f.root.remove();
    },
  );

  test.each(['missing-disclosure', 'wrong-viewer', 'duplicate-contribution', 'request-limit'] as const)(
    'refuses %s before sending source text to the evaluator',
    async (problem) => {
      const evaluate = vi.fn(async (request: string) => engine().evaluate_selected_audience(request));
      const f = fixture(evaluate);
      if (problem === 'missing-disclosure') {
        delete (f.current().disclosure as unknown as Record<string, unknown>).foreign_receive;
      }
      if (problem === 'wrong-viewer') f.current().viewerId = 'another-viewer';
      if (problem === 'duplicate-contribution') {
        const contribution = f.current().documents[0]!.identity.contribution_id;
        f.current().documents[1]!.identity.contribution_id = contribution;
        f.current().selections[1]!.identity.contribution_id = contribution;
      }
      const pane = mountSelectedAudienceWorkspace(
        f.root,
        f.session,
        f.host,
        problem === 'request-limit' ? 1 : 1_048_576,
      );
      await pane.ready;
      expect(evaluate).not.toHaveBeenCalled();
      expect(f.root.textContent).toContain('The selected audience is unavailable.');
      expect(f.root.textContent).not.toContain('Foreign receive: GBR');
      expect(f.write).not.toHaveBeenCalled();
      assertNoPrivateMaterial(f.root, f.current());
      pane.destroy();
      f.root.remove();
    },
  );

  test('a malformed reply cannot render document text even when the host granted the axes', async () => {
    const evaluate = vi.fn(async (request: string) => {
      const response = JSON.parse(engine().evaluate_selected_audience(request)) as {
        foreign_receive: { value: string[] };
      };
      response.foreign_receive.value = [markingA];
      return JSON.stringify(response);
    });
    const f = fixture(evaluate);
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await pane.ready;
    expect(evaluate).toHaveBeenCalledOnce();
    expect(f.root.textContent).toContain('The selected audience is unavailable.');
    assertNoPrivateMaterial(f.root, f.current());
    expect(f.write).not.toHaveBeenCalled();
    pane.destroy();
    f.root.remove();
  });

  test.each(['foreign_receive', 'foreign_show', 'foreign_display_only', 'implied_usa'] as const)(
    'a malformed %s value cannot echo private source text',
    async (axis) => {
      const evaluate = vi.fn(async (request: string) => {
        const response = JSON.parse(engine().evaluate_selected_audience(request)) as Record<
          typeof axis,
          { value: unknown }
        >;
        response[axis].value = axis === 'implied_usa' ? 'PRIVATE_SECRET' : ['PRIVATE_SECRET'];
        return JSON.stringify(response);
      });
      const f = fixture(evaluate);
      f.current().documents[0]!.source += '\n\n(U) PRIVATE_SECRET';
      const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
      await pane.ready;
      expect(evaluate).toHaveBeenCalledOnce();
      expect(f.root.textContent).toContain('The selected audience is unavailable.');
      expect(f.root.outerHTML).not.toContain('PRIVATE_SECRET');
      pane.destroy();
      f.root.remove();
    },
  );

  test('an oversized response is unavailable without rendering its contents', async () => {
    const evaluate = vi.fn(
      async (request: string) => `${engine().evaluate_selected_audience(request)}${' '.repeat(65_537)}`,
    );
    const f = fixture(evaluate);
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await pane.ready;
    expect(evaluate).toHaveBeenCalledOnce();
    expect(f.root.textContent).toContain('The selected audience is unavailable.');
    expect(f.root.textContent).not.toContain('Foreign receive: GBR');
    assertNoPrivateMaterial(f.root, f.current());
    pane.destroy();
    f.root.remove();
  });

  test('an unsupported audience group stays unavailable instead of becoming a recipient', async () => {
    const evaluate = vi.fn(async (request: string) => engine().evaluate_selected_audience(request));
    const f = fixture(evaluate);
    const next = f.current();
    next.documents = [next.documents[0]!];
    next.documents[0]!.source = '(S//REL TO USA, FVEY)';
    next.selections = [
      {
        identity: { ...next.documents[0]!.identity },
        span: [0, new TextEncoder().encode(next.documents[0]!.source).length],
      },
    ];
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await pane.ready;
    const text = f.root.textContent ?? '';
    expect(text).toContain('Selected query: Unavailable');
    expect(text).toContain('Foreign receive: Unavailable');
    expect(text).not.toContain('FVEY');
    assertNoPrivateMaterial(f.root, next);
    pane.destroy();
    f.root.remove();
  });

  test.each(['EU', 'ACGU', 'NATO', 'AX2', 'AUSTRALIA_GROUP'] as const)(
    'retains the actual engine audience member %s without expanding it',
    async (member) => {
      const evaluate = vi.fn(async (request: string) => engine().evaluate_selected_audience(request));
      const f = fixture(evaluate);
      const next = f.current();
      next.documents = [next.documents[0]!];
      next.documents[0]!.source = `(S//REL TO USA, ${member})`;
      next.selections = [
        {
          identity: { ...next.documents[0]!.identity },
          span: [0, new TextEncoder().encode(next.documents[0]!.source).length],
        },
      ];
      const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
      await pane.ready;
      const text = f.root.textContent ?? '';
      expect(text).toContain(`Foreign receive: ${member} (Exact; participates).`);
      expect(text).toContain(`Foreign show: ${member} (Exact; participates).`);
      expect(text).toContain('Display only: None (Exact; participates).');
      expect(text).toContain('This assessment does not authorize release or establish document readiness.');
      assertNoPrivateMaterial(f.root, next);
      pane.destroy();
      f.root.remove();
    },
  );

  test.each(scopeChanges)('withholds a late answer when %s changes during real evaluation', async (change) => {
    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const evaluate = vi.fn(async (request: string) => {
      const answer = engine().evaluate_selected_audience(request);
      await hold;
      return answer;
    });
    const f = fixture(evaluate);
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await vi.waitFor(() => expect(evaluate).toHaveBeenCalledOnce());
    const next = structuredClone(f.current());
    changeScope(next, change);
    f.set(next);
    release!();
    await pane.ready;
    expect(f.root.textContent).not.toContain('Foreign receive: GBR');
    expect(f.root.textContent).not.toContain('Foreign show: AFG, CAN, GBR');
    assertNoPrivateMaterial(f.root, next);
    pane.destroy();
    f.root.remove();
  });

  test.each(bindingFields)('withholds a late answer when session %s changes', async (field) => {
    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const evaluate = vi.fn(async (request: string) => {
      const answer = engine().evaluate_selected_audience(request);
      await hold;
      return answer;
    });
    const f = fixture(evaluate);
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await vi.waitFor(() => expect(evaluate).toHaveBeenCalledOnce());
    (f.session as unknown as Record<string, unknown>)[field] = '0'.repeat(64);
    release!();
    await pane.ready;
    expect(f.root.textContent).toContain('The selected audience is unavailable.');
    expect(f.root.textContent).not.toContain('Foreign receive: GBR');
    assertNoPrivateMaterial(f.root, f.current());
    pane.destroy();
    f.root.remove();
  });

  test.each(scopeChanges)('clears an earlier answer when %s changes during a pending refresh', async (change) => {
    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const evaluate = vi.fn(async (request: string) => {
      const answer = engine().evaluate_selected_audience(request);
      calls++;
      if (calls === 2) await hold;
      return answer;
    });
    const f = fixture(evaluate);
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await pane.ready;
    expect(f.root.textContent).toContain('Foreign receive: GBR');
    const refreshing = pane.refresh();
    expect(f.root.textContent).not.toContain('Foreign receive: GBR');
    await vi.waitFor(() => expect(evaluate).toHaveBeenCalledTimes(2));
    const next = structuredClone(f.current());
    changeScope(next, change);
    f.set(next);
    release!();
    await refreshing;
    expect(f.root.textContent).toContain('The selected audience is unavailable.');
    expect(f.root.textContent).not.toContain('Foreign receive: GBR');
    assertNoPrivateMaterial(f.root, next);
    pane.destroy();
    f.root.remove();
  });

  test('a watcher revokes an already rendered answer immediately', async () => {
    const evaluate = vi.fn(async (request: string) => engine().evaluate_selected_audience(request));
    const f = fixture(evaluate);
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await pane.ready;
    expect(f.root.textContent).toContain('Foreign receive: GBR');
    f.invalidate();
    expect(f.root.textContent).not.toContain('Foreign receive: GBR');
    expect(f.root.textContent).not.toContain('Foreign show: AFG, CAN, GBR');
    pane.destroy();
    f.root.remove();
  });

  test('a watcher revokes an in-flight answer even if the provider repeats the old scope', async () => {
    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const evaluate = vi.fn(async (request: string) => {
      const answer = engine().evaluate_selected_audience(request);
      await hold;
      return answer;
    });
    const f = fixture(evaluate);
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await vi.waitFor(() => expect(evaluate).toHaveBeenCalledOnce());
    f.invalidate();
    release!();
    await pane.ready;
    expect(f.root.textContent).toContain('The selected audience is unavailable.');
    expect(f.root.textContent).not.toContain('Foreign receive: GBR');
    assertNoPrivateMaterial(f.root, f.current());
    pane.destroy();
    f.root.remove();
  });

  test('refresh is single-flight, while invalidation immediately clears the pending view', async () => {
    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const evaluate = vi.fn(async (request: string) => {
      const answer = engine().evaluate_selected_audience(request);
      await hold;
      return answer;
    });
    const f = fixture(evaluate);
    const pane = mountSelectedAudienceWorkspace(f.root, f.session, f.host, 1_048_576);
    await vi.waitFor(() => expect(evaluate).toHaveBeenCalledOnce());
    const button = f.root.querySelector('button')!;
    expect(button.disabled).toBe(true);
    await Promise.all(Array.from({ length: 8 }, () => pane.refresh()));
    expect(evaluate).toHaveBeenCalledOnce();
    f.invalidate();
    expect(f.root.textContent).toContain('The selected audience is unavailable.');
    release!();
    await pane.ready;
    expect(button.disabled).toBe(false);
    expect(f.root.textContent).not.toContain('Foreign receive: GBR');
    await pane.refresh();
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(f.root.textContent).toContain('Foreign receive: GBR (Exact; participates).');
    assertNoPrivateMaterial(f.root, f.current());
    pane.destroy();
    f.root.remove();
  });

  test('the Office entry selects the read-only provider without sample fallback or writes', async () => {
    const evaluate = vi.fn(async (request: string) => engine().evaluate_selected_audience(request));
    const f = fixture(evaluate);
    document.body.innerHTML = '<div id="pane"></div><div id="note"></div><div id="sample"></div>';
    window.marqueOfficeWorkspace = {
      provider: { openWord: async () => f.session },
      wordHost: f.host,
      nativeMaxBytes: 1_048_576,
    };
    let start!: (info: { host: string }) => Promise<void>;
    vi.stubGlobal('Office', {
      HostType: { Word: 'Word' },
      onReady: (callback: typeof start) => {
        start = callback;
      },
    });
    await import('../../../../apps/office-addin/src/taskpane.ts');
    await start({ host: 'Word' });
    const pane = document.querySelector<HTMLElement>('#pane')!;
    await vi.waitFor(() => expect(pane.textContent).toContain('Foreign receive: GBR'));
    expect(pane.textContent).not.toContain('Needs you');
    expect(f.write).not.toHaveBeenCalled();
    assertNoPrivateMaterial(pane, f.current());
    delete window.marqueOfficeWorkspace;
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });
});
