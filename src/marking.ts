// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * Marking — the text primitive (component 2).
 *
 * Renders a classification marking verbatim, in the mark font, so that it
 * never breaks inside a token and never overflows its container. When the
 * engine supplies layers and tokens (knitli/marque-dev#2634) they are used
 * as-is; until then `parse()` derives them from the string with CAPCO's
 * separators — a fallback, and the reason the engine should emit layers.
 *
 * Rules (docs/THEME.md, "Fit" and "Long markings"):
 *   - break between layers first (before `//`), then after a list comma,
 *     then between tokens; never inside a token (REL TO, TOP SECRET, SI-G);
 *   - when any break is needed, stack: one layer per line;
 *   - never truncate, scroll or shrink below 13px;
 *   - four forms: full · folded · summary · diff.
 *
 * No framework. Produces DOM nodes; works in any host that has a document.
 */

import type { Layer, Marking, MarkingLike, Mask, Token, Vocab } from './types.ts';

/** Options for render(). */
export interface RenderOptions {
  form?: 'full' | 'folded' | 'summary' | 'diff';
  state?: string | undefined;
  size?: 'xs' | 'sm' | 'lg';
  stacked?: boolean;
  fold?: number;
  differs?: number[];
  foldLabel?: string;
  help?: string[];
  vocab?: SpokenVocab;
}
/** The kit's vocabulary, or a plain { code: words } map. */
export type SpokenVocab = Vocab | Record<string, string>;

const MULTI = [
  'JOINT TOP SECRET',
  'COSMIC TOP SECRET',
  'TOP SECRET',
  'NATO SECRET',
  'NATO CONFIDENTIAL',
  'NATO RESTRICTED',
  'NATO UNCLASSIFIED',
  'REL TO',
  'DISPLAY ONLY',
];
const GLUE = '\u0001';

const protect = (s: string): string => MULTI.reduce((t, m) => t.split(m).join(m.replace(/ /g, GLUE)), s);
const unprotect = (s: string): string => s.split(GLUE).join(' ');

/** Split a marking string into its `//` layers. Each layer after the first
 *  starts with the `//` that introduces it. A leading `(` joins layer one. */
export function layers(text: string): string[] {
  const idx: number[] = [];
  for (let m = /\/\//g, r; (r = m.exec(text));) idx.push(r.index);
  if (idx.length === 0) return [text];
  const first = text.slice(0, idx[0]);
  const segs = idx.map((p, k) => text.slice(p, k + 1 < idx.length ? idx[k + 1] : text.length));
  if (first.trim() === '' || first.trim() === '(') segs[0] = first + segs[0];
  else segs.unshift(first);
  return segs;
}

/** Split a layer into break-safe tokens: after ', ', before a single '/',
 *  after a space between tokens; never inside a multi-word token. */
export function tokens(layer: string): string[] {
  const L = protect(layer);
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < L.length;) {
    if (L.startsWith('//', i)) {
      buf += '//';
      i += 2;
      continue;
    }
    const c = L[i];
    if (c === '/') {
      if (buf) out.push(buf);
      buf = '/';
      i += 1;
      continue;
    }
    if (L.startsWith(', ', i)) {
      buf += ', ';
      out.push(buf);
      buf = '';
      i += 2;
      continue;
    }
    if (c === ' ') {
      buf += ' ';
      out.push(buf);
      buf = '';
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  if (buf) out.push(buf);
  return out.map(unprotect);
}

const isCode = (t: string): boolean => /^\/?[A-Z]{3,4},? ?\)?$/.test(t);
/** A token without its separators: "//REL TO " → "REL TO", "FVEY)" → "FVEY". */
export const bare = (t: string): string => t.replace(/^[(/]+|[),\s]+$/g, '');

/** Parse a string into the layered form the engine should emit. */
export function parse(text: string): Marking {
  return { text, layers: layers(text).map((l) => ({ tokens: tokens(l).map((t) => ({ t })) })), masks: [] };
}

/** Normalise whatever the caller passed — a string, or an engine marking —
 *  into { text, layers:[{tokens:[{t, help?}]}], masks:[] }. */
export function normalise(marking: MarkingLike): Marking {
  if (typeof marking === 'string') return parse(marking);
  if (marking && marking.layers) return conceal({ ...marking, layers: marking.layers, masks: marking.masks || [] });
  if (marking && marking.text) return conceal({ ...parse(marking.text), masks: marking.masks || [] });
  throw new TypeError('marking must be a string or {text, layers}');
}

/** A mask given as a span ([start, end) in UTF-8 bytes of `text`, as every span is) covers bytes the tokens
 *  may still carry: those bytes go, in what is drawn, said and copied, and the mask stands where they were
 *  (a `{ t: '', mask }` token); the rest of a token it cuts through stays. */
const utf8 = new TextEncoder(),
  utf8d = new TextDecoder();
type Spanned = Mask & { span: [number, number] };
const spanned = (k: Mask): k is Spanned => Array.isArray(k.span);
function conceal(m: Marking): Marking {
  const spans = m.masks.filter(spanned).sort((x, y) => x.span[0] - y.span[0]);
  if (!spans.length) return m;
  const placed = new Set<Spanned>();
  let at = 0;
  const layers = m.layers.map((l): Layer => ({
    ...l,
    tokens: l.tokens.flatMap((tok): Token[] => {
      const b = utf8.encode(tok.t),
        s = at,
        e = (at += b.length);
      const over = spans.filter((k) => k.span[0] < e && s < k.span[1]);
      if (!over.length) return [tok];
      const out: Token[] = [];
      let c = s;
      for (const k of over) {
        if (k.span[0] > c) out.push({ ...tok, t: utf8d.decode(b.slice(c - s, k.span[0] - s)) });
        if (!placed.has(k)) {
          placed.add(k);
          out.push({ t: '', mask: { ...k, len: k.len ?? k.span[1] - k.span[0] } });
        }
        c = Math.max(c, k.span[1]);
      }
      if (c < e) out.push({ ...tok, t: utf8d.decode(b.slice(c - s)) });
      return out;
    }),
  }));
  const masks = m.masks.filter((k) => !spanned(k)); // the rest are drawn at their layer's end
  const b = [...spans]
    .sort((x, y) => y.span[0] - x.span[0])
    .reduce<number[]>((t, k) => [...t.slice(0, k.span[0]), ...t.slice(k.span[1])], [...utf8.encode(m.text)]);
  const text = utf8d.decode(new Uint8Array(b));
  return { ...m, text, layers, masks };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string | null,
  text?: string | null,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * Render a marking.
 * @param marking  string or engine layered form
 * @param o.form       'full' (default) | 'folded' | 'summary' | 'diff'
 * @param o.state      derived | review | unverified
 * @param o.size       xs | sm | lg
 * @param o.stacked    force one layer per line (the kit measures otherwise)
 * @param o.fold       codes shown before a fold (3)
 * @param o.differs    layer indexes that differ between readings (diff form)
 * @param o.foldLabel  e.g. "9 more · same in every reading"
 * @param o.help       tokens with a help entry (says.help[]); each becomes a tier-1 target
 */
export function render(marking: MarkingLike, o: RenderOptions = {}): HTMLSpanElement {
  const m = normalise(marking);
  const root = el('span', 'mq-mark');
  if (o.state) root.classList.add(o.state);
  if (o.size && o.size !== 'sm') root.classList.add(o.size);
  if (o.stacked) {
    root.classList.add('stacked');
    root.dataset.stack = 'fixed';
  }
  root.setAttribute('dir', 'ltr');
  root.dataset.text = m.text;
  // Read out as words, not slashes: a labelled group, so its help tokens are still reachable inside.
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', spoken(m, o.vocab));
  models.set(root, m);
  if (o.form === 'summary') return summary(m, root);
  m.layers.forEach((layer, li) => {
    if (li > 0) root.appendChild(document.createElement('wbr'));
    const L = el('span', 'mq-l');
    const differs = (o.differs || []).includes(li);
    if (differs) L.classList.add('differs');
    const toks = layer.tokens;
    const codes = toks.map((t, i) => (isCode(t.t) ? i : -1)).filter((i) => i >= 0);
    const fold = o.form === 'folded' || o.form === 'diff' ? (o.fold ?? 3) : null;
    let shown = toks,
      hidden: Token[] = [];
    if (fold != null && !differs && codes.length > fold + 1) {
      const cut = codes[fold]!;
      shown = toks.slice(0, cut);
      hidden = toks.slice(cut);
    }
    shown.forEach((t, i) => {
      if (i > 0) L.appendChild(document.createElement('wbr'));
      if (t.mask) {
        L.appendChild(maskEl(t.mask));
        return;
      }
      const text = hidden.length && i === shown.length - 1 ? t.t.replace(/[, ]+$/, '') : t.t;
      const span = el('span', 'mq-i', text);
      const help = t.help || (o.help?.includes(bare(t.t)) ? bare(t.t) : null);
      // Enter opens its help: a button, to a screen reader too. Whether it opens a dialog
      // depends on the vocabulary, so tips() says that.
      if (help) {
        span.classList.add('mq-tok');
        span.tabIndex = 0;
        span.dataset.help = help;
        span.setAttribute('role', 'button');
      }
      L.appendChild(span);
    });
    if (hidden.length) {
      const n = hidden.filter((t) => isCode(t.t)).length;
      L.appendChild(document.createTextNode(' '));
      const f = el('span', 'mq-fold', '+' + (o.foldLabel || `${n} more`));
      f.setAttribute('role', 'button');
      f.tabIndex = 0;
      f.addEventListener('click', () => {
        root.replaceWith(render(marking, { ...o, form: 'full', stacked: true }));
      });
      L.appendChild(f);
      const closing = hidden[hidden.length - 1]!.t.trim().endsWith(')') ? ')' : '';
      if (closing) L.appendChild(el('span', 'mq-i', closing));
    }
    root.appendChild(L);
  });
  // masks: typed regions from the engine (knitli/marque-dev#2634)
  for (const mask of m.masks) root.querySelectorAll('.mq-l')[mask.layer ?? -1]?.appendChild(maskEl(mask));
  return root;
}

const chars = (n: number): string => `${n} character${n === 1 ? '' : 's'}`;
/** The marking as plain text with its masks drawn, never the bytes they cover: for a label that can't hold a marking. */
export function masked(marking: MarkingLike): string {
  const m = normalise(marking);
  return m.layers
    .map(
      (l, i) =>
        l.tokens.map((t) => (t.mask ? glyphs(t.mask) : t.t)).join('') +
        m.masks
          .filter((k) => k.layer === i)
          .map(glyphs)
          .join(''),
    )
    .join('');
}
const glyphs = (mask: Mask): string => (mask.kind === 'concealed' ? '█' : '_').repeat(mask.len ?? 0);
function maskEl(mask: Mask): HTMLSpanElement {
  const s = el('span', mask.kind === 'concealed' ? 'mq-conceal' : 'mq-mask', glyphs(mask));
  s.tabIndex = 0;
  s.title = mask.kind === 'concealed' ? 'Source concealed.' : `${chars(mask.len ?? 0)} Marque couldn't identify.`;
  return s;
}

function summary(m: Marking, root: HTMLSpanElement): HTMLSpanElement {
  root.classList.add('summary');
  m.layers.forEach((layer, li) => {
    if (li > 0) root.appendChild(document.createElement('wbr'));
    const toks = layer.tokens.map((t) => (t.mask ? glyphs(t.mask) : t.t));
    const codes = toks.filter(isCode);
    const L = el('span', 'mq-l');
    if (codes.length > 5) {
      const lead = toks
        .filter((t) => !isCode(t))
        .join('')
        .replace(/[, ]+$/, '');
      const closing = toks[toks.length - 1]!.trim().endsWith(')') ? ')' : '';
      const strip = (t: string): string => t.trim().replace(/[,)]+$/, '');
      L.appendChild(document.createTextNode(lead + ' '));
      L.appendChild(el('span', 'mq-count', `${strip(codes[0]!)}…${strip(codes[codes.length - 1]!)} · ${codes.length}`));
      if (closing) L.appendChild(document.createTextNode(closing));
    } else L.textContent = toks.join('');
    root.appendChild(L);
  });
  return root;
}

/**
 * After insertion: if the marking had to wrap, set it one layer per line so
 * it always wraps the same way (CSS alone wraps greedily and orphans `GBR)`).
 * Call once per render, and again on container resize if the host allows.
 */
/** Measure again after the room changed: a marking stacked at one width may fit at another. */
export function resettle(root: HTMLElement): HTMLElement {
  if (root.dataset.stack !== 'fixed') root.classList.remove('stacked');
  return settle(root);
}

export function settle(root: HTMLElement): HTMLElement {
  if (root.classList.contains('stacked') || root.classList.contains('summary')) return root;
  const one = root.getBoundingClientRect().height;
  const line = parseFloat(getComputedStyle(root).lineHeight) || 20;
  if (one > line * 1.5) root.classList.add('stacked');
  return root;
}

/** A code's words from the kit's vocabulary (help, trigraphs, tetragraphs), or a plain { code: words } map:
 *  a country or group by its name, a marking by its banner form. */
const word = (vocab: SpokenVocab | undefined, tok: string): string | null => {
  if (!vocab) return null;
  const plain: unknown = (vocab as Record<string, unknown>)[tok];
  if (typeof plain === 'string') return plain;
  const v = vocab as Vocab;
  const named = [...(v.trigraphs || []), ...(v.tetragraphs || [])].find((x) => x.code === tok)?.name;
  const banner = v.help?.[tok]?.examples?.find((x) => x.kind === 'banner')?.form;
  return named || (banner && banner !== tok ? banner : null);
};
// Each rendered marking keeps its model, so a pane can say its markings in its own vocabulary.
const models = new WeakMap<Element, Marking>();
/** Say every marking under `node` again with `vocab` (a mount's own). */
export function relabel(node: ParentNode, vocab: SpokenVocab): void {
  for (const n of node.querySelectorAll('.mq-mark')) {
    const m = models.get(n);
    if (m) n.setAttribute('aria-label', spoken(m, vocab));
  }
}

/** Spoken form for assistive tech: "Secret, releasable to U-S-A and F-V-E-Y". */
export function spoken(marking: MarkingLike, vocab: SpokenVocab = {}): string {
  const m = normalise(marking);
  const words: string[] = [];
  // Masks are said as what they are, never as what they cover: in place, or at the end for one given by layer.
  const said = (mask: Mask): string =>
    mask.kind === 'concealed' ? 'source concealed' : `${chars(mask.len ?? 0)} not identified`;
  for (const layer of m.layers)
    for (const { t, mask } of layer.tokens) {
      if (mask) {
        words.push(said(mask));
        continue;
      }
      const tok = bare(t);
      if (!tok) continue;
      words.push(word(vocab, tok) || (/^[A-Z]{3,4}$/.test(tok) ? tok.split('').join('-') : tok));
    }
  for (const mask of m.masks) words.push(said(mask));
  return words.join(', ');
}
