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

const MULTI = [
  'JOINT TOP SECRET', 'COSMIC TOP SECRET', 'TOP SECRET', 'NATO SECRET',
  'NATO CONFIDENTIAL', 'NATO RESTRICTED', 'NATO UNCLASSIFIED', 'REL TO', 'DISPLAY ONLY',
];
const GLUE = '\u0001';

const protect = (s) => MULTI.reduce((t, m) => t.split(m).join(m.replace(/ /g, GLUE)), s);
const unprotect = (s) => s.split(GLUE).join(' ');

/** Split a marking string into its `//` layers. Each layer after the first
 *  starts with the `//` that introduces it. A leading `(` joins layer one. */
export function layers(text) {
  const idx = [];
  for (let m = /\/\//g, r; (r = m.exec(text)); ) idx.push(r.index);
  if (idx.length === 0) return [text];
  const first = text.slice(0, idx[0]);
  const segs = idx.map((p, k) => text.slice(p, k + 1 < idx.length ? idx[k + 1] : text.length));
  if (first.trim() === '' || first.trim() === '(') segs[0] = first + segs[0];
  else segs.unshift(first);
  return segs;
}

/** Split a layer into break-safe tokens: after ', ', before a single '/',
 *  after a space between tokens; never inside a multi-word token. */
export function tokens(layer) {
  const L = protect(layer); const out = []; let buf = '';
  for (let i = 0; i < L.length; ) {
    if (L.startsWith('//', i)) { buf += '//'; i += 2; continue; }
    const c = L[i];
    if (c === '/') { if (buf) out.push(buf); buf = '/'; i += 1; continue; }
    if (L.startsWith(', ', i)) { buf += ', '; out.push(buf); buf = ''; i += 2; continue; }
    if (c === ' ') { buf += ' '; out.push(buf); buf = ''; i += 1; continue; }
    buf += c; i += 1;
  }
  if (buf) out.push(buf);
  return out.map(unprotect);
}

const isCode = (t) => /^\/?[A-Z]{3,4},? ?\)?$/.test(t);
/** A token without its separators: "//REL TO " → "REL TO", "FVEY)" → "FVEY". */
export const bare = (t) => t.replace(/^[(/]+|[),\s]+$/g, '');

/** Parse a string into the layered form the engine should emit. */
export function parse(text) {
  return { text, layers: layers(text).map((l) => ({ tokens: tokens(l).map((t) => ({ t })) })), masks: [] };
}

/** Normalise whatever the caller passed — a string, or an engine marking —
 *  into { text, layers:[{tokens:[{t, help?}]}], masks:[] }. */
export function normalise(marking) {
  if (typeof marking === 'string') return parse(marking);
  if (marking && marking.layers) return marking;
  if (marking && marking.text) return parse(marking.text);
  throw new TypeError('marking must be a string or {text, layers}');
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * Render a marking.
 * @param {string|object} marking  string or engine layered form
 * @param {object} [o]
 * @param {'full'|'folded'|'summary'|'diff'} [o.form='full']
 * @param {string} [o.state]      derived | review | unverified
 * @param {string} [o.size]       xs | sm | lg
 * @param {boolean} [o.stacked]   force one layer per line (the kit measures otherwise)
 * @param {number} [o.fold=3]     codes shown before a fold
 * @param {number[]} [o.differs]  layer indexes that differ between readings (diff form)
 * @param {string} [o.foldLabel]  e.g. "9 more · same in every reading"
 * @param {string[]} [o.help]     tokens with a help entry (says.help[]); each becomes a tier-1 target
 * @returns {HTMLSpanElement}
 */
export function render(marking, o = {}) {
  const m = normalise(marking);
  const root = el('span', 'mq-mark');
  if (o.state) root.classList.add(o.state);
  if (o.size && o.size !== 'sm') root.classList.add(o.size);
  if (o.stacked) root.classList.add('stacked');
  root.setAttribute('dir', 'ltr');
  root.dataset.text = m.text;
  if (o.form === 'summary') return summary(m, root);
  m.layers.forEach((layer, li) => {
    if (li > 0) root.appendChild(document.createElement('wbr'));
    const L = el('span', 'mq-l');
    const differs = (o.differs || []).includes(li);
    if (differs) L.classList.add('differs');
    const toks = layer.tokens;
    const codes = toks.map((t, i) => (isCode(t.t) ? i : -1)).filter((i) => i >= 0);
    const fold = o.form === 'folded' || o.form === 'diff' ? (o.fold ?? 3) : null;
    let shown = toks, hidden = [];
    if (fold != null && !differs && codes.length > fold + 1) {
      const cut = codes[fold]; shown = toks.slice(0, cut); hidden = toks.slice(cut);
    }
    shown.forEach((t, i) => {
      if (i > 0) L.appendChild(document.createElement('wbr'));
      const text = (hidden.length && i === shown.length - 1) ? t.t.replace(/[, ]+$/, '') : t.t;
      const span = el('span', 'mq-i', text);
      const help = t.help || (o.help?.includes(bare(t.t)) ? bare(t.t) : null);
      // Enter opens its help: a button that opens a dialog, to a screen reader too.
      if (help) { span.classList.add('mq-tok'); span.tabIndex = 0; span.dataset.help = help; span.setAttribute('role', 'button'); span.setAttribute('aria-haspopup', 'dialog'); }
      L.appendChild(span);
    });
    if (hidden.length) {
      const n = hidden.filter((t) => isCode(t.t)).length;
      L.appendChild(document.createTextNode(' '));
      const f = el('span', 'mq-fold', '+' + (o.foldLabel || `${n} more`));
      f.setAttribute('role', 'button'); f.tabIndex = 0;
      f.addEventListener('click', () => { root.replaceWith(render(marking, { ...o, form: 'full', stacked: true })); });
      L.appendChild(f);
      const closing = hidden[hidden.length - 1].t.trim().endsWith(')') ? ')' : '';
      if (closing) L.appendChild(el('span', 'mq-i', closing));
    }
    root.appendChild(L);
  });
  // masks: typed regions from the engine (knitli/marque-dev#2634)
  for (const mask of m.masks || []) {
    const L = root.querySelectorAll('.mq-l')[mask.layer];
    if (!L) continue;
    const s = el('span', mask.kind === 'concealed' ? 'mq-conceal' : 'mq-mask',
      (mask.kind === 'concealed' ? '█' : '_').repeat(mask.len));
    s.tabIndex = 0;
    s.title = mask.kind === 'concealed' ? 'Source concealed.' : `${mask.len} characters Marque couldn't identify.`;
    L.appendChild(s);
  }
  return root;
}

function summary(m, root) {
  root.classList.add('summary');
  m.layers.forEach((layer, li) => {
    if (li > 0) root.appendChild(document.createElement('wbr'));
    const toks = layer.tokens.map((t) => t.t);
    const codes = toks.filter(isCode);
    const L = el('span', 'mq-l');
    if (codes.length > 5) {
      const lead = toks.filter((t) => !isCode(t)).join('').replace(/[, ]+$/, '');
      const closing = toks[toks.length - 1].trim().endsWith(')') ? ')' : '';
      const strip = (t) => t.trim().replace(/[,)]+$/, '');
      L.appendChild(document.createTextNode(lead + ' '));
      L.appendChild(el('span', 'mq-count', `${strip(codes[0])}…${strip(codes[codes.length - 1])} · ${codes.length}`));
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
export function settle(root) {
  if (root.classList.contains('stacked') || root.classList.contains('summary')) return root;
  const one = root.getBoundingClientRect().height;
  const line = parseFloat(getComputedStyle(root).lineHeight) || 20;
  if (one > line * 1.5) root.classList.add('stacked');
  return root;
}

/** Spoken form for assistive tech: "Secret, releasable to U-S-A and F-V-E-Y". */
export function spoken(marking, vocab = {}) {
  const m = normalise(marking);
  const words = [];
  for (const layer of m.layers) for (const { t } of layer.tokens) {
    const tok = bare(t);
    if (!tok) continue;
    words.push(vocab[tok] || (/^[A-Z]{3,4}$/.test(tok) ? tok.split('').join('-') : tok));
  }
  return words.join(', ');
}
