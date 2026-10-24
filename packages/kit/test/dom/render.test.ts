// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

// The decided rules (CLAUDE.md, "Fixed, by decision") as they reach the DOM, on the memo.
// `pnpm test` (vp test, happy-dom)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vite-plus/test';
import { render as mark, masked } from '../../src/marking.ts';
import { artifact, card, gate, mount, pane, receipt, rung } from '../../src/render.ts';
import { why } from '../../src/help.ts';
import { docView, empty, record, snapshot } from '@marque/kit-core/state';
import type { Doc, FindingView, Moment } from '@marque/kit-core/types';

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
