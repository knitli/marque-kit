// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

import type { Layer, Marking, MarkingInput, Mask, Token } from './types.ts';

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
