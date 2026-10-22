// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * Help in three tiers, and the vocabulary lookup (docs/COMPONENTS.md, C5 and
 * C13; docs/MODEL.md, "Help in three tiers").
 *
 *   tip(code, vocab)            tier 1 · what a token means, two sentences at most
 *   explain(code, vocab, host)  tier 2 · a token: Marque's words, then the manual's, quoted
 *   why(f, host, rung)          tier 2 · a finding: the rule in plain words, the quote, the citation
 *   passage(c, manual, host)    tier 3 · the section itself, landing on the quoted sentence
 *   lookup(vocab, host)         C13 · look up a code; answer(q, vocab) is its pure half
 *   tips(root, vocab, host)     tier-1 behaviour on every .mq-tok under root
 *   float(content, anchor, o)   a popover or window: never modal; Escape closes the
 *                               innermost and returns focus to where it came from
 *
 * The kit writes no help text of its own. `vocab` is the engine's vocab JSON
 * (/v1/vocab, crates/capco/src/vocabulary/bulk.rs): { version, trigraphs,
 * tetragraphs, help }. `manual` is the cited sections, sliced at build:
 * { sections: [{ section, title, pages, text }] }. A token with no entry gets
 * no tooltip; a citation with no section says so rather than showing nothing.
 * Authored words and the manual's words are set apart everywhere (.mq-quote).
 */

import { render as mark } from './marking.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const button = (cls, text, onClick) => {
  const b = el('button', `mq-btn ${cls}`, text); b.type = 'button';
  b.addEventListener('click', onClick); return b;
};
const byCode = (code) => (x) => x.code === code;
const alpha = (a, b) => a.localeCompare(b);

/* ── data ────────────────────────────────────────────────────────────── */
/** What the vocabulary knows about a code, or null. */
export function entry(vocab, code) {
  if (!vocab || !code) return null;
  const c = code.trim().toUpperCase();
  if (vocab.help?.[c]) return { kind: 'marking', code: c, help: vocab.help[c] };
  const t = vocab.tetragraphs?.find(byCode(c));
  if (t) return { kind: 'tetragraph', code: c, ...t };
  const g = vocab.trigraphs?.find(byCode(c));
  if (g) return { kind: 'trigraph', code: c, ...g };
  return null;
}

/** "§H.8 p145" (the engine's help citation) → the typed citation the chip reads. */
export function citation(c, short) {
  if (typeof c !== 'string') return c;
  const m = c.match(/§(\S+)\s+p\.?\s*(\d+)/);
  return m ? { source: 'capco_2016', section: m[1], page: Number(m[2]), short } : null;
}

/* ── C13 · citation chip ─────────────────────────────────────────────── */
export function cite(c, host = {}) {
  if (!c) return null;
  const a = el('a', 'mq-cite', `${c.source === 'capco_2016' ? 'CAPCO' : c.source} §${c.section} p${c.page}`);
  a.href = '#';
  a.title = c.short || '';
  a.addEventListener('click', (e) => { e.preventDefault(); host.onHelp?.({ kind: 'citation', citation: c, anchor: a }); });
  return a;
}

function quote(c, host) {
  const q = el('div', 'mq-txt');
  const src = el('div', 'mq-src'); src.append('The manual says · ', cite(c, host));
  q.append(src, el('blockquote', 'mq-quote', `“${c.short}”`));
  return q;
}

/* ── tier 1 ──────────────────────────────────────────────────────────── */
/** Whether a code has a tier-1 tooltip: a group or country, or a marking with authored text. */
export const hasTip = (vocab, code) => { const e = entry(vocab, code); return !!e && (e.kind !== 'marking' || !!e.help.plain); };

/** Tier 1: the authored plain line and how it's written, or a group's members.
 *  Never a quote. Null when the vocabulary has nothing authored to say. */
export function tip(code, vocab) {
  const e = entry(vocab, code); if (!e) return null;
  const t = el('div', 'mq-tip');
  t.setAttribute('role', 'tooltip');
  const line = el('div');
  line.append(el('span', 't', e.code), ' ');
  if (e.kind === 'marking') {
    if (!e.help.plain) return null;
    line.append(`— ${e.help.plain}`);
    t.append(line);
    if (e.help.examples?.length) t.append(el('div', null, `Written ${e.help.examples.map((x) => `${x.form} in a ${x.kind}`).join(', ')}.`));
    t.append(el('div', 'mq-src', 'Enter: the manual’s words'));
  } else if (e.kind === 'tetragraph') {
    line.append(`— ${e.name}${e.members?.length ? `: ${[...e.members].sort(alpha).join(', ')}` : ''}.`);
    t.append(line, el('div', 'mq-src', `ISMCAT ${vocab.version?.ismcat ?? ''}`.trim()));
  } else {
    line.append(`— ${e.name}.`);
    t.append(line, el('div', 'mq-src', `ISMCAT ${vocab.version?.ismcat ?? ''}`.trim()));
  }
  return t;
}

/* ── tier 2 ──────────────────────────────────────────────────────────── */
/** Tier 2 for a token: plain first, then tips, then the manual's one line, quoted and cited. */
export function explain(code, vocab, host = {}) {
  const e = entry(vocab, code);
  if (e?.kind !== 'marking') return null; // countries and groups are tier 1 only
  const h = e.help, c = citation(h.citation, h.short);
  const p = el('div', 'mq-pop');
  p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', `What ${e.code} means`);
  p.append(el('div', 'mq-h', e.code));
  if (h.plain) p.append(el('p', 'mq-p', h.plain));
  for (const tp of h.tips || []) { const d = el('div', 'mq-txt'); d.append(el('div', 'mq-src', 'Tip'), el('p', 'mq-p', tp)); p.append(d); }
  if (c) p.append(quote(c, host));
  if (h.long) { const more = el('details'); more.append(el('summary', 'mq-src', 'More of the manual’s words'), el('blockquote', 'mq-quote', `“${h.long}”`)); p.append(more); }
  if (h.sponsor) p.append(el('p', 'mq-keep', `Sponsor and basis: ${h.sponsor}${h.policy_basis ? ` / ${h.policy_basis}` : ''}`));
  if (c) p.append(button('ghost', 'Read the full passage', () => host.onHelp?.({ kind: 'section', citation: c, plain: h.plain })));
  return p;
}

/** The person's own answer stands on this finding, live or already written. */
const answered = (f) => f.person?.value != null
  || f.history?.findLast((e) => e.act === 'answered' || e.act === 'changed')?.value != null;

/** Tier 2 for a finding: the rule in plain words, the manual's sentence, the
 *  citation with a way in, and only then what overriding costs, if it can be. */
export function why(f, host = {}, rung = null) {
  const p = el('div', 'mq-pop');
  p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Why');
  p.append(el('div', 'mq-h', 'Why'));
  p.append(el('p', 'mq-p', f.says.text));
  if (f.outcome?.because === 'most_restrictive') p.append(el('p', 'mq-p', 'Marque took the safe reading because it can’t know which you meant.'));
  const c = f.says.citation;
  if (c) {
    p.append(quote(c, host));
    p.append(button('ghost', 'Read the section', () => host.onHelp?.({ kind: 'section', citation: c })));
  }
  // The ISM caveat, when present, must show.
  if (f.says.caveat) p.append(el('p', 'mq-p', f.says.caveat));
  if (rung === 'advisory' && f.outcome?.kind === 'chosen_over' && f.outcome.readings?.length) {
    p.append(el('p', 'mq-keep', 'Both readings are ones you wrote. Choosing between them is yours, and neither is recorded as an override.'));
  } else if ((rung === 'noticeable' || rung === 'quiet') && f.marking?.as_written && !answered(f) && !f.overridden) {
    // Only Marque's own fix can be overridden: never a person's answer, and never a mark nobody wrote.
    const k = el('div', 'mq-keep');
    // Recorded once: the popover closes, so the button can't record it again.
    k.append(button('ghost', 'Keep it as written', () => { host.onAct?.(f, 'kept_as_written'); p.dispatchEvent(new Event('mq-close', { bubbles: true })); }), ' Marque still reports it in the audit.');
    p.append(k);
  }
  return p;
}

/* ── tier 3 ──────────────────────────────────────────────────────────── */
const flat = (t) => t.replace(/\s+/g, ' ').trim();

/** The manual's markdown, rendered without a library: headings, lists,
 *  paragraphs, **bold** and *italic*, and page labels kept so a printed
 *  manual and this view agree. */
function manualBlocks(text) {
  const out = [];
  let para = null, list = null;
  const inline = (node, s) => {
    for (const part of flat(s).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)) {
      if (!part) continue;
      if (part.startsWith('**')) node.append(el('b', null, part.slice(2, -2)));
      else if (part.startsWith('*')) node.append(el('i', null, part.slice(1, -1)));
      else node.append(part);
    }
  };
  const close = () => { para = null; list = null; };
  for (const line of text.split('\n')) {
    let m;
    if ((m = line.match(/^\s*begin page (\d+)/))) { close(); out.push(el('div', 'pg', `page ${m[1]}`)); continue; }
    if (/^\s*end page \d+/.test(line) || /^\s*---\s*$/.test(line)) { close(); continue; }
    if (!line.trim()) { close(); continue; }
    if ((m = line.match(/^#{1,6}\s+(.*)/))) { close(); const h = el('h4'); inline(h, m[1]); out.push(h); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)/))) {
      para = null;
      if (!list) { list = el('ul'); out.push(list); }
      const li = el('li'); inline(li, m[1]); list.append(li); continue;
    }
    list = null;
    if (!para) { para = el('p'); out.push(para); } else para.append(' ');
    inline(para, line);
  }
  return out;
}

/** Wrap [start, end) of a block's text in <mark>, across its inline nodes. */
function highlight(block, start, end) {
  const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const texts = []; for (let n; (n = walk.nextNode());) texts.push(n);
  let at = 0;
  for (const t of texts) {
    const len = t.length; // splitText shortens t
    const a = Math.max(start, at), b = Math.min(end, at + len);
    if (a < b) {
      const piece = t.splitText(a - at); piece.splitText(b - a);
      const m = el('mark'); piece.replaceWith(m); m.append(piece);
    }
    at += len;
  }
}

/** Tier 3: the cited section, landing on the quoted sentence, highlighted.
 *  `plain` is Marque's reading, shown first so nobody starts from the manual. */
export function passage(c, manual, host = {}, { plain } = {}) {
  const s = manual?.sections?.find((x) => x.section === c.section && x.pages[0] <= c.page && c.page <= x.pages[1]);
  const w = el('div', 'mq-window');
  w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', `CAPCO-2016 §${c.section}`);
  const head = el('div', 'mq-window-head');
  const pages = s ? (s.pages[0] === s.pages[1] ? `p${s.pages[0]}` : `p${s.pages[0]}–${s.pages[1]}`) : `p${c.page}`;
  head.append(el('h3', 'mq-src', `CAPCO-2016 · §${c.section}${s ? ` · ${s.title}` : ''} · ${pages}`)); // the manual's own headings follow as h4
  head.append(button('ghost', 'Close', () => host.onClose?.()));
  const body = el('div', 'mq-window-body');
  body.tabIndex = 0; // it scrolls; a keyboard has to be able to scroll it
  w.append(head, body);
  if (plain) { const r = el('div', 'mq-txt'); r.append(el('div', 'mq-src', 'Marque’s reading'), el('p', 'mq-p', plain)); body.append(r); }
  if (!s) {
    body.append(el('p', 'mq-p', `This view doesn’t carry §${c.section}. The citation and its quote are on the card.`));
    return w;
  }
  const doc = el('div', 'mq-manual');
  doc.append(...manualBlocks(s.text));
  body.append(doc);
  // Land on the quote: each fragment between ellipses, wherever it sits.
  const frags = (c.short || '').split('…').map(flat).filter(Boolean);
  const blocks = [...doc.querySelectorAll('p, li, h4')];
  for (const fr of frags) {
    for (const b of blocks) {
      const t = b.textContent, i = t.indexOf(fr);
      if (i >= 0) { highlight(b, i, i + fr.length); break; }
      // A fragment that runs across list items: mark each item it covers whole.
      if (t.length > 20 && fr.includes(flat(t))) highlight(b, 0, t.length);
    }
  }
  queueMicrotask(() => doc.querySelector('mark')?.scrollIntoView({ block: 'center' }));
  return w;
}

/* ── C13 · vocabulary lookup ─────────────────────────────────────────── */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // a swap is one slip
  }
  return d[a.length][b.length];
}

/** What a lookup returns. A miss is an answer: it points at a real code. */
export function answer(q, vocab) {
  const query = (q || '').trim();
  if (!query) return null;
  const e = entry(vocab, query);
  if (e?.kind === 'tetragraph') return { ...e, members: (e.members || []).map((c) => ({ code: c, name: entry(vocab, c)?.name })) };
  if (e?.kind === 'trigraph') {
    const of = (vocab.tetragraphs || []).filter((t) => t.members?.includes(e.code)).map((t) => ({ code: t.code, name: t.name }));
    return { ...e, member_of: of };
  }
  if (e) return e;
  const lower = query.toLowerCase();
  const named = (vocab.trigraphs || []).filter((t) => t.name.toLowerCase().includes(lower)).slice(0, 3);
  if (named.length) return { kind: 'miss', query, nearest: named.map((t) => t.code), by: 'name' };
  const codes = [...(vocab.trigraphs || []), ...(vocab.tetragraphs || [])].map((t) => t.code).concat(Object.keys(vocab.help || {}));
  const up = query.toUpperCase();
  const scored = codes.map((c) => [c, distance(up, c)]);
  const best = Math.min(...scored.map((x) => x[1]));
  const nearest = best <= 2 ? scored.filter((x) => x[1] === best).map((x) => x[0]).sort().slice(0, 3) : [];
  return { kind: 'miss', query, nearest, by: 'spelling' };
}

const KIND = { tetragraph: 'Tetragraph — stands for its members in a list', trigraph: 'Trigraph — a country code', marking: 'Marking' };

function chips(list, host) {
  const c = el('div', 'mq-chips');
  for (const x of list) {
    const ch = el('button', 'mq-chip', x.code); ch.type = 'button';
    if (x.code === 'USA') ch.classList.add('us');
    if (x.name) ch.append(el('span', 'n', x.name));
    ch.addEventListener('click', () => host.onLookup?.(x.code));
    c.append(ch);
  }
  return c;
}

/** Render one answer as the lookup's result card. */
export function result(a, vocab, host = {}) {
  const r = el('div', 'mq-result');
  const row = (k, v) => { r.append(el('span', 'k', k)); const cell = el('div'); cell.append(v); r.append(cell); };
  if (a.kind === 'miss') {
    const p = el('p', 'mq-p');
    p.append(`Nothing in the vocabulary is spelled “${a.query}”. `);
    if (a.nearest.length) {
      p.append(a.by === 'name' ? (a.nearest.length > 1 ? 'Country codes with that name: ' : 'The country code is ') : (a.nearest.length > 1 ? 'The nearest codes are ' : 'The nearest code is '));
      a.nearest.forEach((c, i) => p.append(i ? ', ' : '', button('ghost', c, () => host.onLookup?.(c))));
      p.append('.');
    } else p.append('Try a trigraph like GBR, a tetragraph like FVEY, or a marking like NF.');
    r.append(p);
    return r;
  }
  row('marking', mark(a.code, { size: 'sm' }));
  row('kind', KIND[a.kind]);
  if (a.kind === 'marking') {
    if (a.help.plain) row('means', el('span', 'mq-p', a.help.plain));
    for (const tp of a.help.tips || []) row('note', el('span', 'mq-p', tp));
    const c = citation(a.help.citation, a.help.short);
    if (c) row('source', cite(c, host));
    return r;
  }
  row('name', a.name);
  if (a.kind === 'tetragraph') {
    if (a.members.length) row('members', chips([...a.members].sort((x, y) => alpha(x.code, y.code)), host));
    else row('members', el('span', 'mq-p', 'Not listed: this group isn’t broken out into countries.'));
  } else if (a.member_of.length) row('member of', chips(a.member_of, host));
  row('source', el('span', 'mq-src', `ISMCAT ${vocab.version?.ismcat ?? ''}`.trim()));
  return r;
}

/** The lookup: a field and its answer. Read-only; nothing here changes the document. */
export function lookup(vocab, host = {}, initial = '') {
  const v = el('div', 'mq-vocab');
  const f = el('div', 'mq-field');
  const id = `mq-lookup-${Math.random().toString(36).slice(2, 8)}`;
  const lab = el('label', null, 'Look up a country, tetragraph or marking'); lab.htmlFor = id;
  const inp = el('input', 'mono'); inp.id = id; inp.type = 'search'; inp.autocomplete = 'off'; inp.spellcheck = false;
  f.append(lab, inp, el('div', 'hint', 'A trigraph (GBR), a tetragraph (FVEY), a marking (NF), or a country’s name.'));
  const out = el('div'); out.setAttribute('aria-live', 'polite');
  const show = (q) => { const a = answer(q, vocab); out.replaceChildren(...(a ? [result(a, vocab, { ...host, onLookup: go })] : [])); };
  const go = (q) => { inp.value = q; show(q); inp.focus(); };
  inp.addEventListener('input', () => show(inp.value));
  v.append(f, out);
  const foot = el('div', 'mq-src', `Vocabulary: ISMCAT ${vocab.version?.ismcat ?? '—'} · help ${vocab.version?.help ?? '—'}`);
  v.append(foot);
  if (initial) go(initial);
  return v;
}

/* ── float · popover and window behaviour ────────────────────────────── */
const stack = [];
let escBound = false;
function onEsc(e) {
  if (e.key !== 'Escape' || !stack.length) return;
  e.stopPropagation();
  stack[stack.length - 1].close();
}

/**
 * Show `content` beside `anchor`. kind 'pop' sits below its anchor and
 * closes on a click outside; kind 'window' sits beside the pane and stays
 * open while the person works. Neither is modal. Returns close().
 */
export function float(content, anchor, { kind = 'pop', onClose } = {}) {
  const root = anchor?.closest?.('.mq') || document.querySelector('.mq') || document.body;
  content.classList.add('mq-float', kind);
  if (!content.hasAttribute('role')) content.setAttribute('role', 'dialog'); // non-modal: no aria-modal
  root.append(content);
  const r = anchor?.getBoundingClientRect?.();
  const vw = document.documentElement.clientWidth;
  if (kind === 'pop' && r) {
    content.style.top = `${Math.min(r.bottom + 6, innerHeight - content.offsetHeight - 8)}px`;
    content.style.left = `${Math.max(8, Math.min(r.left, vw - content.offsetWidth - 8))}px`;
  } else {
    // Beside the pane where there's room; over the page where there isn't. Never over the pane.
    const pane = (anchor?.closest?.('.mq-pane') || root.querySelector('.mq-pane'))?.getBoundingClientRect();
    const room = pane ? pane.left - 32 : 0;
    content.style.top = '24px';
    if (room >= 520) content.style.right = `${vw - pane.left + 16}px`;
    else content.style.left = '16px';
  }
  const back = document.activeElement;
  const outside = (e) => { if (!content.contains(e.target) && e.target !== anchor) close(); };
  const entry = { close };
  content.addEventListener('mq-close', close); // content asks to close itself after an act
  function close() {
    const i = stack.indexOf(entry); if (i < 0) return;
    stack.splice(i, 1);
    document.removeEventListener('pointerdown', outside, true);
    content.remove();
    if (back?.isConnected) back.focus(); else anchor?.isConnected && anchor.focus?.();
    onClose?.();
  }
  stack.push(entry);
  if (!escBound) { document.addEventListener('keydown', onEsc, true); escBound = true; }
  if (kind === 'pop') setTimeout(() => document.addEventListener('pointerdown', outside, true));
  const first = content.querySelector('button, a[href], input, summary, [tabindex]');
  content.tabIndex = -1;
  (kind === 'window' ? content.querySelector('input') || content : first || content).focus({ preventScroll: true });
  return close;
}

/* ── tier-1 behaviour ────────────────────────────────────────────────── */
/**
 * Tooltips on every help token (.mq-tok) under `root`: hover opens after
 * 300ms, focus opens at once, below the token and never over the marking.
 * Escape or moving away closes it. Enter asks the host for tier 2
 * (host.onHelp({ kind: 'token', code, anchor })). Delegated, so it survives
 * redraws. Returns a function that detaches it.
 */
export function tips(root, vocab, host = {}) {
  let timer = null, shown = null;
  const id = `mq-tip-${Math.random().toString(36).slice(2, 8)}`;
  const hide = () => { clearTimeout(timer); if (shown) { shown.tok.removeAttribute('aria-describedby'); shown.t.remove(); shown = null; } };
  const show = (tok) => {
    hide();
    const t = tip(tok.dataset.help, vocab); if (!t) return;
    t.id = id; t.classList.add('mq-float');
    // Inside the token's landmark, so a screen reader finds it where the token is.
    (tok.closest('[role=dialog], main, aside, section') || tok.closest('.mq') || document.body).append(t);
    const r = tok.closest('.mq-mark')?.getBoundingClientRect() || tok.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    // Below the marking, or above it when there's no room below.
    const vh = document.documentElement.clientHeight;
    t.style.top = `${r.bottom + 6 + t.offsetHeight > vh - 8 ? Math.max(8, r.top - 6 - t.offsetHeight) : r.bottom + 6}px`;
    t.style.left = `${Math.max(8, Math.min(tok.getBoundingClientRect().left, vw - t.offsetWidth - 8))}px`;
    tok.setAttribute('aria-describedby', id);
    shown = { tok, t };
  };
  const tokOf = (e) => e.target.closest?.('.mq-tok');
  const over = (e) => { const t = tokOf(e); if (t) { clearTimeout(timer); timer = setTimeout(() => show(t), 300); } };
  const out = (e) => { if (tokOf(e)) hide(); };
  const focus = (e) => { const t = tokOf(e); if (t) show(t); };
  const key = (e) => {
    const t = tokOf(e); if (!t) return;
    if (e.key === 'Escape' && shown) { e.stopPropagation(); hide(); }
    if (e.key === 'Enter') { e.preventDefault(); deeper(t); }
  };
  // Countries and groups are tier 1 only: activating one keeps its tooltip rather than asking for nothing.
  const deeper = (t) => {
    if (entry(vocab, t.dataset.help)?.kind !== 'marking') return show(t);
    hide(); host.onHelp?.({ kind: 'token', code: t.dataset.help, anchor: t });
  };
  // A token inside a reading's label opens help, never picks the reading.
  const click = (e) => { const t = tokOf(e); if (t) { e.preventDefault(); e.stopPropagation(); deeper(t); } };
  const on = [['pointerover', over], ['pointerout', out], ['focusin', focus], ['focusout', out], ['keydown', key], ['click', click]];
  on.forEach(([k, fn]) => root.addEventListener(k, fn));
  return () => { hide(); on.forEach(([k, fn]) => root.removeEventListener(k, fn)); };
}

