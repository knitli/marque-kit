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
 *   (help, vocabulary lookup and the citation chip are in src/help.js)
 *   mount(root, o)  — the pane wired to the kit's state (src/state.js): the
 *                     one call a host needs; it keeps the open card, announces
 *                     new questions and hands every act back to the host
 *
 * Everything reads only the --mq-* tokens through the kit's class names;
 * no colour, size or shape is set here. Plain DOM, no framework.
 *
 * `host` is the thing the kit never decides: { moment, engine, readOnly,
 * vocab, onAct, onHelp, onJump, onGate, onLookup, onReceipt, onRetry, onReport }. Every
 * callback is optional; a missing one makes its control inert rather than
 * absent, so the layout is the same in every host and the person can still
 * see what is possible. `doc` is a view (src/state.js docView) or the
 * engine's document as-is.
 */

import { render as mark, settle, resettle, relabel } from './marking.js';
import { empty, record, see, linted, snapshot, docView, decision, canon } from './state.js';
import { cite, hasTip, tips } from './help.js';
import { check, watch, release } from './theme.js';

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
/** DOM ids per rendered copy: the gate and the pane can show the same finding at once. */
let uid = 0;
const placed = (m) => { queueMicrotask(() => settle(m)); return m; };
const SHORT = { front_marking: 'BANNER', authority_block: 'CAB' };
const NAME = { front_marking: 'Banner', authority_block: 'Authority block' };
const page = (f) => (f.anchor?.kind === 'page' ? f.anchor.page : null);
const where = (f) => f.anchor?.portion ? `¶${f.anchor.portion}` : page(f) != null ? `p${page(f)}` : SHORT[f.kind] || (f.scope === 'document' || f.anchor?.kind === 'document' ? 'DOC' : '—');
const spokenWhere = (f) => f.anchor?.portion ? `Paragraph ${f.anchor.portion}` : page(f) != null ? `Page ${page(f)}` : NAME[f.kind] || 'The document';
/** A marking-valued artifact; a notice may carry typed content instead, which isn't one. */
const isMarking = (v) => typeof v === 'string' || typeof v?.text === 'string';
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
/** How many in `list` changed the document at all, whitespace included. */
const changes = (list) => list.filter((f) => f.outcome?.result && f.marking?.as_written && f.outcome.result.text !== f.marking.as_written.text).length;

function visiblyChanged(f) {
  const was = f.marking?.as_written?.text, now = f.outcome?.result?.text;
  if (!was || !now) return false;
  const norm = (t) => t.replace(/\s+/g, ' ').trim();
  return norm(was) !== norm(now);
}

const decided = decision;
const settled = (f) => decided(f)?.value != null;
const wasAsked = (f) => !!f.asked || !!f.history?.some((e) => e.act === 'answered' && !e.value?.apply); // an apply isn't an answer
const SHAPE = { quiet: '', noticeable: '', advisory: 'can-act', action: 'must-act', blocking: 'must-act' };
const STAMP = {
  quiet: ['quiet', 'Done'], noticeable: ['quiet', 'Changed'], advisory: ['act', 'Alternative'],
  action: ['attn', 'Needs you'], blocking: ['attn', 'Blocks finalize'],
};
/** An absent marking while the person is still writing is not a demand yet:
 *  dashed, "at finalize", filed under "Before you finalize". It becomes gold
 *  the moment they try to finalize. */
const waits = (f, moment) => f.marking?.shape === 'absent' && f.needs_person !== 'none' && f.blocks === 'finalize' && !GATE.has(moment);
const shapeOf = (f, r, moment) => (waits(f, moment) ? 'absent' : SHAPE[r]);
function stampOf(f, r, moment) {
  if (f.overridden) return ['quiet', 'Reported'];
  if (settled(f)) return ['quiet', wasAsked(f) ? 'Answered' : 'Changed'];
  if (r === 'blocking') return ['attn', f.blocks === 'now' ? 'Blocks now' : moment === 'send' ? 'Blocks sending' : 'Blocks finalize'];
  if ((r === 'action' || r === 'advisory') && f.deferred) return ['quiet', f.deferred === 'declined' ? 'Not my call' : 'At finalize'];
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

/* ── C4 · the asks renderer ──────────────────────────────────────────── */
function asks(f, host, r, help) {
  const a = f.asks; if (!a) return null;
  const form = el('form', 'mq-ask');
  const name = `ask-${f.id}-${++uid}`;
  let chosen = null;
  // Answer is never disabled: pressed with nothing chosen, it says what's missing (docs/COMPONENTS.md, C4).
  const err = el('div', 'err'); err.id = `${name}-err`; err.setAttribute('role', 'alert');
  // A typed marking has to look like one before it's written: capitals and marking punctuation,
  // a portion in parentheses, a banner without.
  const shape = { portion: /^\([A-Z0-9/ ,_-]+\)$/, banner: /^[A-Z0-9/ ,_-]+$/ }[a.field?.format] || /^\(?[A-Z0-9/ ,_-]+\)?$/;
  const commit = () => {
    if (chosen?.free && a.field?.type === 'marking' && !shape.test(chosen.free)) {
      fld.classList.add('bad');
      err.textContent = a.field.format === 'portion' ? 'That isn’t a portion marking. Type it in capitals, in parentheses, as it should appear.'
        : 'That isn’t a marking. Type it in capitals, as it should appear.';
      free.focus();
      return;
    }
    if (chosen) return host.onAct?.(f, 'answered', chosen);
    fld.classList.add('bad');
    err.textContent = form.querySelector('input[type=radio]') ? 'Pick one reading, type an answer, or "not my call".' : 'Type an answer, or "not my call".';
    (form.querySelector('input[type=radio]') || free).focus();
  };
  const clear = () => { fld.classList.remove('bad'); err.textContent = ''; };
  form.addEventListener('submit', (e) => { e.preventDefault(); commit(); });
  const options = a.options === 'outcome.readings' ? f.outcome.readings : (a.options || []);

  const fs = el('fieldset', 'mq-opts');
  fs.append(el('legend', null, a.text));
  options.forEach((o, i) => {
    const lab = el('label', 'mq-opt');
    const inp = el('input'); inp.type = 'radio'; inp.name = name; inp.value = String(i); inp.dataset.draft = `${f.id}:reading`;
    inp.dataset.reading = canon(o); // a draft is the reading itself, not its place in the list
    inp.addEventListener('change', () => { chosen = { reading: o, index: i }; free.value = ''; clear(); });
    const txt = el('div', 'mq-txt');
    txt.append(el('div', 'mq-pr', o.reading));
    if (o.result) txt.append(placed(mark(o.result, { size: 'sm', help })));
    lab.append(inp, txt); fs.append(lab);
  });
  form.append(fs);

  // Free answer — always (decided 16 Oct: someone must always be able to type one).
  const fld = el('div', 'mq-field');
  const lab = el('label', null, a.field?.type === 'marking' ? 'Or type the marking' : 'Or type your answer');
  lab.htmlFor = `${name}-free`;
  const free = el('input', 'mono'); free.id = `${name}-free`; free.type = 'text'; free.dataset.draft = `${f.id}:free`;
  free.placeholder = a.field?.hint || 'Type an answer';
  free.addEventListener('input', () => {
    const t = free.value.trim();
    // Blank text doesn't take the answer from a reading still picked.
    chosen = t ? { free: t } : (chosen?.reading ? chosen : null);
    if (t) { form.querySelectorAll('input[type=radio]').forEach((x) => { x.checked = false; }); clear(); }
  });
  free.setAttribute('aria-describedby', err.id);
  fld.append(lab, free, err);
  if (a.field?.waits_on) fld.append(el('div', 'hint', `Waits on ${a.field.waits_on.replace(/_/g, ' ')}.`));
  if (f.deferred === 'declined') fld.append(el('div', 'hint', 'Marked not your call. Someone still has to answer it before the document goes out.'));
  form.append(fld);

  const acts = el('div', 'mq-acts');
  acts.append(button('attn', 'Answer', commit));
  // Blocking is the same card with defer removed (docs/DERIVATION.md).
  if (r !== 'blocking' && f.deferred !== 'deferred') acts.append(button('ghost', 'Ask me at finalize', () => host.onAct?.(f, 'deferred')));
  if (f.deferred !== 'declined') acts.append(button('ghost', 'Not my call', () => host.onAct?.(f, 'declined')));
  form.append(acts);
  return form;
}

/* ── C3 · the finding card ───────────────────────────────────────────── */
export function card(f, host = {}) {
  const moment = host.moment;
  const r = rung(f, moment);
  // Tokens the engine says have help, and the vocabulary can explain (tier 1).
  const help = host.vocab ? (f.says.help || []).filter((k) => hasTip(host.vocab, k)) : [];
  const c = el('article', `mq-card ${shapeOf(f, r, moment)}`.trim());
  c.dataset.finding = f.id; c.dataset.rung = r;

  const head = el('div', 'mq-card-head');
  head.append(el('span', 'mq-label', where(f)));
  const [tone, word] = stampOf(f, r, moment);
  head.append(el('span', `mq-stamp ${tone}`, word));
  c.append(head);

  if (r === 'blocking') {
    c.append(el('p', 'mq-p', f.blocks === 'now' ? 'Marque stopped here. Nothing else is fixed until this is settled.'
      : moment === 'send' ? 'You tried to send. This has to be answered first.' : 'This has to be answered before the document can be finalized.'));
  }

  if (settled(f)) {
    // The answer becomes the headline; changing it is first-class, not an override.
    const v = decided(f).value;
    c.append(el('h3', 'mq-q', v.reading?.reading || (wasAsked(f) && v.free ? `You wrote ${v.free}.` : 'Changed.')));
  } else if (f.overridden) {
    c.append(el('p', 'mq-p', 'Kept as written. Marque will report it.'));
  } else {
    // Question first (decision: style C). The question is the card; the marking is context.
    if (f.asks) c.append(el('h3', 'mq-q', f.asks.text));
    c.append(el('p', 'mq-p', f.says.text));
  }

  // As written → result, when there is a result and it differs.
  // A pending choice shows the marking it asked the host to write.
  if (f.marking?.as_written && !(f.outcome?.result && (f.outcome.kind !== 'choices' || settled(f))) && !f.overridden) {
    // Still to be decided: the marking it's about, as context for the readings below.
    const ctx = el('div', 'mq-was');
    ctx.append(el('span', null, 'As written'), placed(mark(f.marking.as_written, { size: 'sm', help })));
    c.append(ctx);
  } else if (f.marking?.as_written && f.outcome?.result && (f.outcome.kind !== 'choices' || settled(f)) && !f.overridden) {
    const was = el('div', 'mq-was');
    was.append(el('span', null, 'Was'), placed(mark(f.marking.as_written, { size: 'sm', help })), el('span', null, '→'));
    was.append(placed(mark(f.outcome.result, { size: 'sm', help, state: r === 'noticeable' || r === 'quiet' ? 'changed' : undefined })));
    c.append(was);
  } else if (!f.marking?.as_written && settled(f) && f.outcome?.result) {
    const now = el('div', 'mq-was');
    now.append(el('span', null, 'Now'), placed(mark(f.outcome.result, { size: 'sm' })));
    c.append(now);
  }

  // A decision here moves an artifact (its depends_on): say so beside the decision, the gate included.
  if (f.moves?.length && !settled(f) && !f.overridden) {
    const names = [...new Set(f.moves)].map((k) => `the ${(NAME[k] || k.replace(/_/g, ' ')).toLowerCase()}`);
    c.append(el('p', 'mq-p', `What you decide here changes ${names.join(' and ')}.`));
  }

  // The alternative the author also wrote (advisory): one action away.
  if (f.outcome?.kind === 'chosen_over' && f.outcome.readings?.length && !f.overridden && !settled(f)) {
    const alt = f.outcome.readings[0];
    const dep = el('div', 'mq-dep');
    dep.append(el('span', null, 'Or, as you also wrote:'), placed(mark(alt.result, { size: 'sm', help })));
    dep.append(button('ghost', alt.reading, () => host.onAct?.(f, 'changed', { reading: alt, index: 0 })));
    c.append(dep);
  }

  const ask = asks(f, host, r, help); if (ask) c.append(ask);

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
  why.addEventListener('click', (e) => { e.preventDefault(); host.onHelp?.({ kind: 'why', finding: f, rung: r, anchor: why }); });
  foot.append(why);
  const ct = cite(f.says.citation, host); if (ct) foot.append(ct);
  // Back to what Marque said: "Change my answer", "Undo" on a choice the
  // person made, "Fix it after all" on an override. Each is a new line in the log.
  if (settled(f)) foot.append(button('ghost', wasAsked(f) ? 'Change my answer' : 'Undo', () => host.onAct?.(f, 'changed', null)));
  else if (f.overridden) foot.append(button('ghost', 'Fix it after all', () => host.onAct?.(f, 'changed', null)));
  // No Undo on a fix the person must own; an override is recorded, not hidden.
  // An available fix isn't applied yet: leaving it is the default, so there's nothing to keep.
  else if ((r === 'noticeable' || r === 'advisory') && f.outcome?.kind !== 'available') foot.append(button('ghost', 'Keep as written', () => host.onAct?.(f, 'kept_as_written')));
  // Available: Marque has the fix and the person applies it (CONTRACT: available → apply); the host writes it.
  if (f.outcome?.kind === 'available' && f.outcome.result && !settled(f) && !f.overridden && !host.readOnly) {
    const acts = el('div', 'mq-acts');
    acts.append(button('act', 'Apply', () => host.onAct?.(f, 'answered', { apply: true })));
    c.append(acts);
  }
  c.append(foot);
  return c;
}

/* ── C6 · the collapsed row ──────────────────────────────────────────── */
/** An artifact's rung (docs/COMPONENTS.md, Artifact card): Table 2 when it
 *  needs a person, as for a finding. Otherwise a derived value nobody has
 *  written yet, or an artifact that isn't required, is Advisory; anything
 *  else (a non-canonical fix, a block the person filled in) is done. */
const artRung = (a, moment) => a.needs_person !== 'none' ? rung(a, moment)
  : a.applying ? 'quiet'
  : a.state === 'present_not_canonical' ? (a.seen ? 'quiet' : 'noticeable')
  : a.state === 'present_not_required' || (a.state === 'absent_but_required' && a.derived_value) ? 'advisory' : 'quiet';
/** A required artifact that only blocks at finalize waits for it, like an absent mark. */
const artWaits = (a, moment) => a.blocks === 'finalize' && !GATE.has(moment);
/** An artifact's stamp says what it is: missing and derived, there but not required, changed, or done. */
const artStamp = (a, r, moment) => (r === 'blocking' ? ['attn', stampOf(a, r, moment)[1]]
  : r === 'action' ? (artWaits(a, moment) ? ['quiet', 'At finalize'] : ['attn', 'Needs you'])
  : a.applying ? ['quiet', 'To be written']
  : a.state === 'present_not_required' ? ['act', 'Not required']
  : a.state === 'absent_but_required' && a.derived_value ? ['act', 'Derived']
  : a.state === 'present_not_canonical' ? ['quiet', 'Changed'] : ['quiet', 'Done']);

export function row(f, host = {}) {
  const isArtifact = !!f.kind;
  const r = isArtifact ? artRung(f, host.moment) : rung(f, host.moment);
  const li = el('div', 'mq-row-item'); li.dataset.finding = f.id; li.tabIndex = 0; li.setAttribute('role', 'button');
  if (!host.narrow) li.setAttribute('aria-expanded', 'false');
  li.append(el('span', 'where', where(f)));
  const what = el('div', 'what', f.asks ? f.asks.text : f.says.text);
  const m = f.outcome?.result || f.marking?.as_written;
  if (m) what.append(mark(m, { form: 'folded', size: 'xs' }));
  li.append(what);
  const end = el('div', 'end');
  const [tone, word] = isArtifact ? artStamp(f, r, host.moment) : stampOf(f, r, host.moment);
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
    if (host.vocab) relabel(d, host.vocab);
    // Escape from inside the card closes it and goes back to its row.
    // A token's open tooltip takes the first Escape.
    d.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.target.getAttribute?.('aria-describedby')?.startsWith('mq-tip')) return;
      e.preventDefault(); toggle(false); host.onOpen?.(null); li.focus();
    });
    li.after(d);
  };
  const click = () => {
    // Under the width floor there is no room for a card: the host is told, and shows it its own way.
    if (host.narrow) { host.onOpen?.(f); host.onJump?.(f); return; }
    const open = !li.classList.contains('open');
    toggle(open); host.onOpen?.(open ? f : null);
    if (open) host.onJump?.(f);
  };
  li.addEventListener('click', click);
  li.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); click();
    // Opened from the keyboard: on to the question, its chosen or first reading, else the field.
    const d = li.classList.contains('open') && li.nextElementSibling;
    (d?.querySelector('input[type=radio]:checked') || d?.querySelector('input, button'))?.focus();
  });
  if (host.open === f.id && !host.narrow) queueMicrotask(() => toggle(true));
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
    // "Not my call" routes the question; it stays Action required for whoever gets it.
    // Deferred, Advisory or Action required, it waits for finalize, where it blocks.
    // At the gate the moment it waited for has come, so one that never blocks is back in its section.
    else if (waits(f, moment) || ((r === 'action' || r === 'advisory') && f.deferred === 'deferred' && !GATE.has(moment))) g.later.push(f);
    else if (r === 'action') g.must.push(f);
    else if (r === 'advisory') g.can.push(f);
    else g.done.push(f);
  }
  for (const a of doc.document.artifacts) {
    if (a.state === 'present' || a.state === 'absent_not_required') continue; // receipt entries, not cards
    const r = artRung(a, moment);
    (r === 'blocking' ? g.must : r === 'action' ? (artWaits(a, moment) ? g.later : g.must) : r === 'advisory' ? g.can : g.done).push(a);
  }
  return g;
}

/* ── C7 · document status ────────────────────────────────────────────── */
/** A required artifact Marque derived and nobody has written: it goes in as the document goes out. */
const due = (a) => a.state === 'absent_but_required' && a.derived_value && a.fixability === 'fixable';
/** Read-only, nothing can be written, so a due artifact holds the document up. */
const unwritable = (doc, host) => (host.readOnly ? doc.document.artifacts.filter(due).length : 0);
const ready = (doc, host) => doc.document.ready && !unwritable(doc, host);
/** What the gate lists: blockers and the writes still waiting, once each. A required
 *  finding that never blocks needs the person but holds nothing up. */
const holding = (doc, host = {}) => [...new Set([...doc.document.blocking, ...(doc.document.pending || []),
  ...(host.readOnly ? doc.document.artifacts.filter(due).map((a) => a.id) : [])])];
const held = (doc, host) => holding(doc, host).length;

export function status(doc, host = {}) {
  const s = el('div', 'mq-status');
  s.setAttribute('role', 'status');
  s.append(el('span', 'mq-label', 'This document'));
  s.append(el('span', 'sep'));
  // The strip exists before Marque has run, so the host's layout never jumps.
  if (!doc || (host.engine && host.engine !== 'ok')) {
    s.append(el('span', 'mq-ui', '—'), el('span', 'mq-stamp quiet', { checking: 'Checking', failed: 'Stopped' }[host.engine] || 'Not checked'));
    return s;
  }
  const banner = doc.document.artifacts.find((a) => a.kind === 'front_marking');
  if (banner?.derived_value) s.append(placed(mark(banner.derived_value, { size: 'lg' })));

  const g = sections(doc, host.moment);
  const overrides = doc.findings.filter((f) => f.overridden).length;
  const words = (t) => el('span', 'mq-small', t);
  const stuck = unwritable(doc, host);
  if (ready(doc, host) && !g.must.length) {
    // Plain, not celebratory: the Ready stamp is outlined because there is nothing to act on.
    s.append(el('span', 'mq-stamp', 'Ready'));
    if (overrides) s.append(el('span', 'mq-stamp', `${overrides} reported`), words(overrides === 1 ? 'one marking kept as written' : `${overrides} markings kept as written`));
    else if (changes(g.done)) s.append(words(`${plural(changes(g.done), 'change', 'changes')} made quietly`));
  } else if (!g.must.length && doc.document.pending?.length) {
    // Everything is answered; the host hasn't written it yet.
    s.append(el('span', 'mq-stamp', 'Not ready'), words(`${plural(doc.document.pending.length, 'answer', 'answers')} waiting to be written into the document`));
  } else if (!g.must.length && stuck) {
    s.append(el('span', 'mq-stamp', 'Not ready'), words(`${plural(stuck, 'thing', 'things')} can't be written while the document is read-only`));
  } else if (GATE.has(host.moment) && held(doc, host)) {
    s.classList.add('must');
    const n = held(doc, host);
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
  // Still checking with results in: they show as they arrive, under the checking notice.
  const partial = host.engine === 'checking' && !!doc;
  if (!partial && (down || !doc)) {
    head.append(el('span', `mq-stamp ${host.engine === 'failed' ? '' : 'quiet'}`.trim(),
      { checking: 'Checking', failed: 'Stopped' }[host.engine] || 'Not checked'));
    p.append(status(null, host), engineState(host));
    return p;
  }

  const g = sections(doc, host.moment);
  const atGate = GATE.has(host.moment);
  head.append(partial ? el('span', 'mq-stamp quiet', 'Checking')
    : g.must.length ? el('span', 'mq-stamp attn', atGate && held(doc, host) ? 'Blocked' : `${g.must.length} needs you`)
    : el('span', 'mq-stamp', ready(doc, host) ? 'Ready' : 'Not ready'));
  p.append(status(doc, host));
  if (partial) p.append(engineState(host));

  if (host.readOnly) {
    // The host's state, not Marque's. Findings still show; a reader needs them too.
    const waiting = doc.document.pending?.length || 0; // acts the host hasn't written, not Marque's own fixes
    const ro = el('div', 'mq-engine');
    const body = el('div', 'mq-txt');
    body.append(el('div', 'mq-h', 'This document is read-only.'),
      el('p', 'mq-p', `Marque can show what it found but can't change the document. ${waiting ? `${plural(waiting, 'answer is', 'answers are')} waiting; answers` : 'Answers'} you give are kept for when it can be edited.`));
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
    const id = `mq-sec-${k}-${++uid}`;
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
      // Not everything here changed the document: a withheld note or a canonical artifact is done, not a change.
      const n = changes(list);
      sum.append(el('span', 'where', ''), el('div', 'what', `${n === list.length ? plural(n, 'change', 'changes') : `${list.length} done${n ? `, ${n} changed` : ''}`} · show`));
      const end = el('div', 'end'); end.append(el('span', 'mq-stamp sm quiet', n ? 'Changed' : 'Done')); sum.append(end);
      det.append(sum);
      list.forEach((f) => det.append(row(f, host)));
      rows.append(det);
    } else list.forEach((f) => rows.append(row(f, host)));
    sec.append(rows);
    p.append(sec);
  }

  const foot = el('div', 'mq-pane-foot');
  foot.append(button('ghost', 'Check before sending', () => host.onGate?.()), button('ghost', 'Look up a code', (e) => host.onLookup?.(e.currentTarget)), button('ghost', 'Receipt', () => host.onReceipt?.()));
  p.append(foot);
  return p;
}

/* ── C9 · artifact card (banner, CAB) ────────────────────────────────── */
export function artifact(a, host = {}) {
  const r = artRung(a, host.moment);
  const must = r === 'blocking' || r === 'action';
  const atGate = must && !artWaits(a, host.moment); // gold now, not at finalize
  const c = el('article', `mq-card ${atGate ? 'must-act' : a.state === 'absent_but_required' ? 'absent' : ''}`.trim());
  c.dataset.artifact = a.id;
  const head = el('div', 'mq-card-head');
  head.append(el('span', 'mq-label', NAME[a.kind] || a.kind));
  const [tone, word] = artStamp(a, r, host.moment);
  head.append(el('span', `mq-stamp ${tone}`, word));
  c.append(head);
  c.append(el('p', 'mq-p', a.says.text));
  if (a.derived_value) {
    // Typed notice content isn't a marking: its words are the host's to show. Either way it can be applied.
    c.append(isMarking(a.derived_value) ? placed(mark(a.derived_value, { size: 'lg', state: 'derived' })) : el('p', 'mq-p', 'Marque has a notice to add here.'));
    if (a.placement) c.append(el('span', 'mq-place', `Placed: ${a.placement.replace(/_/g, ' ')}`));
    // Generated, not applied: the person can apply it; the host writes it (docs/COMPONENTS.md, C9).
    const fixes = a.state === 'absent_but_required' || a.state === 'present_not_canonical';
    if (a.applying && fixes) c.append(el('p', 'mq-p', 'Waiting to be written into the document.'));
    else if (a.fixability === 'fixable' && fixes && !host.readOnly) {
      const acts = el('div', 'mq-acts');
      acts.append(button('act', 'Apply', () => host.onAct?.(a, 'answered', { apply: true })));
      c.append(acts);
    }
  }
  // Present but not required: an Advisory in its own right, one optional action. Leaving it is the other choice.
  if (a.state === 'present_not_required' && !a.applying && !host.readOnly) {
    const acts = el('div', 'mq-acts');
    acts.append(button('act', 'Remove it', () => host.onAct?.(a, 'answered', { remove: true })));
    c.append(acts);
  } else if (a.state === 'present_not_required' && a.applying) c.append(el('p', 'mq-p', 'Waiting to be removed from the document.'));
  if (a.fields) {
    const dl = el('div', 'mq-cab');
    // A field a person fills: labelled by its key, committed on Enter or Fill in.
    const entry = (k, fld, key) => {
      const v = el('span', 'v blank mq-field');
      const inp = el('input', 'mono'); inp.type = 'text'; inp.id = `${a.id}-${k}-${++uid}`; inp.dataset.draft = `${a.id}:${k}`;
      key.id = `${inp.id}-k`; inp.setAttribute('aria-labelledby', key.id);
      inp.placeholder = fld.format || ''; inp.defaultValue = fld.value || '';
      const fill = () => { const t = inp.value.trim(); if (t && t !== fld.value) host.onAct?.(a, 'answered', { fields: { [k]: t } }); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fill(); } });
      v.append(inp);
      if (fld.hint) v.append(el('span', 'hint', fld.hint));
      v.append(button('ghost', 'Fill in', fill));
      return v;
    };
    for (const [k, fld] of Object.entries(a.fields)) {
      const key = el('span', 'k', k.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase()));
      dl.append(key);
      if (fld.state === 'blank') { dl.append(entry(k, fld, key)); continue; }
      const has = fld.state === 'known' || fld.state === 'derived';
      const v = el('span', `v ${has ? 'derived' : ''}`.trim(),
        has ? fld.value : fld.state === 'waiting' ? `Waits on ${fld.waits_on.replace(/_/g, ' ')}` : fld.format || '');
      if (fld.hint) v.title = fld.hint;
      // A filled field stays correctable: a typo, or Classified By when someone else made the call.
      // Read-only too: the correction waits with the other answers.
      if (has) {
        const change = button('ghost', 'Change', () => { const n = entry(k, fld, key); v.replaceWith(n); const i = n.querySelector('input'); i.dataset.opened = '1'; i.focus(); });
        change.dataset.change = `${a.id}:${k}`;
        v.append(' ', change);
      }
      dl.append(v);
    }
    c.append(dl);
    if (a.applying && !a.derived_value && a.state !== 'present_not_required') c.append(el('p', 'mq-p', 'Waiting to be written into the document.'));
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
  why.addEventListener('click', (e) => { e.preventDefault(); host.onHelp?.({ kind: a.derivation ? 'derivation' : 'why', artifact: a, anchor: why }); });
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
  if (host.vocab) queueMicrotask(() => relabel(g, host.vocab)); // once its cards are in
  if (!ids.length) {
    // Still the last look before it goes out: what will be written, and what the person answered.
    const n = doc.document.pending?.length;
    // What still has to be written: pending acts, and a derived artifact nobody has written. Done acts are not future writes.
    const pend = new Set(doc.document.pending || []);
    const will = doc.document.artifacts.filter((a) => pend.has(a.id) || due(a));
    // What the person decided and still stands; one they took back is the receipt's to show.
    const answered = doc.findings.filter((f) => pend.has(f.id) || decision(f)?.value != null);
    const stuck = unwritable(doc, host);
    g.append(el('h3', 'mq-q', n ? `Waiting for ${plural(n, 'answer', 'answers')} to be written into the document.`
      : stuck ? `Not ready. The document is read-only, so ${plural(stuck, 'thing', 'things')} can't be written into it.`
      : will.length ? `Ready. ${plural(will.length, 'thing', 'things')} will be applied as it goes out.` : 'Ready to finalize.'));
    will.forEach((a) => g.append(artifact(a, h)));
    answered.forEach((f) => g.append(card(f, h)));
    return g;
  }
  // An answer still waiting to be written holds it up too, and so, read-only, does a required artifact nobody can write.
  const all = holding(doc, host);
  g.append(el('h3', 'mq-q', all.length === 1 ? 'One thing before this can go out.' : `${all.length} things before this can go out.`));
  for (const id of all) {
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
  // Each act with what was said and when, so a changed answer keeps the one it replaced.
  // A reading by its words and its marking: two readings can write the same marking.
  const said = (v) => (v?.reading ? `${v.reading.result?.text ?? ''} (${v.reading.reading})`.trim() : null) ?? v?.free
    ?? (v?.fields ? Object.entries(v.fields).map(([k, t]) => `${k.replace(/_/g, ' ')} ${t}`).join(', ') : '');
  const op = (e) => (e.act === 'changed' && e.value == null ? 'back to Marque\u2019s result'
    : e.act === 'kept_as_written' ? (e.about?.result ? `instead of ${e.about.result}` : '')
    : e.value?.apply ? `apply${e.about?.result ? ` ${e.about.result}` : ''}` : e.value?.remove ? 'remove' : said(e.value));
  // An act taken on another rule or marking under this id says which, from its own snapshot.
  const about = (e, x) => {
    const rule = x.rule ? `${x.rule.scheme}:${x.rule.predicate}` : x.kind;
    if (!e.about) return '';
    if (e.about.rule && e.about.rule !== rule) return `on ${e.about.rule}${e.about.as_written ? ` ${e.about.as_written}` : ''}`;
    return e.about.as_written !== (x.marking?.as_written?.text ?? null) && e.about.as_written ? `asked of ${e.about.as_written}` : '';
  };
  const acts = (x) => (x.history || []).map((e) => [e.act.replace(/_/g, ' '), op(e), about(e, x), e.at].filter(Boolean).join(' ')).join(' → ');
  for (const f of doc.findings) {
    const ln = el('div', 'ln');
    ln.append(el('span', 't', where(f)));
    const b = el('div', 'b');
    const did = acts(f);
    b.append(el('span', null, `${f.rule.scheme}:${f.rule.predicate} · ${f.outcome.kind.replace(/_/g, ' ')}${did ? ` · ${did}` : ''}`));
    if (f.marking?.as_written) b.append(placed(mark(f.marking.as_written, { size: 'xs' })));
    if (f.outcome?.result) b.append(placed(mark(f.outcome.result, { size: 'xs', state: 'changed' })));
    ln.append(b); r.append(ln);
  }
  // Every artifact, card or not: present and absent-not-required ones live only here.
  for (const a of doc.document.artifacts) {
    const ln = el('div', 'ln');
    const did = acts(a);
    const b = el('div', 'b');
    b.append(el('span', null, `${a.kind} · ${a.state.replace(/_/g, ' ')}${did ? ` · ${did}` : ''}`));
    if (isMarking(a.derived_value)) b.append(placed(mark(a.derived_value, { size: 'xs', state: 'changed' })));
    ln.append(el('span', 't', where(a)), b);
    r.append(ln);
  }
  // Acts on findings a later lint withdrew stay in the audit.
  for (const x of doc.document.withdrawn || []) {
    const ln = el('div', 'ln');
    const a = x.about || {};
    ln.append(el('span', 't', a.anchor || a.kind ? where(a) : '—'));
    const b = el('div', 'b');
    b.append(el('span', null, `${a.rule ? `${a.rule} · ` : ''}no longer reported · ${acts(x)}`));
    // From the act's own marking where it has one: its masks stay masks.
    if (a.marking || a.as_written) b.append(placed(mark(a.marking || { text: a.as_written }, { size: 'xs' })));
    ln.append(b);
    r.append(ln);
  }
  const ft = el('div', 'ft');
  ft.append(el('span', null, `${doc.findings.length} findings · ${doc.document.blocking.length} open${doc.document.pending?.length ? ` · ${doc.document.pending.length} waiting to be written` : ''}`), el('span', 'mq-hash', session.session_root || 'session root: computed by the engine at seal'));
  r.append(ft);
  return r;
}

/* ── mount · the pane, wired to the kit's state ──────────────────────── */
/**
 * Mount the pane in `root` and keep it current.
 *
 *   const p = mount(el, { doc, state, moment, onChange, onHelp, onJump, ... });
 *   p.update({ doc })       // after a re-lint
 *   p.update({ doc, linted: n, seq }) // async: n = p.state.log.length when that lint
 *                                     // began; seq = the host's request counter
 *   p.update({ moment })    // the host's moment changed
 *   p.view()                // the document with the person's acts on it
 *
 * Help on tokens is bound inside the pane; a host that renders gate() or a
 * card elsewhere binds tips(surface, vocab, p.host) on that surface too.
 *
 * The kit records each act in `state` (src/state.js) and hands it to
 * `onChange(state, act)` for the host to persist and apply; `act` is null
 * when only bookkeeping changed (the seen list, the lint checkpoint). An answer stays pending, and the document
 * not ready, until the host re-lints and passes the new `doc`. A new Action
 * required is announced in a polite live region; Quiet changes are not.
 */
export function mount(root, { doc = null, state = empty(), moment = 'editing', engine = 'ok', readOnly = false, ...host } = {}) {
  const cur = { doc, state, moment, engine, readOnly, open: null, seq: null };
  // Findings already there at mount aren't news; the first ones to arrive later are.
  let said = doc ? null : new Set(), unseen = false;
  const live = el('div', 'mq-sr'); live.setAttribute('aria-live', 'polite');
  const body = el('div');
  // The kit root carries the tokens; one above it (with its theme) wins, so only add it when there is none.
  const added = !root.closest('.mq');
  if (added) root.classList.add('mq');
  // Every mount is its own query container, so the card's narrow rules follow this pane, not a wider ancestor.
  root.classList.add('mq-mount');
  root.replaceChildren(body, live);
  let theme = check(root); // before the first draw, so a failing host token never shows
  // Under the floor, rows only, in the room there is: the root's own minimum steps aside.
  const narrowed = () => root.classList.toggle('mq-narrow', !!theme?.narrow);
  narrowed();
  host.onTheme?.(theme);
  // A marking stacked or not at one width is measured again at another.
  let width = 0;
  const sized = typeof ResizeObserver !== 'undefined' && new ResizeObserver(() => {
    if (root.clientWidth === width) return;
    width = root.clientWidth;
    root.querySelectorAll('.mq-mark').forEach(resettle);
  });
  if (sized) sized.observe(root);
  const unwatch = typeof MutationObserver !== 'undefined' ? watch(root, (r) => {
    const was = !!theme?.narrow;
    theme = r; narrowed(); host.onTheme?.(r);
    if (!!r?.narrow !== was) draw();
  }) : () => {};
  const untips = host.vocab ? tips(body, host.vocab, host) : () => {};

  const h = {
    ...host,
    get moment() { return cur.moment; },
    get engine() { return cur.engine; },
    get readOnly() { return cur.readOnly; },
    get open() { return cur.open; },
    get narrow() { return !!theme?.narrow; },
    onOpen(f) {
      cur.open = f?.id ?? null;
      // Opening it is seeing it. Recorded now and drawn when the row closes, so rows never move under the pointer.
      if (f) {
        const s = see(cur.state, f);
        // Narrow, there's no card to close, so the row is drawn as seen now.
        if (s !== cur.state) { cur.state = s; host.onChange?.(s, null); if (theme?.narrow) queueMicrotask(() => draw()); else unseen = true; }
      } else if (unseen) { unseen = false; queueMicrotask(() => draw()); }
      host.onOpen?.(f);
    },
    onAct(f, act, value = null) {
      cur.state = record(cur.state, f.id, act, value, undefined, snapshot(f));
      // The card stays open where the finding now lives, and keeps focus if it had it.
      const inPane = body.contains(document.activeElement);
      cur.open = f.id;
      // A host that re-lints at once redraws inside onChange; this finding's draft went with the act.
      acting = f.id;
      try { host.onChange?.(cur.state, { id: f.id, act, value }); } finally { acting = null; }
      draw(inPane ? f.id : null, { fresh: true });
    },
  };

  /** A redraw replaces the pane; put focus back on the same finding's card,
   *  or its row when the card is closed, so a keyboard user isn't sent to the top. */
  function refocus(id) {
    if (!id) return;
    queueMicrotask(() => {
      const sel = `[data-finding="${CSS.escape(id)}"], [data-artifact="${CSS.escape(id)}"]`;
      const target = body.querySelector(`.mq-row-detail :is(${sel})`) || body.querySelector(`.mq-row-item:is(${sel})`);
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus();
    });
  }

  const focusedId = () => {
    const n = body.contains(document.activeElement) && document.activeElement.closest('[data-finding], [data-artifact]');
    return n ? n.dataset.finding ?? n.dataset.artifact : null;
  };

  /** What the person has picked or typed and not yet sent, by a key that survives a redraw. */
  let acting = null, gen = 0; // the finding being acted on (its draft is spent); which draw is current
  const drafts = () => [...body.querySelectorAll('[data-draft]')]
    .filter((x) => !acting || !x.dataset.draft.startsWith(`${acting}:`))
    // An opened correction counts as soon as it's open, typed in or not.
    .filter((x) => (x.type === 'radio' ? x.checked : x.dataset.opened || (x.value.trim() && x.value !== x.defaultValue)))
    .map((x) => ({ key: x.dataset.draft, value: x.type === 'radio' ? x.dataset.reading : x.value, radio: x.type === 'radio', focused: x === document.activeElement }));
  function restore(list) {
    const find = (d) => [...body.querySelectorAll('[data-draft]')].find((x) => x.dataset.draft === d.key && (d.radio ? x.type === 'radio' && x.dataset.reading === d.value : x.type !== 'radio'));
    for (const d of list) {
      let n = find(d);
      // A correction under way to a filled field: open it again for the person.
      if (!n && !d.radio) { [...body.querySelectorAll('[data-change]')].find((x) => x.dataset.change === d.key)?.click(); n = find(d); }
      if (!n) continue;
      if (d.radio) { n.checked = true; n.dispatchEvent(new Event('change')); } else { n.value = d.value; n.dispatchEvent(new Event('input')); }
      if (d.focused) n.focus();
    }
  }

  // `fresh`: the person just acted, so what they had in the form went with it.
  let dead = false; // destroyed: a draw queued before it (onOpen, a resize) draws nothing
  function draw(focusId = focusedId(), { fresh = false } = {}) {
    if (dead) return;
    const kept = fresh ? [] : drafts();
    const v = cur.doc && docView(cur.doc, cur.state);
    let say = '';
    const ok = cur.engine === 'ok';
    if (v && (ok || cur.engine === 'checking')) {
      const now = sections(v, cur.moment).must;
      // Keyed by the question too: one asked again under the same id is news.
      const key = (f) => `${f.id} ${canon(f.asks ?? null)}`;
      if (said && ok) say = now.filter((f) => !said.has(key(f))).map((f) => `${spokenWhere(f)} needs you.`).join(' ');
      // While checking, only the first results set the baseline; what arrives after is told once it's done.
      if (ok || !said) said = new Set(now.map(key));
    }
    // Never leave an old announcement behind for someone to find later.
    live.textContent = say;
    body.replaceChildren(pane(v, h));
    if (host.vocab) relabel(body, host.vocab); // this pane's own vocabulary
    refocus(focusId);
    // After the open card is back (a microtask) and focus with it.
    // Only into this draw: a later one collects its own.
    const mine = ++gen;
    if (kept.length) queueMicrotask(() => queueMicrotask(() => { if (gen === mine) restore(kept); }));
  }
  draw();

  return {
    get theme() { return theme; }, // the gate's report: { checked, rejected: [{ token, measured, floor, fallback }] }
    /** Take the pane down: its theme watchers go, and so does what it drew. */
    destroy() { dead = true; unwatch(); if (sized) sized.disconnect(); untips(); release(root); root.replaceChildren(); root.classList.remove('mq-narrow', 'mq-mount'); if (added) root.classList.remove('mq'); },
    update({ linted: upTo, seq, ...next }) {
      // A lint that began before the one already shown is stale: keep the newer document.
      // `seq` orders lints that began at the same point in the log. A stale lint's
      // failure is as stale as its document: neither replaces the newer one.
      const lint = 'doc' in next || 'engine' in next;
      // One request may send several updates (partial results, then done): an equal `seq` is the same lint.
      if (lint && ((upTo != null && upTo < (cur.state.linted ?? 0)) || (seq != null && cur.seq != null && seq < cur.seq))) { delete next.doc; delete next.engine; }
      else if (lint && seq != null) cur.seq = seq;
      Object.assign(cur, next);
      // A new lint is the host saying it applied what the person answered: everything
      // up to `upTo`, the log length when the host started that lint (default: all of it).
      if (next.doc) {
        const s = linted(cur.state, upTo);
        if (s.linted !== cur.state.linted) { cur.state = s; host.onChange?.(s, null); }
      }
      draw();
    },
    view: () => cur.doc && docView(cur.doc, cur.state),
    get state() { return cur.state; },
    host: h,
  };
}
