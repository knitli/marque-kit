// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * State — the kit's half of the ladder (docs/CONTRACT.md §F): what the person
 * did, keyed by finding id. Never on Marque's wire; the host persists it.
 *
 * A state is plain JSON so a host can keep it anywhere (document properties,
 * a server, localStorage):
 *   { log: [{ id, act, value, at, about }], seen: [{ id, result }], linted: n }
 * `about` is what the act was about when it was taken (snapshot()), so the
 * receipt can name a finding a later lint withdrew and an override is
 * reopened when the marking it kept changes.
 * The log is append-only. Changing an answer adds a line and never rewrites
 * one, so the receipt shows both answers (docs/COMPONENTS.md, "Answered").
 *
 * Acts are a closed vocabulary (knitli/marque-dev#2643):
 *   answered         a reading picked or a value typed for a question or a field
 *   changed          an advisory alternative taken or an answer changed;
 *                    value null puts the finding back to what Marque said
 *   kept_as_written  the one override; recorded, never hidden
 *   deferred         "Ask me at finalize"
 *   declined         "Not my call"; still Action required, routed by the host
 *
 * view() overlays the log on Marque's findings. An answer is generated, not
 * applied (docs/DECISIONS.md #4): it shows on the card but keeps the document
 * from being ready until the host applies it and re-lints. `linted` counts the
 * log lines the current lint already reflects; answers before it are the
 * engine's to report now, so they are never replayed over a newer finding.
 * Overrides, deferrals and declines have no engine shape yet (#2643) and
 * always overlay.
 */

export const ACTS = Object.freeze(['answered', 'changed', 'kept_as_written', 'deferred', 'declined']);

export const empty = () => ({ log: [], seen: [] });

/** Append one act. Returns a new state; the old one is untouched. */
export function record(state, id, act, value = null, at = new Date().toISOString(), about = undefined) {
  if (!ACTS.includes(act)) throw new Error(`Unknown act "${act}"; expected one of ${ACTS.join(', ')}`);
  // The log owns its values: a host editing its document in place can't rewrite an act.
  return { ...state, log: [...state.log, { id, act, value: value == null ? value : structuredClone(value), at, ...(about && { about: structuredClone(about) }) }] };
}

/** What an act is about, kept with it: markings, rule and place, never body text. */
/** A marking-valued derived value is a string or carries text; anything else is typed content, kept whole. */
const textOf = (v) => (typeof v === 'string' ? v : typeof v?.text === 'string' ? v.text : null);
const typed = (v) => (v && textOf(v) == null ? canon(v) : null);
const ruleOf = (f) => (f.rule ? `${f.rule.scheme}:${f.rule.predicate}` : f.kind ?? null);
export const snapshot = (f) => structuredClone({ // a record, not a view of a document that may change in place
  rule: ruleOf(f), anchor: f.anchor, kind: f.kind,
  as_written: f.marking?.as_written?.text ?? null, result: f.outcome?.result?.text ?? textOf(f.derived_value),
  // The marking whole, layers and typed masks with it, so the receipt redraws it masked.
  ...(f.marking?.as_written && { marking: f.marking.as_written }),
  // A typed derived value (a notice's content) isn't text: kept whole, so an apply is of this one.
  ...(typed(f.derived_value) && { content: typed(f.derived_value) }),
  // Where an artifact goes: an apply was approved for this place.
  ...(f.kind && { placement: f.placement ?? null, scope: f.scope ?? null }),
  // What taking the act back restores: Marque's own words, never body text.
  ...(f.outcome && { outcome: { kind: f.outcome.kind, result: f.outcome.result, readings: f.outcome.readings } }),
  ...(f.asks && { asks: f.asks }), needs_person: f.needs_person, blocks: f.blocks,
  ...(f.state && { state: f.state }), ...(f.fields && { fields: f.fields }),
});

/** Seen only quiets (docs/DERIVATION.md): a Noticeable becomes Quiet; nothing else moves. */
/** Seen is of a result, not an id: ids survive re-lints, so a new result
 *  under the same id is unseen again. */
const shown = (f) => f.outcome?.result?.text ?? textOf(f.derived_value) ?? typed(f.derived_value); // typed content by its whole value
const wasSeen = (state, f) => state.seen.some((s) => s.id === f.id && s.result === shown(f));
export function see(state, f) {
  return wasSeen(state, f) ? state : { ...state, seen: [...state.seen, { id: f.id, result: shown(f) }] };
}

export const last = (state, id) => state.log.findLast((e) => e.id === id) || null;
const history = (state, id) => state.log.filter((e) => e.id === id);
const edits = (e) => e?.act === 'answered' || e?.act === 'changed';
const putOff = (e) => e?.act === 'deferred' || e?.act === 'declined';
/** The person said what it is, rather than putting it off. */
const settled = (e) => edits(e) && e.value != null;
/** Log lines the current lint hasn't seen. */
const since = (state) => state.log.slice(state.linted ?? 0);
/** The person's last act on `id` that still overlays: an edit only until the next lint. */
function live(state, id) {
  const e = last(state, id);
  return edits(e) && state.log.lastIndexOf(e) < (state.linted ?? 0) ? null : e;
}

/** Does the act in force on `id` ask the host to change the document? An
 *  answer or an override does; so does undoing one a lint already wrote.
 *  Undoing one nobody wrote yet cancels it and writes nothing. */
function writes(state, id) {
  let e = last(state, id);
  // Deferring a reopened question doesn't cancel the take-back before it: that still has to be written.
  if (putOff(e)) { const p = history(state, id).findLast((x) => !putOff(x)); if (edits(p) && p.value == null) e = p; }
  if (!e || state.log.lastIndexOf(e) < (state.linted ?? 0)) return false;
  return settled(e) || e.act === 'kept_as_written' || (edits(e) && !!reversed(state, id, e));
}

/** The written answer or override a null `changed` since the lint takes back, if any. */
function reversed(state, id, e = last(state, id)) {
  const n = state.linted ?? 0;
  if (!edits(e) || e.value != null || state.log.lastIndexOf(e) < n) return null;
  return state.log.slice(0, n).findLast((x) => x.id === id && (settled(x) || x.act === 'kept_as_written')) || null;
}

/** The host re-linted: the first `n` acts are in the new findings. Never moves back. */
export const linted = (state, n = state.log.length) => ({ ...state, linted: Math.max(state.linted ?? 0, Math.min(n, state.log.length)) });

/** JSON with object keys sorted, arrays in order: the same question reserialised is the same question. */
export const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((n) => [n, x[n]])) : x));
/** The finding isn't the one the act was taken on: another marking or question under the same id. */
const moved = (e, f) => !!e.about
  // The whole question, not only its words: a new field type or format changes what an answer means.
  // Another rule under the same id is another finding, whatever it says.
  && ((e.about.rule ?? null) !== ruleOf(f) || e.about.as_written !== (f.marking?.as_written?.text ?? null) || canon(e.about.asks ?? null) !== canon(f.asks ?? null)
    || e.about.result !== (f.outcome?.result?.text ?? null));
const stale = (e, f) => moved(e, f)
  // A reading picked is stale once the finding no longer offers it, from the readings or the question's own options.
  // The whole reading, not only its marking: what it asserts is what gets applied and audited.
  || (!!e.value?.reading && ![...(f.outcome?.readings || []), ...(Array.isArray(f.asks?.options) ? f.asks.options : [])]
    .some((r) => canon(r) === canon(e.value.reading)));
/** The finding as it was before a written act, from that act's snapshot. */
const restore = (f, was) => ({ ...f, asks: was.asks ?? null, outcome: { ...f.outcome, ...was.outcome }, needs_person: was.needs_person, blocks: was.blocks });
/** The finding the person answered: after a pending take-back of a written answer, the question it reopened. */
function answeredOn(state, f, e) {
  const h = history(state, f.id), n = state.linted ?? 0;
  const prev = h.slice(0, h.indexOf(e)).findLast((x) => !putOff(x)); // a deferral in between keeps the question reopened
  if (!prev || !edits(prev) || prev.value != null || state.log.lastIndexOf(prev) < n) return f;
  const back = state.log.slice(0, n).findLast((x) => x.id === f.id && (settled(x) || x.act === 'kept_as_written'));
  return back?.about?.outcome ? restore(f, back.about) : f;
}
/** An artifact op is stale once the artifact isn't the one it was taken on. */
const staleOp = (e, a) => !!e.about && (e.about.state !== a.state || e.about.result !== textOf(a.derived_value)
  || (e.about.content ?? null) !== typed(a.derived_value)
  || ('placement' in e.about && (e.about.placement !== (a.placement ?? null) || e.about.scope !== (a.scope ?? null)))
  // A typed field is stale once the field is gone or asks for something else; its state and value are the overlay's.
  || Object.keys(e.value?.fields || {}).some((k) => !a.fields?.[k] || (e.about.fields?.[k] && schema(e.about.fields[k]) !== schema(a.fields[k]))));
const schema = ({ state, value, source, ...fl }) => canon(fl);

const edited = (e) => (e?.act === 'answered' || e?.act === 'changed') ? e : null;
/** On a view (render and help share it): the person's decision on this finding: the act in force, or, once a lint has
 *  written it and nothing is asked again, the last one in the history. A stale
 *  view has no decision: the lint dropped the person's last one. Nor is a
 *  written answer whose marking the engine has since moved off. */
const holds = (e, f) => {
  // A prose answer becomes a marking only once the engine derives one; only a typed marking compares.
  const r = e?.value?.reading?.result?.text ?? (e?.about?.asks?.field?.type === 'marking' ? e.value.free : null);
  const norm = (t) => (t ?? '').replace(/\s+/g, ' ').trim();
  const now = norm(f.outcome?.result?.text), was = norm(f.marking?.as_written?.text);
  // Asked of this marking: the one it was asked about, or the one a marking answer wrote.
  // A prose answer's written marking can't be told from a new one, so it holds only on its own.
  // Another rule under the same id is another finding, whatever its marking.
  if (e?.about && (e.about.rule ?? null) !== ruleOf(f)) return null;
  const same = !e?.about || was === norm(e.about.as_written) || (r != null && was === now);
  return same && (r == null || norm(r) === now) ? e : null;
};
export const decision = (f) => edited(f.person) || (!f.stale && f.needs_person === 'none' && !f.asks ? holds(edited(f.history?.findLast((e) => edited(e))), f) : null);
/** One finding or artifact as it stands with the person's acts on it. */
export function view(f, state, took) {
  const v = overlay(f, state, took);
  // Seen is of the result shown: a new one the person put there hasn't been looked at yet.
  // A copy: a host that edits the view mustn't reach into the log.
  return structuredClone(v.seen && shown(v) !== shown(f) ? { ...v, seen: wasSeen(state, v) } : v);
}

function overlay(f, state, took) {
  // `person` is the act still in force; `history` keeps every act for the audit.
  const e = live(state, f.id);
  const v = { ...f, seen: !!f.seen || wasSeen(state, f), person: e, history: history(state, f.id) };
  if (f.kind) return artifactView(v, state, took);
  if (!e) return v;
  switch (e.act) {
    case 'answered':
    case 'changed': {
      // An answer taken on a different marking or question doesn't carry over: the finding is open again.
      const on = e.value != null ? answeredOn(state, f, e) : f;
      if (e.value != null && stale(e, on)) return { ...v, person: null, stale: true };
      if (e.value == null) {
        // Back to Marque's own result. Taking back one a lint already wrote reopens
        // the finding as it was before that act, question and readings included.
        const back = reversed(state, f.id);
        // A take-back on a written finding that has since changed takes back nothing. An override
        // shows the marking as written, so taking one back is checked against the override's own snapshot.
        if (back && moved(back.act === 'kept_as_written' ? back : e, f)) return { ...v, person: null, stale: true };
        const was = back?.about;
        if (!was?.outcome) return v;
        return restore(v, was);
      }
      // A typed answer is a marking only when the question asks for one; prose waits for the re-lint.
      const result = e.value.reading?.result ?? (on.asks?.field?.type === 'marking' ? { text: e.value.free } : on.outcome?.result);
      // The kind stays the engine's: the answer is generated until the host applies it.
      return { ...v, asked: on.asks, outcome: { ...on.outcome, result, fallback: undefined }, asks: null, needs_person: 'none', blocks: 'never' };
    }
    case 'kept_as_written':
      // The person kept one marking against one fix; a different one under the same id is open again.
      if (e.about && ((e.about.rule ?? null) !== ruleOf(f) || e.about.as_written !== (f.marking?.as_written?.text ?? null) || e.about.result !== (f.outcome?.result?.text ?? null))) return { ...v, person: null, stale: true };
      return { ...v, overridden: true, outcome: { ...f.outcome, kind: 'kept_as_written', result: f.marking?.as_written, readings: [] }, needs_person: 'none', blocks: 'never' };
    default: { // deferred, declined: still open, as the question a pending take-back reopened if there is one
      const on = answeredOn(state, f, e);
      // Put off on another question: the one asked now hasn't been put off.
      if (moved(e, on)) return { ...v, person: null, stale: true };
      return { ...v, ...(on !== f && { asks: on.asks, outcome: on.outcome, needs_person: on.needs_person, blocks: on.blocks }), deferred: e.act };
    }
  }
}

function artifactView(a, state, took) {
  let out = a;
  // A banner moves with the alternatives taken, so the ops below are checked against the value shown.
  if (a.if_taken) {
    // `took`: the findings whose answer still holds (docView passes the checked views); a stale answer moves nothing.
    const taken = Object.keys(a.if_taken).filter((fid) => (took ? took.has(fid) : settled(live(state, fid))));
    if (taken.length) {
      const rest = Object.fromEntries(Object.entries(a.if_taken).filter(([fid]) => !taken.includes(fid)));
      out = { ...out, derived_value: a.if_taken[taken[taken.length - 1]], if_taken: Object.keys(rest).length ? rest : null };
    }
  }
  const ops = since(state).filter((e) => e.id === a.id);
  // An apply, a removal or a typed field taken on another value or state of this artifact doesn't carry over.
  // Each op is checked on its own: a stale later field leaves an earlier one that still holds.
  const valid = ops.filter((e) => !staleOp(e, out));
  if (ops.length && !valid.length) return { ...out, person: null, stale: true };
  if (a.fields) {
    const typed = Object.assign({}, ...valid.filter((e) => e.value?.fields).map((e) => e.value.fields));
    const fields = Object.fromEntries(Object.entries(a.fields).map(([k, fl]) =>
      [k, typed[k] ? { ...fl, state: 'known', value: typed[k], source: 'person' } : fl]));
    const has = (fl) => fl?.state === 'known' || fl?.state === 'derived';
    // A field that waited on one now filled is the person's to fill next.
    for (const [k, fl] of Object.entries(fields)) {
      if (fl.state === 'waiting' && has(fields[fl.waits_on])) fields[k] = { ...fl, state: 'blank' };
    }
    const open = Object.values(fields).some((fl) => !has(fl));
    out = { ...out, fields, needs_person: open ? a.needs_person : 'none' };
  }
  const asked = (ops.length ? valid[valid.length - 1] : live(state, a.id))?.value;
  // A block the person has now filled in waits to be written, like an apply.
  if (asked?.apply || asked?.remove || (ops.length && asked?.fields && out.needs_person === 'none')) out = { ...out, applying: true };
  return out;
}

/**
 * The whole document with the person's acts on it. `blocking` keeps the
 * engine's list and drops what the person has answered; every edit since
 * the lint waits in `pending` until the host applies it and re-lints. `ready` needs both
 * empty. `withdrawn` keeps the acts on ids the latest lint no longer lists,
 * for the receipt. Nothing else appears here the engine didn't list.
 */
export function docView(doc, state) {
  // What each finding's decision moves: the artifacts that depend on it, by kind.
  const moves = (id) => doc.document.artifacts.filter((a) => a.depends_on?.includes(id)).map((a) => a.kind);
  const findings = doc.findings.map((f) => { const v = view(f, state), m = moves(f.id); return m.length ? { ...v, moves: m } : v; });
  const took = new Set(findings.filter((x) => settled(x.person)).map((x) => x.id));
  const artifacts = doc.document.artifacts.map((a) => view(a, state, took));
  const all = new Map([...findings, ...artifacts].map((x) => [x.id, x]));
  const blocking = doc.document.blocking.filter((id) => all.get(id)?.needs_person !== 'none');
  // Every write since the lint waits for it, blocker or not: an alternative taken moves the banner too.
  // A write to a finding the lint withdrew has nowhere to go; its acts stay in `withdrawn`.
  const pending = [...new Set(since(state).map((e) => e.id))].filter((id) => all.has(id) && !all.get(id).stale && writes(state, id));
  const withdrawn = [...new Set(state.log.map((e) => e.id))].filter((id) => !all.has(id))
    .map((id) => structuredClone({ id, about: history(state, id).findLast((e) => e.about)?.about, history: history(state, id) }));
  return { ...doc, findings, document: { ...doc.document, artifacts, blocking, pending, withdrawn, ready: !blocking.length && !pending.length } };
}
