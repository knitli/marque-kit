// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * State — the kit's half of the ladder (docs/CONTRACT.md §F): what the person
 * did, keyed by finding id. Never on Marque's wire; the host persists it.
 *
 * A state is plain JSON so a host can keep it anywhere (document properties,
 * a server, localStorage):
 *   { log: [{ id, act, value, at }], seen: [id] }
 * The log is append-only. Changing an answer adds a line and never rewrites
 * one, so the receipt shows both answers (docs/COMPONENTS.md, "Answered").
 *
 * Acts are a closed vocabulary (knitli/marque-dev#2643):
 *   answered         a reading picked or a value typed for a question or a field
 *   changed          an advisory alternative taken or an answer changed;
 *                    value null puts the finding back to what Marque said
 *   kept_as_written  the one override; recorded, never hidden
 *   deferred         "Ask me at finalize"
 *   declined         "Not my call"; still open, routed by the host
 *
 * view() overlays the log on Marque's findings until the next lint. The
 * overlay is generated, not applied: the host applies, the engine re-lints,
 * and the new findings replace what view() guessed.
 */

export const ACTS = Object.freeze(['answered', 'changed', 'kept_as_written', 'deferred', 'declined']);

export const empty = () => ({ log: [], seen: [] });

/** Append one act. Returns a new state; the old one is untouched. */
export function record(state, id, act, value = null, at = new Date().toISOString()) {
  if (!ACTS.includes(act)) throw new Error(`Unknown act "${act}"; expected one of ${ACTS.join(', ')}`);
  return { ...state, log: [...state.log, { id, act, value, at }] };
}

/** Seen only quiets (docs/DERIVATION.md): a Noticeable becomes Quiet; nothing else moves. */
export function see(state, id) {
  return state.seen.includes(id) ? state : { ...state, seen: [...state.seen, id] };
}

export const last = (state, id) => state.log.findLast((e) => e.id === id) || null;
const history = (state, id) => state.log.filter((e) => e.id === id);
/** The person said what it is, rather than putting it off. */
const settled = (e) => (e?.act === 'answered' || e?.act === 'changed') && e.value != null;

/** One finding or artifact as it stands with the person's acts on it. */
export function view(f, state) {
  const e = last(state, f.id);
  const v = { ...f, seen: !!f.seen || state.seen.includes(f.id), person: e, history: history(state, f.id) };
  if (f.fields || f.if_taken) return artifactView(v, state);
  if (!e) return v;
  switch (e.act) {
    case 'answered':
    case 'changed': {
      if (e.value == null) return v; // back to Marque's own result
      const result = e.value.reading?.result ?? { text: e.value.free };
      return { ...v, asked: f.asks, outcome: { ...f.outcome, kind: 'applied', result, fallback: undefined }, asks: null, needs_person: 'none', blocks: 'never' };
    }
    case 'kept_as_written':
      return { ...v, overridden: true, outcome: { ...f.outcome, kind: 'kept_as_written', result: f.marking?.as_written, readings: [] }, needs_person: 'none', blocks: 'never' };
    default: // deferred, declined: still open, filed under "Before you finalize"
      return { ...v, deferred: e.act };
  }
}

function artifactView(a, state) {
  let out = a;
  if (a.fields) {
    const typed = Object.assign({}, ...a.history.filter((e) => e.value?.fields).map((e) => e.value.fields));
    const fields = Object.fromEntries(Object.entries(a.fields).map(([k, fl]) =>
      [k, typed[k] ? { ...fl, state: 'known', value: typed[k], source: 'person' } : fl]));
    // A field that waited on one the person has now filled is theirs to fill next.
    for (const [k, fl] of Object.entries(fields)) {
      if (fl.state === 'waiting' && fields[fl.waits_on]?.state === 'known') fields[k] = { ...fl, state: 'blank' };
    }
    const open = Object.values(fields).some((fl) => fl.state !== 'known');
    out = { ...out, fields, needs_person: open ? a.needs_person : 'none' };
  }
  if (a.if_taken) {
    const taken = Object.keys(a.if_taken).filter((fid) => settled(last(state, fid)));
    if (taken.length) {
      const rest = Object.fromEntries(Object.entries(a.if_taken).filter(([fid]) => !taken.includes(fid)));
      out = { ...out, derived_value: a.if_taken[taken[taken.length - 1]], if_taken: Object.keys(rest).length ? rest : null };
    }
  }
  return out;
}

/**
 * The whole document with the person's acts on it. `blocking` keeps the
 * engine's list and drops only what no longer needs a person; `ready` is
 * true when nothing is left. Nothing appears here the engine didn't list.
 */
export function docView(doc, state) {
  const findings = doc.findings.map((f) => view(f, state));
  const artifacts = doc.document.artifacts.map((a) => view(a, state));
  const all = new Map([...findings, ...artifacts].map((x) => [x.id, x]));
  const blocking = doc.document.blocking.filter((id) => all.get(id)?.needs_person !== 'none');
  return { ...doc, findings, document: { ...doc.document, artifacts, blocking, ready: blocking.length === 0 } };
}
