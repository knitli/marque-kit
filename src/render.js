// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * Render — finding JSON (docs/CONTRACT.md) → the kit's DOM.
 *
 * One function per component, in build order (docs/COMPONENTS.md):
 *   rung(f, moment) — which of the five rungs a finding sits on (docs/DERIVATION.md)
 *   markClass(f, m) — C8, the shape class an inline-mark adapter puts on a span
 *   card(f, host)   — C3, the finding card; C4 (the asks renderer) lives inside it
 *   row(f, host)    — C6, the pane's collapsed list item
 *   pane(doc, host) — C6–C7, the whole pane plus the document status line
 *   status(doc, h)  — C7, the one-line document status
 *   artifact(a, h)  — C9, banner / CAB card
 *   gate(doc, host) — C10, the Needs-you section with defer removed
 *   derivation(a)   — C11, how Marque got here
 *   receipt(doc)    — C12, the audit receipt (what the engine will attest)
 *   mount(root, o)  — the pane wired to the kit's state (src/state.js): the
 *                     one call a host needs; it keeps the open card, announces
 *                     new questions and hands every act back to the host
 *
 * Everything reads only the --mq-* tokens through the kit's class names;
 * no colour, size or shape is set here. Plain DOM, no framework.
 *
 * `host` is the thing the kit never decides: { moment, engine, readOnly,
 * onAct, onHelp, onJump, onGate, onReceipt, onRetry, onReport }. Every
 * callback is optional; a missing one makes its control inert rather than
 * absent, so the layout is the same in every host and the person can still
 * see what is possible. `doc` is a view (src/state.js docView) or the
 * engine's document as-is.
 */

import { render as mark, settle } from './marking.js';
import { empty, record, see, docView } from './state.js';

/* ── helpers ─────────────────────────────────────────────────────────── */
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
const placed = (m) => { queueMicrotask(() => settle(m)); return m; };
const SHORT = { front_marking: 'BANNER', authority_block: 'CAB' };
const NAME = { front_marking: 'Banner', authority_block: 'Authority block' };
const where = (f) => f.anchor?.portion ? `¶${f.anchor.portion}` : SHORT[f.kind] || (f.scope === 'document' || f.anchor?.kind === 'document' ? 'DOC' : '—');
const spokenWhere = (f) => f.anchor?.portion ? `Paragraph ${f.anchor.portion}` : NAME[f.kind] || 'The document';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ── 1b · rung ───────────────────────────────────────────────────────── */
/** Moments at which an open "finalize" finding stops the operation. The host
 *  names its moment; Marque never knows it (docs/DERIVATION.md, Table 2). */
const GATE = new Set(['finalize', 'send']);

/**
 * needs_person × blocks × host moment → rung. The kit computes this
 * (decided 16 Oct); the engine emits only the two inputs.
 * @returns {'quiet'|'noticeable'|'advisory'|'action'|'blocking'}
 */
export function rung(f, moment = 'editing') {
  const atGate = GATE.has(moment);
  if (f.needs_person !== 'none' && f.blocks === 'now') return 'blocking';
  if (f.needs_person === 'required') return atGate && f.blocks !== 'never' ? 'blocking' : 'action';
  if (f.needs_person === 'optional') return atGate && f.blocks === 'finalize' ? 'blocking' : 'advisory';
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

const settled = (f) => (f.person?.act === 'answered' || f.person?.act === 'changed') && f.person.value != null;
const SHAPE = { quiet: '', noticeable: '', advisory: 'can-act', action: 'must-act', blocking: 'must-act' };
const STAMP = {
  quiet: ['quiet', 'Done'], noticeable: ['quiet', 'Changed'], advisory: ['act', 'Alternative'],
  action: ['attn', 'Needs you'], blocking: ['attn', 'Blocks finalize'],
};
/** An absent marking while the person is still writing is not a demand yet:
 *  dashed, "at finalize", filed under "Before you finalize". It becomes gold
 *  the moment they try to finalize. */
const waits = (f, moment) => f.marking?.shape === 'absent' && f.needs_person !== 'none' && !GATE.has(moment);
const shapeOf = (f, r, moment) => (waits(f, moment) ? 'absent' : SHAPE[r]);
function stampOf(f, r, moment) {
  if (f.overridden) return ['quiet', 'Reported'];
  if (settled(f)) return ['quiet', f.asked ? 'Answered' : 'Changed'];
  if (r === 'blocking') return ['attn', moment === 'send' ? 'Blocks sending' : 'Blocks finalize'];
  if (r === 'action' && f.deferred) return ['quiet', f.deferred === 'declined' ? 'Not my call' : 'At finalize'];
  if (waits(f, moment)) return ['quiet', 'At finalize'];
  return STAMP[r];
}

/* ── C8 · inline mark ────────────────────────────────────────────────── */
/** The shape class an adapter puts on the marking's span in the document:
 *  web overlay, ::highlight(), or Word's own underline (docs/MODEL.md, Hosts).
 *  Quiet has no mark. */
export function markClass(f, moment = 'editing') {
  if (waits(f, moment)) return 'mq-absent';
  const r = rung(f, moment);
  return r === 'action' || r === 'blocking' ? 'mq-must-act' : r === 'advisory' ? 'mq-can-act' : r === 'noticeable' ? 'mq-changed' : '';
}

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
function asks(f, host, r) {
  const a = f.asks; if (!a) return null;
  const form = el('form', 'mq-ask');
  const name = `ask-${f.id}`;
  let chosen = null;
  const commit = () => { if (chosen) host.onAct?.(f, 'answered', chosen); };
  form.addEventListener('submit', (e) => { e.preventDefault(); commit(); });
  const options = a.options === 'outcome.readings' ? f.outcome.readings : (a.options || []);

  const fs = el('fieldset', 'mq-opts');
  fs.append(el('legend', null, a.text));
  options.forEach((o, i) => {
    const lab = el('label', 'mq-opt');
    const inp = el('input'); inp.type = 'radio'; inp.name = name; inp.value = String(i);
    inp.addEventListener('change', () => { chosen = { reading: o, index: i }; free.value = ''; go.disabled = false; });
    const txt = el('div', 'mq-txt');
    txt.append(el('div', 'mq-pr', o.reading));
    if (o.result) txt.append(placed(mark(o.result, { size: 'sm' })));
    lab.append(inp, txt); fs.append(lab);
  });
  form.append(fs);

  // Free answer — always (decided 16 Oct: someone must always be able to type one).
  const fld = el('div', 'mq-field');
  const lab = el('label', null, a.field?.type === 'marking' ? 'Or type the marking' : 'Or type your answer');
  lab.htmlFor = `${name}-free`;
  const free = el('input', 'mono'); free.id = `${name}-free`; free.type = 'text';
  free.placeholder = a.field?.hint || 'Type an answer';
  free.addEventListener('input', () => {
    const t = free.value.trim();
    chosen = t ? { free: t } : null;
    if (t) form.querySelectorAll('input[type=radio]').forEach((x) => { x.checked = false; });
    go.disabled = !t;
  });
  fld.append(lab, free);
  if (a.field?.waits_on) fld.append(el('div', 'hint', `Waits on ${a.field.waits_on.replace(/_/g, ' ')}.`));
  if (f.deferred === 'declined') fld.append(el('div', 'hint', 'Marked not your call. Someone still has to answer it before the document goes out.'));
  form.append(fld);

  const acts = el('div', 'mq-acts');
  const go = button('attn', 'Answer', commit); go.disabled = true;
  acts.append(go);
  // Blocking is the same card with defer removed (docs/DERIVATION.md).
  if (r !== 'blocking' && f.deferred !== 'deferred') acts.append(button('ghost', 'Ask me at finalize', () => host.onAct?.(f, 'deferred')));
  acts.append(button('ghost', 'Not my call', () => host.onAct?.(f, 'declined')));
  form.append(acts);
  return form;
}

/* ── C3 · the finding card ───────────────────────────────────────────── */
export function card(f, host = {}) {
  const moment = host.moment;
  const r = rung(f, moment);
  const c = el('article', `mq-card ${shapeOf(f, r, moment)}`.trim());
  c.dataset.finding = f.id; c.dataset.rung = r;

  const head = el('div', 'mq-card-head');
  head.append(el('span', 'mq-label', where(f)));
  const [tone, word] = stampOf(f, r, moment);
  head.append(el('span', `mq-stamp ${tone}`, word));
  c.append(head);

  if (r === 'blocking') {
    c.append(el('p', 'mq-p', moment === 'send' ? 'You tried to send. This has to be answered first.' : 'This has to be answered before the document can be finalized.'));
  }

  if (settled(f)) {
    // The answer becomes the headline; changing it is first-class, not an override.
    const v = f.person.value;
    c.append(el('h3', 'mq-q', v.reading?.reading || (f.asked ? `You wrote ${v.free}.` : 'Changed.')));
  } else if (f.overridden) {
    c.append(el('p', 'mq-p', 'Kept as written. Marque will report it.'));
  } else {
    // Question first (decision: style C). The question is the card; the marking is context.
    if (f.asks) c.append(el('h3', 'mq-q', f.asks.text));
    c.append(el('p', 'mq-p', f.says.text));
  }

  // As written → result, when there is a result and it differs.
  if (f.marking?.as_written && f.outcome?.result && f.outcome.kind !== 'choices' && !f.overridden) {
    const was = el('div', 'mq-was');
    was.append(el('span', null, 'Was'), placed(mark(f.marking.as_written, { size: 'sm' })), el('span', null, '→'));
    was.append(placed(mark(f.outcome.result, { size: 'sm', state: r === 'noticeable' || r === 'quiet' ? 'changed' : undefined })));
    c.append(was);
  } else if (!f.marking?.as_written && settled(f) && f.outcome?.result) {
    const now = el('div', 'mq-was');
    now.append(el('span', null, 'Now'), placed(mark(f.outcome.result, { size: 'sm' })));
    c.append(now);
  }

  // The alternative the author also wrote (advisory): one action away.
  if (f.outcome?.kind === 'chosen_over' && f.outcome.readings?.length && !f.overridden) {
    const alt = f.outcome.readings[0];
    const dep = el('div', 'mq-dep');
    dep.append(el('span', null, 'Or, as you also wrote:'), placed(mark(alt.result, { size: 'sm' })));
    dep.append(button('ghost', alt.reading, () => host.onAct?.(f, 'changed', { reading: alt, index: 0 })));
    c.append(dep);
  }

  const ask = asks(f, host, r); if (ask) c.append(ask);

  // Conservative fallback, named, for the unattended boundary.
  if (f.outcome?.fallback && r === 'blocking') {
    const fb = el('div', 'mq-dep');
    fb.append(el('span', null, "If no one can answer, Marque's most restrictive form keeps every stated equity:"));
    fb.append(placed(mark(f.outcome.fallback.result, { size: 'sm' })));
    fb.append(el('span', null, 'The host decides whether to apply it or hold.'));
    c.append(fb);
  }

  const foot = el('div', 'mq-foot');
  const why = el('a', 'mq-why', 'Why?'); why.href = '#';
  why.addEventListener('click', (e) => { e.preventDefault(); host.onHelp?.({ kind: 'why', finding: f }); });
  foot.append(why);
  const ct = cite(f.says.citation, host); if (ct) foot.append(ct);
  // Back to what Marque said: "Change my answer", "Undo" on a choice the
  // person made, "Fix it after all" on an override. Each is a new line in the log.
  if (settled(f)) foot.append(button('ghost', f.asked ? 'Change my answer' : 'Undo', () => host.onAct?.(f, 'changed', null)));
  else if (f.overridden) foot.append(button('ghost', 'Fix it after all', () => host.onAct?.(f, 'changed', null)));
  // No Undo on a fix the person must own; an override is recorded, not hidden.
  else if (r === 'noticeable' || r === 'advisory') foot.append(button('ghost', 'Keep as written', () => host.onAct?.(f, 'kept_as_written')));
  c.append(foot);
  return c;
}

/* ── C6 · the collapsed row ──────────────────────────────────────────── */
export function row(f, host = {}) {
  const isArtifact = !!f.kind;
  const r = isArtifact ? (f.needs_person === 'required' ? (GATE.has(host.moment) ? 'blocking' : 'action') : 'quiet') : rung(f, host.moment);
  const li = el('div', 'mq-row-item'); li.dataset.finding = f.id; li.tabIndex = 0; li.setAttribute('role', 'button');
  li.setAttribute('aria-expanded', 'false');
  li.append(el('span', 'where', where(f)));
  const what = el('div', 'what', f.asks ? f.asks.text : f.says.text);
  const m = f.outcome?.result || f.marking?.as_written;
  if (m) what.append(mark(m, { form: 'folded', size: 'xs' }));
  li.append(what);
  const end = el('div', 'end');
  const [tone, word] = isArtifact
    ? (r === 'blocking' ? ['attn', stampOf(f, r, host.moment)[1]] : ['quiet', 'At finalize'])
    : stampOf(f, r, host.moment);
  end.append(el('span', `mq-stamp sm ${tone}`, word));
  li.append(end);
  const toggle = (open) => {
    const next = li.nextElementSibling;
    if (next?.classList.contains('mq-row-detail')) next.remove();
    li.classList.toggle('open', open); li.setAttribute('aria-expanded', String(open));
    if (!open) return;
    // One card open at a time.
    li.closest('.mq-pane')?.querySelectorAll('.mq-row-item.open').forEach((o) => { if (o !== li) { o.nextElementSibling?.remove(); o.classList.remove('open'); o.setAttribute('aria-expanded', 'false'); } });
    const d = el('div', 'mq-row-detail'); d.append(isArtifact ? artifact(f, host) : card(f, host));
    li.after(d);
  };
  const click = () => {
    const open = !li.classList.contains('open');
    toggle(open); host.onOpen?.(open ? f : null);
    if (open) host.onJump?.(f);
  };
  li.addEventListener('click', click);
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); click(); } });
  if (host.open === f.id) queueMicrotask(() => toggle(true));
  return li;
}

/* ── the pane's sections, shared by the pane, the status and the head ── */
/** Four sections, always in this order; document order within each, never
 *  severity (docs/COMPONENTS.md, Findings pane). */
export function sections(doc, moment = 'editing') {
  const g = { must: [], can: [], later: [], done: [] };
  for (const f of doc.findings) {
    if (f.outcome?.kind === 'covered_by') continue; // one span, one card: it lives in its owner's
    const r = rung(f, moment);
    if (r === 'blocking') g.must.push(f);
    else if (waits(f, moment) || (r === 'action' && f.deferred)) g.later.push(f);
    else if (r === 'action') g.must.push(f);
    else if (r === 'advisory') g.can.push(f);
    else g.done.push(f);
  }
  for (const a of doc.document.artifacts) {
    if (a.needs_person === 'required') (GATE.has(moment) ? g.must : g.later).push(a);
  }
  return g;
}

/* ── C7 · document status ────────────────────────────────────────────── */
export function status(doc, host = {}) {
  const s = el('div', 'mq-status');
  s.setAttribute('role', 'status');
  s.append(el('span', 'mq-label', 'This document'));
  s.append(el('span', 'sep'));
  // The strip exists before Marque has run, so the host's layout never jumps.
  if (!doc || (host.engine && host.engine !== 'ok')) {
    s.append(el('span', 'mq-ui', '—'), el('span', 'mq-stamp quiet', host.engine === 'checking' ? 'Checking' : 'Not checked'));
    return s;
  }
  const banner = doc.document.artifacts.find((a) => a.kind === 'front_marking');
  if (banner?.derived_value) s.append(placed(mark(banner.derived_value, { size: 'lg' })));

  const g = sections(doc, host.moment);
  const overrides = doc.findings.filter((f) => f.overridden).length;
  const words = (t) => el('span', 'mq-small', t);
  if (doc.document.ready && !g.must.length) {
    // Plain, not celebratory: the Ready stamp is outlined because there is nothing to act on.
    s.append(el('span', 'mq-stamp', 'Ready'));
    if (overrides) s.append(el('span', 'mq-stamp', `${overrides} reported`), words(overrides === 1 ? 'one marking kept as written' : `${overrides} markings kept as written`));
    else if (g.done.length) s.append(words(`${plural(g.done.length, 'change', 'changes')} made quietly`));
  } else if (GATE.has(host.moment)) {
    s.classList.add('must');
    const n = doc.document.blocking.length;
    s.append(el('span', 'mq-stamp attn', 'Blocked'), words(`${plural(n, 'thing has', 'things have')} to be settled before it can go out`));
  } else {
    if (g.must.length) { s.classList.add('must'); s.append(el('span', 'mq-stamp attn', `${g.must.length} needs you`)); }
    else s.append(el('span', 'mq-stamp', 'Not ready'));
    if (g.later.length) s.append(words(`${g.must.length ? 'and ' : ''}${g.later.length} before you finalize`));
  }
  return s;
}

/* ── C6 · the pane ───────────────────────────────────────────────────── */
const TITLES = { must: 'Needs you', can: 'Worth a look', later: 'Before you finalize', done: 'Done quietly' };

function engineState(host) {
  const box = el('div', `mq-engine ${host.engine === 'failed' ? 'err' : ''}`.trim());
  const body = el('div', 'mq-txt');
  if (host.engine === 'checking') {
    // No spinner: a sentence.
    body.append(el('div', 'mq-h', 'Checking the document…'), el('p', 'mq-p', 'Usually under a second. The pane fills in as results arrive.'));
  } else if (host.engine === 'failed') {
    // Fail-closed: no partial results, because none were produced.
    body.append(el('div', 'mq-h', 'Marque stopped before checking anything.'),
      el('p', 'mq-p', 'A component failed its integrity check, so nothing was read or changed. The document is as you left it.'));
    const acts = el('div', 'mq-acts');
    acts.append(button('ghost', 'Try again', () => host.onRetry?.()), button('ghost', 'Copy the report for your administrator', () => host.onReport?.()));
    body.append(acts);
  } else {
    body.append(el('div', 'mq-h', "The document hasn't been checked."),
      el('p', 'mq-p', "Marque isn't reachable from this pane. Markings on the page are as written."));
    const acts = el('div', 'mq-acts'); acts.append(button('ghost', 'Retry', () => host.onRetry?.())); body.append(acts);
  }
  box.append(body);
  return box;
}

export function pane(doc, host = {}) {
  const p = el('div', 'mq-pane');
  const head = el('div', 'mq-pane-head');
  const brand = el('div', 'mq-brand'); brand.append('MAR', el('b', null, 'QUE')); head.append(brand);
  p.append(head);

  const down = host.engine && host.engine !== 'ok';
  if (down || !doc) {
    head.append(el('span', `mq-stamp ${host.engine === 'failed' ? '' : 'quiet'}`.trim(),
      { checking: 'Checking', failed: 'Stopped' }[host.engine] || 'Not checked'));
    p.append(status(null, host), engineState(host));
    return p;
  }

  const g = sections(doc, host.moment);
  const atGate = GATE.has(host.moment);
  head.append(g.must.length
    ? el('span', 'mq-stamp attn', atGate ? 'Blocked' : `${g.must.length} needs you`)
    : el('span', 'mq-stamp', doc.document.ready ? 'Ready' : 'Not ready'));
  p.append(status(doc, host));

  if (host.readOnly) {
    // The host's state, not Marque's. Findings still show; a reader needs them too.
    const waiting = doc.findings.filter((f) => f.outcome?.kind === 'applied').length;
    const ro = el('div', 'mq-engine');
    const body = el('div', 'mq-txt');
    body.append(el('div', 'mq-h', 'This document is read-only.'),
      el('p', 'mq-p', `Marque can show what it found but can't change the document. ${waiting ? `${plural(waiting, 'fix is', 'fixes are')} waiting; ` : ''}answers you give are kept for when it can be edited.`));
    ro.append(body); p.append(ro);
  }

  if (!g.must.length && !g.can.length && !g.later.length) {
    p.append(el('div', 'mq-empty', 'Nothing needs you.'));
  }

  for (const k of ['must', 'can', 'later', 'done']) {
    const list = g[k];
    if (!list.length) continue;
    const sec = el('section', `mq-section ${k}`);
    const sh = el('div', 'mq-section-head');
    const id = `mq-sec-${k}`;
    const title = el('span', 'mq-label', TITLES[k]); title.id = id;
    sh.append(title, el('span', 'mq-count-pill', String(list.length)));
    sec.setAttribute('aria-labelledby', id);
    sec.append(sh);
    const rows = el('div', 'mq-rows');
    if (k === 'done') {
      // Collapsed by default to one row with a count. Nothing in it is ever hidden from the receipt.
      const det = el('details', 'mq-quiet');
      if (list.some((f) => f.id === host.open)) det.open = true;
      const sum = el('summary', 'mq-row-item');
      sum.append(el('span', 'where', ''), el('div', 'what', `${plural(list.length, 'change', 'changes')} · show`));
      const end = el('div', 'end'); end.append(el('span', 'mq-stamp sm quiet', 'Changed')); sum.append(end);
      det.append(sum);
      list.forEach((f) => det.append(row(f, host)));
      rows.append(det);
    } else list.forEach((f) => rows.append(row(f, host)));
    sec.append(rows);
    p.append(sec);
  }

  const foot = el('div', 'mq-pane-foot');
  foot.append(button('ghost', 'Check before sending', () => host.onGate?.()), button('ghost', 'Receipt', () => host.onReceipt?.()));
  p.append(foot);
  return p;
}

/* ── C9 · artifact card (banner, CAB) ────────────────────────────────── */
export function artifact(a, host = {}) {
  const must = a.needs_person === 'required';
  const atGate = GATE.has(host.moment);
  const c = el('article', `mq-card ${must && atGate ? 'must-act' : a.state === 'absent_but_required' ? 'absent' : ''}`.trim());
  c.dataset.artifact = a.id;
  const head = el('div', 'mq-card-head');
  head.append(el('span', 'mq-label', NAME[a.kind] || a.kind));
  head.append(el('span', `mq-stamp ${must ? (atGate ? 'attn' : 'quiet') : 'act'}`, must ? (atGate ? 'Needs you' : 'At finalize') : 'Derived'));
  c.append(head);
  c.append(el('p', 'mq-p', a.says.text));
  if (a.derived_value) {
    c.append(placed(mark(a.derived_value, { size: 'lg', state: 'derived' })));
    if (a.placement) c.append(el('span', 'mq-place', `Placed: ${a.placement.replace(/_/g, ' ')}`));
  }
  if (a.fields) {
    const dl = el('div', 'mq-cab');
    for (const [k, fld] of Object.entries(a.fields)) {
      const key = el('span', 'k', k.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase()));
      dl.append(key);
      if (fld.state === 'blank') {
        // A blank a person fills: the field, labelled by its key, committed on Enter or Fill in.
        const v = el('span', 'v blank mq-field');
        const inp = el('input', 'mono'); inp.type = 'text'; inp.id = `${a.id}-${k}`;
        key.id = `${inp.id}-k`; inp.setAttribute('aria-labelledby', key.id);
        inp.placeholder = fld.format || '';
        const fill = () => { const t = inp.value.trim(); if (t) host.onAct?.(a, 'answered', { fields: { [k]: t } }); };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fill(); } });
        v.append(inp);
        if (fld.hint) v.append(el('span', 'hint', fld.hint));
        v.append(button('ghost', 'Fill in', fill));
        dl.append(v);
        continue;
      }
      const v = el('span', `v ${fld.state === 'known' ? 'derived' : ''}`.trim(),
        fld.state === 'known' ? fld.value : fld.state === 'waiting' ? `Waits on ${fld.waits_on.replace(/_/g, ' ')}` : fld.format || '');
      if (fld.hint) v.title = fld.hint;
      dl.append(v);
    }
    c.append(dl);
  }
  if (a.if_taken) {
    const dep = el('div', 'mq-dep');
    for (const [fid, alt] of Object.entries(a.if_taken)) {
      dep.append(el('span', null, `If ¶${fid.match(/p(\d+)/)?.[1] ?? '?'}'s alternative is taken:`), placed(mark(alt, { size: 'sm' })));
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
/** The Needs-you section with defer removed, in the pane's own words, with
 *  the answers inline. The host calls it at its real moment; pass that moment
 *  as host.moment ('finalize' when it isn't one of the gate moments). */
export function gate(doc, host = {}) {
  const h = GATE.has(host.moment) ? host : { ...host, moment: 'finalize' };
  const ids = doc.document.blocking;
  const g = el('div', 'mq-gate');
  g.setAttribute('role', 'region'); g.setAttribute('aria-label', 'Before this can go out');
  if (!ids.length) { g.append(el('h3', 'mq-q', 'Ready to finalize.')); return g; }
  g.append(el('h3', 'mq-q', ids.length === 1 ? 'One thing before this can go out.' : `${ids.length} things before this can go out.`));
  for (const id of ids) {
    const f = doc.findings.find((x) => x.id === id);
    const a = f ? null : doc.document.artifacts.find((x) => x.id === id);
    if (f) g.append(card(f, h)); else if (a) g.append(artifact(a, h));
  }
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
 *  construction: markings, rule ids, spans, decisions — never body text.
 *  Every act the person took is listed, including each changed answer. */
export function receipt(doc, session = {}) {
  const r = el('div', 'mq-receipt');
  const hd = el('div', 'hd');
  hd.append(el('span', null, `MARQUE · ${session.schema || 'audit'}`), el('span', 'who', session.classifier_id || 'classifier id not set'));
  r.append(hd);
  const acts = (x) => (x.history || []).map((e) => e.act.replace(/_/g, ' ')).join(' → ');
  for (const f of doc.findings) {
    const ln = el('div', 'ln');
    ln.append(el('span', 't', where(f)));
    const b = el('div', 'b');
    const did = acts(f);
    b.append(el('span', null, `${f.rule.scheme}:${f.rule.predicate} · ${f.outcome.kind.replace(/_/g, ' ')}${did ? ` · ${did}` : ''}`));
    if (f.marking?.as_written) b.append(mark(f.marking.as_written, { size: 'xs' }));
    if (f.outcome?.result) b.append(mark(f.outcome.result, { size: 'xs', state: 'changed' }));
    ln.append(b); r.append(ln);
  }
  for (const a of doc.document.artifacts.filter((x) => x.history?.length)) {
    const ln = el('div', 'ln');
    ln.append(el('span', 't', where(a)), el('div', 'b', `${a.kind} · ${acts(a)}`));
    r.append(ln);
  }
  const ft = el('div', 'ft');
  ft.append(el('span', null, `${doc.findings.length} findings · ${doc.document.blocking.length} open`), el('span', 'mq-hash', session.session_root || 'session root: computed by the engine at seal'));
  r.append(ft);
  return r;
}

/* ── mount · the pane, wired to the kit's state ──────────────────────── */
/**
 * Mount the pane in `root` and keep it current.
 *
 *   const p = mount(el, { doc, state, moment, onChange, onHelp, onJump, ... });
 *   p.update({ doc })       // after a re-lint
 *   p.update({ moment })    // the host's moment changed
 *   p.view()                // the document with the person's acts on it
 *
 * The kit records each act in `state` (src/state.js) and hands it to
 * `onChange(state, act)` for the host to persist and apply. A new Action
 * required is announced in a polite live region; Quiet changes are not.
 */
export function mount(root, { doc = null, state = empty(), moment = 'editing', engine = 'ok', readOnly = false, ...host } = {}) {
  const cur = { doc, state, moment, engine, readOnly, open: null };
  let said = null;
  const live = el('div', 'mq-sr'); live.setAttribute('aria-live', 'polite');
  const body = el('div');
  root.replaceChildren(body, live);

  const h = {
    ...host,
    get moment() { return cur.moment; },
    get engine() { return cur.engine; },
    get readOnly() { return cur.readOnly; },
    get open() { return cur.open; },
    onOpen(f) {
      cur.open = f?.id ?? null;
      // Opening it is seeing it. Recorded now, drawn next time, so rows never move under the pointer.
      if (f) cur.state = see(cur.state, f.id);
      host.onOpen?.(f);
    },
    onAct(f, act, value = null) {
      cur.state = record(cur.state, f.id, act, value);
      host.onChange?.(cur.state, { id: f.id, act, value });
      draw();
    },
  };

  function draw() {
    const v = cur.doc && docView(cur.doc, cur.state);
    if (v && cur.engine === 'ok') {
      const now = sections(v, cur.moment).must;
      if (said) {
        const fresh = now.filter((f) => !said.has(f.id));
        if (fresh.length) live.textContent = fresh.map((f) => `${spokenWhere(f)} needs you.`).join(' ');
      }
      said = new Set(now.map((f) => f.id));
    }
    body.replaceChildren(pane(v, h));
  }
  draw();

  return {
    update(next) { Object.assign(cur, next); draw(); },
    view: () => cur.doc && docView(cur.doc, cur.state),
    get state() { return cur.state; },
    host: h,
  };
}
