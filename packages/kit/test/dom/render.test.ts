// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

// The decided rules (docs/DECISIONS.md) as they reach the DOM, on the memo.
// `pnpm test` (vp test, happy-dom)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vite-plus/test';
import { render as mark, masked } from '../../src/marking.ts';
import { artifact, card, gate, mount, pane, receipt, rung, UNDO_MS } from '../../src/render.ts';
import { why } from '../../src/help.ts';
import {
  appendAct,
  acceptedReplacements,
  docView,
  empty,
  record,
  snapshot,
  writeConfirmationToken,
} from '@knitli/marque-kit-core/state';
import type {
  ActAppendRequest,
  AppendActResult,
  Doc,
  EvaluationBasis,
  FindingView,
  Moment,
  State,
} from '@knitli/marque-kit-core/types';

// By path: under happy-dom, URL is the page's, and won't open a file.
const memo = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../../fixtures/memo.findings.json'), 'utf8'),
) as Doc;
const P2 = 'f-p2-rel-to-separator',
  P3 = 'f-p3-ownership',
  P4 = 'f-p4-portion-mark-absent',
  P5 = 'f-p5-noforn-rel-conflict';
const doc = docView(memo, empty());
const f = (id: string, d: Doc = doc): FindingView => d.findings.find((x) => x.id === id)!;
const buttons = (n: Element): string[] => [...n.querySelectorAll('button')].map((b) => b.textContent ?? '');
const asking = doc.findings.filter((x) => x.asks);
const inMemoryAppender = (initial: State = empty()) => {
  let state = initial;
  return {
    get state() {
      return state;
    },
    append: async (request: ActAppendRequest): Promise<AppendActResult> => {
      const result = appendAct(state, request);
      state = result.state;
      return result;
    },
  };
};
const flushAppend = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('question first', () => {
  test.each(asking.map((x) => [x.id, x]))('%s: the question is the heading, before what Marque says', (_, x) => {
    const c = card(x);
    const h = c.querySelector('h3.mq-q');
    expect(h?.textContent).toBe(x.asks!.text);
    const said = [...c.querySelectorAll('p.mq-p')].find((p) => p.textContent === x.says.text);
    expect(said).toBeTruthy();
    expect(h!.compareDocumentPosition(said!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the pane follows the cursor (DECISIONS #8)', () => {
  test('update({ open }) opens that card and leaves focus in the document; null closes it', async () => {
    // happy-dom lays nothing out: give the pane and its parent room for a card (the kit's floor is 240px).
    const box = document.createElement('div'),
      root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const outside = Object.assign(document.createElement('input'), { id: 'word' });
    document.body.append(outside);
    outside.focus();
    const opened: (string | null)[] = [];
    const p = mount(root, { doc: memo, onOpen: (x) => opened.push(x?.id ?? null) });
    const row = () => root.querySelector(`.mq-row-item[data-finding="${P3}"]`);
    p.update({ open: P3 });
    await new Promise((r) => setTimeout(r));
    expect(row()?.classList.contains('open')).toBe(true);
    expect(document.activeElement).toBe(outside);
    p.update({ open: null });
    await new Promise((r) => setTimeout(r));
    expect(row()?.classList.contains('open')).toBe(false);
    expect(opened).toEqual([P3, null]);
    p.destroy();
    box.remove();
    outside.remove();
  });
});

describe('a free answer and "Not my call" are always there', () => {
  for (const moment of ['editing', 'finalize', 'send'] as Moment[])
    test.each(asking.map((x) => [x.id, x]))(`%s at ${moment}`, (_, x) => {
      const c = card(x, { moment, onAct: () => {} });
      expect(c.querySelector('form.mq-ask input[type=text]')).toBeTruthy();
      expect(buttons(c)).toContain('Not my call');
      // Blocking is the same card with defer removed.
      expect(buttons(c).includes('Ask me at finalize')).toBe(rung(x, moment) !== 'blocking');
    });
});

describe('no Undo on a fix the person must own', () => {
  test.each([P3, P4])('%s offers no Keep as written and no Undo', (id) => {
    expect(buttons(card(f(id)))).not.toEqual(expect.arrayContaining(['Keep as written']));
    expect(buttons(card(f(id)))).not.toContain('Undo');
  });
  test.each([P2, P5])('%s, Noticeable or Advisory, can be kept as written', (id) => {
    expect(buttons(card(f(id), { onAct: () => {} }))).toContain('Keep as written');
  });
});

describe('an override is recorded, never hidden', () => {
  const s = record(empty(), P2, 'kept_as_written', null, 't0', snapshot(f(P2)));
  const d = docView(memo, s);
  test('the card says it will be reported', () => {
    expect(card(f(P2, d)).textContent).toContain('Kept as written. Marque will report it.');
  });
  test('the receipt lists it', () => {
    expect(receipt(d).textContent).toContain('kept as written');
  });
});

describe('gold is must-act only', () => {
  for (const moment of ['editing', 'finalize'] as Moment[])
    test.each(doc.findings.map((x) => [x.id, x]))(`%s at ${moment}`, (_, x) => {
      const r = rung(x, moment);
      const c = card(x, { moment });
      if (c.classList.contains('must-act')) expect(['action', 'blocking']).toContain(r);
      if (r === 'quiet' || r === 'noticeable') expect(c.querySelector('.must-act, .mq-stamp.attn')).toBeNull();
    });
});

describe('masks', () => {
  const text = '(S//REL TO USA, GBR)';
  test('a concealed span is drawn as a mask, and its bytes are gone', () => {
    const m = mark({ text, masks: [{ kind: 'concealed', span: [16, 19] }] });
    expect(m.textContent).not.toContain('GBR');
    expect(m.querySelector('.mq-conceal')?.textContent).toBe('███');
  });
  test('mismatched tokens and covered fragment metadata do not escape visible, copy or accessible output', () => {
    const m = mark({
      text: 'PUBLIC HIDE END',
      layers: [{ tokens: [{ t: 'PUBLIC HIDE END-CANARY', help: 'CANARY-HELP' }] }],
      masks: [{ kind: 'concealed', span: [7, 11] }],
    });
    expect(m.textContent).toBe('PUBLIC ████ END');
    expect(m.outerHTML).not.toContain('CANARY');
    expect(m.outerHTML).not.toContain('HIDE');
    expect(m.getAttribute('aria-label')).not.toContain('HIDE');
    expect(m.dataset.text).toBe('PUBLIC  END');
  });
  test('partial token metadata cannot identify masked content', () => {
    const m = mark({
      text: 'PUBLIC HIDE END',
      layers: [{ tokens: [{ t: 'PUBLIC HIDE END', help: 'HIDE' }] }],
      masks: [{ kind: 'concealed', span: [7, 11] }],
    });
    expect(m.outerHTML).not.toContain('HIDE');
    expect(m.textContent).toBe('PUBLIC ████ END');
  });
  test('unbound inline mask suppresses ambiguous text', () => {
    const m = mark({
      text: 'PUBLIC SECRET END',
      layers: [{ tokens: [{ t: 'PUBLIC ' }, { t: '', mask: { kind: 'concealed', len: 2 } }, { t: 'END' }] }],
      masks: [],
    });
    expect(m.outerHTML).not.toContain('SECRET');
    expect(m.dataset.text).toBe('');
  });
  test('a mask with neither span nor layer is drawn at the end, and kept in the plain text', () => {
    const m = mark({ text, masks: [{ kind: 'concealed', len: 3 }] });
    expect(m.querySelector('.mq-conceal')?.textContent).toBe('███');
    expect(masked({ text, masks: [{ kind: 'concealed', len: 3 }] })).toBe(`${text}███`);
  });
});

describe('no internal id reaches a person', () => {
  const ids = [...memo.findings, ...memo.document.artifacts].map((x) => x.id);
  test('the pane', () => {
    const t = pane(doc).textContent ?? '';
    for (const id of ids) expect(t).not.toContain(id);
  });
  test('the gate, cards open', () => {
    const t = gate(doc, { moment: 'finalize' }).textContent ?? '';
    for (const id of ids) expect(t).not.toContain(id);
  });
  test('the gate never claims readiness without current complete evaluation and host confirmation', () => {
    const b: EvaluationBasis = {
      sourceRevisions: { document: 'source' },
      selectionRevision: 'selection',
      relationshipRevision: 'relations',
      contextRevision: 'context',
      policyRevision: 'policy',
      declarationsRevision: 'declarations',
      scope: 'document',
      operation: 'send',
      evaluationContextRevision: 'send',
      targetProfile: 'default',
      questionRevisions: {},
      artifactRevisions: {},
      replacements: {},
    };
    const readyDoc: Doc = {
      findings: [],
      document: {
        blocking: [],
        artifacts: [],
        pending: [],
        awaitingWrites: [],
        evaluation: { basis: b, completion: 'complete', requirements: [], snapshotReady: true },
      },
    };
    const host = { moment: 'finalize' as const, currentBasis: b };
    expect(gate(readyDoc, host).textContent).toContain('Ready to finalize.');

    const incomplete = {
      ...readyDoc,
      document: {
        ...readyDoc.document,
        evaluation: { ...readyDoc.document.evaluation!, completion: 'incomplete' as const, snapshotReady: false },
      },
    };
    const missing = { ...readyDoc, document: { ...readyDoc.document, evaluation: undefined } };
    const stale = {
      ...readyDoc,
      document: {
        ...readyDoc.document,
        evaluation: { ...readyDoc.document.evaluation!, basis: { ...b, contextRevision: 'changed' } },
      },
    };
    const awaitingWrite = { ...readyDoc, document: { ...readyDoc.document, awaitingWrites: ['f-p3@0'] } };
    const failedCheckHost = {
      ...host,
      requiredAcceptanceChecks: ['outgoing-saved'],
      acceptanceChecks: {
        'outgoing-saved': writeConfirmationToken('outgoing-saved', { ...b, contextRevision: 'old' })!,
      },
    };
    for (const [candidate, candidateHost] of [
      [incomplete, host],
      [missing, host],
      [stale, host],
      [awaitingWrite, host],
      [readyDoc, failedCheckHost],
    ] as const) {
      const text = gate(candidate, candidateHost).textContent ?? '';
      expect(text).toContain('Not ready.');
      expect(text).not.toContain('Ready to finalize.');
    }
  });
  test('the banner shows only a matching joint preview, never per-answer composition', () => {
    const banner = doc.document.artifacts.find((a) => a.kind === 'front_marking')!;
    const b: EvaluationBasis = {
      sourceRevisions: { document: 'source' },
      selectionRevision: 'selection',
      relationshipRevision: 'relations',
      contextRevision: 'context',
      policyRevision: 'policy',
      declarationsRevision: 'declarations',
      scope: 'document',
      operation: 'send',
      evaluationContextRevision: 'send',
      targetProfile: 'default',
      questionRevisions: { [P5]: 'q1' },
      artifactRevisions: {},
      replacements: {},
    };
    const joint = { ...banner, jointPreview: { status: 'complete' as const, basis: b, result: banner.derived_value! } };
    const d: Doc = {
      ...doc,
      document: {
        ...doc.document,
        evaluation: {
          basis: { ...b, replacements: {} },
          completion: 'complete',
          requirements: [],
          snapshotReady: false,
          jointPreview: { status: 'complete', basis: b },
        },
      },
    };
    expect(artifact(joint, { currentBasis: d.document.evaluation!.basis }, d).textContent).toContain(
      'If the accepted answers are taken together:',
    );
    expect(artifact(joint).textContent).not.toContain('If the accepted answers are taken together:');
    const reading = f(P5).outcome.readings![0]!;
    const pendingBasis = { ...b, replacements: { [P5]: { kind: 'reading' as const, reading } } };
    const pendingDoc: Doc = {
      ...d,
      document: {
        ...d.document,
        artifacts: d.document.artifacts.map((a) =>
          a.id === 'a-cab'
            ? {
                ...a,
                evaluationBasis: b,
                fields: Object.fromEntries(
                  Object.entries(a.fields ?? {}).map(([key, value]) => [key, { ...value, evaluationBasis: b }]),
                ),
              }
            : a,
        ),
        evaluation: { ...d.document.evaluation!, jointPreview: { status: 'complete' as const, basis: pendingBasis } },
      },
    };
    const answerState = record(empty(), P5, 'changed', { reading, index: 0 }, 'accepted');
    const acceptedDoc = docView(pendingDoc, answerState);
    const pendingJoint = {
      ...joint,
      jointPreview: { status: 'complete' as const, basis: pendingBasis, result: banner.derived_value! },
    };
    expect(artifact(pendingJoint, { currentBasis: b }, acceptedDoc).textContent).toContain(
      'If the accepted answers are taken together:',
    );
    const cabStart = docView(pendingDoc, answerState).document.artifacts.find((x) => x.id === 'a-cab')!;
    const firstCabField = record(
      answerState,
      'a-cab',
      'answered',
      { fields: { derived_from: 'Source A, 20240115' } },
      'cab-field-1',
      snapshot(cabStart),
    );
    const secondCabField = docView(pendingDoc, firstCabField).document.artifacts.find((x) => x.id === 'a-cab')!;
    const withCabFields = record(
      firstCabField,
      'a-cab',
      'answered',
      { fields: { declassify_on: '20490115' } },
      'cab-field-2',
      snapshot(secondCabField),
    );
    const cabReplacements = {
      [P5]: { kind: 'reading' as const, reading },
      'a-cab.derived_from': { kind: 'artifact_field' as const, field: 'derived_from', value: 'Source A, 20240115' },
      'a-cab.declassify_on': { kind: 'artifact_field' as const, field: 'declassify_on', value: '20490115' },
    };
    const cabBasis = { ...b, replacements: cabReplacements };
    const cabDoc = docView(
      {
        ...pendingDoc,
        document: {
          ...pendingDoc.document,
          evaluation: {
            ...pendingDoc.document.evaluation!,
            jointPreview: { status: 'complete' as const, basis: cabBasis },
          },
        },
      },
      withCabFields,
    );
    expect(acceptedReplacements(cabDoc)).toEqual(cabReplacements);
    const cabArtifact = cabDoc.document.artifacts.find((x) => x.id === 'a-cab')!;
    const cabJoint = {
      ...cabArtifact,
      jointPreview: { status: 'complete' as const, basis: cabBasis, result: { fields: cabReplacements } },
    };
    expect(artifact(cabJoint, { currentBasis: b }, cabDoc).textContent).toContain(
      'If the accepted answers are taken together:',
    );
    const changedContext = { ...b, contextRevision: 'changed' };
    const changedCabInput: Doc = {
      ...pendingDoc,
      document: {
        ...pendingDoc.document,
        artifacts: pendingDoc.document.artifacts.map((a) =>
          a.id === 'a-cab'
            ? {
                ...a,
                evaluationBasis: changedContext,
                fields: Object.fromEntries(
                  Object.entries(a.fields ?? {}).map(([key, value]) => [
                    key,
                    { ...value, evaluationBasis: changedContext },
                  ]),
                ),
              }
            : a,
        ),
        evaluation: { ...pendingDoc.document.evaluation!, basis: changedContext },
      },
    };
    const changedCabView = docView(changedCabInput, withCabFields);
    expect(
      (changedCabView.document.artifacts.find((x) => x.id === 'a-banner')!.derived_value as { text: string }).text,
    ).toBe((cabDoc.document.artifacts.find((x) => x.id === 'a-banner')!.derived_value as { text: string }).text);
    expect(Object.keys(acceptedReplacements(changedCabView)).filter((key) => key.startsWith('a-cab.'))).toEqual([]);
    const takeBack = record(answerState, P5, 'changed', null, 'take-back');
    expect(artifact(pendingJoint, { currentBasis: b }, docView(pendingDoc, takeBack)).textContent).not.toContain(
      'If the accepted answers are taken together:',
    );
    const staleBasis = { ...b, contextRevision: 'changed' };
    const staleJoint = { ...joint, jointPreview: { ...joint.jointPreview!, basis: staleBasis } };
    const stale = {
      ...d,
      document: {
        ...d.document,
        evaluation: {
          ...d.document.evaluation!,
          basis: staleBasis,
          jointPreview: { status: 'complete' as const, basis: staleBasis },
        },
      },
    };
    expect(artifact(staleJoint, { currentBasis: b }, stale).textContent).not.toContain(
      'If the accepted answers are taken together:',
    );
  });
});

test('the receipt counts one finding as one', () => {
  expect(receipt({ ...doc, findings: [f(P2)] }).textContent).toContain('1 finding ·');
});

test('a citation without the manual’s words cites and quotes nothing', () => {
  const x = f(P2);
  const c = why({ ...x, says: { ...x.says, citation: { ...x.says.citation!, short: undefined } } });
  expect(c.querySelector('blockquote')).toBeNull();
  expect(c.textContent).not.toContain('undefined');
  expect(c.querySelector('.mq-cite')).toBeTruthy();
});

describe('the undo window (DECISIONS #23)', () => {
  const setup = () => {
    const box = document.createElement('div'),
      root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const host = inMemoryAppender();
    const p = mount(root, { doc: memo, state: host.state, onAppend: host.append });
    const answer = async () => {
      const x = p.view()!.findings.find((y) => y.id === P3)!;
      p.host.onAct?.(x, 'answered', { reading: x.outcome!.readings![0]! });
      await flushAppend();
    };
    return { root, p, answer, host, done: () => (p.destroy(), box.remove()) };
  };
  const strip = (root: Element) => root.querySelector(`.mq-undo[data-undo="${P3}"]`);

  test('an answer leaves Undo in its place for 8 seconds; a redraw keeps it there', async () => {
    vi.useFakeTimers();
    const { root, p, answer, done } = setup();
    await answer();
    expect(strip(root)?.textContent).toContain('Answered');
    expect(buttons(strip(root)!)).toEqual(['Undo']);
    // ¶3 was all Action required held while editing: its section went with it, so the strip stands where it was.
    const top = () => strip(root)!.parentElement!.nextElementSibling;
    expect(top()?.matches('.mq-section.can')).toBe(true);
    p.update({ moment: 'editing' });
    expect(top()?.matches('.mq-section.can')).toBe(true);
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(strip(root)).toBeTruthy();
    vi.advanceTimersByTime(1);
    expect(strip(root)).toBeNull();
    done();
    vi.useRealTimers();
  });

  test('hovering stops the clock; leaving starts it again with what was left', async () => {
    vi.useFakeTimers();
    const { root, answer, done } = setup();
    await answer();
    vi.advanceTimersByTime(5000);
    strip(root)!.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(60_000);
    expect(strip(root)).toBeTruthy();
    strip(root)!.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(UNDO_MS - 5000);
    expect(strip(root)).toBeNull();
    done();
    vi.useRealTimers();
  });

  test('Undo on an answer to a must-act question brings the question back', async () => {
    const { root, p, answer, done } = setup();
    await answer();
    strip(root)!.querySelector('button')!.click();
    await flushAppend();
    expect(strip(root)).toBeNull();
    expect(p.view()!.findings.find((y) => y.id === P3)!.asks).toBeTruthy();
    await new Promise((r) => setTimeout(r));
    expect(root.querySelector(`.mq-row-item[data-finding="${P3}"]`)?.classList.contains('open')).toBe(true);
    done();
  });

  test('deferred where its section stays: the strip stays beside it, and focus on Undo survives a redraw', async () => {
    vi.useFakeTimers();
    const { root, p, done } = setup();
    const x = p.view()!.findings.find((y) => y.id === P3)!;
    p.update({ moment: 'finalize' });
    p.host.onAct?.(x, 'declined');
    await flushAppend();
    expect(strip(root)?.closest('.mq-section')).toBeTruthy();
    const undo = strip(root)!.querySelector('button')!;
    undo.focus();
    p.update({ moment: 'finalize' });
    expect(document.activeElement).toBe(undo);
    vi.advanceTimersByTime(60_000);
    expect(strip(root)).toBeTruthy();
    done();
    vi.useRealTimers();
  });

  test('a re-lint that asks something new under the same id takes the strip away', async () => {
    const { root, p, answer, done } = setup();
    await answer();
    const asks = { ...f(P3).asks!, text: 'Whose information is this now?' };
    p.update({ doc: { ...memo, findings: memo.findings.map((x) => (x.id === P3 ? { ...x, asks } : x)) } });
    expect(strip(root)).toBeNull();
    done();
  });

  test('redrawing a form cannot select an indistinguishable or unbound reading on the person’s behalf', async () => {
    const { root, p, done } = setup();
    const changed = structuredClone(memo);
    const target = changed.findings.find((item) => item.id === P3)!;
    const reading = target.outcome.readings![0]!;
    target.outcome.readings = [reading, structuredClone(reading)];
    const redraw = async () => {
      p.update({ doc: changed, open: P3 });
      await new Promise((resolve) => setTimeout(resolve));
    };
    const radios = () => [...root.querySelectorAll<HTMLInputElement>('input[type=radio]')];
    const choose = (index: number) => {
      const input = radios()[index]!;
      input.checked = true;
      input.dispatchEvent(new Event('change'));
    };
    await redraw();
    choose(1);
    await redraw();
    expect(radios().some((input) => input.checked)).toBe(false);
    const result = reading.result!;
    reading.result = { ...result, masks: [{ kind: 'concealed', span: [1, 2] }] };
    target.outcome.readings = [reading];
    await redraw();
    choose(0);
    await redraw();
    expect(radios()[0]?.checked).toBe(false);
    done();
  });

  test('a re-lint that conceals a code in the answer masks it in the strip too', async () => {
    const { root, p, answer, done } = setup();
    const evaluationBasis: EvaluationBasis = {
      sourceRevisions: { memo: 'r1' },
      selectionRevision: 'selection',
      relationshipRevision: 'relations',
      contextRevision: 'context',
      policyRevision: 'policy',
      declarationsRevision: 'declarations',
      scope: 'paragraph3',
      operation: 'query',
      evaluationContextRevision: 'evaluation',
      targetProfile: 'memo',
      questionRevisions: { [P3]: 'q1' },
      artifactRevisions: {},
      replacements: {},
    };
    p.update({ doc: { ...memo, findings: memo.findings.map((x) => (x.id === P3 ? { ...x, evaluationBasis } : x)) } });
    await answer();
    const r = f(P3).outcome!.readings![0]!.result!;
    const at = r.text.indexOf('AUS');
    const result = { ...r, masks: [{ kind: 'concealed' as const, span: [at, at + 3] as [number, number] }] };
    const settled = {
      ...f(P3),
      evaluationBasis,
      asks: undefined,
      needs_person: 'none' as const,
      blocks: 'never' as const,
      outcome: { ...f(P3).outcome!, kind: 'applied' as const, result },
    };
    p.update({
      doc: { ...memo, findings: memo.findings.map((x) => (x.id === P3 ? settled : x)) },
      linted: p.state.log.length,
    });
    expect(strip(root)?.querySelector('.mq-conceal')).toBeTruthy();
    expect(strip(root)?.querySelector('.mq-l')?.textContent).not.toContain('AUS');
    done();
  });

  test('from the keyboard, Undo puts focus back on the reopened card', async () => {
    const { root, answer, done } = setup();
    await answer();
    const undo = strip(root)!.querySelector('button')!;
    undo.focus();
    undo.click();
    await new Promise((r) => setTimeout(r));
    expect(root.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.closest(`[data-finding="${P3}"]`)).toBeTruthy();
    done();
  });

  test('kept as written from Done: the section opens to show Undo, and the marking is full size', async () => {
    const { root, p, done } = setup();
    p.host.onAct?.(
      p.view()!.findings.find((y) => y.id === P2)!,
      'kept_as_written',
    );
    await flushAppend();
    const s = root.querySelector(`.mq-undo[data-undo="${P2}"]`)!;
    expect(s.closest('details')?.open).toBe(true);
    expect(s.querySelector('.mq-mark.xs')).toBeNull();
    done();
  });

  test('an apply is asked for, not done; a typed field gets no Undo', async () => {
    const { root, p, done } = setup();
    const art = (id: string) => p.view()!.document.artifacts.find((a) => a.id === id)!;
    p.host.onAct?.(art('a-banner'), 'answered', { apply: true });
    await flushAppend();
    expect(root.querySelector('.mq-undo[data-undo="a-banner"]')?.textContent).toContain('Will be applied');
    // A simulated host re-lint after apply removes the temporary strip.
    p.update({ doc: memo });
    expect(root.querySelector('.mq-undo[data-undo="a-banner"]')).toBeNull();
    p.host.onAct?.(art('a-cab'), 'answered', { fields: { derived_from: 'Memo 12' } });
    await flushAppend();
    expect(root.querySelector('.mq-undo[data-undo="a-cab"]')).toBeNull();
    done();
  });
});

describe('host-acknowledged append', () => {
  const clickAnswer = async (root: HTMLElement, p: ReturnType<typeof mount>) => {
    p.update({ open: P3 });
    await new Promise((resolve) => setTimeout(resolve));
    const radio = root.querySelector<HTMLInputElement>('form.mq-ask input[type="radio"]')!;
    radio.click();
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === 'Answer')!.click();
  };

  test('without an act owner, navigation and details remain but answer/edit actions are absent', async () => {
    const box = document.createElement('div');
    const root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const initial = empty();
    const p = mount(root, { doc: memo, state: initial });

    p.update({ open: P3 });
    await new Promise((resolve) => setTimeout(resolve));

    expect(p.state.log).toEqual(initial.log);
    expect(root.querySelector('.mq-card h3.mq-q')?.textContent).toContain('Who collected or produced');
    expect(root.querySelector('.mq-card form.mq-ask')).toBeNull();
    expect(root.querySelector('.mq-card input')).toBeNull();
    for (const action of ['Answer', 'Ask me at finalize', 'Not my call', 'Apply'])
      expect(buttons(root)).not.toContain(action);
    expect(root.querySelector('.mq-undo')).toBeNull();
    p.destroy();
    box.remove();
  });

  test('a read-only host with an append owner can route a question but cannot answer or take back writes', async () => {
    const box = document.createElement('div');
    const root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const saved = record(empty(), P3, 'answered', { free: 'saved answer' }, 't0', snapshot(f(P3)));
    const host = inMemoryAppender(saved);
    const p = mount(root, { doc: memo, state: saved, readOnly: true, onAppend: host.append });

    p.update({ open: P3 });
    await new Promise((resolve) => setTimeout(resolve));
    expect(root.querySelector('.mq-card input')).toBeNull();
    expect(buttons(root)).not.toContain('Answer');
    expect(buttons(root)).not.toContain('Change my answer');

    p.host.onTab?.('history');
    await new Promise((resolve) => setTimeout(resolve));
    expect(buttons(root)).not.toContain('Take back');
    p.destroy();
    box.remove();

    const nextBox = document.createElement('div');
    const nextRoot = document.createElement('div');
    for (const n of [nextBox, nextRoot]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    nextBox.append(nextRoot);
    document.body.append(nextBox);
    const routeHost = inMemoryAppender();
    const routed = mount(nextRoot, { doc: memo, state: routeHost.state, readOnly: true, onAppend: routeHost.append });
    routed.update({ open: P3 });
    await new Promise((resolve) => setTimeout(resolve));
    expect(nextRoot.querySelector('.mq-card input')).toBeNull();
    expect(buttons(nextRoot)).not.toContain('Answer');
    expect(buttons(nextRoot)).toContain('Not my call');
    nextRoot.querySelector<HTMLButtonElement>('.mq-acts button:last-child')!.click();
    await flushAppend();
    expect(routeHost.state.log.at(-1)?.act).toBe('declined');
    routed.destroy();
    nextBox.remove();
  });

  test('exhaustion keeps the request outside unchanged history and never dispatches a write', async () => {
    const box = document.createElement('div');
    const root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const prior = record(empty(), P2, 'kept_as_written', null, 't0', snapshot(f(P2)));
    const initial: State = {
      ...prior,
      actSequence: Number.MAX_SAFE_INTEGER,
      actHistoryCoverage: { state: 'complete', sequenceRange: [1, 1] },
    };
    const host = inMemoryAppender(initial);
    const binding = { documentId: 'memo-fixture', chain: 'chain-A' };
    const requests: ActAppendRequest[] = [];
    const dispatched: unknown[] = [];
    const p = mount(root, {
      doc: memo,
      state: initial,
      actBinding: binding,
      onAppend: async (request) => {
        requests.push(request);
        return host.append(request);
      },
      onChange: (_state, action) => {
        if (action) dispatched.push(action);
      },
    });

    await clickAnswer(root, p);
    await flushAppend();

    expect(requests).toHaveLength(1);
    expect(requests[0]?.binding).toEqual(binding);
    expect(host.state.log).toEqual(initial.log);
    expect(host.state.actSequence).toBe(Number.MAX_SAFE_INTEGER);
    expect(host.state.pendingAppends).toHaveLength(1);
    expect(host.state.pendingAppends?.[0]).toMatchObject({
      id: P3,
      sequence: null,
      state: 'pending_sequence',
      reason: 'sequence-exhausted',
    });
    expect(p.view()!.findings.find((x) => x.id === P3)?.asks).toBeTruthy();
    expect(root.querySelector('.mq-undo')).toBeNull();
    expect(root.textContent).toContain('This action remains pending outside history and has not been applied.');
    expect(dispatched).toEqual([]);
    p.destroy();
    box.remove();
  });

  test('a restarted pane retries exact staged requests and advances through the saved queue', async () => {
    const box = document.createElement('div');
    const root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const staged = [
      {
        requestId: 'restart-first',
        id: P3,
        act: 'answered' as const,
        value: null,
        at: 't1',
        about: snapshot(f(P3)),
        sequence: null,
        state: 'staged' as const,
      },
      {
        requestId: 'restart-second',
        id: P2,
        act: 'kept_as_written' as const,
        value: null,
        at: 't2',
        about: snapshot(f(P2)),
        sequence: null,
        state: 'staged' as const,
      },
    ];
    const initial: State = { ...empty(), pendingAppends: staged };
    const host = inMemoryAppender(initial);
    const requests: ActAppendRequest[] = [];
    const changes: unknown[] = [];
    const p = mount(root, {
      doc: memo,
      state: initial,
      onAppend: async (request) => {
        requests.push(structuredClone(request));
        return host.append(request);
      },
      onChange: (_state, action) => {
        if (action) changes.push(action);
      },
    });

    expect(root.textContent).toContain('A saved action is waiting to be recorded.');
    root.querySelector<HTMLButtonElement>('.mq-pane-foot button')!.click();
    await flushAppend();
    expect(requests.map((request) => request.requestId)).toEqual(['restart-first']);
    expect(p.state.pendingAppends?.map((item) => item.requestId)).toEqual(['restart-second']);
    expect(root.textContent).toContain('Another saved action is ready to retry.');

    root.querySelector<HTMLButtonElement>('.mq-pane-foot button')!.click();
    await flushAppend();
    expect(requests.map((request) => request.requestId)).toEqual(['restart-first', 'restart-second']);
    expect(host.state.log.map((entry) => entry.requestId)).toEqual(['restart-first', 'restart-second']);
    expect(p.state.pendingAppends).toEqual([]);
    expect(changes).toHaveLength(2);
    p.destroy();
    box.remove();
  });

  test('terminal sequence refusals stay visible while the pane advances to other staged requests', async () => {
    const box = document.createElement('div');
    const root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const stagedRequest = (requestId: string, id: string) => ({
      requestId,
      id,
      act: 'answered' as const,
      value: null,
      at: requestId,
      sequence: null,
      state: 'staged' as const,
    });
    const terminal = {
      ...stagedRequest('already-exhausted', P4),
      state: 'pending_sequence' as const,
      reason: 'sequence-exhausted' as const,
    };
    const initial: State = {
      ...empty(),
      actSequence: Number.MAX_SAFE_INTEGER,
      actHistoryCoverage: { state: 'complete', sequenceRange: [1, 1] },
      pendingAppends: [terminal, stagedRequest('exhausted-first', P3), stagedRequest('exhausted-second', P2)],
    };
    const host = inMemoryAppender(initial);
    const requests: string[] = [];
    const p = mount(root, {
      doc: memo,
      state: initial,
      onAppend: async (request) => {
        requests.push(request.requestId);
        return host.append(request);
      },
    });

    expect(root.textContent).toContain('sequence limit');
    expect(buttons(root)).toContain('Retry pending action');
    root.querySelector<HTMLButtonElement>('.mq-pane-foot button')!.click();
    await flushAppend();
    expect(requests).toEqual(['exhausted-first']);
    expect(root.textContent).toContain('Another saved action is ready to retry.');
    expect(buttons(root)).toContain('Retry pending action');

    root.querySelector<HTMLButtonElement>('.mq-pane-foot button')!.click();
    await flushAppend();
    expect(requests).toEqual(['exhausted-first', 'exhausted-second']);
    expect(root.textContent).toContain('sequence limit');
    expect(buttons(root)).not.toContain('Retry pending action');
    expect(p.state.pendingAppends?.filter((item) => item.state === 'pending_sequence')).toHaveLength(3);
    p.destroy();
    box.remove();
  });

  test('invalid committed acknowledgement never changes local history or dispatches a write', async () => {
    const box = document.createElement('div');
    const root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const host = inMemoryAppender();
    let malformed = true;
    const changes: unknown[] = [];
    const p = mount(root, {
      doc: memo,
      state: host.state,
      onAppend: async (request): Promise<AppendActResult> => {
        if (malformed) {
          malformed = false;
          const entry = { ...request, id: request.id!, sequence: 0, at: request.at ?? 'invalid-at' };
          return {
            status: 'committed',
            entry,
            replayed: false,
            state: {
              ...empty(),
              log: [entry],
              actSequence: 0,
              actHistoryCoverage: { state: 'complete', sequenceRange: null },
            },
          };
        }
        return host.append(request);
      },
      onChange: (_state, action) => {
        if (action) changes.push(action);
      },
    });

    await clickAnswer(root, p);
    await flushAppend();
    expect(p.state.log).toEqual([]);
    expect(changes).toEqual([]);
    expect(root.textContent).toContain('history position or ordered rows are invalid');
    expect(buttons(root)).toContain('Retry pending action');

    root.querySelector<HTMLButtonElement>('.mq-pane-foot button')!.click();
    await flushAppend();
    expect(p.state.log).toHaveLength(1);
    expect(changes).toHaveLength(1);
    p.destroy();
    box.remove();
  });

  test('missing history coverage and a request-key conflict get distinct retry explanations', async () => {
    const makeRoot = () => {
      const box = document.createElement('div');
      const root = document.createElement('div');
      for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
      box.append(root);
      document.body.append(box);
      return { box, root };
    };
    const missing = makeRoot();
    const noCoverage: State = { ...empty(), actHistoryCoverage: undefined };
    const coverageHost = inMemoryAppender(noCoverage);
    const coveragePane = mount(missing.root, { doc: memo, state: noCoverage, onAppend: coverageHost.append });
    await clickAnswer(missing.root, coveragePane);
    await flushAppend();
    expect(missing.root.textContent).toContain('no history coverage');
    expect(buttons(missing.root)).toContain('Retry pending action');
    expect(missing.root.textContent).not.toContain('request key conflicts');
    coveragePane.destroy();
    missing.box.remove();

    const conflict = makeRoot();
    const initial = empty();
    const conflictPane = mount(conflict.root, {
      doc: memo,
      state: initial,
      onAppend: async () => ({ status: 'refused', reason: 'request-id-conflict', state: initial }),
    });
    await clickAnswer(conflict.root, conflictPane);
    await flushAppend();
    expect(conflict.root.textContent).toContain('request key conflicts with a stored request');
    expect(buttons(conflict.root)).toContain('Retry pending action');
    expect(conflict.root.textContent).not.toContain('no history coverage');
    conflictPane.destroy();
    conflict.box.remove();
  });

  test('an ack-lost retry uses the same request and dispatches the exact replayed entry once', async () => {
    const box = document.createElement('div');
    const root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const host = inMemoryAppender();
    const requests: ActAppendRequest[] = [];
    const dispatches: NonNullable<Parameters<NonNullable<ReturnType<typeof mount>['host']['onChange']>>[1]>[] = [];
    let loseAck = true;
    const p = mount(root, {
      doc: memo,
      state: host.state,
      onAppend: async (request) => {
        requests.push(structuredClone(request));
        if (loseAck) {
          loseAck = false;
          const committed = await host.append(request);
          expect(committed.status).toBe('committed');
          throw new Error('simulated lost acknowledgement');
        }
        return host.append(request);
      },
      onChange: (_state, action) => {
        if (action) dispatches.push(action);
      },
    });

    await clickAnswer(root, p);
    await flushAppend();
    expect(host.state.log).toHaveLength(1);
    expect(p.state.log).toHaveLength(0);
    expect(dispatches).toHaveLength(0);
    expect(root.textContent).toContain('retry will use the same request');

    root.querySelector<HTMLButtonElement>('.mq-pane-foot button')!.click();
    await flushAppend();

    expect(requests).toHaveLength(2);
    expect(requests[1]?.requestId).toBe(requests[0]?.requestId);
    expect(host.state.log).toHaveLength(1);
    expect(p.state.log).toHaveLength(1);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toMatchObject({
      id: P3,
      requestId: requests[0]?.requestId,
      entry: host.state.log[0],
      replayed: true,
    });
    p.destroy();
    box.remove();
  });

  test('an unrelated seen update survives an acknowledgement started from an older state', async () => {
    const box = document.createElement('div');
    const root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const host = inMemoryAppender();
    let release!: () => void;
    const p = mount(root, {
      doc: memo,
      state: host.state,
      onAppend: async (request) => {
        const result = await host.append(request);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return result;
      },
    });

    p.update({ open: P3 });
    await new Promise((resolve) => setTimeout(resolve));
    root.querySelector<HTMLInputElement>('form.mq-ask input[type="radio"]')!.click();
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === 'Answer')!.click();
    await flushAppend();

    p.update({ open: P2 });
    await new Promise((resolve) => setTimeout(resolve));
    const seen = p.state.seen.find((item) => item.id === P2);
    expect(seen).toBeTruthy();
    expect(host.state.seen).toEqual([]);

    release();
    await flushAppend();
    expect(p.state.log).toHaveLength(1);
    expect(p.state.seen).toContainEqual(seen);
    p.destroy();
    box.remove();
  });

  test('an old same-owner acknowledgement cannot roll back a newer adopted history', async () => {
    const box = document.createElement('div');
    const root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const host = inMemoryAppender();
    let release!: () => void;
    const dispatches: unknown[] = [];
    const p = mount(root, {
      doc: memo,
      state: host.state,
      actBinding: { documentId: 'memo-fixture', chain: 'chain-A' },
      onAppend: async (request) => {
        const result = await host.append(request);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return result;
      },
      onChange: (_state, action) => {
        if (action) dispatches.push(action);
      },
    });

    await clickAnswer(root, p);
    await flushAppend();
    expect(host.state.log).toHaveLength(1);
    const newer = appendAct(host.state, {
      requestId: 'concurrent-same-owner-act',
      id: P2,
      act: 'kept_as_written',
      value: null,
      at: 't2',
    });
    expect(newer.status).toBe('committed');
    const { log, actSequence, actHistoryCoverage } = newer.state;
    if (actSequence === undefined || !actHistoryCoverage) throw new Error('expected a sequenced host history');
    p.state.log = log;
    p.state.actSequence = actSequence;
    p.state.actHistoryCoverage = actHistoryCoverage;

    release();
    await flushAppend();
    expect(p.state.log.map((entry) => entry.requestId)).toEqual([
      host.state.log[0]?.requestId,
      'concurrent-same-owner-act',
    ]);
    expect(dispatches).toHaveLength(1);
    p.destroy();
    box.remove();
  });

  test('an async acknowledgement for an old chain cannot dispatch work into the new context', async () => {
    const box = document.createElement('div');
    const root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const host = inMemoryAppender();
    let finish!: (result: AppendActResult) => void;
    const requests: ActAppendRequest[] = [];
    const dispatches: unknown[] = [];
    const p = mount(root, {
      doc: memo,
      state: host.state,
      actBinding: { documentId: 'memo-fixture', chain: 'chain-A' },
      onAppend: (request) => {
        requests.push(structuredClone(request));
        return new Promise((resolve) => {
          finish = (result) => resolve(result);
          void host.append(request).then((result) => {
            finish(result);
          });
        });
      },
      onChange: (_state, action) => {
        if (action) dispatches.push(action);
      },
    });

    await clickAnswer(root, p);
    p.update({ actBinding: { documentId: 'memo-fixture', chain: 'chain-B' } });
    await flushAppend();

    expect(host.state.log).toHaveLength(1);
    expect(dispatches).toEqual([]);
    expect(p.state.log).toHaveLength(0);
    expect(p.state.pendingAppends).toHaveLength(0);
    expect(root.textContent).toContain('document or chain changed');
    expect(root.textContent).toContain('same request remains pending');
    expect(root.querySelector('.mq-undo')).toBeNull();
    expect(buttons(root)).toContain('Retry pending action');
    root.querySelector<HTMLButtonElement>('.mq-pane-foot button')!.click();
    await flushAppend();
    expect(requests).toHaveLength(1);
    expect(p.state.log).toHaveLength(0);
    expect(dispatches).toEqual([]);
    expect(root.textContent).toContain('Restore its original context');
    p.destroy();
    box.remove();
  });
});

describe('History (DECISIONS #24)', () => {
  const setup = () => {
    const box = document.createElement('div'),
      root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const host = inMemoryAppender();
    const p = mount(root, { doc: memo, state: host.state, onAppend: host.append });
    const act = async (id: string, a: Parameters<NonNullable<typeof p.host.onAct>>[1], value?: object) => {
      const x = [...p.view()!.findings, ...p.view()!.document.artifacts].find((y) => y.id === id)!;
      p.host.onAct?.(x, a, value ?? null);
      await flushAppend();
    };
    const answer = () => act(P3, 'answered', { reading: f(P3).outcome!.readings![0]! });
    const tab = (k: string) => root.querySelector<HTMLElement>(`.mq-tab[data-tab="${k}"]`);
    const rows = () => [...root.querySelectorAll<HTMLElement>('.mq-history .mq-row-item')];
    return { root, p, act, answer, tab, rows, done: () => (p.destroy(), box.remove()) };
  };

  test('no tabs until something is done; then Findings, chosen', async () => {
    const { tab, answer, done } = setup();
    expect(tab('history')).toBeNull();
    await answer();
    expect(tab('findings')?.getAttribute('aria-selected')).toBe('true');
    expect(tab('history')?.getAttribute('aria-selected')).toBe('false');
    done();
  });

  test('every act, newest first; only the one in force can be taken back', async () => {
    const { act, answer, tab, rows, done } = setup();
    await act(P2, 'kept_as_written');
    await answer();
    await act('a-cab', 'answered', { fields: { derived_from: 'Memo 12' } });
    tab('history')!.click();
    expect(rows().map((r) => r.querySelector('.where')?.textContent)).toEqual(['CAB', '¶3', '¶2']);
    const [cab, p3, p2] = rows();
    expect(buttons(cab!)).toEqual([]);
    expect(buttons(p3!)).toEqual(['Take back']);
    expect(p3!.querySelector('.mq-mark')).toBeNull(); // No current historical disclosure for the answer.
    // An override stays listed, and can be taken back: Marque's fix goes in after all.
    expect(p2!.textContent).toContain('Kept as written');
    expect(buttons(p2!)).toEqual(['Take back']);
    done();
  });

  test('taking an answer back asks the question again, on Findings, with its card open', async () => {
    const { root, p, answer, tab, rows, done } = setup();
    await answer();
    tab('history')!.click();
    rows()[0]!.querySelector('button')!.click();
    await flushAppend();
    expect(tab('findings')?.getAttribute('aria-selected')).toBe('true');
    expect(p.view()!.findings.find((y) => y.id === P3)!.asks).toBeTruthy();
    await new Promise((r) => setTimeout(r));
    expect(root.querySelector(`.mq-row-item[data-finding="${P3}"]`)?.classList.contains('open')).toBe(true);
    tab('history')!.click();
    expect(rows().map((r) => r.querySelector('.what')?.textContent)).toEqual(['Taken back', 'Answered']);
    expect(rows().flatMap((r) => buttons(r))).toEqual([]);
    done();
  });

  test('a routing act has nothing to take back; a host-confirmed answer still does', async () => {
    const { p, act, answer, tab, rows, done } = setup();
    await answer();
    // A simulated host re-lint settles ¶3 on the reading chosen.
    const result = f(P3).outcome!.readings![0]!.result!;
    const settled = {
      ...f(P3),
      asks: undefined,
      needs_person: 'none' as const,
      blocks: 'never' as const,
      outcome: { ...f(P3).outcome!, kind: 'applied' as const, result },
    };
    p.update({
      doc: { ...memo, findings: memo.findings.map((x) => (x.id === P3 ? settled : x)) },
      linted: p.state.log.length,
    });
    expect(p.view()!.findings.find((y) => y.id === P3)!.person).toBeNull();
    await act(P4, 'deferred');
    tab('history')!.click();
    expect(rows()[0]!.textContent).toContain('Will ask at finalize');
    expect(buttons(rows()[0]!)).toEqual([]);
    expect(buttons(rows()[1]!)).toEqual(['Take back']);
    done();
  });

  test('what was typed on Findings is still there after a look at History', async () => {
    const { root, p, act, tab, done } = setup();
    await act(P2, 'kept_as_written');
    p.update({ open: P4 });
    await new Promise((r) => setTimeout(r));
    const input = () => root.querySelector<HTMLInputElement>(`input[type="text"][data-draft^="${P4}:"]`);
    input()!.value = '(U)';
    input()!.dispatchEvent(new Event('input'));
    tab('history')!.click();
    expect(input()).toBeNull();
    tab('findings')!.click();
    await new Promise((r) => setTimeout(r));
    expect(input()?.value).toBe('(U)');
    done();
  });

  test('arrow keys move between the tabs, and focus goes with them', async () => {
    const { answer, tab, done } = setup();
    await answer();
    tab('findings')!.focus();
    tab('findings')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tab('history')?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('history'));
    expect(document.activeElement?.getAttribute('tabindex')).toBe('0');
    done();
  });
});
