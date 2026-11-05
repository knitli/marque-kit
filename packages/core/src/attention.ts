// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Attention: which of the five rungs a finding or an artifact sits on, and the
 * pane's four sections (docs/DERIVATION.md). No DOM, so a host can run it where
 * there is no page: Outlook's send handler decides what blocks with it.
 */

import type {
  ArtifactView,
  Blocks,
  Doc,
  Finding,
  FindingView,
  MarkingInput,
  Moment,
  NeedsPerson,
  Rung,
  Subject,
} from './types.ts';

/** What rung() reads: the two inputs Marque emits, and whether a visible change was seen. */
export interface Attention {
  needs_person: NeedsPerson;
  blocks: Blocks;
  seen?: boolean | undefined;
  marking?: Finding['marking'] | undefined;
  outcome?: { result?: MarkingInput | null | undefined } | undefined;
}
/** The pane's four sections, in order. */
export interface Sections {
  must: Subject[];
  can: Subject[];
  later: Subject[];
  done: Subject[];
}

/* ── 1b · rung ───────────────────────────────────────────────────────── */
/** Moments at which an open "finalize" finding stops the operation. The host
 *  names its moment; Marque never knows it (docs/DERIVATION.md, Table 2). */
export const GATE: ReadonlySet<Moment | undefined> = new Set(['finalize', 'send']);

/**
 * needs_person × blocks × host moment → rung. The kit computes this
 * (decided 16 Oct); the engine emits only the two inputs.
 */
export function rung(f: Attention, moment: Moment = 'editing'): Rung {
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
function visiblyChanged(f: Attention): boolean {
  const was = f.marking?.as_written?.text,
    now = f.outcome?.result?.text;
  if (!was || !now) return false;
  const norm = (t: string): string => t.replace(/\s+/g, ' ').trim();
  return norm(was) !== norm(now);
}

/** An absent marking while the person is still writing is not a demand yet:
 *  dashed, "at finalize", filed under "Before you finalize". It becomes gold
 *  the moment they try to finalize. */
export const waits = (f: Subject, moment?: Moment): boolean =>
  f.marking?.shape === 'absent' && f.needs_person !== 'none' && f.blocks === 'finalize' && !GATE.has(moment);

/** An artifact's rung (docs/COMPONENTS.md, Artifact card): Table 2 when it
 *  needs a person, as for a finding. Otherwise a derived value nobody has
 *  written yet, or an artifact that isn't required, is Advisory; anything
 *  else (a non-canonical fix, a block the person filled in) is done. */
export const artRung = (a: ArtifactView, moment?: Moment): Rung =>
  a.needs_person !== 'none'
    ? rung(a, moment)
    : a.applying
      ? 'quiet'
      : a.state === 'present_not_canonical'
        ? a.seen
          ? 'quiet'
          : 'noticeable'
        : a.state === 'present_not_required' || (a.state === 'absent_but_required' && a.derived_value)
          ? 'advisory'
          : 'quiet';
/** A required artifact that only blocks at finalize waits for it, like an absent mark. */
export const artWaits = (a: ArtifactView, moment?: Moment): boolean => a.blocks === 'finalize' && !GATE.has(moment);

/* ── C8 · inline mark ────────────────────────────────────────────────── */
/** The shape class an adapter puts on the marking's span in the document:
 *  web overlay, ::highlight(), or Word's own underline (docs/MODEL.md, Hosts).
 *  Quiet has no mark. */
export function markClass(f: FindingView, moment: Moment = 'editing'): string {
  if (waits(f, moment)) return 'mq-absent';
  const r = rung(f, moment);
  return r === 'action' || r === 'blocking'
    ? 'mq-must-act'
    : r === 'advisory'
      ? 'mq-can-act'
      : r === 'noticeable'
        ? 'mq-changed'
        : '';
}

/* ── the pane's sections, shared by the pane, the status and the head ── */
/** Four sections, always in this order; document order within each, never
 *  severity (docs/COMPONENTS.md, Findings pane). */
export function sections(doc: Doc, moment: Moment = 'editing'): Sections {
  const g: Sections = { must: [], can: [], later: [], done: [] };
  for (const f of doc.findings) {
    if (f.outcome?.kind === 'covered_by') continue; // one span, one card: it lives in its owner's
    const r = rung(f, moment);
    if (r === 'blocking') g.must.push(f);
    // "Not my call" routes the question; it stays Action required for whoever gets it.
    // Deferred, Advisory or Action required, it waits for finalize, where it blocks.
    // At the gate the moment it waited for has come, so one that never blocks is back in its section.
    else if (
      waits(f, moment) ||
      ((r === 'action' || r === 'advisory') && f.deferred === 'deferred' && !GATE.has(moment))
    )
      g.later.push(f);
    else if (r === 'action') g.must.push(f);
    else if (r === 'advisory') g.can.push(f);
    else g.done.push(f);
  }
  for (const a of doc.document.artifacts) {
    if (a.state === 'present' || a.state === 'absent_not_required') continue; // receipt entries, not cards
    const r = artRung(a, moment);
    (r === 'blocking'
      ? g.must
      : r === 'action'
        ? artWaits(a, moment)
          ? g.later
          : g.must
        : r === 'advisory'
          ? g.can
          : g.done
    ).push(a);
  }
  return g;
}
