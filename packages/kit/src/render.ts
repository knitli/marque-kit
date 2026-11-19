// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Render — finding JSON (docs/CONTRACT.md) → the kit's DOM.
 *
 * One function per component, in build order (docs/COMPONENTS.md):
 *   rung, markClass, sections — re-exported from @knitli/marque-kit-core/attention,
 *                     which has no DOM (docs/DERIVATION.md; C8's shape class)
 *   card(f, host)   — C3, the finding card; C4 (the asks renderer) lives inside it
 *   row(f, host, d) — C6, the pane's collapsed list item
 *   pane(doc, host) — C6–C7, the whole pane plus the document status line
 *   status(doc, h)  — C7, the one-line document status
 *   artifact(a,h,d) — C9, banner / CAB card
 *   gate(doc, host) — C10, the Needs-you section with defer removed
 *   derivation(a)   — C11, how Marque got here
 *   receipt(doc)    — C12, the audit receipt (what the engine will attest)
 *   (help, vocabulary lookup and the citation chip are in src/help.js)
 *   mount(root, o)  — the pane wired to the kit's state (src/state.js): the
 *                     one call a host needs; it keeps the open card, announces
 *                     new questions and hands every act back to the host
 *
 * Everything reads only the --mq-* tokens through the kit's class names;
 * no color, size or shape is set here. Plain DOM, no framework.
 *
 * `host` is the thing the kit never decides: { moment, engine, readOnly,
 * vocab, onAct, onHelp, onJump, onGate, onLookup, onReceipt, onRetry, onReport }. Every
 * callback is optional; a missing one makes its control inert rather than
 * absent, so the layout is the same in every host and the person can still
 * see what is possible. `doc` is a view (src/state.js docView) or the
 * engine's document as-is.
 */

import { readCabSnapshot } from '@knitli/marque-kit-core/native-cab';
import type { NativeCabRequest } from '@knitli/marque-kit-core/native-cab';
import { readNativeSemanticResults } from '@knitli/marque-kit-core/native-results';
import type { NativeSemanticResultsRequest } from '@knitli/marque-kit-core/native-results';
import type { NativeField, NativeSemanticResultSupportKind } from '@knitli/marque-kit-core/native-wire';
import { render as mark, settle, resettle, relabel, el, button } from './marking.ts';
import {
  appendAcknowledgementIssue,
  disclosedReading,
  canWriteMarking,
  hasDefinitiveSourceBasis,
  disclosedAsks,
  disclosedBasis,
  disclosedAppendRequest,
  isDisclosedState,
  isDisclosedRequest,
  empty,
  newActRequestId,
  see,
  linted,
  snapshot,
  docView,
  decision,
  answered,
  canon,
  sameBasis,
  effectiveReady,
  writeConfirmationToken,
  acceptedReplacements,
  isArtifact,
} from '@knitli/marque-kit-core/state';
import { GATE, rung, waits, artRung, artWaits, sections, type Sections } from '@knitli/marque-kit-core/attention';
import { cite, hasTip, tips, closeWithin } from './help.ts';
import { check, watch, release } from './theme.ts';
import type {
  Act,
  ActAppendBinding,
  ActAppendRefusal,
  ActAppendRequest,
  AppendActResult,
  ActValue,
  Anchor,
  ArtifactField,
  ArtifactView,
  Doc,
  EngineState,
  HistoryDisclosure,
  Finding,
  FindingView,
  Host,
  LogEntry,
  MarkingLike,
  Moment,
  PendingAppend,
  Rule,
  Rung,
  Snapshot,
  State,
  Subject,
  Tab,
  ThemeReport,
} from '@knitli/marque-kit-core/types';

// The rung, the inline mark's class and the sections live in core; hosts still find them here.
export { rung, markClass, sections } from '@knitli/marque-kit-core/attention';
export type { Attention, Sections } from '@knitli/marque-kit-core/attention';

/** How long an act's Undo stays in its card's place, while nobody is on it (DECISIONS #23). */
export const UNDO_MS = 8000;
/** What the undo strip says was done, by act. */
const DONE: Record<Act, string> = {
  answered: 'Answered',
  changed: 'Changed',
  kept_as_written: 'Kept as written',
  deferred: 'Will ask at finalize',
  declined: 'Left for someone else',
};

/** A stamp: its tone class and its word. */
type Stamp = [tone: string, word: string];
/** A line on the receipt: a finding, an artifact, or acts on one the lint withdrew. */
interface Receiptable extends Placed {
  rule?: Rule | undefined;
  marking?: Finding['marking'] | undefined;
  history?: LogEntry[] | undefined;
}
/** A draft the person hasn't sent, by a key that survives a redraw. */
interface Draft {
  key: string;
  asked: string | undefined;
  value: string | undefined;
  radio: boolean;
  focused: boolean;
}
export type { HistoryDisclosure } from '@knitli/marque-kit-core/types';
type HistoryDisclosureHost = Pick<
  Host,
  'actBinding' | 'currentBasis' | 'currentDisclosureRevision' | 'historyDisclosure'
>;
/** What the receipt is about: the session as the engine will seal it. */
export interface Session extends HistoryDisclosureHost {
  schema?: string;
  classifier_id?: string;
  session_root?: string;
}
/** Anything with a place: a finding, an artifact, or an act's snapshot. */
interface Placed {
  anchor?: Anchor | null | undefined;
  kind?: string | null | undefined;
  scope?: string | null | undefined;
}
/** What mount() takes: the host, and the document and state to start from. */
export interface MountOptions extends Host {
  doc?: Doc | null;
  state?: State;
}
/** What update() takes: a new lint, moment or engine state. */
export interface Update {
  doc?: Doc | null;
  engine?: EngineState;
  moment?: Moment;
  readOnly?: boolean;
  /** The host's latest known document/chain/basis binding; null clears it to unknown. */
  actBinding?: ActAppendBinding | null;
  currentDisclosureRevision?: string | null;
  historyDisclosure?: HistoryDisclosure | null;
  /** Replace or revoke the independently supplied native CAB scope. */
  nativeCabRequest?: NativeCabRequest | null;
  /** Replace or revoke the independently supplied selected-result disclosure. */
  nativeSemanticResultsRequest?: NativeSemanticResultsRequest | null;
  /** The log length when this lint began. */
  linted?: number | undefined;
  /** The host's request counter. */
  seq?: number | undefined;
  /** Open this finding's or artifact's card, as if the person had: an Office host's cursor landing
   *  in a marking (DECISIONS #8). null closes it. Focus stays where it is, in the document. */
  open?: string | null | undefined;
}
/** A mounted pane. */
export interface Mounted {
  /** The gate's report: { checked, rejected: [{ token, measured, floor, fallback }] }. */
  readonly theme: ThemeReport | null;
  destroy(): void;
  update(next: Update): void;
  view(): Doc | null;
  readonly state: State;
  host: Host;
}

/* ── helpers ─────────────────────────────────────────────────────────── */
/** DOM ids per rendered copy: the gate and the pane can show the same finding at once. */
let uid = 0;
// Draft comparison keys are private to the form and never belong in a DOM attribute.
const draftContext = new WeakMap<HTMLElement, { asked: string; reading?: string }>();
const placed = <T extends HTMLElement>(m: T): T => {
  queueMicrotask(() => settle(m));
  return m;
};
const SHORT: Record<string, string> = { front_marking: 'BANNER', authority_block: 'CAB' };
const NAME: Record<string, string> = { front_marking: 'Banner', authority_block: 'Authority block' };
const page = (f: Placed): number | null => (f.anchor?.kind === 'page' ? (f.anchor.page ?? null) : null);
const where = (f: Placed): string =>
  f.anchor?.portion
    ? `¶${f.anchor.portion}`
    : page(f) != null
      ? `p${page(f)}`
      : SHORT[f.kind ?? ''] || (f.scope === 'document' || f.anchor?.kind === 'document' ? 'DOC' : '—');
const spokenWhere = (f: Placed): string =>
  f.anchor?.portion
    ? `Paragraph ${f.anchor.portion}`
    : page(f) != null
      ? `Page ${page(f)}`
      : NAME[f.kind ?? ''] || 'The document';
/** Field formats the kit can check, by the name a format string uses; one it doesn't know is the engine's to judge. */
const FORMATS: Record<string, (t: string) => boolean> = {
  YYYYMMDD: (t) => {
    // a real day: the date built from it is the same date back
    if (!/^\d{8}$/.test(t)) return false;
    const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6)));
    return (
      d.getUTCFullYear() === +t.slice(0, 4) && d.getUTCMonth() === +t.slice(4, 6) - 1 && d.getUTCDate() === +t.slice(6)
    );
  },
  event: (t) => /[A-Za-z]/.test(t) && /\S\s+\S/.test(t), // an event is described in words, not one token
  '25X#/50X#/75X#': (t) => /^(25|50|75)X\d+(-[A-Z]+)?$/.test(t),
};
/** Does `t` fit a format such as "YYYYMMDD | event | 25X#/50X#/75X#"? Any one alternative will do. */
const fits = (format: string | null | undefined, t: string): boolean => {
  if (!format) return true;
  const alts = format.split('|').map((s) => s.trim());
  return alts.some((f) => FORMATS[f]?.(t) ?? true);
};
/** A marking-valued artifact; a notice may carry typed content instead, which isn't one. */
const isMarking = (v: unknown): v is MarkingLike =>
  typeof v === 'string' || typeof (v as { text?: unknown } | null | undefined)?.text === 'string';
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** How many in `list` changed the document at all, whitespace included. */
const changes = (list: Subject[]): number =>
  list.filter((f) => f.outcome?.result && f.marking?.as_written && f.outcome.result.text !== f.marking.as_written.text)
    .length;

const wasAsked = (f: Subject): boolean =>
  !!f.asked || !!f.history?.some((e) => e.act === 'answered' && !e.value?.apply); // an apply isn't an answer
const SHAPE: Record<Rung, string> = {
  quiet: '',
  noticeable: '',
  advisory: 'can-act',
  action: 'must-act',
  blocking: 'must-act',
};
const STAMP: Record<Rung, Stamp> = {
  quiet: ['quiet', 'Done'],
  noticeable: ['quiet', 'Changed'],
  advisory: ['act', 'Alternative'],
  action: ['attn', 'Needs you'],
  blocking: ['attn', 'Blocks finalize'],
};
const shapeOf = (f: Subject, r: Rung, moment?: Moment): string => (waits(f, moment) ? 'absent' : SHAPE[r]);
function stampOf(f: Subject, r: Rung, moment?: Moment): Stamp {
  if (f.overridden) return ['quiet', 'Reported'];
  if (answered(f)) return ['quiet', wasAsked(f) ? 'Answered' : 'Changed'];
  if (r === 'blocking')
    return ['attn', f.blocks === 'now' ? 'Blocks now' : moment === 'send' ? 'Blocks sending' : 'Blocks finalize'];
  if ((r === 'action' || r === 'advisory') && f.deferred)
    return ['quiet', f.deferred === 'declined' ? 'Not my call' : 'At finalize'];
  if (waits(f, moment)) return ['quiet', 'At finalize'];
  return STAMP[r];
}

/* ── C4 · the asks renderer ──────────────────────────────────────────── */
const canRecordAct = (host: Host): boolean => typeof host.onAct === 'function';
const canWriteDocument = (host: Host): boolean => canRecordAct(host) && !host.readOnly;

function asks(f: FindingView, host: Host, r: Rung, help: string[]): HTMLElement | null {
  const a = f.asks;
  if (!a) return null;
  if (!canRecordAct(host)) return el('p', 'mq-p', 'This host cannot record actions.');
  if (host.readOnly) {
    const routes = el('div', 'mq-ask');
    routes.append(
      el('p', 'mq-p', 'This document is read-only. You can route the question, but cannot answer it here.'),
    );
    const actions = el('div', 'mq-acts');
    if (r !== 'blocking' && f.deferred !== 'deferred')
      actions.append(button('ghost', 'Ask me at finalize', () => host.onAct?.(f, 'deferred')));
    if (f.deferred !== 'declined') actions.append(button('ghost', 'Not my call', () => host.onAct?.(f, 'declined')));
    if (actions.childElementCount) routes.append(actions);
    return routes;
  }
  const form = el('form', 'mq-ask');
  const name = `ask-${f.id}-${++uid}`;
  let chosen: ActValue | null = null;
  // Answer is never disabled: pressed with nothing chosen, it says what's missing (docs/COMPONENTS.md, C4).
  const err = el('div', 'err');
  err.id = `${name}-err`;
  err.setAttribute('role', 'alert');
  // A typed marking has to look like one before it's written: capitals and marking punctuation,
  // a portion in parentheses, a banner without, and a classification word in it, not punctuation alone.
  const shape =
    ({ portion: /^\([A-Z0-9/ ,_-]+\)$/, banner: /^[A-Z0-9/ ,_-]+$/ } as Record<string, RegExp>)[
      a.field?.format ?? ''
    ] || /^\(?[A-Z0-9/ ,_-]+\)?$/;
  const commit = () => {
    if (chosen?.free && a.field?.type === 'marking' && !(shape.test(chosen.free) && /[A-Z]/.test(chosen.free))) {
      fld.classList.add('bad');
      err.textContent =
        a.field?.format === 'portion'
          ? 'That isn’t a portion marking. Type it in capitals, in parentheses, as it should appear.'
          : 'That isn’t a marking. Type it in capitals, as it should appear.';
      free.focus();
      return;
    }
    if (chosen) return host.onAct?.(f, 'answered', chosen);
    fld.classList.add('bad');
    err.textContent = form.querySelector('input[type=radio]')
      ? 'Pick one reading, type an answer, or "not my call".'
      : 'Type an answer, or "not my call".';
    (form.querySelector<HTMLInputElement>('input[type=radio]') || free).focus();
  };
  const clear = () => {
    fld.classList.remove('bad');
    err.textContent = '';
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    commit();
  });
  const options = a.options === 'outcome.readings' ? (f.outcome.readings ?? []) : a.options || [];

  const askedKey = canon({ asked: disclosedAsks(a), basis: f.evaluationBasis && disclosedBasis(f.evaluationBasis) });
  const maskedQuestion =
    !canWriteMarking(f.marking?.as_written) || options.some((option) => !canWriteMarking(option.result));
  const restoreDraft = !maskedQuestion || hasDefinitiveSourceBasis(f.evaluationBasis, f.evaluationBasis);
  const fs = el('fieldset', 'mq-opts');
  fs.append(el('legend', null, a.text));
  options.forEach((o, i) => {
    const lab = el('label', 'mq-opt');
    const inp = el('input');
    inp.type = 'radio';
    inp.name = name;
    inp.value = String(i);
    inp.dataset.draft = `${f.id}:reading`;
    if (restoreDraft) draftContext.set(inp, { asked: askedKey, reading: canon(disclosedReading(o)) });
    inp.addEventListener('change', () => {
      chosen = { reading: o, index: i };
      free.value = '';
      clear();
    });
    const txt = el('div', 'mq-txt');
    txt.append(el('div', 'mq-pr', o.reading));
    if (o.result) txt.append(placed(mark(o.result, { size: 'sm', help })));
    lab.append(inp, txt);
    fs.append(lab);
  });
  form.append(fs);

  // Free answer — always (decided 16 Oct: someone must always be able to type one).
  const fld = el('div', 'mq-field');
  const lab = el('label', null, a.field?.type === 'marking' ? 'Or type the marking' : 'Or type your answer');
  lab.htmlFor = `${name}-free`;
  const free = el('input', 'mono');
  free.id = `${name}-free`;
  free.type = 'text';
  free.dataset.draft = `${f.id}:free`;
  if (restoreDraft) draftContext.set(free, { asked: askedKey });
  free.placeholder = a.field?.hint || 'Type an answer';
  free.addEventListener('input', () => {
    const t = free.value.trim();
    // Blank text doesn't take the answer from a reading still picked.
    chosen = t ? { free: t } : chosen?.reading ? chosen : null;
    if (t) {
      form.querySelectorAll<HTMLInputElement>('input[type=radio]').forEach((x) => {
        x.checked = false;
      });
      clear();
    }
  });
  free.setAttribute('aria-describedby', err.id);
  fld.append(lab, free, err);
  if (a.field?.waits_on) fld.append(el('div', 'hint', `Waits on ${a.field.waits_on.replace(/_/g, ' ')}.`));
  if (f.deferred === 'declined')
    fld.append(el('div', 'hint', 'Marked not your call. Someone still has to answer it before the document goes out.'));
  form.append(fld);

  const acts = el('div', 'mq-acts');
  acts.append(button('attn', 'Answer', commit));
  // Blocking is the same card with defer removed (docs/DERIVATION.md).
  if (r !== 'blocking' && f.deferred !== 'deferred')
    acts.append(button('ghost', 'Ask me at finalize', () => host.onAct?.(f, 'deferred')));
  if (f.deferred !== 'declined') acts.append(button('ghost', 'Not my call', () => host.onAct?.(f, 'declined')));
  form.append(acts);
  return form;
}

/* ── C3 · the finding card ───────────────────────────────────────────── */
export function card(f: FindingView, host: Host = {}): HTMLElement {
  const moment = host.moment;
  const r = rung(f, moment);
  // Tokens the engine says have help, and the vocabulary can explain (tier 1).
  const help = host.vocab ? (f.says.help || []).filter((k) => hasTip(host.vocab, k)) : [];
  const c = el('article', `mq-card ${shapeOf(f, r, moment)}`.trim());
  c.dataset.finding = f.id;
  c.dataset.rung = r;

  const head = el('div', 'mq-card-head');
  head.append(el('span', 'mq-label', where(f)));
  const [tone, word] = stampOf(f, r, moment);
  head.append(el('span', `mq-stamp ${tone}`, word));
  c.append(head);

  if (r === 'blocking') {
    c.append(
      el(
        'p',
        'mq-p',
        f.blocks === 'now'
          ? 'Marque stopped here. Nothing else is fixed until this is settled.'
          : moment === 'send'
            ? 'You tried to send. This has to be answered first.'
            : 'This has to be answered before the document can be finalized.',
      ),
    );
  }

  if (answered(f)) {
    // The answer becomes the headline; changing it is first-class, not an override.
    const v: ActValue = decision(f)?.value ?? {};
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
  const result = f.outcome?.result && (f.outcome.kind !== 'choices' || answered(f)) ? f.outcome.result : null;
  if (f.marking?.as_written && !result && !f.overridden) {
    // Still to be decided: the marking it's about, as context for the readings below.
    const ctx = el('div', 'mq-was');
    ctx.append(el('span', null, 'As written'), placed(mark(f.marking.as_written, { size: 'sm', help })));
    c.append(ctx);
  } else if (f.marking?.as_written && result && !f.overridden) {
    const was = el('div', 'mq-was');
    was.append(
      el('span', null, 'Was'),
      placed(mark(f.marking.as_written, { size: 'sm', help })),
      el('span', null, '→'),
    );
    was.append(
      placed(
        mark(result, {
          size: 'sm',
          help,
          state: r === 'noticeable' || r === 'quiet' ? 'changed' : undefined,
        }),
      ),
    );
    c.append(was);
  } else if (!f.marking?.as_written && answered(f) && f.outcome?.result) {
    const now = el('div', 'mq-was');
    now.append(el('span', null, 'Now'), placed(mark(f.outcome.result, { size: 'sm' })));
    c.append(now);
  }

  // A decision here moves an artifact (its depends_on): say so beside the decision, the gate included.
  if (f.moves?.length && !answered(f) && !f.overridden) {
    const names = [...new Set(f.moves)].map((k) => `the ${(NAME[k] || k.replace(/_/g, ' ')).toLowerCase()}`);
    c.append(el('p', 'mq-p', `What you decide here changes ${names.join(' and ')}.`));
  }

  // The alternative the author also wrote (advisory): one action away.
  if (
    canWriteDocument(host) &&
    f.outcome?.kind === 'chosen_over' &&
    f.outcome.readings?.length &&
    !f.overridden &&
    !answered(f)
  ) {
    const alt = f.outcome.readings[0]!;
    const dep = el('div', 'mq-dep');
    dep.append(el('span', null, 'Or, as you also wrote:'));
    if (alt.result) dep.append(placed(mark(alt.result, { size: 'sm', help })));
    dep.append(button('ghost', alt.reading, () => host.onAct?.(f, 'changed', { reading: alt, index: 0 })));
    c.append(dep);
  }

  const ask = asks(f, host, r, help);
  if (ask) c.append(ask);

  // Conservative fallback, named, for the unattended boundary.
  if (canWriteDocument(host) && f.outcome?.fallback && r === 'blocking') {
    const fb = el('div', 'mq-dep');
    fb.append(el('span', null, "If no one can answer, Marque's most restrictive form keeps every stated equity:"));
    fb.append(placed(mark(f.outcome.fallback.result, { size: 'sm' })));
    fb.append(el('span', null, 'The host decides whether to apply it or hold.'));
    c.append(fb);
  }

  const foot = el('div', 'mq-foot');
  const why = el('a', 'mq-why', 'Why?');
  why.href = '#';
  why.addEventListener('click', (e) => {
    e.preventDefault();
    host.onHelp?.({ kind: 'why', finding: f, rung: r, anchor: why });
  });
  foot.append(why);
  const ct = cite(f.says.citation, host);
  if (ct) foot.append(ct);
  // Back to what Marque said: "Change my answer", "Undo" on a choice the
  // person made, "Fix it after all" on an override. Each is a new line in the log.
  if (canWriteDocument(host) && answered(f))
    foot.append(button('ghost', wasAsked(f) ? 'Change my answer' : 'Undo', () => host.onAct?.(f, 'changed', null)));
  else if (canRecordAct(host) && f.overridden)
    foot.append(button('ghost', 'Fix it after all', () => host.onAct?.(f, 'changed', null)));
  // No Undo on a fix the person must own; an override is recorded, not hidden.
  // Only a fix Marque made or chose can be kept against: an available one isn't applied, a withheld one is none.
  else if (
    canRecordAct(host) &&
    (r === 'noticeable' || r === 'advisory') &&
    (f.outcome?.kind === 'applied' || f.outcome?.kind === 'chosen_over')
  )
    foot.append(button('ghost', 'Keep as written', () => host.onAct?.(f, 'kept_as_written')));
  // Available: Marque has the fix and the person applies it (CONTRACT: available → apply); the host writes it.
  if (canWriteDocument(host) && f.outcome?.kind === 'available' && f.outcome.result && !answered(f) && !f.overridden) {
    const acts = el('div', 'mq-acts');
    acts.append(button('act', 'Apply', () => host.onAct?.(f, 'answered', { apply: true })));
    c.append(acts);
  }
  c.append(foot);
  return c;
}

/* ── C6 · the collapsed row ──────────────────────────────────────────── */
/** An artifact's stamp says what it is: missing and derived, there but not required, changed, or done. */
const artStamp = (a: ArtifactView, r: Rung, moment?: Moment): Stamp =>
  r === 'blocking'
    ? ['attn', stampOf(a, r, moment)[1]]
    : r === 'action'
      ? artWaits(a, moment)
        ? ['quiet', 'At finalize']
        : ['attn', 'Needs you']
      : a.applying
        ? ['quiet', 'To be written']
        : a.state === 'present_not_required'
          ? ['act', 'Not required']
          : a.state === 'absent_but_required' && a.derived_value
            ? ['act', 'Derived']
            : a.state === 'present_not_canonical'
              ? ['quiet', 'Changed']
              : ['quiet', 'Done'];

export function row(f: Subject, host: Host = {}, doc?: Doc | null): HTMLDivElement {
  const r = isArtifact(f) ? artRung(f, host.moment) : rung(f, host.moment);
  const li = el('div', 'mq-row-item');
  li.dataset.finding = f.id;
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  if (!host.narrow) li.setAttribute('aria-expanded', 'false');
  li.append(el('span', 'where', where(f)));
  const what = el('div', 'what', f.asks ? f.asks.text : f.says.text);
  const m = f.outcome?.result || f.marking?.as_written;
  if (m) what.append(mark(m, { form: 'folded', size: 'xs' }));
  li.append(what);
  const end = el('div', 'end');
  const [tone, word] = isArtifact(f) ? artStamp(f, r, host.moment) : stampOf(f, r, host.moment);
  end.append(el('span', `mq-stamp sm ${tone}`, word));
  li.append(end);
  const toggle = (open: boolean): void => {
    const next = li.nextElementSibling;
    if (next?.classList.contains('mq-row-detail')) next.remove();
    li.classList.toggle('open', open);
    li.setAttribute('aria-expanded', String(open));
    if (!open) return;
    // One card open at a time.
    li.closest('.mq-pane')
      ?.querySelectorAll('.mq-row-item.open')
      .forEach((o) => {
        if (o !== li) {
          o.nextElementSibling?.remove();
          o.classList.remove('open');
          o.setAttribute('aria-expanded', 'false');
        }
      });
    const d = el('div', 'mq-row-detail');
    d.append(isArtifact(f) ? artifact(f, host, doc) : card(f, host));
    if (host.vocab) relabel(d, host.vocab);
    // Escape from inside the card closes it and goes back to its row.
    // A token's open tooltip takes the first Escape.
    d.addEventListener('keydown', (e) => {
      if (
        e.key !== 'Escape' ||
        e.defaultPrevented ||
        (e.target instanceof Element && e.target.getAttribute('aria-describedby')?.startsWith('mq-tip'))
      )
        return;
      e.preventDefault();
      toggle(false);
      host.onOpen?.(null);
      li.focus();
    });
    li.after(d);
  };
  const click = () => {
    // Under the width floor there is no room for a card: the host is told, and shows it its own way.
    if (host.narrow) {
      host.onOpen?.(f);
      host.onJump?.(f);
      return;
    }
    const open = !li.classList.contains('open');
    toggle(open);
    host.onOpen?.(open ? f : null);
    if (open) host.onJump?.(f);
  };
  li.addEventListener('click', click);
  li.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    click();
    // Opened from the keyboard: on to the question, its chosen or first reading, else the field.
    const d = li.classList.contains('open') ? li.nextElementSibling : null;
    (
      d?.querySelector<HTMLElement>('input[type=radio]:checked') || d?.querySelector<HTMLElement>('input, button')
    )?.focus();
  });
  if (host.open === f.id && !host.narrow) queueMicrotask(() => toggle(true));
  return li;
}

/* ── C7 · document status ────────────────────────────────────────────── */
/** A required artifact Marque derived and nobody has written: it goes in as the document goes out. */
const due = (a: ArtifactView): boolean =>
  a.state === 'absent_but_required' && !!a.derived_value && a.fixability === 'fixable';
/** No automatic artifact placement can be confirmed by a read-only host. */
const unwritable = (doc: Doc, host: Host): number => (host.readOnly ? doc.document.artifacts.filter(due).length : 0);
/** Read-only, nothing can be written, so a due artifact holds the document up. */
const unconfirmedWrites = (doc: Doc, host: Host): string[] =>
  [
    ...new Set([
      ...(doc.document.awaitingWrites ?? []),
      ...(host.requiredWrites ?? []),
      ...doc.document.artifacts.filter(due).map((a) => a.id),
    ]),
  ].filter((token) => {
    const basis = doc.document.evaluation?.basis;
    const confirmation = basis && writeConfirmationToken(token, basis);
    return !confirmation || !(host.confirmedWrites ?? []).includes(confirmation);
  });
const ready = (doc: Doc, host: Host): boolean =>
  effectiveReady(doc, {
    ...host,
    requiredWrites: [...(host.requiredWrites ?? []), ...doc.document.artifacts.filter(due).map((a) => a.id)],
  });
/** What the gate lists: blockers and the writes still waiting, once each. A required
 *  finding that never blocks needs the person but holds nothing up. */
const holding = (doc: Doc, host: Host = {}): string[] => [
  ...new Set([
    ...doc.document.blocking,
    ...(doc.document.pending || []),
    ...unconfirmedWrites(doc, host),
    ...(host.requiredAcceptanceChecks ?? [])
      .filter((id) => {
        const basis = doc.document.evaluation?.basis;
        const confirmation = basis && writeConfirmationToken(id, basis);
        return !confirmation || host.acceptanceChecks?.[id] !== confirmation;
      })
      .map((id) => `check:${id}`),
  ]),
];
const held = (doc: Doc, host: Host): number => holding(doc, host).length;

export function status(doc: Doc | null, host: Host = {}): HTMLDivElement {
  const s = el('div', 'mq-status');
  s.setAttribute('role', 'status');
  s.append(el('span', 'mq-label', 'This document'));
  s.append(el('span', 'sep'));
  // The strip exists before Marque has run, so the host's layout never jumps.
  if (!doc || (host.engine && host.engine !== 'ok')) {
    s.append(el('span', 'mq-ui', '—'), el('span', 'mq-stamp quiet', ENGINE[host.engine ?? ''] || 'Not checked'));
    return s;
  }
  const banner = doc.document.artifacts.find((a) => a.kind === 'front_marking');
  if (banner && isMarking(banner.derived_value)) s.append(placed(mark(banner.derived_value, { size: 'lg' })));

  const g = sections(doc, host.moment);
  const overrides = doc.findings.filter((f) => f.overridden).length;
  const words = (t: string): HTMLSpanElement => el('span', 'mq-small', t);
  const stuck = unwritable(doc, host);
  if (ready(doc, host) && !g.must.length) {
    // Plain, not celebratory: the Ready stamp is outlined because there is nothing to act on.
    s.append(el('span', 'mq-stamp', 'Ready'));
    if (overrides)
      s.append(
        el('span', 'mq-stamp', `${overrides} reported`),
        words(overrides === 1 ? 'one marking kept as written' : `${overrides} markings kept as written`),
      );
    else if (changes(g.done)) s.append(words(`${plural(changes(g.done), 'change', 'changes')} made quietly`));
  } else if (!g.must.length && doc.document.pending?.length) {
    // Everything is answered; the host hasn't written it yet.
    s.append(
      el('span', 'mq-stamp', 'Not ready'),
      words(`${plural(doc.document.pending.length, 'answer', 'answers')} waiting to be written into the document`),
    );
  } else if (!g.must.length && stuck) {
    s.append(
      el('span', 'mq-stamp', 'Not ready'),
      words(`${plural(stuck, 'thing', 'things')} can't be written while the document is read-only`),
    );
  } else if (GATE.has(host.moment) && held(doc, host)) {
    s.classList.add('must');
    const n = held(doc, host);
    s.append(
      el('span', 'mq-stamp attn', 'Blocked'),
      words(`${plural(n, 'thing has', 'things have')} to be settled before it can go out`),
    );
  } else {
    if (g.must.length) {
      s.classList.add('must');
      s.append(el('span', 'mq-stamp attn', `${g.must.length} needs you`));
    } else s.append(el('span', 'mq-stamp', 'Not ready'));
    if (g.later.length) s.append(words(`${g.must.length ? 'and ' : ''}${g.later.length} before you finalize`));
  }
  return s;
}

/* ── C6 · the pane ───────────────────────────────────────────────────── */
const ENGINE: Record<string, string> = { checking: 'Checking', failed: 'Stopped' };
const TITLES: Record<keyof Sections, string> = {
  must: 'Needs you',
  can: 'Worth a look',
  later: 'Before you finalize',
  done: 'Done quietly',
};

function engineState(host: Host): HTMLDivElement {
  const box = el('div', `mq-engine ${host.engine === 'failed' ? 'err' : ''}`.trim());
  const body = el('div', 'mq-txt');
  if (host.engine === 'checking') {
    // No spinner: a sentence.
    body.append(
      el('div', 'mq-h', 'Checking the document…'),
      el('p', 'mq-p', 'Usually under a second. The pane fills in as results arrive.'),
    );
  } else if (host.engine === 'failed') {
    // Fail-closed: no partial results, because none were produced.
    body.append(
      el('div', 'mq-h', 'Marque stopped before checking anything.'),
      el(
        'p',
        'mq-p',
        'A component failed its integrity check, so nothing was read or changed. The document is as you left it.',
      ),
    );
    const acts = el('div', 'mq-acts');
    acts.append(
      button('ghost', 'Try again', () => host.onRetry?.()),
      button('ghost', 'Copy the report for your administrator', () => host.onReport?.()),
    );
    body.append(acts);
  } else {
    body.append(
      el('div', 'mq-h', "The document hasn't been checked."),
      el('p', 'mq-p', "Marque isn't reachable from this pane. Markings on the page are as written."),
    );
    const acts = el('div', 'mq-acts');
    acts.append(button('ghost', 'Retry', () => host.onRetry?.()));
    body.append(acts);
  }
  box.append(body);
  return box;
}

/** The two tabs, Findings and History, and the panel the chosen one fills. */
function tabbed(p: HTMLElement, host: Host): HTMLElement {
  const on: Tab = host.tab === 'history' ? 'history' : 'findings';
  const bar = el('div', 'mq-tabs');
  bar.setAttribute('role', 'tablist');
  const panel = el('div', 'mq-panel');
  panel.setAttribute('role', 'tabpanel');
  panel.id = `mq-panel-${++uid}`;
  for (const [k, text] of [
    ['findings', 'Findings'],
    ['history', 'History'],
  ] as const) {
    const t = el('button', 'mq-tab', text);
    t.type = 'button';
    t.id = `${panel.id}-${k}`;
    t.dataset.tab = k;
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-selected', String(k === on));
    t.tabIndex = k === on ? 0 : -1;
    if (k === on) {
      t.setAttribute('aria-controls', panel.id);
      panel.setAttribute('aria-labelledby', t.id);
    }
    t.addEventListener('click', () => host.onTab?.(k));
    // Two tabs: an arrow goes to the other one, Home and End to the first and last.
    t.addEventListener('keydown', (e) => {
      const to: Tab | null =
        e.key === 'Home'
          ? 'findings'
          : e.key === 'End'
            ? 'history'
            : e.key === 'ArrowLeft' || e.key === 'ArrowRight'
              ? k === 'findings'
                ? 'history'
                : 'findings'
              : null;
      if (!to) return;
      e.preventDefault();
      host.onTab?.(to);
    });
    bar.append(t);
  }
  p.append(bar, panel);
  return panel;
}

/** What an act did, in a word or two. */
const did = (e: LogEntry): string =>
  e.act === 'changed' && e.value == null
    ? 'Taken back'
    : e.value?.apply
      ? 'Asked to apply'
      : e.value?.remove
        ? 'Asked to remove'
        : e.value?.fields
          ? 'Filled in'
          : DONE[e.act];

type DisclosedHistoryEntry = Extract<HistoryDisclosure['entries'][number], { status: 'available' }>;

/** Index the provider's current display once; conflicting request or sequence identities withhold that act. */
function historyDisplay(doc: Doc, context: HistoryDisclosureHost): (entry: LogEntry) => DisclosedHistoryEntry | null {
  const p = context.historyDisclosure;
  const binding = context.actBinding;
  if (
    !p ||
    !binding?.documentId ||
    !binding.chain ||
    !context.currentDisclosureRevision?.trim() ||
    p.disclosureRevision !== context.currentDisclosureRevision ||
    p.documentId !== binding.documentId ||
    p.chain !== binding.chain ||
    !Array.isArray(p.entries) ||
    !sameBasis(p.basis, context.currentBasis) ||
    !sameBasis(binding.basis, context.currentBasis) ||
    !sameBasis(doc.document.evaluation?.basis, context.currentBasis)
  )
    return () => null;
  const requests = new Set<string>();
  const repeated = new Set<string>();
  const rows = new Map<number, HistoryDisclosure['entries'][number] | null>();
  for (const row of p.entries) {
    if (requests.has(row.requestId)) repeated.add(row.requestId);
    requests.add(row.requestId);
    rows.set(row.sequence, rows.has(row.sequence) ? null : row);
  }
  return (entry) => {
    const row = rows.get(entry.sequence);
    if (
      !entry.requestId ||
      !Number.isSafeInteger(entry.sequence) ||
      entry.sequence < 1 ||
      entry.binding?.documentId !== p.documentId ||
      entry.binding.chain !== p.chain ||
      row?.status !== 'available' ||
      row.requestId !== entry.requestId ||
      row.subjectId !== entry.id ||
      repeated.has(entry.requestId)
    )
      return null;
    return row;
  };
}
function history(doc: Doc, log: readonly LogEntry[], host: Host): HTMLElement {
  const display = historyDisplay(doc, host);
  const rows = el('div', 'mq-rows mq-history');
  const all: Subject[] = [...doc.findings, ...doc.document.artifacts];
  [...log].reverse().forEach((e, i, newest) => {
    const x = all.find((y) => y.id === e.id);
    const li = el('div', 'mq-row-item');
    li.dataset.act = e.act;
    li.append(el('span', 'where', x ? where(x) : e.about?.anchor ? where({ anchor: e.about.anchor }) : '—'));
    const what = el('div', 'what', did(e));
    // In force: the last act on its id, and still the one the finding stands on.
    const last = newest.findIndex((y) => y.id === e.id) === i;
    const force = last && !!x && [x.person, isArtifact(x) ? null : decision(x)].some((d) => d && canon(d) === canon(e));
    if (force && !isArtifact(x) && e.act === 'kept_as_written' && x.marking?.as_written)
      what.append(placed(mark(x.marking.as_written, { form: 'folded' })));
    const disclosed = display(e);
    if (disclosed?.text) what.append(el('span', 'mq-p', disclosed.text));
    if (disclosed?.marking) what.append(placed(mark(disclosed.marking, { form: 'folded' })));
    li.append(what);
    // Routing acts (later, not my call) leave the question open: there is nothing to take back.
    const back =
      force &&
      !e.value?.fields &&
      (e.act === 'kept_as_written' || ((e.act === 'answered' || e.act === 'changed') && e.value != null));
    if (back) {
      const end = el('div', 'end');
      if (canWriteDocument(host)) end.append(button('ghost', 'Take back', () => host.onAct?.(x, 'changed', null)));
      li.append(end);
    }
    rows.append(li);
  });
  return rows;
}

const CAB_FIELD_LABEL: Record<NativeField, string> = {
  classified_by: 'Classified by',
  agency_and_office_of_origin: 'Agency and office of origin',
  classification_reason: 'Classification reason',
  declassify_on: 'Declassify on',
};
const RESULT_SUPPORT_LABEL: Record<NativeSemanticResultSupportKind, string> = {
  authored: 'Author-written material',
  unresolved_occurrence: 'Unresolved source occurrence',
  implied_usa: 'Implied by U.S. origin',
  examined_absence: 'Examined absence',
  rel_receive_implies_show: 'Foreign release relationship',
  eyes_receive_implies_show: 'EYES receive implies show',
  preview_answer: 'Preview response',
  cab_proof: 'Classification authority evidence',
  sci_proof: 'Sensitive compartmented information evidence',
  default_policy_proof: 'Default policy evidence',
};
const words = (value: string): string => value.replaceAll('_', ' ');
/** A scoped read, not a finding, document readiness verdict, or writable card. */
function nativeCab(doc: Doc, host: Host): HTMLElement {
  const section = el('section', 'mq-section');
  const heading = el('h2', 'mq-label', 'Classification Authority Block');
  section.append(heading);
  const result = host.nativeCabRequest && readCabSnapshot(doc, host.nativeCabRequest);
  if (!result) {
    section.append(el('p', 'mq-p', 'The current authority block evaluation is unavailable.'));
    return section;
  }
  const ready = result.readiness.kind === 'supported' ? words(result.readiness.status) : words(result.readiness.kind);
  section.append(el('p', 'mq-p', `Authority block evaluation is ${ready}.`));
  section.append(el('p', 'mq-p', `Source coverage is ${words(result.coverage.status)}.`));
  const list = el('dl', 'mq-rows');
  for (const req of result.requirements) {
    if (!req.field) continue;
    const row = el('div', 'mq-row-item');
    row.append(el('dt', 'mq-label', CAB_FIELD_LABEL[req.field]), el('dd', 'mq-p', words(req.state)));
    list.append(row);
  }
  if (list.childElementCount) section.append(list);
  if ('findings' in result) {
    section.append(el('p', 'mq-p', 'Finding details are partial.'));
    const findings = el('ul', 'mq-rows');
    for (const finding of result.findings.items) {
      const row = el('li', 'mq-row-item');
      const req =
        finding.requirement.status === 'resolved' ? result.requirements[Number(finding.requirement.index)] : null;
      row.append(el('span', 'mq-label', req?.field ? CAB_FIELD_LABEL[req.field] : 'Requirement unavailable'));
      row.append(
        el(
          'span',
          'mq-p',
          finding.outcome === 'needs_fact'
            ? 'Finding reports: Additional information is needed.'
            : 'Finding outcome is unavailable.',
        ),
      );
      const prompt = finding.question?.prompt ?? finding.requested_action?.requested_fact;
      if (prompt) row.append(el('span', 'mq-p', prompt));
      if (finding.identity.status === 'unavailable') row.append(el('span', 'mq-p', 'Finding identity is unavailable.'));
      if (!finding.question) row.append(el('span', 'mq-p', 'Question identity is unavailable.'));
      if (!finding.result || !finding.result_revision)
        row.append(el('span', 'mq-p', 'Result identity is unavailable.'));
      findings.append(row);
    }
    if (findings.childElementCount) section.append(findings);
  }
  return section;
}

/** A bounded read-only projection of only the rows and details the host granted. */
function nativeSemanticResults(doc: Doc, host: Host): HTMLElement {
  const section = el('section', 'mq-section');
  section.append(el('h2', 'mq-label', 'Evaluation results'));
  const result = readNativeSemanticResults(doc, host.nativeSemanticResultsRequest, host.currentDisclosureRevision);
  if (!result) {
    section.append(el('p', 'mq-p', 'The current result disclosure is unavailable.'));
    return section;
  }
  section.append(
    el(
      'p',
      'mq-p',
      `${plural(result.disclosure.items.length, 'selected result row', 'selected result rows')} are available for this read-only view. Source values and identifiers are not shown.`,
    ),
  );
  if (result.disclosure.coverage)
    section.append(el('p', 'mq-p', `Result coverage is ${words(result.disclosure.coverage)}.`));
  const rows = el('ol', 'mq-rows');
  for (const item of result.disclosure.items) {
    const row = el('li', 'mq-row-item');
    const title = item.meaning?.status === 'available' ? CAB_FIELD_LABEL[item.meaning.field] : `Result ${item.ordinal}`;
    row.append(el('h3', 'mq-label', title));
    if (!item.meaning || item.meaning.status === 'unavailable')
      row.append(el('p', 'mq-p', 'Typed meaning is unavailable.'));
    if (item.support_kinds) {
      const supportText = item.support_kinds.map((kind) => RESULT_SUPPORT_LABEL[kind]).join('; ');
      row.append(el('p', 'mq-p', supportText ? `Evidence types: ${supportText}.` : 'No support types were reported.'));
    }
    if (item.dependencies) {
      if (item.dependencies.status === 'unavailable') {
        row.append(el('p', 'mq-p', 'Dependency information is unavailable.'));
      } else if (item.dependencies.items.length === 0) {
        row.append(el('p', 'mq-p', 'No result dependencies were reported.'));
      } else {
        const dependencyRows = item.dependencies.items
          .map((dependency) =>
            dependency.status === 'resolved' ? `Result ${dependency.row}` : 'An unavailable dependency',
          )
          .join('; ');
        row.append(el('p', 'mq-p', `Depends on: ${dependencyRows}.`));
      }
    }
    rows.append(row);
  }
  if (rows.childElementCount) section.append(rows);
  return section;
}

export function pane(doc: Doc | null, host: Host = {}): HTMLDivElement {
  const p = el('div', 'mq-pane');
  const head = el('div', 'mq-pane-head');
  const brand = el('div', 'mq-brand');
  brand.append('MAR', el('b', null, 'QUE'));
  head.append(brand);
  p.append(head);

  const down = host.engine && host.engine !== 'ok';
  // Still checking with results in: they show as they arrive, under the checking notice.
  const partial = host.engine === 'checking' && !!doc;
  if (!doc || (!partial && down)) {
    head.append(
      el(
        'span',
        `mq-stamp ${host.engine === 'failed' ? '' : 'quiet'}`.trim(),
        ENGINE[host.engine ?? ''] || 'Not checked',
      ),
    );
    p.append(status(null, host), engineState(host));
    return p;
  }

  if ('native_evaluation' in doc.document || 'native_semantic_results' in doc.document) {
    if ('native_evaluation' in doc.document) p.append(nativeCab(doc, host));
    if ('native_semantic_results' in doc.document) p.append(nativeSemanticResults(doc, host));
    return p;
  }

  const g = sections(doc, host.moment);
  const atGate = GATE.has(host.moment);
  head.append(
    partial
      ? el('span', 'mq-stamp quiet', 'Checking')
      : g.must.length
        ? el('span', 'mq-stamp attn', atGate && held(doc, host) ? 'Blocked' : `${g.must.length} needs you`)
        : el('span', 'mq-stamp', ready(doc, host) ? 'Ready' : 'Not ready'),
  );
  p.append(status(doc, host));
  if (partial) p.append(engineState(host));

  if (host.readOnly) {
    // The host's state, not Marque's. Findings still show; a reader needs them too.
    const waiting = doc.document.pending?.length || 0; // acts the host hasn't written, not Marque's own fixes
    const ro = el('div', 'mq-engine');
    const body = el('div', 'mq-txt');
    body.append(
      el('div', 'mq-h', 'This document is read-only.'),
      el(
        'p',
        'mq-p',
        `Marque can show what it found but can't change the document. ${waiting ? `${plural(waiting, 'answer is', 'answers are')} waiting; answers` : 'Answers'} you give are kept for when it can be edited.`,
      ),
    );
    ro.append(body);
    p.append(ro);
  }

  // Once anything is done, it can be looked back on: the findings or the History (DECISIONS #24).
  const out = host.log?.length ? tabbed(p, host) : p;
  const findings = !host.log?.length || host.tab !== 'history';
  if (!findings) out.append(history(doc, host.log!, host));
  else if (!g.must.length && !g.can.length && !g.later.length) {
    out.append(el('div', 'mq-empty', 'Nothing needs you.'));
  }

  for (const k of ['must', 'can', 'later', 'done'] as const) {
    const list = g[k];
    if (!list.length || !findings) continue;
    const sec = el('section', `mq-section ${k}`);
    const sh = el('div', 'mq-section-head');
    const id = `mq-sec-${k}-${++uid}`;
    const title = el('span', 'mq-label', TITLES[k]);
    title.id = id;
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
      sum.append(
        el('span', 'where', ''),
        el(
          'div',
          'what',
          `${n === list.length ? plural(n, 'change', 'changes') : `${list.length} done${n ? `, ${n} changed` : ''}`} · show`,
        ),
      );
      const end = el('div', 'end');
      end.append(el('span', 'mq-stamp sm quiet', n ? 'Changed' : 'Done'));
      sum.append(end);
      det.append(sum);
      list.forEach((f) => det.append(row(f, host, doc)));
      rows.append(det);
    } else list.forEach((f) => rows.append(row(f, host, doc)));
    sec.append(rows);
    out.append(sec);
  }

  const foot = el('div', 'mq-pane-foot');
  foot.append(
    button('ghost', 'Check before sending', () => host.onGate?.()),
    button('ghost', 'Look up a code', (e) => host.onLookup?.(e.currentTarget as HTMLElement)),
    button('ghost', 'Receipt', () => host.onReceipt?.()),
  );
  p.append(foot);
  return p;
}

/* ── C9 · artifact card (banner, CAB) ────────────────────────────────── */
export function artifact(a: ArtifactView, host: Host = {}, doc?: Doc | null): HTMLElement {
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
    c.append(
      isMarking(a.derived_value)
        ? placed(mark(a.derived_value, { size: 'lg', state: 'derived' }))
        : el('p', 'mq-p', 'Marque has a notice to add here.'),
    );
    if (a.placement) c.append(el('span', 'mq-place', `Placed: ${a.placement.replace(/_/g, ' ')}`));
    // Generated, not applied: the person can apply it; the host writes it (docs/COMPONENTS.md, C9).
    const fixes = a.state === 'absent_but_required' || a.state === 'present_not_canonical';
    if (a.applying && fixes) c.append(el('p', 'mq-p', 'Waiting to be written into the document.'));
    else if (a.fixability === 'fixable' && fixes && canWriteDocument(host)) {
      const acts = el('div', 'mq-acts');
      acts.append(button('act', 'Apply', () => host.onAct?.(a, 'answered', { apply: true })));
      c.append(acts);
    }
  }
  // Present but not required: an Advisory in its own right, one optional action. Leaving it is the other choice.
  if (a.state === 'present_not_required' && !a.applying && canWriteDocument(host)) {
    const acts = el('div', 'mq-acts');
    acts.append(button('act', 'Remove it', () => host.onAct?.(a, 'answered', { remove: true })));
    c.append(acts);
  } else if (a.state === 'present_not_required' && a.applying)
    c.append(el('p', 'mq-p', 'Waiting to be removed from the document.'));
  if (a.fields) {
    const dl = el('div', 'mq-cab');
    // A field a person fills: labeled by its key, committed on Enter or Fill in.
    const entry = (k: string, fld: ArtifactField, key: HTMLElement): HTMLSpanElement => {
      if (!canWriteDocument(host)) {
        const value = el('span', `v ${fld.state === 'blank' ? 'blank' : ''}`.trim(), fld.value || 'Not provided');
        value.setAttribute('aria-label', `${k.replace(/_/g, ' ')}: ${fld.value || 'not provided'}`);
        return value;
      }
      const v = el('span', 'v blank mq-field');
      const inp = el('input', 'mono');
      inp.type = 'text';
      inp.id = `${a.id}-${k}-${++uid}`;
      inp.dataset.draft = `${a.id}:${k}`;
      draftContext.set(inp, {
        asked: canon({ ...fld, evaluationBasis: fld.evaluationBasis && disclosedBasis(fld.evaluationBasis) }),
      });
      key.id = `${inp.id}-k`;
      inp.setAttribute('aria-labelledby', key.id);
      inp.placeholder = fld.format || '';
      inp.defaultValue = fld.value || '';
      const err = el('span', 'err');
      err.id = `${inp.id}-err`;
      err.setAttribute('role', 'alert');
      inp.setAttribute('aria-describedby', err.id);
      const fill = () => {
        const t = inp.value.trim();
        if (!t || t === fld.value) return;
        // A declared format is checked before the value is recorded; the field stays open until it fits.
        if (!fits(fld.format, t)) {
          v.classList.add('bad');
          err.textContent = `That doesn’t fit this field. Use: ${(fld.format ?? '')
            .split('|')
            .map((s) => s.trim())
            .join(', or ')}.`;
          inp.focus();
          return;
        }
        host.onAct?.(a, 'answered', { fields: { [k]: t } });
      };
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          fill();
        }
      });
      v.append(inp);
      if (fld.hint) v.append(el('span', 'hint', fld.hint));
      v.append(button('ghost', 'Fill in', fill), err);
      return v;
    };
    for (const [k, fld] of Object.entries(a.fields)) {
      const key = el(
        'span',
        'k',
        k.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase()),
      );
      dl.append(key);
      if (fld.state === 'blank') {
        dl.append(entry(k, fld, key));
        continue;
      }
      const has = fld.state === 'known' || fld.state === 'derived';
      const v = el(
        'span',
        `v ${has ? 'derived' : ''}`.trim(),
        has
          ? (fld.value ?? '')
          : fld.state === 'waiting'
            ? `Waits on ${(fld.waits_on ?? '').replace(/_/g, ' ')}`
            : fld.format || '',
      );
      if (fld.hint) v.title = fld.hint;
      // A filled field stays correctable: a typo, or Classified By when someone else made the call.
      // Read-only too: the correction waits with the other answers.
      if (has) {
        const change = button('ghost', 'Change', () => {
          const n = entry(k, fld, key);
          v.replaceWith(n);
          const i = n.querySelector('input')!;
          i.dataset.opened = '1';
          i.focus();
        });
        change.dataset.change = `${a.id}:${k}`;
        draftContext.set(change, {
          asked: canon({ ...fld, evaluationBasis: fld.evaluationBasis && disclosedBasis(fld.evaluationBasis) }),
        });
        v.append(' ', change);
      }
      dl.append(v);
    }
    c.append(dl);
    if (a.applying && !a.derived_value && a.state !== 'present_not_required')
      c.append(el('p', 'mq-p', 'Waiting to be written into the document.'));
  }
  const joint = a.jointPreview;
  const evaluation = doc?.document.evaluation;
  const baseOnly = (basis: Host['currentBasis']) => basis && { ...basis, replacements: {} };
  const jointIsCurrent =
    joint &&
    joint.status === 'complete' &&
    evaluation?.completion === 'complete' &&
    evaluation.jointPreview?.status === 'complete' &&
    sameBasis(evaluation.basis, host.currentBasis) &&
    sameBasis(baseOnly(joint.basis), baseOnly(evaluation.basis)) &&
    sameBasis(joint.basis, evaluation.jointPreview.basis) &&
    canon(joint.basis.replacements) === canon(doc ? acceptedReplacements(doc) : {});
  if (joint?.status === 'unavailable') {
    c.append(el('p', 'mq-p', 'Combined preview unavailable. Marque will check the accepted answers together.'));
  } else if (jointIsCurrent && joint?.result) {
    const dep = el('div', 'mq-dep');
    dep.append(el('span', null, 'If the accepted answers are taken together:'));
    if (isMarking(joint.result)) dep.append(placed(mark(joint.result, { size: 'sm' })));
    else dep.append(el('span', null, 'A combined artifact value is available.'));
    c.append(dep);
  }
  const foot = el('div', 'mq-foot');
  const why = el('a', 'mq-why', a.derivation ? 'How Marque got here' : 'Why?');
  why.href = '#';
  why.addEventListener('click', (e) => {
    e.preventDefault();
    host.onHelp?.({ kind: a.derivation ? 'derivation' : 'why', artifact: a, anchor: why });
  });
  foot.append(why);
  const ct = cite(a.says.citation, host);
  if (ct) foot.append(ct);
  c.append(foot);
  return c;
}

/* ── C10 · finalize gate ─────────────────────────────────────────────── */
/** The Needs-you section with defer removed, in the pane's own words, with
 *  the answers inline. The host calls it at its real moment; pass that moment
 *  as host.moment ('finalize' when it isn't one of the gate moments). */
export function gate(doc: Doc, host: Host = {}): HTMLDivElement {
  const h: Host = GATE.has(host.moment) ? host : { ...host, moment: 'finalize' };
  const ids = doc.document.blocking;
  const g = el('div', 'mq-gate');
  g.setAttribute('role', 'region');
  g.setAttribute('aria-label', 'Before this can go out');
  const vocab = host.vocab;
  if (vocab) queueMicrotask(() => relabel(g, vocab)); // once its cards are in
  if (!ids.length) {
    // Still the last look before it goes out: what will be written, and what the person answered.
    const n = doc.document.pending?.length;
    // What still has to be written: pending acts, and a derived artifact nobody has written. Done acts are not future writes.
    const pend = new Set(doc.document.pending || []);
    const will = doc.document.artifacts.filter((a) => pend.has(a.id) || due(a));
    // What the person decided and still stands; one they took back is the receipt's to show.
    // Overrides too: the last look says which markings will be reported as kept.
    const decided = doc.findings.filter((f) => pend.has(f.id) || answered(f) || f.overridden);
    const stuck = unwritable(doc, host);
    const isReady = ready(doc, h);
    const outstanding = holding(doc, host).length;
    g.append(
      el(
        'h3',
        'mq-q',
        n
          ? `Waiting for ${plural(n, 'answer', 'answers')} to be written into the document.`
          : stuck
            ? `Not ready. The document is read-only, so ${plural(stuck, 'thing', 'things')} can't be written into it.`
            : isReady
              ? 'Ready to finalize.'
              : outstanding
                ? `Not ready. ${plural(outstanding, 'write or check is', 'writes or checks are')} waiting for confirmation.`
                : 'Not ready. Marque needs to check the current document and confirm that changes were saved.',
      ),
    );
    will.forEach((a) => g.append(artifact(a, h, doc)));
    decided.forEach((f) => g.append(card(f, h)));
    return g;
  }
  // An answer still waiting to be written holds it up too, and so, read-only, does a required artifact nobody can write.
  const all = holding(doc, host);
  g.append(
    el(
      'h3',
      'mq-q',
      all.length === 1 ? 'One thing before this can go out.' : `${all.length} things before this can go out.`,
    ),
  );
  for (const id of all) {
    const f = doc.findings.find((x) => x.id === id);
    const a = f ? null : doc.document.artifacts.find((x) => x.id === id);
    if (f) g.append(card(f, h));
    else if (a) g.append(artifact(a, h, doc));
  }
  return g;
}

/* ── C11 · derivation panel ──────────────────────────────────────────── */
export function derivation(a: ArtifactView, doc: Doc, host: Host = {}): HTMLDivElement {
  const d = el('div', 'mq-deriv');
  (a.derivation || []).forEach((step, i) => {
    const s = el('div', 'mq-step');
    s.append(el('span', 'n', String(i + 1)));
    const body = el('div', 'body');
    const rule = el('div', 'rule');
    rule.append(el('span', 'mq-label', step.axis), el('span', 'mq-ui', step.output));
    body.append(rule);
    const from = step.inputs.map((id) => where(doc.findings.find((f) => f.id === id) || {})).join(', ');
    body.append(el('p', 'mq-p', `From ${from}.`));
    const ct = cite(step.citation, host);
    if (ct) body.append(ct);
    s.append(body);
    d.append(s);
  });
  return d;
}

/* ── C12 · audit receipt ─────────────────────────────────────────────── */
/** What the engine will attest for this session. Content-ignorant by
 *  construction: markings, rule ids, spans, decisions — never body text.
 *  Every act the person took is listed, including each changed answer. */
export function receipt(doc: Doc, session: Session = {}): HTMLDivElement {
  const r = el('div', 'mq-receipt');
  const hd = el('div', 'hd');
  hd.append(
    el('span', null, `MARQUE · ${session.schema || 'audit'}`),
    el('span', 'who', session.classifier_id || 'classifier id not set'),
  );
  r.append(hd);
  // Private log payload is not a disclosure grant. Only host-projected text/markings are displayable.
  const display = historyDisplay(doc, session);
  const acts = (x: Receiptable): HTMLElement => {
    const out = el('span');
    (x.history || []).forEach((e, i) => {
      if (i) out.append(document.createTextNode(' → '));
      out.append(document.createTextNode([e.act.replace(/_/g, ' '), e.at].filter(Boolean).join(' ')));
      const safe = display(e);
      if (safe?.text) out.append(document.createTextNode(` ${safe.text}`));
      if (safe?.marking) out.append(document.createTextNode(' '), placed(mark(safe.marking, { size: 'xs' })));
    });
    return out;
  };
  for (const f of doc.findings) {
    const ln = el('div', 'ln');
    ln.append(el('span', 't', where(f)));
    const b = el('div', 'b');
    const did = acts(f);
    b.append(el('span', null, `${f.rule.scheme}:${f.rule.predicate} · ${f.outcome.kind.replace(/_/g, ' ')}`));
    if (did.hasChildNodes()) b.append(document.createTextNode(' · '), did);
    if (f.marking?.as_written) b.append(placed(mark(f.marking.as_written, { size: 'xs' })));
    // A pending answer's overlaid result is historical until the engine evaluates it.
    if (!f.person && f.outcome?.result) b.append(placed(mark(f.outcome.result, { size: 'xs', state: 'changed' })));
    ln.append(b);
    r.append(ln);
  }
  // Every artifact, card or not: present and absent-not-required ones live only here.
  for (const a of doc.document.artifacts) {
    const ln = el('div', 'ln');
    const did = acts(a);
    const b = el('div', 'b');
    b.append(el('span', null, `${a.kind} · ${a.state.replace(/_/g, ' ')}`));
    if (did.hasChildNodes()) b.append(document.createTextNode(' · '), did);
    if (isMarking(a.derived_value)) b.append(placed(mark(a.derived_value, { size: 'xs', state: 'changed' })));
    ln.append(el('span', 't', where(a)), b);
    r.append(ln);
  }
  // Acts on findings a later lint withdrew stay in the audit.
  for (const x of doc.document.withdrawn || []) {
    const ln = el('div', 'ln');
    const a: Partial<Snapshot> = x.about || {};
    ln.append(el('span', 't', a.anchor || a.kind ? where(a) : '—'));
    const b = el('div', 'b');
    b.append(el('span', null, `${a.rule ? `${a.rule} · ` : ''}no longer reported`));
    const did = acts(x);
    if (did.hasChildNodes()) b.append(document.createTextNode(' · '), did);
    ln.append(b);
    r.append(ln);
  }
  const ft = el('div', 'ft');
  ft.append(
    el(
      'span',
      null,
      `${plural(doc.findings.length, 'finding', 'findings')} · ${doc.document.blocking.length} open${doc.document.pending?.length ? ` · ${doc.document.pending.length} waiting to be written` : ''}`,
    ),
    el('span', 'mq-hash', session.session_root || 'session root: computed by the engine at seal'),
  );
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
 * A user action reaches `onAppend` first. The kit adopts only its acknowledged
 * state; a new committed act is then handed to `onChange(state, act)` for host
 * work. A refusal remains pending outside ordered history and never dispatches
 * a write. `onChange` with a null act is still used for bookkeeping only.
 * An answer stays pending, and the document not ready, until the host re-lints
 * and passes the new `doc`. A new Action required is announced in a polite live
 * region; Quiet changes are not.
 */
export function mount(
  root: HTMLElement,
  { doc = null, state = empty(), moment = 'editing', engine = 'ok', readOnly = false, ...host }: MountOptions = {},
): Mounted {
  if (!isDisclosedState(state))
    throw new TypeError('The workspace must supply disclosed action history to open the pane.');
  const cur: {
    doc: Doc | null;
    state: State;
    moment: Moment;
    engine: EngineState;
    readOnly: boolean;
    actBinding: ActAppendBinding | null;
    currentDisclosureRevision: string | null;
    historyDisclosure: HistoryDisclosure | null;
    nativeCabRequest: NativeCabRequest | null;
    nativeSemanticResultsRequest: NativeSemanticResultsRequest | null;
    open: string | null;
    tab: Tab;
    seq: number | null;
  } = {
    doc,
    state,
    moment,
    engine,
    readOnly,
    actBinding: host.actBinding ?? null,
    currentDisclosureRevision: host.currentDisclosureRevision ?? null,
    historyDisclosure: host.historyDisclosure ?? null,
    nativeCabRequest: host.nativeCabRequest ?? null,
    nativeSemanticResultsRequest: host.nativeSemanticResultsRequest ?? null,
    open: null,
    tab: 'findings',
    seq: null,
  };
  // Findings already there at mount aren't news; the first ones to arrive later are.
  let said: Set<string> | null = doc ? null : new Set(),
    unseen = false;
  const live = el('div', 'mq-sr');
  live.setAttribute('aria-live', 'polite');
  const body = el('div');
  // The kit root carries the tokens; one above it (with its theme) wins, so only add it when there is none.
  const added = !root.closest('.mq');
  if (added) root.classList.add('mq');
  // A theme set above on something that isn't a kit root: the root this mount made follows it, since
  // its own .mq light defaults would otherwise win over what it inherits. Kept in step as it changes.
  // A theme the host sets on the root later is the host's: mirroring stops and never removes it.
  let mirrors = added && !root.hasAttribute('data-mq-theme'),
    mine: string | null = null;
  const follow = () => {
    if (!mirrors) return;
    if (root.getAttribute('data-mq-theme') !== mine) {
      mirrors = false;
      return;
    }
    const t = root.parentElement?.closest('[data-mq-theme]')?.getAttribute('data-mq-theme') ?? null;
    if (t === mine) return;
    if (t) root.setAttribute('data-mq-theme', t);
    else root.removeAttribute('data-mq-theme');
    mine = t;
  };
  follow();
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
  const sized =
    typeof ResizeObserver !== 'undefined' &&
    new ResizeObserver(() => {
      if (root.clientWidth === width) return;
      width = root.clientWidth;
      root.querySelectorAll<HTMLElement>('.mq-mark').forEach((m) => resettle(m));
    });
  if (sized) sized.observe(root);
  const unwatch =
    typeof MutationObserver !== 'undefined'
      ? watch(root, (r) => {
          follow(); // a change above: if it moved the root's theme, that change checks again
          const was = !!theme?.narrow;
          theme = r;
          narrowed();
          host.onTheme?.(r);
          if (!!r?.narrow !== was) draw();
        })
      : () => {};
  const untips = host.vocab ? tips(body, host.vocab, host) : () => {};

  const h: Host = {
    ...host,
    get moment() {
      return cur.moment;
    },
    get engine() {
      return cur.engine;
    },
    get readOnly() {
      return cur.readOnly;
    },
    get actBinding() {
      return cur.actBinding ?? undefined;
    },
    get currentDisclosureRevision() {
      return cur.currentDisclosureRevision ?? undefined;
    },
    get historyDisclosure() {
      return cur.historyDisclosure ?? undefined;
    },
    get nativeCabRequest() {
      return cur.nativeCabRequest ?? undefined;
    },
    get nativeSemanticResultsRequest() {
      return cur.nativeSemanticResultsRequest ?? undefined;
    },
    get open() {
      return cur.open;
    },
    get tab() {
      return cur.tab;
    },
    get log() {
      return cur.state.log;
    },
    onTab(t: Tab) {
      // The undo strip belongs to the findings it stood among.
      recent?.end();
      cur.tab = t;
      draw();
      // From the keyboard, focus goes with the tab chosen.
      body.querySelector<HTMLElement>(`.mq-tab[data-tab="${t}"]`)?.focus();
    },
    get narrow() {
      return !!theme?.narrow;
    },
    onOpen(f: Subject | null) {
      cur.open = f?.id ?? null;
      // Opening it is seeing it. Recorded now and drawn when the row closes, so rows never move under the pointer.
      if (f) {
        const s = see(cur.state, f);
        // Narrow, there's no card to close, so the row is drawn as seen now.
        if (s !== cur.state) {
          cur.state = s;
          host.onChange?.(s, null);
          if (theme?.narrow) queueMicrotask(() => draw());
          else unseen = true;
        }
      } else if (unseen) {
        unseen = false;
        queueMicrotask(() => draw());
      }
      host.onOpen?.(f);
    },
    onAct: host.onAppend
      ? (f: Subject, act: Act, value: ActValue | null = null) => void submitAct(f, act, value)
      : undefined,
  };

  /** The undo window: for UNDO_MS after an act, the card's place says what was done and offers Undo.
   *  Hovering or focusing it stops the clock; leaving starts it again. One at a time: the next act replaces it. */
  let recent: {
    id: string;
    section: string | null;
    next: string | null;
    strip: HTMLElement;
    say: string;
    end: () => void;
    /** Is the act still the one in force on its finding? */
    holds: () => boolean;
    /** Draw its marking again from the latest view. */
    paint: () => void;
    /** Was focus on it when the pane was taken down to redraw? */
    focused: boolean;
    /** Focus isn't on it: start the clock again if focus was what stopped it. */
    left: () => void;
  } | null = null;
  function undoable(f: Subject, act: Act, value: ActValue | null, appended?: LogEntry): void {
    recent?.end();
    const li = body.querySelector<HTMLElement>(`.mq-row-item[data-finding="${CSS.escape(f.id)}"]`);
    const sec = li?.closest('.mq-section');
    const after = [...(sec?.querySelectorAll<HTMLElement>('.mq-row-item[data-finding]') ?? [])];
    // The host applies: an apply or a removal is asked for here, not done.
    const word = value?.apply ? 'Will be applied' : value?.remove ? 'Will be removed' : DONE[act];
    const strip = el('div', 'mq-row-item mq-undo');
    strip.dataset.undo = f.id;
    strip.append(el('span', 'where', where(f)));
    const what = el('div', 'what');
    strip.append(what);
    const end = el('div', 'end');
    end.append(
      button('ghost', 'Undo', () => {
        const ok = holds();
        // A re-lint may have withdrawn it since: the act is taken back on what it was taken on.
        if (ok) void submitAct(target() ?? f, 'changed', null);
        else stop();
      }),
    );
    strip.append(end);
    // The act this strip undoes, and whether it is still the one in force: a re-lint may have put another
    // question or marking under the same id, and Undo must not bring the old one back over it.
    const entry = canon(appended ?? cur.state.log[cur.state.log.length - 1]);
    const target = (): Subject | undefined => {
      const v = cur.doc && docView(cur.doc, cur.state);
      return [...(v?.findings ?? []), ...(v?.document.artifacts ?? [])].find((y) => y.id === f.id);
    };
    const holds = (): boolean => {
      const x = target();
      // An artifact's apply or removal can be taken back only until it is written: core has no reversal
      // of a written one, so once the host re-lints the strip goes.
      return !x || [x.person, isArtifact(x) ? null : decision(x)].some((d) => d && canon(d) === entry);
    };
    // The marking as the latest view has it: a re-lint may have concealed a code in it since.
    let seen: Subject | undefined;
    const paint = (): void => {
      const x = target() ?? seen;
      seen = x;
      const m = x && (act === 'answered' || act === 'changed') && !isArtifact(x) ? x.outcome?.result : null;
      what.replaceChildren(word);
      if (m && isMarking(m)) what.append(placed(mark(m, { form: 'folded' })));
    };
    paint();
    let left = UNDO_MS,
      since = 0,
      timer: ReturnType<typeof setTimeout> | undefined,
      over = false,
      within = false;
    const run = () => {
      if (over || within || timer !== undefined) return;
      since = Date.now();
      timer = setTimeout(stop, left);
    };
    const hold = () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      left -= Date.now() - since;
    };
    const stop = () => {
      clearTimeout(timer);
      if (recent?.strip !== strip) return;
      recent = null;
      // Focus can't be in it (that stops the clock), unless it is going away with the pane.
      strip.remove();
    };
    strip.addEventListener('mouseenter', () => ((over = true), hold()));
    strip.addEventListener('mouseleave', () => ((over = false), run()));
    strip.addEventListener('focusin', () => ((within = true), hold()));
    strip.addEventListener('focusout', (e) => {
      if (strip.contains(e.relatedTarget as Node | null)) return;
      within = false;
      run();
    });
    recent = {
      id: f.id,
      section: sec ? (['must', 'can', 'later', 'done'].find((k) => sec.classList.contains(k)) ?? null) : null,
      next: (li && after[after.indexOf(li) + 1]?.dataset.finding) ?? null,
      strip,
      say: `${spokenWhere(f)}: ${word.toLowerCase()}. Undo is in its place.`,
      end: stop,
      holds,
      paint,
      focused: false,
      left: () => {
        if (!within || strip.contains(document.activeElement)) return;
        within = false;
        run();
      },
    };
    run();
  }
  /** Put the undo strip back where the card was, in a pane just drawn. */
  function replace(): void {
    if (!recent) return;
    // Nothing left to undo: a re-lint put something else under its id.
    if (!recent.holds()) return recent.end();
    recent.paint();
    const { section, next, strip } = recent;
    const sec = section && body.querySelector(`.mq-section.${section}`);
    const before = sec && next ? sec.querySelector(`.mq-row-item[data-finding="${CSS.escape(next)}"]`) : null;
    const into = sec && (sec.querySelector('details') ?? sec.querySelector('.mq-rows'));
    if (before) before.before(strip);
    else if (into) into.append(strip);
    else {
      // Its section went with it: the strip stands on its own above the first one left.
      const rows = el('div', 'mq-rows');
      rows.append(strip);
      const at = body.querySelector('.mq-section, .mq-pane-foot');
      if (at) at.before(rows);
      else body.querySelector('.mq-pane')?.append(rows);
    }
    // Done is collapsed: open while it holds the strip, or nobody sees it.
    const det = strip.closest('details');
    if (det) det.open = true;
    // Focus that was on it comes back; a browser that sent no focusout when it left mustn't leave the clock stopped.
    if (recent.focused) strip.querySelector('button')?.focus();
    else recent.left();
  }

  /** A redraw replaces the pane; put focus back on the same finding's card,
   *  or its row when the card is closed, so a keyboard user isn't sent to the top. */
  function refocus(id: string | null | undefined): void {
    if (!id) return;
    queueMicrotask(() => {
      const sel = `[data-finding="${CSS.escape(id)}"], [data-artifact="${CSS.escape(id)}"]`;
      const target =
        body.querySelector<HTMLElement>(`.mq-row-detail :is(${sel})`) ||
        body.querySelector<HTMLElement>(`.mq-row-item:is(${sel})`);
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus();
    });
  }

  const focusedId = (): string | null => {
    const a = document.activeElement;
    const n = a && body.contains(a) ? a.closest<HTMLElement>('[data-finding], [data-artifact]') : null;
    return n ? (n.dataset.finding ?? n.dataset.artifact ?? null) : null;
  };

  /** What the person has picked or typed and not yet sent, by a key that survives a redraw. */
  let acting: string | null = null,
    gen = 0; // the finding being acted on (its draft is spent); which draw is current
  const canRetryPending = (item: PendingAppend): boolean =>
    item.state === 'staged' || item.reason !== 'sequence-exhausted';
  const nextPendingRequest = (state: State): PendingAppend | undefined => state.pendingAppends?.find(canRetryPending);
  const terminalPendingRequest = (state: State): PendingAppend | undefined =>
    state.pendingAppends?.find((item) => item.state === 'pending_sequence' && item.reason === 'sequence-exhausted');
  const initialTerminalPending = terminalPendingRequest(cur.state);
  let pendingRequest: ActAppendRequest | null = nextPendingRequest(cur.state) ?? null;
  let appendStatus = pendingRequest
    ? initialTerminalPending
      ? 'A prior action remains outside history because the chain sequence limit was reached. Another saved action is ready to retry.'
      : host.onAppend
        ? 'A saved action is waiting to be recorded. It has not been applied.'
        : 'A saved action remains outside the ordered history. This host cannot retry it; it has not been applied.'
    : initialTerminalPending
      ? 'A saved action remains outside history because the chain sequence limit was reached. It has not been applied.'
      : '';
  let appendRetryable = !!pendingRequest;
  let appendInFlight: string | null = null;
  const drafts = (): Draft[] =>
    [...body.querySelectorAll<HTMLInputElement>('[data-draft]')]
      .filter((x) => draftContext.has(x) && (!acting || !x.dataset.draft?.startsWith(`${acting}:`)))
      // An opened correction counts as soon as it's open, typed in or not.
      .filter((x) =>
        x.type === 'radio' ? x.checked : x.dataset.opened || (x.value.trim() && x.value !== x.defaultValue),
      )
      .map((x) => ({
        key: x.dataset.draft ?? '',
        asked: draftContext.get(x)?.asked,
        value: x.type === 'radio' ? draftContext.get(x)?.reading : x.value,
        radio: x.type === 'radio',
        focused: x === document.activeElement,
      }));
  function restore(list: Draft[]): void {
    const find = (d: Draft): HTMLInputElement | undefined => {
      const matches = [...body.querySelectorAll<HTMLInputElement>('[data-draft]')].filter(
        (x) =>
          x.dataset.draft === d.key &&
          draftContext.get(x)?.asked === d.asked &&
          (d.radio ? x.type === 'radio' && draftContext.get(x)?.reading === d.value : x.type !== 'radio'),
      );
      return matches.length === 1 ? matches[0] : undefined;
    };
    for (const d of list) {
      let n = find(d);
      // A correction under way to a filled field: open it again for the person.
      if (!n && !d.radio) {
        [...body.querySelectorAll<HTMLElement>('[data-change]')]
          .find((x) => x.dataset.change === d.key && draftContext.get(x)?.asked === d.asked)
          ?.click();
        n = find(d);
      }
      if (!n) continue;
      if (d.radio) {
        n.checked = true;
        n.dispatchEvent(new Event('change'));
      } else {
        n.value = d.value ?? '';
        n.dispatchEvent(new Event('input'));
      }
      if (d.focused) n.focus();
    }
  }

  // `fresh`: the person just acted, so what they had in the form went with it.
  let parked: Draft[] = [];
  let writeAuthorityRevoked = false;
  let dead = false; // destroyed: a draw queued before it (onOpen, a resize) draws nothing
  function draw(focusId?: string | null, { fresh = false }: { fresh?: boolean } = {}): void {
    if (dead) return;
    // While History shows, what was picked or typed on Findings is held for when it comes back.
    const got = fresh ? [] : body.querySelector('.mq-history') ? parked : drafts();
    const kept = cur.tab === 'history' ? [] : got;
    parked = cur.tab === 'history' ? got : [];
    const v = cur.doc && docView(cur.doc, cur.state);
    let say = '';
    const ok = cur.engine === 'ok';
    const nativeRoute = !!v && ('native_evaluation' in v.document || 'native_semantic_results' in v.document);
    if (nativeRoute) recent?.end();
    if (v && !nativeRoute && (ok || cur.engine === 'checking')) {
      const now = sections(v, cur.moment).must;
      // Keyed by the question too: one asked again under the same id is news.
      const key = (f: Subject): string => `${f.id} ${canon(f.asks ? disclosedAsks(f.asks) : null)}`;
      const before = said;
      if (before && ok)
        say = now
          .filter((f) => !before.has(key(f)))
          .map((f) => `${spokenWhere(f)} needs you.`)
          .join(' ');
      // While checking, only the first results set the baseline; what arrives after is told once it's done.
      if (ok || !said) said = new Set(now.map(key));
    }
    // Never leave an old announcement behind for someone to find later.
    live.textContent = say;
    // A popover opened on the last draw acts on the findings it was drawn from: it goes with them.
    closeWithin(root, { windows: false });
    // Read after the popover has handed focus back to its row or card, so focus follows into the new draw.
    if (focusId === undefined) focusId = focusedId();
    if (recent) recent.focused = recent.strip.contains(document.activeElement);
    const onTab = body.contains(document.activeElement) && document.activeElement?.closest<HTMLElement>('.mq-tab');
    const view = pane(v, h);
    if (appendStatus && !nativeRoute && !writeAuthorityRevoked) {
      const notice = el('div', 'mq-pane-foot');
      notice.setAttribute('role', 'status');
      notice.append(el('p', 'mq-p', appendStatus));
      if (pendingRequest && appendRetryable && !appendInFlight && host.onAppend) {
        notice.append(button('ghost', 'Retry pending action', () => void submitPending()));
      }
      view.insertBefore(notice, view.children[1] ?? null);
    }
    body.replaceChildren(view);
    replace();
    if (onTab) body.querySelector<HTMLElement>(`.mq-tab[data-tab="${onTab.dataset.tab}"]`)?.focus();
    if (host.vocab) relabel(body, host.vocab); // this pane's own vocabulary
    refocus(focusId);
    // After the open card is back (a microtask) and focus with it.
    // Only into this draw: a later one collects its own.
    const mine = ++gen;
    if (kept.length)
      queueMicrotask(() =>
        queueMicrotask(() => {
          if (gen === mine) restore(kept);
        }),
      );
  }
  const actOwnerKey = (binding: ActAppendBinding | null): string =>
    canon({ documentId: binding?.documentId ?? null, chain: binding?.chain ?? null });
  const adoptHostState = (next: State, resolvedRequestId?: string): void => {
    // A concurrent acknowledgement can arrive with an older same-owner snapshot.
    // Keep the newer history unless the incoming log contains it exactly.
    const incomingContainsCurrent = cur.state.log.every((entry) =>
      next.log.some((candidate) => candidate.sequence === entry.sequence && canon(candidate) === canon(entry)),
    );
    const incomingFrontier = next.actSequence;
    const currentFrontier = cur.state.actSequence;
    const incomingIsAtLeastAsNew =
      currentFrontier === undefined ||
      (incomingFrontier !== undefined && Number.isSafeInteger(incomingFrontier) && incomingFrontier >= currentFrontier);
    const base = incomingContainsCurrent && incomingIsAtLeastAsNew ? next : cur.state;
    // `seen` and `linted` are independent local bookkeeping. Preserve pending
    // host intents too, while letting a fresh refusal update a staged row.
    const seen = [...base.seen];
    for (const item of cur.state.seen) {
      if (!seen.some((known) => canon(known) === canon(item))) seen.push(item);
    }
    const pending = new Map<string, PendingAppend>();
    for (const item of [...(cur.state.pendingAppends ?? []), ...(next.pendingAppends ?? [])])
      pending.set(item.requestId, item);
    if (resolvedRequestId) pending.delete(resolvedRequestId);
    const linted = Math.min(Math.max(cur.state.linted ?? 0, next.linted ?? 0), base.log.length);
    cur.state = {
      ...base,
      seen,
      pendingAppends: [...pending.values()],
      ...(linted > 0 && { linted }),
    };
  };
  const currentAppendBinding = (): ActAppendBinding | null => {
    let binding = cur.actBinding ? structuredClone(cur.actBinding) : null;
    if (host.currentBasis && !binding?.basis) {
      binding = { ...binding, basis: structuredClone(host.currentBasis) };
    }
    return binding;
  };
  const appendRefusalMessage = (reason: ActAppendRefusal): string => {
    switch (reason) {
      case 'sequence-exhausted':
        return 'The history reached its sequence limit. This action remains pending outside history and has not been applied.';
      case 'missing-frontier':
        return 'The host has no trusted history position. This action remains pending outside history and has not been applied.';
      case 'missing-coverage':
        return 'The host has no history coverage to check this request. It remains pending; restore coverage before retrying.';
      case 'history-incomplete':
        return 'The host history is incomplete or inconsistent. This action remains pending; repair history before retrying.';
      case 'invalid-frontier':
        return 'The host history position or ordered rows are invalid. This action remains pending outside history.';
      case 'missing-target':
        return 'The host could not bind this action to a finding. It remains pending and has not been applied.';
      case 'undisclosed-marking':
        return 'This action or its history contains undisclosed marking content. It was not recorded or applied.';
      case 'request-id-conflict':
        return 'This request key conflicts with a stored request. Resolve the conflict before retrying; no write was dispatched.';
    }
  };

  async function submitPending(): Promise<void> {
    if (!pendingRequest || appendInFlight) return;
    if (!host.onAppend) {
      appendRetryable = false;
      appendStatus = 'The host cannot retry this pending action. It remains unapplied outside history.';
      draw();
      return;
    }
    const current = cur.doc && docView(cur.doc, cur.state);
    const target = pendingRequest.id
      ? [...(current?.findings ?? []), ...(current?.document.artifacts ?? [])].find(
          (item) => item.id === pendingRequest!.id,
        )
      : undefined;
    await submitAppend(pendingRequest, target);
  }

  async function submitAct(f: Subject, act: Act, value: ActValue | null): Promise<void> {
    if (
      writeAuthorityRevoked ||
      (cur.doc && ('native_evaluation' in cur.doc.document || 'native_semantic_results' in cur.doc.document))
    )
      return;
    if (appendInFlight) return;
    if (!host.onAppend) {
      appendStatus = 'The host cannot record this action. It has not been applied or added to history.';
      draw();
      return;
    }
    if (pendingRequest) {
      appendStatus = 'An earlier action is still pending. Retry it before starting another action.';
      draw();
      return;
    }
    const binding = currentAppendBinding() ?? undefined;
    const request = disclosedAppendRequest({
      requestId: newActRequestId(),
      id: f.id,
      act,
      value: value == null ? value : structuredClone(value),
      at: new Date().toISOString(),
      about: snapshot(f),
      ...(binding && { binding }),
    });
    await submitAppend(request, f);
  }

  async function submitAppend(request: ActAppendRequest, original?: Subject): Promise<void> {
    if (
      writeAuthorityRevoked ||
      (cur.doc && ('native_evaluation' in cur.doc.document || 'native_semantic_results' in cur.doc.document))
    )
      return;
    const append = host.onAppend;
    if (!append || appendInFlight) return;
    const ownerBinding = currentAppendBinding();
    const ownerKey = actOwnerKey(ownerBinding);
    const ownerKnown = !!(ownerBinding?.documentId || ownerBinding?.chain);
    const documentAtRequest = cur.doc;
    const documentBasisKey = canon(documentAtRequest?.document.evaluation?.basis ?? null);
    const bindingKey = canon(ownerBinding);
    if (canon(request.binding ?? null) !== bindingKey) {
      pendingRequest = request;
      appendRetryable = false;
      appendStatus =
        'This pending action belongs to a different document or chain. Restore its original context before retrying.';
      draw();
      return;
    }
    const contextIsCurrent = (): boolean =>
      !writeAuthorityRevoked &&
      cur.doc === documentAtRequest &&
      !(cur.doc && ('native_evaluation' in cur.doc.document || 'native_semantic_results' in cur.doc.document)) &&
      canon(currentAppendBinding()) === bindingKey &&
      canon(cur.doc?.document.evaluation?.basis ?? null) === documentBasisKey;
    const sameOwner = (): boolean =>
      actOwnerKey(cur.actBinding ?? null) === ownerKey && (ownerKnown || cur.doc === documentAtRequest);
    const focusId = focusedId();
    appendInFlight = request.requestId;
    pendingRequest = request;
    appendRetryable = false;
    appendStatus = 'Sending this action to the host for recording.';
    draw(focusId);

    let result: AppendActResult;
    try {
      result = await append(structuredClone(request));
    } catch {
      if (dead) return;
      appendInFlight = null;
      appendRetryable = true;
      appendStatus = 'The host did not acknowledge this action. It remains pending; retry will use the same request.';
      draw(focusId);
      return;
    }
    if (dead) return;
    appendInFlight = null;
    if (result.status === 'refused') {
      if (!isDisclosedState(result.state) || (result.pending && !isDisclosedRequest(result.pending))) {
        appendRetryable = true;
        appendStatus = 'The workspace must return disclosed action history before this request can continue.';
        draw(focusId);
        return;
      }
      if (sameOwner() && contextIsCurrent()) adoptHostState(result.state);
      const storedRequest = nextPendingRequest(cur.state);
      pendingRequest = storedRequest ?? (result.reason === 'sequence-exhausted' ? null : (result.pending ?? request));
      // A refusal belongs to the exact document/basis it was issued against.
      // If that context moved while the host was working, leave it untouched
      // and let the person retry the same request against the current context.
      appendRetryable = !sameOwner() || !contextIsCurrent();
      appendStatus =
        !sameOwner() || !contextIsCurrent()
          ? 'The document or chain changed before the host response. No state was adopted; this action remains pending with the same request for retry.'
          : appendRefusalMessage(result.reason);
      if (pendingRequest && pendingRequest.requestId !== request.requestId)
        appendStatus += ' Another saved action is ready to retry.';
      appendRetryable = appendRetryable || !!pendingRequest;
      draw(focusId);
      return;
    }

    const acknowledgementIssue = appendAcknowledgementIssue(request, result, cur.state);
    if (acknowledgementIssue) {
      appendRetryable = true;
      appendStatus = `${appendRefusalMessage(acknowledgementIssue)} No host state was adopted.`;
      draw(focusId);
      return;
    }

    const { entry, replayed } = result;
    if (!sameOwner() || !contextIsCurrent()) {
      // A committed acknowledgement remains history for the same owner, but
      // it must not trigger a write after the view loses write authority.
      if (sameOwner()) adoptHostState(result.state, request.requestId);
      appendStatus =
        'The action was recorded, but the document or chain changed before it could be applied. The same request remains pending; retry it after restoring its document.';
      appendRetryable = true;
      draw(focusId);
      return;
    }

    // Adopt only after the host's exact acknowledgement is bound to the still
    // current document, chain, and evaluation basis.
    adoptHostState(result.state, request.requestId);
    pendingRequest = nextPendingRequest(cur.state) ?? null;
    appendRetryable = !!pendingRequest;

    appendStatus = pendingRequest
      ? terminalPendingRequest(cur.state)
        ? 'This action was recorded. A prior action remains outside history at the chain sequence limit; another saved action is ready to retry.'
        : 'This action was recorded. Another saved action is ready to retry.'
      : terminalPendingRequest(cur.state)
        ? appendRefusalMessage('sequence-exhausted')
        : '';
    const current = cur.doc && docView(cur.doc, cur.state);
    const target = request.id
      ? [...(current?.findings ?? []), ...(current?.document.artifacts ?? [])].find((item) => item.id === request.id)
      : undefined;
    const subject = target ?? original;
    const back = (entry.act === 'changed' && entry.value == null) || !cur.doc || !!entry.value?.fields;
    const inPane = body.contains(document.activeElement);
    recent?.end();
    if (back) {
      cur.open = entry.id;
      cur.tab = 'findings';
    } else {
      cur.open = null;
      if (subject) undoable(subject, entry.act, entry.value, entry);
    }
    acting = entry.id;
    try {
      host.onChange?.(cur.state, {
        id: entry.id,
        act: entry.act,
        value: entry.value,
        requestId: request.requestId,
        entry,
        replayed,
      });
    } finally {
      acting = null;
    }
    draw(back && inPane ? entry.id : null, { fresh: true });
    if (!back && recent) {
      if (inPane) recent.strip.querySelector('button')?.focus();
      live.textContent = `${live.textContent} ${recent.say}`.trim();
    }
  }

  draw();

  return {
    get theme() {
      return theme;
    }, // the gate's report: { checked, rejected: [{ token, measured, floor, fallback }] }
    /** Take the pane down: its theme watchers go, and so does what it drew. */
    destroy() {
      dead = true;
      recent?.end();
      closeWithin(root);
      unwatch();
      if (sized) sized.disconnect();
      untips();
      release(root);
      root.replaceChildren();
      root.classList.remove('mq-narrow', 'mq-mount');
      if (added) root.classList.remove('mq');
      if (mirrors && mine) root.removeAttribute('data-mq-theme');
    },
    update({ linted: upTo, seq, open, actBinding, ...next }: Update) {
      // A lint that began before the one already shown is stale: keep the newer document.
      // `seq` orders lints that began at the same point in the log. A stale lint's
      // failure is as stale as its document: neither replaces the newer one.
      const lint = 'doc' in next || 'engine' in next;
      // One request may send several updates (partial results, then done): an equal `seq` is the same lint.
      if (
        lint &&
        ((upTo != null && upTo < (cur.state.linted ?? 0)) || (seq != null && cur.seq != null && seq < cur.seq))
      ) {
        delete next.doc;
        delete next.engine;
        delete next.currentDisclosureRevision;
        delete next.historyDisclosure;
        delete next.nativeCabRequest;
        delete next.nativeSemanticResultsRequest;
        actBinding = undefined;
      } else {
        if (lint && seq != null) cur.seq = seq;
        // A new evaluation must explicitly carry a newly obtained native scope.
        if (('doc' in next || ('engine' in next && next.engine !== 'ok')) && !('nativeCabRequest' in next))
          cur.nativeCabRequest = null;
        if (('doc' in next || ('engine' in next && next.engine !== 'ok')) && !('nativeSemanticResultsRequest' in next))
          cur.nativeSemanticResultsRequest = null;
        if (
          'currentDisclosureRevision' in next &&
          next.currentDisclosureRevision !== cur.currentDisclosureRevision &&
          !('nativeSemanticResultsRequest' in next)
        )
          cur.nativeSemanticResultsRequest = null;
      }
      if (next.readOnly === true && !cur.readOnly) writeAuthorityRevoked = true;
      if (next.readOnly === false) writeAuthorityRevoked = false;
      Object.assign(cur, next);
      if (actBinding !== undefined) cur.actBinding = actBinding;
      if (open !== undefined) {
        const v = cur.doc && docView(cur.doc, cur.state);
        h.onOpen?.((open && v && [...v.findings, ...v.document.artifacts].find((x) => x.id === open)) || null);
      }
      // A new lint is the host saying it applied what the person answered: everything
      // up to `upTo`, the log length when the host started that lint (default: all of it).
      if (next.doc) {
        const s = linted(cur.state, upTo);
        if (s.linted !== cur.state.linted) {
          cur.state = s;
          host.onChange?.(s, null);
        }
      }
      draw();
    },
    view: () => cur.doc && docView(cur.doc, cur.state),
    get state() {
      return cur.state;
    },
    host: h,
  };
}
