// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

// A marking a server wrote with html() is the marking render() builds, and the kit's
// behavior (tier-1 help, stacking, folds) works on it as on its own.
// `pnpm test` (vp test, happy-dom)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import { enhance, html, relabel, render, settle, unfold } from '../../src/marking.ts';
import { tips } from '../../src/help.ts';
import type { MarkingInput, MarkingLike, Vocab } from '@knitli/marque-kit-core/types';

const read = (f: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, '../../../../fixtures', f), 'utf8'));
const vocab = read('memo.vocab.json') as Vocab;
// Every marking the memo's findings carry, in the engine's layered form, and the memo's own text.
const fromFindings: MarkingInput[] = [];
const walk = (x: unknown): void => {
  if (Array.isArray(x)) return x.forEach(walk);
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    if (typeof o.text === 'string' && Array.isArray(o.layers)) fromFindings.push(o as unknown as MarkingInput);
    Object.values(o).forEach(walk);
  }
};
walk(read('memo.findings.json'));
const memo = readFileSync(join(import.meta.dirname, '../../../../fixtures/memo.txt'), 'utf8');
const fromText = [...memo.matchAll(/\([A-Z/][^)]*\)/g)].map((m) => m[0]);
const codes = 'AUS, AUT, BEL, BGR, CAN, CHE, CZE, DEU, DNK, ESP, EST, FIN';
const masks: MarkingLike[] = [
  { text: '(//FGI AUS S//REL TO USA, GBR)', masks: [{ kind: 'concealed', span: [7, 10] }] },
  { text: `(TS//REL TO USA, KOR, ${codes})`, masks: [{ kind: 'unidentified', layer: 0, len: 18 }] },
  { text: `(TS//REL TO USA, ${codes}, KOR)`, masks: [{ kind: 'unidentified', span: [20, 23] }] },
];
const all: MarkingLike[] = [...fromFindings, ...fromText, `(S//REL TO USA, ${codes})`, ...masks];

/** html(), parsed by the page the way a server's markup is. */
const parsed = (s: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = s;
  expect(t.content.childNodes.length).toBe(1);
  return t.content.firstChild as HTMLElement;
};
const inserted = (s: string): HTMLElement => {
  const box = document.createElement('div');
  box.innerHTML = s;
  document.body.append(box);
  return box;
};
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('html() is render() as a string', () => {
  expect(fromFindings.length).toBeGreaterThan(10);
  const forms = [undefined, 'full', 'folded', 'summary', 'diff'] as const;
  const states = [undefined, 'derived', 'review', 'unverified'];
  const sizes = [undefined, 'xs', 'sm', 'lg'] as const;
  test.each(all.map((m) => [typeof m === 'string' ? m : m.text, m]))('%s: every form, state, size', (_, m) => {
    for (const form of forms)
      for (const state of states)
        for (const size of sizes)
          for (const stacked of [false, true]) {
            const o = { form, state, size, stacked, fold: 2, help: ['NF', 'USA', 'GBR', 'REL TO'], vocab };
            const a = parsed(html(m, o)),
              b = render(m, o);
            expect(a.isEqualNode(b), `${form} ${state} ${size} ${stacked}\n${a.outerHTML}\n${b.outerHTML}`).toBe(true);
          }
  });
  test('a differing layer, a fold label', () => {
    const m = `(S//REL TO USA, ${codes}//NF)`;
    for (const o of [
      { form: 'diff' as const, differs: [1] },
      { form: 'diff' as const, foldLabel: '9 more · same in every reading' },
    ])
      expect(parsed(html(m, o)).isEqualNode(render(m, o))).toBe(true);
  });
  test('a concealed code is written nowhere, and its blocks are', () => {
    const s = html(masks[0]!, { form: 'folded', fold: 0 });
    expect(s).not.toContain('AUS');
    expect(parsed(s).querySelector('.mq-conceal')?.textContent).toBe('███');
  });
});

describe('server markup, brought to life', () => {
  test('tips() gives a token from html() its tier-1 help, on focus and on hover', async () => {
    const box = inserted(html('(S//NF/REL TO USA, GBR)', { help: ['NF', 'GBR'] }));
    const stop = tips(box, vocab);
    const nf = box.querySelector<HTMLElement>('.mq-tok[data-help="NF"]')!;
    nf.focus();
    const tip = document.querySelector('.mq-tip[role=tooltip]');
    expect(tip?.textContent).toContain('NF');
    expect(nf.getAttribute('aria-describedby')).toBe(tip?.id);
    expect(nf.getAttribute('aria-haspopup')).toBe('dialog'); // a marking's code opens the manual
    nf.blur();
    expect(document.querySelector('.mq-tip')).toBeNull();
    vi.useFakeTimers();
    const gbr = box.querySelector<HTMLElement>('.mq-tok[data-help="GBR"]')!;
    gbr.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect(document.querySelector('.mq-tip')?.textContent).toContain('United Kingdom');
    expect(gbr.hasAttribute('aria-haspopup')).toBe(false); // a country keeps to its tooltip
    stop();
    expect(document.querySelector('.mq-tip')).toBeNull();
  });

  // happy-dom lays nothing out: a marking reports the height it would have.
  const tall = (n: Element, h: number): void => {
    n.getBoundingClientRect = () => ({ height: h }) as DOMRect;
  };
  test('settle() stacks a server marking that had to wrap, and leaves one that fits', () => {
    const box = inserted(html('(S//REL TO USA, GBR)') + html('(//JOINT S AUS GBR//REL TO USA, GBR)'));
    const [fits, wraps] = [...box.querySelectorAll<HTMLElement>('.mq-mark')];
    tall(fits!, 20);
    tall(wraps!, 60);
    expect(settle(fits!).classList.contains('stacked')).toBe(false);
    expect(settle(wraps!).classList.contains('stacked')).toBe(true);
  });

  test('enhance() settles every marking under it; a fixed stack stays', () => {
    const box = inserted(html('(S//REL TO USA, GBR)') + html('(S//NF)', { stacked: true }) + html('(U)'));
    const [a, b, c] = [...box.querySelectorAll<HTMLElement>('.mq-mark')];
    tall(a!, 60);
    tall(b!, 20);
    tall(c!, 20);
    enhance(box)();
    expect([a, b, c].map((m) => m!.classList.contains('stacked'))).toEqual([true, true, false]);
    expect(b!.dataset.stack).toBe('fixed');
  });

  test('enhance() opens a server fold to the full form, with its state, size and label', () => {
    const m = masks[2]!;
    const box = inserted(html(m, { form: 'folded', state: 'review', size: 'xs', vocab }));
    const label = box.querySelector('.mq-mark')!.getAttribute('aria-label');
    const stop = enhance(box);
    box.querySelector<HTMLElement>('.mq-fold')!.click();
    const full = box.querySelector<HTMLElement>('.mq-mark')!;
    expect(box.querySelector('.mq-fold')).toBeNull();
    expect(
      full.classList.contains('stacked') && full.classList.contains('review') && full.classList.contains('xs'),
    ).toBe(true);
    expect(full.getAttribute('aria-label')).toBe(label);
    // The same as the full form drawn from the start; the mask is still a mask.
    expect(full.isEqualNode(render(m, { form: 'full', stacked: true, state: 'review', size: 'xs', vocab }))).toBe(true);
    expect(full.querySelector('.mq-mask')?.textContent).toBe('___');
    stop();
  });

  test('a diff fold opens with its differing layers still marked', () => {
    const m = '(S//REL TO USA, AUS, AUT, BEL, BGR, CAN//NF)';
    const box = inserted(html(m, { form: 'diff', differs: [2] }));
    enhance(box);
    box.querySelector<HTMLElement>('.mq-fold')!.click();
    const full = box.querySelector('.mq-mark')!;
    expect(box.querySelector('.mq-fold')).toBeNull();
    expect([...full.querySelectorAll('.mq-l')].map((l) => l.classList.contains('differs'))).toEqual([
      false,
      false,
      true,
    ]);
    expect(full.isEqualNode(render(m, { form: 'full', stacked: true, differs: [2] }))).toBe(true);
  });

  test('Enter opens a fold too; a fold render() made opens itself, once', () => {
    const box = inserted(html(`(S//REL TO USA, ${codes})`, { form: 'folded' }));
    enhance(box);
    box.querySelector('.mq-fold')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(box.querySelector('.mq-fold')).not.toBeNull();
    box.querySelector('.mq-fold')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(box.querySelector('.mq-fold')).toBeNull();
    const own = document.createElement('div');
    own.append(render(`(S//REL TO USA, ${codes})`, { form: 'folded' }));
    document.body.append(own);
    enhance(own);
    own.querySelector<HTMLElement>('.mq-fold')!.click();
    expect(own.querySelectorAll('.mq-mark').length).toBe(1);
    expect(own.querySelector('.mq-fold')).toBeNull();
  });

  test('unfold() leaves a marking with no model alone; relabel() reaches one that carries it', () => {
    const plain = parsed(html('(S//REL TO USA, GBR)'));
    expect(unfold(plain)).toBeNull();
    const box = inserted(html(`(S//REL TO USA, ${codes})`, { form: 'folded' }) + html('(S//REL TO USA, GBR)'));
    relabel(box, { USA: 'United States' });
    const [folded, full] = [...box.querySelectorAll('.mq-mark')];
    expect(folded!.getAttribute('aria-label')).toContain('United States');
    expect(full!.getAttribute('aria-label')).toBe('S, REL TO, U-S-A, G-B-R'); // the server's label stands
  });
});
