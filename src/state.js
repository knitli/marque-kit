// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * State — the kit's half of the ladder (docs/CONTRACT.md §F): what the person
 * did, keyed by finding id. Never on Marque's wire; the host persists it.
 *
 * A state is plain JSON so a host can keep it anywhere (document properties,
 * a server, localStorage):
 *   { log: [{ id, act, value, at }], seen: [{ id, result }], linted: n }
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
export function record(state, id, act, value = null, at = new Date().toISOString()) {
  if (!ACTS.includes(act)) throw new Error(`Unknown act "${act}"; expected one of ${ACTS.join(', ')}`);
  return { ...state, log: [...state.log, { id, act, value, at }] };
}

/** Seen only quiets (docs/DERIVATION.md): a Noticeable becomes Quiet; nothing else moves. */
/** Seen is of a result, not an id: ids survive re-lints, so a new result
 *  under the same id is unseen again. */
const shown = (f) => f.outcome?.result?.text ?? null;
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

/** The host re-linted: every act so far is in the new findings. */
export const linted = (state) => ({ ...state, linted: state.log.length });

/** One finding or artifact as it stands with the person's acts on it. */
export function view(f, state) {
  const v = { ...f, seen: !!f.seen || wasSeen(state, f), person: last(state, f.id), history: history(state, f.id) };
  if (f.fields || f.if_taken) return artifactView(v, state);
  const e = live(state, f.id);
  if (!e) return v;
  switch (e.act) {
    case 'answered':
    case 'changed': {
      if (e.value == null) return v; // back to Marque's own result
      // A typed answer is a marking only when the question asks for one; prose waits for the re-lint.
      const result = e.value.reading?.result ?? (f.asks?.field?.type === 'marking' ? { text: e.value.free } : f.outcome?.result);
      // The kind stays the engine's: the answer is generated until the host applies it.
      return { ...v, asked: f.asks, outcome: { ...f.outcome, result, fallback: undefined }, asks: null, needs_person: 'none', blocks: 'never' };
    }
    case 'kept_as_written':
      return { ...v, overridden: true, outcome: { ...f.outcome, kind: 'kept_as_written', result: f.marking?.as_written, readings: [] }, needs_person: 'none', blocks: 'never' };
    default: // deferred, declined: still open
      return { ...v, deferred: e.act };
  }
}

function artifactView(a, state) {
  let out = a;
  if (a.fields) {
    const typed = Object.assign({}, ...since(state).filter((e) => e.id === a.id && e.value?.fields).map((e) => e.value.fields));
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
  if (live(state, a.id)?.value?.apply) out = { ...out, applying: true };
  if (a.if_taken) {
    const taken = Object.keys(a.if_taken).filter((fid) => settled(live(state, fid)));
    if (taken.length) {
      const rest = Object.fromEntries(Object.entries(a.if_taken).filter(([fid]) => !taken.includes(fid)));
      out = { ...out, derived_value: a.if_taken[taken[taken.length - 1]], if_taken: Object.keys(rest).length ? rest : null };
    }
  }
  return out;
}

/**
 * The whole document with the person's acts on it. `blocking` keeps the
 * engine's list and drops what the person has answered; every edit since
 * the lint waits in `pending` until the host applies it and re-lints. `ready` needs both
 * empty. Nothing appears here the engine didn't list.
 */
export function docView(doc, state) {
  const findings = doc.findings.map((f) => view(f, state));
  const artifacts = doc.document.artifacts.map((a) => view(a, state));
  const all = new Map([...findings, ...artifacts].map((x) => [x.id, x]));
  const blocking = doc.document.blocking.filter((id) => all.get(id)?.needs_person !== 'none');
  // Every edit since the lint waits for it, blocker or not: an alternative taken moves the banner too.
  const pending = [...new Set(since(state).map((e) => e.id))].filter((id) => settled(live(state, id)));
  return { ...doc, findings, document: { ...doc.document, artifacts, blocking, pending, ready: !blocking.length && !pending.length } };
}
