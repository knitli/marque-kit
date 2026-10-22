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
  return { ...state, log: [...state.log, { id, act, value: value == null ? value : structuredClone(value), at, ...(about && { about }) }] };
}

/** What an act is about, kept with it: markings, rule and place, never body text. */
export const snapshot = (f) => structuredClone({ // a record, not a view of a document that may change in place
  rule: f.rule ? `${f.rule.scheme}:${f.rule.predicate}` : f.kind, anchor: f.anchor, kind: f.kind,
  as_written: f.marking?.as_written?.text ?? null, result: f.outcome?.result?.text ?? f.derived_value?.text ?? null,
  // What taking the act back restores: Marque's own words, never body text.
  ...(f.outcome && { outcome: { kind: f.outcome.kind, result: f.outcome.result, readings: f.outcome.readings } }),
  ...(f.asks && { asks: f.asks }), needs_person: f.needs_person, blocks: f.blocks,
  ...(f.state && { state: f.state }), ...(f.fields && { fields: f.fields }),
});

/** Seen only quiets (docs/DERIVATION.md): a Noticeable becomes Quiet; nothing else moves. */
/** Seen is of a result, not an id: ids survive re-lints, so a new result
 *  under the same id is unseen again. */
const shown = (f) => f.outcome?.result?.text ?? f.derived_value?.text ?? null;
const wasSeen = (state, f) => state.seen.some((s) => s.id === f.id && s.result === shown(f));
export function see(state, f) {
  return wasSeen(state, f) ? state : { ...state, seen: [...state.seen, { id: f.id, result: shown(f) }] };
}

export const last = (state, id) => state.log.findLast((e) => e.id === id) || null;
const history = (state, id) => state.log.filter((e) => e.id === id);
const edits = (e) => e?.act === 'answered' || e?.act === 'changed';
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
  const e = last(state, id);
  if (!e || state.log.lastIndexOf(e) < (state.linted ?? 0)) return false;
  return settled(e) || e.act === 'kept_as_written' || (edits(e) && !!reversed(state, id));
}

/** The written answer or override a null `changed` since the lint takes back, if any. */
function reversed(state, id) {
  const e = last(state, id), n = state.linted ?? 0;
  if (!edits(e) || e.value != null || state.log.lastIndexOf(e) < n) return null;
  return state.log.slice(0, n).findLast((x) => x.id === id && (settled(x) || x.act === 'kept_as_written')) || null;
}

/** The host re-linted: the first `n` acts are in the new findings. Never moves back. */
export const linted = (state, n = state.log.length) => ({ ...state, linted: Math.max(state.linted ?? 0, Math.min(n, state.log.length)) });

/** The finding isn't the one the act was taken on: another marking or question under the same id. */
const moved = (e, f) => !!e.about
  // The whole question, not only its words: a new field type or format changes what an answer means.
  && (e.about.as_written !== (f.marking?.as_written?.text ?? null) || JSON.stringify(e.about.asks ?? null) !== JSON.stringify(f.asks ?? null)
    || e.about.result !== (f.outcome?.result?.text ?? null));
const stale = (e, f) => moved(e, f)
  // A reading picked is stale once the finding no longer offers it.
  // The whole reading, not only its marking: what it asserts is what gets applied and audited.
  || (!!e.value?.reading && !(f.outcome?.readings || []).some((r) => JSON.stringify(r) === JSON.stringify(e.value.reading)));
/** An artifact op is stale once the artifact isn't the one it was taken on. */
const staleOp = (e, a) => !!e.about && (e.about.state !== a.state || e.about.result !== (a.derived_value?.text ?? null)
  // A typed field is stale once the field is gone or asks for something else; its state and value are the overlay's.
  || Object.keys(e.value?.fields || {}).some((k) => !a.fields?.[k] || (e.about.fields?.[k] && schema(e.about.fields[k]) !== schema(a.fields[k]))));
const schema = ({ state, value, source, ...fl }) => JSON.stringify(fl);

/** One finding or artifact as it stands with the person's acts on it. */
export function view(f, state) {
  const v = overlay(f, state);
  // Seen is of the result shown: a new one the person put there hasn't been looked at yet.
  return v.seen && shown(v) !== shown(f) ? { ...v, seen: wasSeen(state, v) } : v;
}

function overlay(f, state) {
  // `person` is the act still in force; `history` keeps every act for the audit.
  const e = live(state, f.id);
  const v = { ...f, seen: !!f.seen || wasSeen(state, f), person: e, history: history(state, f.id) };
  if (f.kind) return artifactView(v, state);
  if (!e) return v;
  switch (e.act) {
    case 'answered':
    case 'changed': {
      // An answer taken on a different marking or question doesn't carry over: the finding is open again.
      if (e.value != null && stale(e, f)) return { ...v, person: null, stale: true };
      if (e.value == null) {
        // Back to Marque's own result. Taking back one a lint already wrote reopens
        // the finding as it was before that act, question and readings included.
        const back = reversed(state, f.id);
        // A take-back on a written finding that has since changed takes back nothing. An override
        // shows the marking as written, so taking one back is checked against the override's own snapshot.
        if (back && moved(back.act === 'kept_as_written' ? back : e, f)) return { ...v, person: null, stale: true };
        const was = back?.about;
        if (!was?.outcome) return v;
        return { ...v, asks: was.asks ?? null, outcome: { ...f.outcome, ...was.outcome }, needs_person: was.needs_person, blocks: was.blocks };
      }
      // A typed answer is a marking only when the question asks for one; prose waits for the re-lint.
      const result = e.value.reading?.result ?? (f.asks?.field?.type === 'marking' ? { text: e.value.free } : f.outcome?.result);
      // The kind stays the engine's: the answer is generated until the host applies it.
      return { ...v, asked: f.asks, outcome: { ...f.outcome, result, fallback: undefined }, asks: null, needs_person: 'none', blocks: 'never' };
    }
    case 'kept_as_written':
      // The person kept one marking against one fix; a different one under the same id is open again.
      if (e.about && (e.about.as_written !== (f.marking?.as_written?.text ?? null) || e.about.result !== (f.outcome?.result?.text ?? null))) return { ...v, person: null, stale: true };
      return { ...v, overridden: true, outcome: { ...f.outcome, kind: 'kept_as_written', result: f.marking?.as_written, readings: [] }, needs_person: 'none', blocks: 'never' };
    default: // deferred, declined: still open
      return { ...v, deferred: e.act };
  }
}

function artifactView(a, state) {
  let out = a;
  // A banner moves with the alternatives taken, so the ops below are checked against the value shown.
  if (a.if_taken) {
    const taken = Object.keys(a.if_taken).filter((fid) => settled(live(state, fid)));
    if (taken.length) {
      const rest = Object.fromEntries(Object.entries(a.if_taken).filter(([fid]) => !taken.includes(fid)));
      out = { ...out, derived_value: a.if_taken[taken[taken.length - 1]], if_taken: Object.keys(rest).length ? rest : null };
    }
  }
  const ops = since(state).filter((e) => e.id === a.id);
  // An apply, a removal or a typed field taken on another value or state of this artifact doesn't carry over.
  if (ops.length && staleOp(ops[ops.length - 1], out)) return { ...out, person: null, stale: true };
  if (a.fields) {
    const typed = Object.assign({}, ...ops.filter((e) => e.value?.fields && !staleOp(e, out)).map((e) => e.value.fields));
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
  const asked = live(state, a.id)?.value;
  if (asked?.apply || asked?.remove) out = { ...out, applying: true };
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
  const findings = doc.findings.map((f) => view(f, state));
  const artifacts = doc.document.artifacts.map((a) => view(a, state));
  const all = new Map([...findings, ...artifacts].map((x) => [x.id, x]));
  const blocking = doc.document.blocking.filter((id) => all.get(id)?.needs_person !== 'none');
  // Every write since the lint waits for it, blocker or not: an alternative taken moves the banner too.
  // A write to a finding the lint withdrew has nowhere to go; its acts stay in `withdrawn`.
  const pending = [...new Set(since(state).map((e) => e.id))].filter((id) => all.has(id) && !all.get(id).stale && writes(state, id));
  const withdrawn = [...new Set(state.log.map((e) => e.id))].filter((id) => !all.has(id))
    .map((id) => ({ id, about: history(state, id).findLast((e) => e.about)?.about, history: history(state, id) }));
  return { ...doc, findings, document: { ...doc.document, artifacts, blocking, pending, withdrawn, ready: !blocking.length && !pending.length } };
}
