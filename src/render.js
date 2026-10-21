// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * Render — finding JSON (docs/CONTRACT.md) → the kit's DOM.
 *
 * One function per component, in build order (docs/COMPONENTS.md):
 *   rung(f)        — which of the five rungs a finding sits on (docs/DERIVATION.md)
 *   card(f, host)  — C3, the finding card; C4 (the asks renderer) lives inside it
 *   row(f, host)   — C6, the pane's collapsed list item
 *   pane(doc, host)— C6–C7, the whole pane plus the document status line
 *   artifact(a)    — C9, banner / CAB card
 *   gate(doc)      — C10, what Finalize shows while the document isn't ready
 *   receipt(doc)   — C12, the audit receipt (what the engine will attest)
 *
 * Everything reads only the --mq-* tokens through the kit's class names;
 * no colour, size or shape is set here. Plain DOM, no framework.
 *
 * `host` is the thing the kit never decides: { moment, onAnswer, onDefer,
 * onKeep, onHelp, onJump }. Every callback is optional; a missing one makes
 * its control inert rather than absent, so the layout is the same in every
 * host and the person can still see what is possible.
 */

import { render as mark, settle } from './marking.js';

/* ── helpers ─────────────────────────────────────────────────────────── */
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const frag = (...kids) => { const f = document.createDocumentFragment(); kids.flat().filter(Boolean).forEach((k) => f.append(k)); return f; };
const where = (f) => f.anchor?.portion ? `¶${f.anchor.portion}` : f.scope === 'document' ? 'DOC' : '—';

/* ── 1b · rung ───────────────────────────────────────────────────────── */
/**
 * needs_person × blocks × host moment → rung. The kit computes this
 * (decided 16 Oct); the engine emits only the two inputs.
 * @returns {'quiet'|'noticeable'|'advisory'|'action'|'blocking'}
 */
export function rung(f, moment = 'editing') {
  if (f.needs_person === 'required') return f.blocks !== 'never' && moment === 'finalize' ? 'blocking' : 'action';
  if (f.needs_person === 'optional') return 'advisory';
  // Nothing for a person to do. Noticeable while a visible change is unseen;
  // seen only quiets. Severity never sets a rung (docs/DERIVATION.md, table 2).
  return visiblyChanged(f) && !f.seen ? 'noticeable' : 'quiet';
}

/** A change a person can see: the tokens differ, not just the whitespace
 *  between them (¶2's added comma, yes; ¶6's doubled space, no). */
function visiblyChanged(f) {
  const was = f.marking?.as_written?.text, now = f.outcome?.result?.text;
  if (!was || !now) return false;
  const norm = (t) => t.replace(/\s+/g, ' ').trim();
  return norm(was) !== norm(now);
}

const SHAPE = { quiet: '', noticeable: '', advisory: 'can-act', action: 'must-act', blocking: 'must-act' };
const STAMP = {
  quiet: ['quiet', 'Done'], noticeable: ['quiet', 'Changed'], advisory: ['act', 'Can act'],
  action: ['attn', 'Needs you'], blocking: ['attn', 'Blocks finalize'],
};
/** An absent marking while the person is still writing is not a demand yet:
 *  dashed, "at finalize", filed under "Waits for finalize". It becomes gold
 *  the moment they try to finalize. */
const waits = (f, moment) => f.marking?.shape === 'absent' && moment !== 'finalize';
const shapeOf = (f, r, moment) => (waits(f, moment) ? 'absent' : SHAPE[r]);
const stampOf = (f, r, moment) => (waits(f, moment) ? ['quiet', 'At finalize'] : STAMP[r]);

/* ── C13 · citation link ─────────────────────────────────────────────── */
function cite(c, host) {
  if (!c) return null;
  const a = el('a', 'mq-cite', `${c.source === 'capco_2016' ? 'CAPCO' : c.source} §${c.section} p${c.page}`);
  a.href = '#';
  a.title = c.short || '';
  a.addEventListener('click', (e) => { e.preventDefault(); host.onHelp?.({ kind: 'citation', citation: c }); });
  return a;
}

/* ── C4 · the asks renderer ──────────────────────────────────────────── */
function asks(f, host) {
  const a = f.asks; if (!a) return null;
  const form = el('form', 'mq-ask');
  form.addEventListener('submit', (e) => { e.preventDefault(); if (chosen) host.onAnswer?.(f, chosen); });
  const name = `ask-${f.id}`;
  let chosen = null;
  const options = a.options === 'outcome.readings' ? f.outcome.readings : (a.options || []);

  const fs = el('fieldset', 'mq-opts');
  fs.append(el('legend', null, a.text));
  options.forEach((r, i) => {
    const lab = el('label', 'mq-opt');
    const inp = el('input'); inp.type = 'radio'; inp.name = name; inp.value = String(i);
    inp.addEventListener('change', () => { chosen = { reading: r, index: i }; free.value = ''; go.disabled = false; });
    const txt = el('div', 'mq-txt');
    txt.append(el('div', 'mq-pr', r.reading));
    if (r.result) { const m = mark(r.result, { size: 'sm' }); txt.append(m); queueMicrotask(() => settle(m)); }
    lab.append(inp, txt); fs.append(lab);
  });
  form.append(fs);

  // Free answer — always (decided 16 Oct: someone must always be able to type one).
  const fld = el('div', 'mq-field');
  const lab = el('label', null, a.field?.type === 'marking' ? 'Or type the marking' : 'Or type your answer');
  lab.htmlFor = `${name}-free`;
  const free = el('input', 'mono'); free.id = `${name}-free`; free.type = 'text';
  free.placeholder = a.field?.hint || 'Type an answer';
  free.addEventListener('input', () => { if (free.value) { chosen = { free: free.value }; form.querySelectorAll('input[type=radio]').forEach((r) => { r.checked = false; }); } go.disabled = !free.value; });
  fld.append(lab, free);
  if (a.field?.waits_on) fld.append(el('div', 'hint', `Waits on ${a.field.waits_on.replace(/_/g, ' ')}.`));
  form.append(fld);

  const acts = el('div', 'mq-acts');
  const go = el('button', 'mq-btn attn', 'Answer'); go.type = 'button'; go.disabled = true;
  go.addEventListener('click', () => chosen && host.onAnswer?.(f, chosen));
  const later = el('button', 'mq-btn ghost', 'Not now'); later.type = 'button';
  later.addEventListener('click', () => host.onDefer?.(f));
  const notMine = el('button', 'mq-btn ghost', 'Not my call'); notMine.type = 'button';
  notMine.addEventListener('click', () => host.onDefer?.(f, { route: true }));
  acts.append(go, later, notMine);
  form.append(acts);
  return form;
}

/* ── C3 · the finding card ───────────────────────────────────────────── */
export function card(f, host = {}) {
  const r = rung(f, host.moment);
  const c = el('article', `mq-card ${shapeOf(f, r, host.moment)}`.trim());
  c.dataset.finding = f.id; c.dataset.rung = r;

  const head = el('div', 'mq-card-head');
  head.append(el('span', 'mq-label', where(f)));
  const [tone, word] = stampOf(f, r, host.moment);
  head.append(el('span', `mq-stamp ${tone}`, word));
  c.append(head);

  // Question first (decision: style C). The question is the card; the marking is context.
  if (f.asks) c.append(el('h3', 'mq-q', f.asks.text));
  c.append(el('p', 'mq-p', f.says.text));

  // As written → result, when there is a result and it differs.
  if (f.marking?.as_written && f.outcome?.result && f.outcome.kind !== 'choices') {
    const was = el('div', 'mq-was');
    was.append(el('span', null, 'Was'));
    const w = mark(f.marking.as_written, { size: 'sm' }); was.append(w);
    was.append(el('span', null, '→'));
    const now = mark(f.outcome.result, { size: 'sm', state: r === 'noticeable' || r === 'quiet' ? 'changed' : undefined }); was.append(now);
    c.append(was); queueMicrotask(() => { settle(w); settle(now); });
  }

  // The alternative the author also wrote (advisory): one action away.
  if (f.outcome?.kind === 'chosen_over' && f.outcome.readings?.length) {
    const alt = f.outcome.readings[0];
    const dep = el('div', 'mq-dep');
    dep.append(el('span', null, 'Or, as you also wrote:'));
    const m = mark(alt.result, { size: 'sm' }); dep.append(m); queueMicrotask(() => settle(m));
    const take = el('button', 'mq-btn ghost', alt.reading); take.type = 'button';
    take.addEventListener('click', () => host.onAnswer?.(f, { reading: alt, index: 0 }));
    dep.append(take);
    c.append(dep);
  }

  const ask = asks(f, host); if (ask) c.append(ask);

  // Conservative fallback, named, for the unattended boundary.
  if (f.outcome?.fallback) {
    const fb = el('div', 'mq-dep');
    fb.append(el('span', null, 'If nobody answers, Marque will use the safe form:'));
    const m = mark(f.outcome.fallback.result, { size: 'sm' }); fb.append(m); queueMicrotask(() => settle(m));
    c.append(fb);
  }

  const foot = el('div', 'mq-foot');
  const why = el('a', 'mq-why', 'Why?'); why.href = '#';
  why.addEventListener('click', (e) => { e.preventDefault(); host.onHelp?.({ kind: 'why', finding: f }); });
  foot.append(why);
  const ct = cite(f.says.citation, host); if (ct) foot.append(ct);
  // No Undo on a fix the person must own; an override is recorded, not hidden.
  if (r === 'noticeable' || r === 'advisory') {
    const keep = el('button', 'mq-btn ghost', 'Keep as written'); keep.type = 'button';
    keep.addEventListener('click', () => host.onKeep?.(f));
    foot.append(keep);
  }
  c.append(foot);
  return c;
}

/* ── C6 · the collapsed row ──────────────────────────────────────────── */
export function row(f, host = {}) {
  const r = rung(f, host.moment);
  const li = el('div', 'mq-row-item'); li.dataset.finding = f.id; li.tabIndex = 0; li.setAttribute('role', 'button');
  li.append(el('span', 'where', where(f)));
  const what = el('div', 'what', f.asks ? f.asks.text : f.says.text);
  const m = f.outcome?.result || f.marking?.as_written;
  if (m) { const mk = mark(m, { form: 'folded', size: 'xs' }); what.append(mk); }
  li.append(what);
  const end = el('div', 'end');
  const [tone, word] = stampOf(f, r, host.moment); end.append(el('span', `mq-stamp sm ${tone}`, word));
  li.append(end);
  const open = () => {
    const next = li.nextElementSibling;
    if (next?.classList.contains('mq-row-detail')) { next.remove(); li.classList.remove('open'); return; }
    const d = el('div', 'mq-row-detail'); d.append(card(f, host));
    li.after(d); li.classList.add('open'); host.onJump?.(f);
  };
  li.addEventListener('click', open);
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return li;
}

/* ── C7 · document status ────────────────────────────────────────────── */
export function status(doc, host = {}) {
  const blocking = doc.document.blocking.length;
  const s = el('div', `mq-status ${blocking ? 'must' : ''}`.trim());
  s.append(el('span', 'mq-label', blocking ? `${blocking} before finalize` : 'Ready to finalize'));
  const banner = doc.document.artifacts.find((a) => a.kind === 'front_marking');
  if (banner?.derived_value) {
    s.append(el('span', 'sep'));
    const m = mark(banner.derived_value, { size: 'lg', state: banner.state === 'absent_but_required' ? 'must-act' : undefined });
    if (banner.state === 'absent_but_required') m.classList.add('mq-must-act');
    s.append(m); queueMicrotask(() => settle(m));
  }
  return s;
}

/* ── C6 · the pane ───────────────────────────────────────────────────── */
export function pane(doc, host = {}) {
  const p = el('div', 'mq-pane');
  const head = el('div', 'mq-pane-head');
  const brand = el('div', 'mq-brand'); brand.append('MAR', el('b', null, 'QUE')); head.append(brand);
  head.append(status(doc, host));
  p.append(head);

  const groups = { must: [], can: [], later: [], done: [] };
  for (const f of doc.findings) {
    const r = rung(f, host.moment);
    (waits(f, host.moment) ? groups.later : r === 'action' || r === 'blocking' ? groups.must
      : r === 'advisory' ? groups.can : groups.done).push(f);
  }
  const titles = { must: 'Needs you', can: 'You can act', later: 'Waits for finalize', done: 'Done quietly' };
  for (const [k, list] of Object.entries(groups)) {
    if (!list.length) continue;
    const sec = el('section', `mq-section ${k}`);
    const sh = el('div', 'mq-section-head');
    sh.append(el('span', 'mq-label', titles[k]), el('span', 'mq-count-pill', String(list.length)));
    sec.append(sh);
    const rows = el('div', 'mq-rows');
    list.forEach((f) => rows.append(row(f, host)));
    sec.append(rows);
    p.append(sec);
  }
  const arts = doc.document.artifacts.filter((a) => a.needs_person === 'required' || a.state === 'absent_but_required');
  if (arts.length) {
    const sec = el('section', 'mq-section must');
    const sh = el('div', 'mq-section-head'); sh.append(el('span', 'mq-label', 'The document'), el('span', 'mq-count-pill', String(arts.length)));
    sec.append(sh);
    arts.forEach((a) => sec.append(artifact(a, host)));
    p.append(sec);
  }
  return p;
}

/* ── C9 · artifact card (banner, CAB) ────────────────────────────────── */
export function artifact(a, host = {}) {
  const must = a.needs_person === 'required';
  const c = el('article', `mq-card ${must ? 'must-act' : a.state === 'absent_but_required' ? 'absent' : ''}`.trim());
  c.dataset.artifact = a.id;
  const head = el('div', 'mq-card-head');
  head.append(el('span', 'mq-label', a.kind === 'front_marking' ? 'Banner' : a.kind === 'authority_block' ? 'Authority block' : a.kind));
  head.append(el('span', `mq-stamp ${must ? 'attn' : 'act'}`, must ? 'Needs you' : 'Derived'));
  c.append(head);
  c.append(el('p', 'mq-p', a.says.text));
  if (a.derived_value) {
    const m = mark(a.derived_value, { size: 'lg', state: 'derived' }); c.append(m); queueMicrotask(() => settle(m));
    if (a.placement) c.append(el('span', 'mq-place', `Placed: ${a.placement.replace(/_/g, ' ')}`));
  }
  if (a.fields) {
    const dl = el('div', 'mq-cab');
    for (const [k, fld] of Object.entries(a.fields)) {
      dl.append(el('span', 'k', k.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase())));
      const v = el('span', `v ${fld.state === 'blank' ? 'blank' : fld.state === 'known' ? 'derived' : ''}`.trim(),
        fld.state === 'known' ? fld.value : fld.state === 'waiting' ? `Waits on ${fld.waits_on.replace(/_/g, ' ')}` : fld.format || '');
      if (fld.hint) v.title = fld.hint;
      dl.append(v);
    }
    c.append(dl);
  }
  if (a.if_taken) {
    const dep = el('div', 'mq-dep');
    for (const [fid, alt] of Object.entries(a.if_taken)) {
      dep.append(el('span', null, `If ¶${fid.match(/p(\d+)/)?.[1] ?? '?'}'s alternative is taken:`));
      const m = mark(alt, { size: 'sm' }); dep.append(m); queueMicrotask(() => settle(m));
    }
    c.append(dep);
  }
  const foot = el('div', 'mq-foot');
  const why = el('a', 'mq-why', a.derivation ? 'How Marque got here' : 'Why?'); why.href = '#';
  why.addEventListener('click', (e) => { e.preventDefault(); host.onHelp?.({ kind: a.derivation ? 'derivation' : 'why', artifact: a }); });
  foot.append(why);
  const ct = cite(a.says.citation, host); if (ct) foot.append(ct);
  c.append(foot);
  return c;
}

/* ── C10 · finalize gate ─────────────────────────────────────────────── */
export function gate(doc, host = {}) {
  const ids = doc.document.blocking;
  const g = el('div', 'mq-gate');
  if (!ids.length) { g.append(el('h3', 'mq-q', 'Ready to finalize.')); return g; }
  g.append(el('h3', 'mq-q', ids.length === 1 ? 'One thing before this can go out.' : `${ids.length} things before this can go out.`));
  const ol = el('ol');
  ids.forEach((id, i) => {
    const f = doc.findings.find((x) => x.id === id) || doc.document.artifacts.find((x) => x.id === id);
    const li = el('li'); li.append(el('span', 'n', String(i + 1)));
    const b = el('button', 'mq-btn ghost', f?.asks?.text || f?.says?.text || id); b.type = 'button';
    b.addEventListener('click', () => host.onJump?.(f));
    li.append(b); ol.append(li);
  });
  g.append(ol);
  return g;
}

/* ── C11 · derivation panel ──────────────────────────────────────────── */
export function derivation(a, doc, host = {}) {
  const d = el('div', 'mq-deriv');
  (a.derivation || []).forEach((step, i) => {
    const s = el('div', 'mq-step'); s.append(el('span', 'n', String(i + 1)));
    const body = el('div', 'body');
    const rule = el('div', 'rule');
    rule.append(el('span', 'mq-label', step.axis), el('span', 'mq-ui', step.output));
    body.append(rule);
    const from = step.inputs.map((id) => where(doc.findings.find((f) => f.id === id) || {})).join(', ');
    body.append(el('p', 'mq-p', `From ${from}.`));
    const ct = cite(step.citation, host); if (ct) body.append(ct);
    s.append(body); d.append(s);
  });
  return d;
}

/* ── C12 · audit receipt ─────────────────────────────────────────────── */
/** What the engine will attest for this session. Content-ignorant by
 *  construction: markings, rule ids, spans, decisions — never body text. */
export function receipt(doc, session = {}) {
  const r = el('div', 'mq-receipt');
  const hd = el('div', 'hd');
  hd.append(el('span', null, `MARQUE · ${session.schema || 'audit'}`), el('span', 'who', session.classifier_id || 'classifier id not set'));
  r.append(hd);
  for (const f of doc.findings) {
    const ln = el('div', 'ln');
    ln.append(el('span', 't', where(f)));
    const b = el('div', 'b');
    b.append(el('span', null, `${f.rule.scheme}:${f.rule.predicate} · ${f.outcome.kind}${f.overridden ? ' · kept as written' : ''}`));
    if (f.marking?.as_written) b.append(mark(f.marking.as_written, { size: 'xs' }));
    if (f.outcome?.result) b.append(mark(f.outcome.result, { size: 'xs', state: 'changed' }));
    ln.append(b); r.append(ln);
  }
  const ft = el('div', 'ft');
  ft.append(el('span', null, `${doc.findings.length} findings · ${doc.document.blocking.length} open`), el('span', 'mq-hash', session.session_root || 'session root: computed by the engine at seal'));
  r.append(ft);
  return r;
}
