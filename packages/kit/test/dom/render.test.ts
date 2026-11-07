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
import { docView, empty, record, snapshot } from '@knitli/marque-kit-core/state';
import type { Doc, FindingView, Moment } from '@knitli/marque-kit-core/types';

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
      const c = card(x, { moment });
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
    expect(buttons(card(f(id)))).toContain('Keep as written');
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
  test("the banner names the alternative's paragraph by where it is, not by its id", () => {
    const banner = doc.document.artifacts.find((a) => a.kind === 'front_marking')!;
    expect(artifact(banner, {}, doc).textContent).toContain("If ¶5's alternative is taken:");
    const opaque = { ...banner, if_taken: { f_a9p12: banner.if_taken![P5]! } };
    const d = { ...doc, findings: doc.findings.map((x) => (x.id === P5 ? { ...x, id: 'f_a9p12' } : x)) };
    expect(artifact(opaque, {}, d).textContent).toContain("If ¶5's alternative is taken:");
    expect(artifact(opaque).textContent).toContain('If the alternative is taken:');
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
    const p = mount(root, { doc: memo });
    const answer = () => {
      const x = p.view()!.findings.find((y) => y.id === P3)!;
      p.host.onAct?.(x, 'answered', { reading: x.outcome!.readings![0]! });
    };
    return { root, p, answer, done: () => (p.destroy(), box.remove()) };
  };
  const strip = (root: Element) => root.querySelector(`.mq-undo[data-undo="${P3}"]`);

  test('an answer leaves Undo in its place for 8 seconds; a redraw keeps it there', () => {
    vi.useFakeTimers();
    const { root, p, answer, done } = setup();
    answer();
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

  test('hovering stops the clock; leaving starts it again with what was left', () => {
    vi.useFakeTimers();
    const { root, answer, done } = setup();
    answer();
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
    answer();
    strip(root)!.querySelector('button')!.click();
    expect(strip(root)).toBeNull();
    expect(p.view()!.findings.find((y) => y.id === P3)!.asks).toBeTruthy();
    await new Promise((r) => setTimeout(r));
    expect(root.querySelector(`.mq-row-item[data-finding="${P3}"]`)?.classList.contains('open')).toBe(true);
    done();
  });

  test('deferred where its section stays: the strip stays beside it, and focus on Undo survives a redraw', () => {
    vi.useFakeTimers();
    const { root, p, done } = setup();
    const x = p.view()!.findings.find((y) => y.id === P3)!;
    p.update({ moment: 'finalize' });
    p.host.onAct?.(x, 'declined');
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

  test('a re-lint that asks something new under the same id takes the strip away', () => {
    const { root, p, answer, done } = setup();
    answer();
    const asks = { ...f(P3).asks!, text: 'Whose information is this now?' };
    p.update({ doc: { ...memo, findings: memo.findings.map((x) => (x.id === P3 ? { ...x, asks } : x)) } });
    expect(strip(root)).toBeNull();
    done();
  });

  test('a re-lint that conceals a code in the answer masks it in the strip too', () => {
    const { root, p, answer, done } = setup();
    answer();
    const r = f(P3).outcome!.readings![0]!.result!;
    const at = r.text.indexOf('AUS');
    const result = { ...r, masks: [{ kind: 'concealed' as const, span: [at, at + 3] as [number, number] }] };
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
    expect(strip(root)?.querySelector('.mq-conceal')).toBeTruthy();
    expect(strip(root)?.querySelector('.mq-l')?.textContent).not.toContain('AUS');
    done();
  });

  test('from the keyboard, Undo puts focus back on the reopened card', async () => {
    const { root, answer, done } = setup();
    answer();
    const undo = strip(root)!.querySelector('button')!;
    undo.focus();
    undo.click();
    await new Promise((r) => setTimeout(r));
    expect(root.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.closest(`[data-finding="${P3}"]`)).toBeTruthy();
    done();
  });

  test('kept as written from Done: the section opens to show Undo, and the marking is full size', () => {
    const { root, p, done } = setup();
    p.host.onAct?.(
      p.view()!.findings.find((y) => y.id === P2)!,
      'kept_as_written',
    );
    const s = root.querySelector(`.mq-undo[data-undo="${P2}"]`)!;
    expect(s.closest('details')?.open).toBe(true);
    expect(s.querySelector('.mq-mark.xs')).toBeNull();
    done();
  });

  test('an apply is asked for, not done; a typed field gets no Undo', () => {
    const { root, p, done } = setup();
    const art = (id: string) => p.view()!.document.artifacts.find((a) => a.id === id)!;
    p.host.onAct?.(art('a-banner'), 'answered', { apply: true });
    expect(root.querySelector('.mq-undo[data-undo="a-banner"]')?.textContent).toContain('Will be applied');
    // Once the host writes it, there's no taking it back: the strip goes.
    p.update({ doc: memo });
    expect(root.querySelector('.mq-undo[data-undo="a-banner"]')).toBeNull();
    p.host.onAct?.(art('a-cab'), 'answered', { fields: { derived_from: 'Memo 12' } });
    expect(root.querySelector('.mq-undo[data-undo="a-cab"]')).toBeNull();
    done();
  });
});

describe('History (DECISIONS #24)', () => {
  const setup = () => {
    const box = document.createElement('div'),
      root = document.createElement('div');
    for (const n of [box, root]) Object.defineProperty(n, 'clientWidth', { value: 360 });
    box.append(root);
    document.body.append(box);
    const p = mount(root, { doc: memo });
    const act = (id: string, a: Parameters<NonNullable<typeof p.host.onAct>>[1], value?: object) => {
      const x = [...p.view()!.findings, ...p.view()!.document.artifacts].find((y) => y.id === id)!;
      p.host.onAct?.(x, a, value ?? null);
    };
    const answer = () => act(P3, 'answered', { reading: f(P3).outcome!.readings![0]! });
    const tab = (k: string) => root.querySelector<HTMLElement>(`.mq-tab[data-tab="${k}"]`);
    const rows = () => [...root.querySelectorAll<HTMLElement>('.mq-history .mq-row-item')];
    return { root, p, act, answer, tab, rows, done: () => (p.destroy(), box.remove()) };
  };

  test('no tabs until something is done; then Findings, chosen', () => {
    const { tab, answer, done } = setup();
    expect(tab('history')).toBeNull();
    answer();
    expect(tab('findings')?.getAttribute('aria-selected')).toBe('true');
    expect(tab('history')?.getAttribute('aria-selected')).toBe('false');
    done();
  });

  test('every act, newest first; only the one in force can be taken back, with its marking', () => {
    const { act, answer, tab, rows, done } = setup();
    act(P2, 'kept_as_written');
    answer();
    act('a-cab', 'answered', { fields: { derived_from: 'Memo 12' } });
    tab('history')!.click();
    expect(rows().map((r) => r.querySelector('.where')?.textContent)).toEqual(['CAB', '¶3', '¶2']);
    const [cab, p3, p2] = rows();
    expect(buttons(cab!)).toEqual([]);
    expect(buttons(p3!)).toEqual(['Take back']);
    expect(p3!.querySelector('.mq-mark')).toBeTruthy();
    // An override stays listed, and can be taken back: Marque's fix goes in after all.
    expect(p2!.textContent).toContain('Kept as written');
    expect(buttons(p2!)).toEqual(['Take back']);
    done();
  });

  test('taking an answer back asks the question again, on Findings, with its card open', async () => {
    const { root, p, answer, tab, rows, done } = setup();
    answer();
    tab('history')!.click();
    rows()[0]!.querySelector('button')!.click();
    expect(tab('findings')?.getAttribute('aria-selected')).toBe('true');
    expect(p.view()!.findings.find((y) => y.id === P3)!.asks).toBeTruthy();
    await new Promise((r) => setTimeout(r));
    expect(root.querySelector(`.mq-row-item[data-finding="${P3}"]`)?.classList.contains('open')).toBe(true);
    tab('history')!.click();
    expect(rows().map((r) => r.querySelector('.what')?.textContent)).toEqual(['Taken back', 'Answered']);
    expect(rows().flatMap((r) => buttons(r))).toEqual([]);
    done();
  });

  test('a routing act has nothing to take back; a written answer still does', () => {
    const { p, act, answer, tab, rows, done } = setup();
    answer();
    // The host wrote it: the re-lint has ¶3 settled on the reading chosen.
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
    act(P4, 'deferred');
    tab('history')!.click();
    expect(rows()[0]!.textContent).toContain('Will ask at finalize');
    expect(buttons(rows()[0]!)).toEqual([]);
    expect(buttons(rows()[1]!)).toEqual(['Take back']);
    done();
  });

  test('what was typed on Findings is still there after a look at History', async () => {
    const { root, p, act, tab, done } = setup();
    act(P2, 'kept_as_written');
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

  test('arrow keys move between the tabs, and focus goes with them', () => {
    const { answer, tab, done } = setup();
    answer();
    tab('findings')!.focus();
    tab('findings')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tab('history')?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('history'));
    expect(document.activeElement?.getAttribute('tabindex')).toBe('0');
    done();
  });
});
