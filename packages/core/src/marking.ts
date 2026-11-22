// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Marking, with no DOM: parse, the spoken form, the structure, and the HTML string.
 *
 * The kit's `render()` (@knitli/marque-kit/marking) builds its DOM from `tree()`, and `html()`
 * writes the same tree as a string, so a server can send a marking a page shows with no
 * script and a strict CSP (classes and attributes only, no inline style). The two cannot
 * drift: there is one structure.
 *
 *   tree(marking, o)   the structure: `.mq-mark > .mq-l > .mq-i`, `<wbr>` between, masks, folds
 *   html(marking, o)   the same, as an escaped HTML string
 *   spoken(marking)    the words a screen reader says
 *   masked(marking)    plain text with the masks drawn, never the bytes they cover
 *
 * Rules (docs/THEME.md, "Fit" and "Long markings"): break between layers first, then after a
 * list comma, then between tokens; never inside a token (REL TO, TOP SECRET, SI-G).
 */

import type { Layer, Marking, MarkingInput, MarkingLike, Mask, Token, Vocab } from './types.ts';

/** Options for render() and html(). */
export interface MarkOptions {
  /** 'full' (default) | 'folded' | 'summary' | 'diff' */
  form?: 'full' | 'folded' | 'summary' | 'diff';
  /** derived | review | unverified */
  state?: string | undefined;
  /** xs | sm (default) | lg */
  size?: 'xs' | 'sm' | 'lg';
  /** One layer per line, always. The kit measures otherwise; a server can't, so it may set this. */
  stacked?: boolean;
  /** Codes shown before a fold (3). */
  fold?: number;
  /** Layer indexes that differ between readings (diff form). */
  differs?: number[];
  /** e.g. "9 more · same in every reading" */
  foldLabel?: string;
  /** Tokens with a help entry (says.help[]); each becomes a tier-1 target. */
  help?: string[];
  /** Words for the spoken form. */
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

const utf8 = new TextEncoder();
const decode = new TextDecoder('utf-8', { ignoreBOM: true });
const loneSurrogate = /[\uD800-\uDFFF]/u;

function matchesText(layers: Layer[], text: string): boolean {
  let at = 0;
  for (const layer of layers) {
    for (const token of layer.tokens) {
      if (loneSurrogate.test(token.t) || !text.startsWith(token.t, at) || (token.mask && token.t !== '')) return false;
      at += token.t.length;
    }
  }
  return at === text.length;
}

function placeholder(mask: Mask, length = mask.len): Token {
  const len = length !== undefined && Number.isSafeInteger(length) && length >= 0 ? length : undefined;
  return { t: '', mask: { kind: mask.kind, ...(len !== undefined && { len }) } };
}

/** Project source byte spans and layer masks once. Resulting masks contain no source text or offsets. */
export function disclosedMarking(m: MarkingInput): MarkingInput {
  const masks = m.masks ?? [];
  // A host may split one Unicode scalar between two adjacent ordinary tokens.
  const supplied = m.layers?.map((layer): Layer => {
    if (!layer.tokens.some((token) => loneSurrogate.test(token.t))) return layer;
    const tokens: Token[] = [];
    let run = '';
    for (const token of layer.tokens) {
      if (token.mask) {
        if (run) tokens.push({ t: run });
        run = '';
        tokens.push(token);
      } else run += token.t;
    }
    if (run) tokens.push({ t: run });
    return { tokens };
  });
  const inline = supplied?.flatMap((layer) => layer.tokens.flatMap((token) => (token.mask ? [token.mask] : []))) ?? [];
  const matches = supplied && matchesText(supplied, m.text);
  if (!masks.length && !inline.length) {
    if (!supplied) return m;
    if (!matches) return { text: m.text };
    return supplied.some((l, i) => l !== m.layers![i]) ? { ...m, layers: supplied } : m;
  }
  const withheld = (): Marking => ({
    text: '',
    masks: [],
    layers: [{ tokens: [...inline, ...masks].map((k) => placeholder(k)) }],
  });
  if ((inline.length && !matches) || loneSurrogate.test(m.text)) return withheld();

  let layers = matches ? supplied! : parse(m.text).layers;
  if (!matches && !matchesText(layers, m.text)) layers = [{ tokens: [{ t: m.text }] }];
  if (!layers.length) layers = [{ tokens: [] }];
  const bytes = utf8.encode(m.text);
  const boundary = (at: number): boolean =>
    Number.isSafeInteger(at) && at >= 0 && at <= bytes.length && (at === bytes.length || (bytes[at]! & 0xc0) !== 0x80);
  const spans: Array<{ start: number; end: number; mask: Mask }> = [];
  const endMasks = new Map<number, Token[]>();
  for (const mask of masks) {
    if (mask.span !== undefined) {
      if (!Array.isArray(mask.span) || mask.span.length !== 2) return withheld();
      const [start, end] = mask.span;
      if (!boundary(start) || !boundary(end) || start >= end) return withheld();
      spans.push({ start, end, mask });
    } else {
      const layer = mask.layer ?? layers.length - 1;
      if (!Number.isSafeInteger(layer) || layer < 0 || layer >= layers.length) return withheld();
      const tokens = endMasks.get(layer) ?? [];
      tokens.push(placeholder(mask));
      endMasks.set(layer, tokens);
    }
  }
  spans.sort((a, b) => a.start - b.start);
  if (spans.some((span, i) => i > 0 && spans[i - 1]!.end > span.start)) return withheld();

  let offset = 0;
  let next = 0;
  const visible = layers.map((layer, index): Layer => {
    const tokens: Token[] = [];
    for (const token of layer.tokens) {
      if (token.mask) {
        tokens.push(placeholder(token.mask));
        continue;
      }
      const end = offset + utf8.encode(token.t).length;
      while (next < spans.length && spans[next]!.start < end) {
        const span = spans[next]!;
        if (offset <= span.start) {
          if (offset < span.start) tokens.push({ t: decode.decode(bytes.subarray(offset, span.start)) });
          // An existing spanned mask without an explicit length represents the covered characters.
          const length = span.mask.len ?? Array.from(decode.decode(bytes.subarray(span.start, span.end))).length;
          tokens.push(placeholder(span.mask, length));
        }
        offset = Math.min(end, span.end);
        if (offset < span.end) break;
        next++;
      }
      if (offset < end) tokens.push({ t: decode.decode(bytes.subarray(offset, end)) });
      offset = end;
    }
    for (const mask of endMasks.get(index) ?? []) tokens.push(mask);
    return { tokens };
  });
  return { text: visible.map((l) => l.tokens.map((t) => t.t).join('')).join(''), layers: visible, masks: [] };
}

/** Normalize whatever the caller passed — a string, or an engine marking — into
 *  { text, layers:[{tokens:[{t, help?}]}], masks:[] }. The renderer and action history use the same disclosure projection. */
export function normalize(marking: MarkingLike): Marking {
  if (typeof marking === 'string') return parse(marking);
  const safe = disclosedMarking(marking);
  return { text: safe.text, layers: safe.layers ?? parse(safe.text).layers, masks: safe.masks ?? [] };
}

const chars = (n: number): string => `${n} character${n === 1 ? '' : 's'}`;
/** The marking as plain text with its masks drawn, never the bytes they cover: for a label that can't hold a marking. */
export function masked(marking: MarkingLike): string {
  const m = normalize(marking);
  return m.layers
    .map(
      (l, i) =>
        l.tokens.map((t) => (t.mask ? glyphs(t.mask) : t.t)).join('') +
        m.masks
          .filter((k) => layerOf(m, k) === i)
          .map(glyphs)
          .join(''),
    )
    .join('');
}
/** The layer a mask without a span is drawn at the end of: its own, else the last. */
const layerOf = (m: Marking, mask: Mask): number => mask.layer ?? m.layers.length - 1;
const glyphs = (mask: Mask): string => {
  const glyph = mask.kind === 'concealed' ? '█' : '_';
  // A long withheld region is represented by a single mark, with its count in the accessible label.
  return mask.len === undefined || mask.len > 4096 ? glyph : glyph.repeat(Math.max(1, mask.len));
};

/* ── the structure ─────────────────────────────────────────────────────── */

/** One element of a rendered marking: a tag, its attributes in order, and its children (text is a string). */
export interface MarkNode {
  tag: 'span' | 'wbr';
  attrs: [name: string, value: string][];
  kids: (MarkNode | string)[];
}

const node = (tag: MarkNode['tag'], cls?: string | null, text?: string | null): MarkNode => ({
  tag,
  attrs: cls ? [['class', cls]] : [],
  kids: text ? [text] : [],
});
const wbr = (): MarkNode => node('wbr');
const addClass = (n: MarkNode, cls: string): void => {
  const c = n.attrs.find(([k]) => k === 'class');
  if (c) c[1] += ` ${cls}`;
  else n.attrs.unshift(['class', cls]);
};
const maskNode = (mask: Mask): MarkNode => {
  const s = node('span', mask.kind === 'concealed' ? 'mq-conceal' : 'mq-mask', glyphs(mask));
  s.attrs.push(
    ['tabindex', '0'],
    ['title', mask.kind === 'concealed' ? 'Source concealed.' : `${chars(mask.len ?? 0)} Marque couldn't identify.`],
  );
  return s;
};

/**
 * The structure of a rendered marking, with no DOM. `render()` builds its elements from this and
 * `html()` writes it as a string. Every token with help is a `.mq-tok` with `data-help`, `tabindex`
 * and `role="button"`, which is all tier-1 help (`tips()`) needs. A marking with a fold carries
 * `data-model` (its layers and masks as JSON, masks already applied) so the fold can open on a page
 * the kit didn't draw.
 */
export function tree(marking: MarkingLike, o: MarkOptions = {}): MarkNode {
  const m = normalize(marking);
  const root = node('span', 'mq-mark');
  if (o.state) addClass(root, o.state);
  if (o.size && o.size !== 'sm') addClass(root, o.size);
  if (o.stacked) {
    addClass(root, 'stacked');
    root.attrs.push(['data-stack', 'fixed']);
  }
  root.attrs.push(['dir', 'ltr'], ['data-text', m.text]);
  // Read out as words, not slashes: a labeled group, so its help tokens are still reachable inside.
  root.attrs.push(['role', 'group'], ['aria-label', spoken(m, o.vocab)]);
  if (o.form === 'summary') return summary(m, root);
  const helpOf = (t: Token): string | null => t.help || (o.help?.includes(bare(t.t)) ? bare(t.t) : null);
  const drawn: MarkNode[] = [];
  let folded = false;
  m.layers.forEach((layer, li) => {
    if (li > 0) root.kids.push(wbr());
    const L = node('span', 'mq-l');
    const differs = (o.differs || []).includes(li);
    if (differs) addClass(L, 'differs');
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
      if (i > 0) L.kids.push(wbr());
      if (t.mask) {
        L.kids.push(maskNode(t.mask));
        return;
      }
      const text = hidden.length && i === shown.length - 1 ? t.t.replace(/[, ]+$/, '') : t.t;
      const span = node('span', 'mq-i', text);
      const help = helpOf(t);
      // Enter opens its help: a button, to a screen reader too. Whether it opens a dialog
      // depends on the vocabulary, so tips() says that.
      if (help) {
        addClass(span, 'mq-tok');
        span.attrs.push(['tabindex', '0'], ['data-help', help], ['role', 'button']);
      }
      L.kids.push(span);
    });
    if (hidden.length) {
      folded = true;
      const n = hidden.filter((t) => isCode(t.t)).length;
      L.kids.push(' ');
      const f = node('span', 'mq-fold', '+' + (o.foldLabel || `${n} more`));
      f.attrs.push(['role', 'button'], ['tabindex', '0']);
      L.kids.push(f);
      const closing = hidden[hidden.length - 1]!.t.trim().endsWith(')') ? ')' : '';
      if (closing) L.kids.push(node('span', 'mq-i', closing));
    }
    drawn.push(L);
    root.kids.push(L);
  });
  // masks: typed regions from the engine; as the engine emits them, layers and masks apply whole
  // One given by neither span nor layer is drawn at the end, where spoken() says it.
  for (const mask of m.masks) drawn[layerOf(m, mask)]?.kids.push(maskNode(mask));
  if (folded) {
    // What the fold opens to: the full form, help resolved. Only what the full form would show; masks stay masks.
    const layers = m.layers.map((l) => ({
      tokens: l.tokens.map((t): Token => {
        const help = t.mask ? null : helpOf(t);
        return { t: t.t, ...(help ? { help } : {}), ...(t.mask ? { mask: t.mask } : {}) };
      }),
    }));
    root.attrs.push(['data-model', JSON.stringify({ layers, masks: m.masks })]);
  }
  return root;
}

function summary(m: Marking, root: MarkNode): MarkNode {
  addClass(root, 'summary');
  m.layers.forEach((layer, li) => {
    if (li > 0) root.kids.push(wbr());
    const toks = layer.tokens.map((t) => (t.mask ? glyphs(t.mask) : t.t));
    const codes = toks.filter(isCode);
    const L = node('span', 'mq-l');
    if (codes.length > 5) {
      const lead = toks
        .filter((t) => !isCode(t))
        .join('')
        .replace(/[, ]+$/, '');
      const closing = toks[toks.length - 1]!.trim().endsWith(')') ? ')' : '';
      const strip = (t: string): string => t.trim().replace(/[,)]+$/, '');
      L.kids.push(lead + ' ');
      L.kids.push(node('span', 'mq-count', `${strip(codes[0]!)}…${strip(codes[codes.length - 1]!)} · ${codes.length}`));
      if (closing) L.kids.push(closing);
    } else {
      const text = toks.join('');
      if (text) L.kids.push(text);
    }
    root.kids.push(L);
  });
  return root;
}

/* ── as a string ───────────────────────────────────────────────────────── */

const ENTITY: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text or an attribute value, safe inside an element or a double-quoted attribute. */
export const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTITY[c]!);

/** A MarkNode as HTML. Every text and attribute value is escaped; nothing is styled inline. */
export function serialize(n: MarkNode | string): string {
  if (typeof n === 'string') return escape(n);
  const a = n.attrs.map(([k, v]) => ` ${k}="${escape(v)}"`).join('');
  if (n.tag === 'wbr') return `<wbr${a}>`;
  return `<${n.tag}${a}>${n.kids.map(serialize).join('')}</${n.tag}>`;
}

/**
 * A marking as an HTML string, for a page rendered on a server: the same structure `render()`
 * builds, with classes and attributes only, so it works under `style-src 'self'` and with no
 * script. Load theme.css and kit.css; then, if the page runs script, `enhance()` stacks it
 * when it wraps and opens folds, and `tips()` gives its tokens their help.
 *
 *   html('(S//REL TO USA, GBR)', { help: ['REL TO'] })
 */
export function html(marking: MarkingLike, o: MarkOptions = {}): string {
  return serialize(tree(marking, o));
}

/* ── spoken ────────────────────────────────────────────────────────────── */

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

/** Spoken form for assistive tech: "Secret, releasable to U-S-A and F-V-E-Y". */
export function spoken(marking: MarkingLike, vocab: SpokenVocab = {}): string {
  const m = normalize(marking);
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
