// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * State — the kit's half of the ladder (docs/CONTRACT.md §F): what the person
 * did, keyed by finding id. Never on Marque's wire; the host persists it.
 *
 * A state is plain JSON persisted by the trusted host workspace. It contains
 * private interaction history; do not copy it into document metadata or a
 * portable provenance seal:
 *   { log, seen, linted, actSequence, actHistoryCoverage, pendingAppends }
 * `about` is what the act was about when it was taken (snapshot()), so the
 * receipt can name a finding a later lint withdrew and an override is
 * reopened when the marking it kept changes.
 * The log is append-only. Changing an answer adds a line and never rewrites
 * one, so the receipt shows both answers (docs/COMPONENTS.md, "Answered").
 *
 * Acts are a closed vocabulary:
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
 * Overrides, deferrals and declines have no engine shape yet — tracked internally —
 * and always overlay.
 */

import type {
  Reading,
  EvaluationBasis,
  Outcome,
  Asks,
  MarkingInput,
  Act,
  ActAppendRequest,
  ActValue,
  AppendActResult,
  Anchor,
  ActHistoryCoverage,
  ArtifactField,
  ArtifactKind,
  ArtifactView,
  Doc,
  FindingView,
  Host,
  HypotheticalReplacement,
  LogEntry,
  MarkingLike,
  Mask,
  PendingAct,
  Snapshot,
  State,
  Subject,
} from './types.ts';
import { disclosedMarking } from './marking.ts';

export const ACTS: readonly Act[] = Object.freeze([
  'answered',
  'changed',
  'kept_as_written',
  'deferred',
  'declined',
] as const);

export const empty = (): State => ({
  log: [],
  seen: [],
  actSequence: 0,
  actHistoryCoverage: { state: 'complete', sequenceRange: null },
  pendingAppends: [],
});

/** A transport key for retrying the same host-owned append; it is not a semantic identity. */
export const newActRequestId = (): string => globalThis.crypto.randomUUID();

/** Copy only disclosed marking projections into host-owned interaction state. */
export const disclosedReading = (reading: Reading): Reading => ({
  ...reading,
  ...(reading.result != null && { result: disclosedMarking(reading.result) }),
});
export const disclosedBasis = (basis: EvaluationBasis): EvaluationBasis => ({
  ...basis,
  replacements: Object.fromEntries(
    Object.entries(basis.replacements).map(([key, replacement]) => [
      key,
      replacement.kind === 'reading' ? { ...replacement, reading: disclosedReading(replacement.reading) } : replacement,
    ]),
  ),
});
export const disclosedActValue = (value: ActValue | null): ActValue | null =>
  value?.reading ? { ...value, reading: disclosedReading(value.reading) } : value;
const disclosedOutcome = (outcome: Outcome): Outcome => ({
  ...outcome,
  ...(outcome.result != null && { result: disclosedMarking(outcome.result) }),
  ...(outcome.readings && { readings: outcome.readings.map(disclosedReading) }),
  ...(outcome.fallback && { fallback: { ...outcome.fallback, result: disclosedMarking(outcome.fallback.result) } }),
});
export const disclosedAsks = (asks: Asks | null | undefined): Asks | null | undefined =>
  asks && Array.isArray(asks.options) ? { ...asks, options: asks.options.map(disclosedReading) } : asks;
const disclosedSnapshot = (about: Snapshot): Snapshot => {
  const marking = about.marking && disclosedMarking(about.marking);
  const result =
    typeof about.result_marking === 'string'
      ? about.result_marking
      : about.result_marking && disclosedMarking(about.result_marking);
  return {
    ...about,
    ...(marking && { marking, as_written: marking.text }),
    ...(result && { result_marking: result, result: typeof result === 'string' ? result : result.text }),
    ...(about.outcome && { outcome: disclosedOutcome(about.outcome) }),
    ...(about.asks !== undefined && { asks: disclosedAsks(about.asks) }),
    ...(about.evaluationBasis && { evaluationBasis: disclosedBasis(about.evaluationBasis) }),
    ...(about.fields && {
      fields: Object.fromEntries(
        Object.entries(about.fields).map(([key, field]) => [
          key,
          field.evaluationBasis ? { ...field, evaluationBasis: disclosedBasis(field.evaluationBasis) } : field,
        ]),
      ),
    }),
  };
};
export const disclosedAppendRequest = (request: ActAppendRequest): ActAppendRequest => ({
  ...request,
  value: disclosedActValue(request.value),
  ...(request.about && { about: disclosedSnapshot(request.about) }),
  ...(request.binding?.basis && { binding: { ...request.binding, basis: disclosedBasis(request.binding.basis) } }),
});
/** A concealed or unknown reading is not physical write text. */
export const canWriteMarking = (marking: MarkingLike | null | undefined): boolean =>
  marking == null ||
  typeof marking === 'string' ||
  !((marking.masks?.length ?? 0) || marking.layers?.some((layer) => layer.tokens.some((token) => token.mask)));
export const canWriteAct = (value: ActValue | null): boolean => canWriteMarking(value?.reading?.result);

const appendRequestValue = (request: ActAppendRequest) => ({
  requestId: request.requestId,
  ...(request.id !== undefined && { id: request.id }),
  act: request.act,
  value: request.value,
  ...(request.at !== undefined && { at: request.at }),
  ...(request.about !== undefined && { about: request.about }),
  ...(request.binding !== undefined && { binding: request.binding }),
});

const sameAppendRequest = (a: ActAppendRequest, b: ActAppendRequest): boolean => {
  const left = appendRequestValue(a);
  const right = appendRequestValue(b);
  // A caller may omit the timestamp on a retry. The original committed time is
  // returned from the entry; it is not a reason to issue a second act.
  if (a.at === undefined) delete (right as { at?: string }).at;
  if (b.at === undefined) delete (left as { at?: string }).at;
  return canon(left) === canon(right);
};

const copyRequest = (request: ActAppendRequest): ActAppendRequest => structuredClone(appendRequestValue(request));

function refusal(
  state: State,
  request: ActAppendRequest,
  reason: 'sequence-exhausted' | 'missing-frontier' | 'missing-coverage' | 'history-incomplete' | 'invalid-frontier',
): AppendActResult {
  const pending: PendingAct = {
    ...copyRequest(request),
    sequence: null,
    state: 'pending_sequence',
    reason,
  };
  const existing = state.pendingAppends ?? [];
  const index = existing.findIndex((entry) => entry.requestId === request.requestId);
  return {
    status: 'refused',
    reason,
    pending,
    state: {
      ...state,
      pendingAppends: index < 0 ? [...existing, pending] : existing.map((entry, i) => (i === index ? pending : entry)),
    },
  };
}

type AppendHistoryIssue = 'missing-frontier' | 'invalid-frontier' | 'missing-coverage' | 'history-incomplete';

/** Rows retained by any history lane must still have ordered, in-frontier coordinates. */
function retainedHistoryIssue(state: State, frontier: number): 'invalid-frontier' | 'request-id-conflict' | null {
  let previous = 0;
  const requestIds = new Set<string>();
  const sequences = new Set<number>();
  for (const entry of state.log) {
    if (!Number.isSafeInteger(entry.sequence) || entry.sequence <= previous || entry.sequence > frontier)
      return 'invalid-frontier';
    previous = entry.sequence;
    if (sequences.has(entry.sequence)) return 'invalid-frontier';
    sequences.add(entry.sequence);
    if (entry.requestId !== undefined) {
      if (typeof entry.requestId !== 'string' || entry.requestId.length === 0 || requestIds.has(entry.requestId))
        return 'request-id-conflict';
      requestIds.add(entry.requestId);
    }
  }
  return null;
}

/** A `complete` declaration is valid only when the retained ordered rows prove every sequence. */
function completeHistoryIssue(state: State): AppendHistoryIssue | 'request-id-conflict' | null {
  const frontier = state.actSequence;
  if (frontier === undefined) return 'missing-frontier';
  if (!Number.isSafeInteger(frontier) || frontier < 0) return 'invalid-frontier';
  const coverage = state.actHistoryCoverage;
  if (coverage === undefined) return 'missing-coverage';
  const range = coverage.sequenceRange;
  if (
    coverage.state !== 'complete' ||
    !((frontier === 0 && range === null) || (frontier > 0 && range !== null && range[0] === 1 && range[1] === frontier))
  )
    return 'history-incomplete';
  if (state.log.length !== frontier) return 'history-incomplete';
  const retainedIssue = retainedHistoryIssue(state, frontier);
  if (retainedIssue === 'request-id-conflict') return retainedIssue;
  if (retainedIssue) return 'history-incomplete';
  for (let i = 0; i < state.log.length; i++) {
    if (state.log[i]?.sequence !== i + 1) return 'history-incomplete';
  }
  return null;
}

const requestFromEntry = (entry: LogEntry): ActAppendRequest => ({
  requestId: entry.requestId ?? '',
  id: entry.id,
  act: entry.act,
  value: entry.value,
  at: entry.at,
  ...(entry.about !== undefined && { about: entry.about }),
  ...(entry.binding !== undefined && { binding: entry.binding }),
});

/** Check only typed marking-bearing paths; never canonicalize whole histories here. */
const isDisclosedMarking = (m: MarkingLike | null | undefined): boolean => {
  if (m == null || typeof m === 'string') return true;
  try {
    return typeof m.text === 'string' && canon(m) === canon(disclosedMarking(m));
  } catch {
    return false;
  }
};
const isDisclosedReading = (reading: Reading): boolean => isDisclosedMarking(reading.result);
const isDisclosedBasis = (basis: EvaluationBasis | undefined): boolean => {
  if (!basis) return true;
  try {
    return Object.values(basis.replacements).every(
      (item) => item.kind !== 'reading' || isDisclosedReading(item.reading),
    );
  } catch {
    return false;
  }
};
const isDisclosedSnapshot = (about: Snapshot | undefined): boolean => {
  if (!about) return true;
  if (!isDisclosedMarking(about.marking) || !isDisclosedMarking(about.result_marking)) return false;
  if (about.marking && about.as_written !== about.marking.text) return false;
  if (
    about.result_marking &&
    about.result !== (typeof about.result_marking === 'string' ? about.result_marking : about.result_marking.text)
  )
    return false;
  const outcome = about.outcome;
  if (
    outcome &&
    (!isDisclosedMarking(outcome.result) ||
      !isDisclosedMarking(outcome.fallback?.result) ||
      (outcome.readings && !outcome.readings.every(isDisclosedReading)))
  )
    return false;
  if (Array.isArray(about.asks?.options) && !about.asks.options.every(isDisclosedReading)) return false;
  return (
    isDisclosedBasis(about.evaluationBasis) &&
    Object.values(about.fields ?? {}).every((field) => isDisclosedBasis(field.evaluationBasis))
  );
};
export const isDisclosedRequest = (request: ActAppendRequest): boolean =>
  (!request.value?.reading || isDisclosedReading(request.value.reading)) &&
  isDisclosedSnapshot(request.about) &&
  isDisclosedBasis(request.binding?.basis);
/** Check marking-bearing rows before adopting any host state, including refusals. */
export const isDisclosedState = (state: State): boolean =>
  state.log.every((row) => isDisclosedRequest(requestFromEntry(row))) &&
  (state.pendingAppends ?? []).every(isDisclosedRequest);

function knownRequestIssue(
  state: State,
  request: ActAppendRequest,
  entry: LogEntry,
): 'missing-frontier' | 'invalid-frontier' | 'request-id-conflict' | null {
  const frontier = state.actSequence;
  if (frontier === undefined) return 'missing-frontier';
  if (!Number.isSafeInteger(frontier) || frontier < 0) return 'invalid-frontier';
  const retainedIssue = retainedHistoryIssue(state, frontier);
  if (retainedIssue) return retainedIssue;
  if (!Number.isSafeInteger(entry.sequence) || entry.sequence <= 0 || entry.sequence > frontier)
    return 'invalid-frontier';
  if (!sameAppendRequest(requestFromEntry(entry), request)) return 'request-id-conflict';
  return null;
}

/**
 * Validate a host's committed acknowledgement before the UI adopts it or dispatches a write.
 * Exact retained replays need only a unique valid row within the known frontier, so partial
 * coverage remains sufficient for a request the host can prove it already committed.
 */
export function appendAcknowledgementIssue(
  request: ActAppendRequest,
  result: AppendActResult,
  current?: State,
):
  | 'undisclosed-marking'
  | 'request-id-conflict'
  | 'missing-frontier'
  | 'invalid-frontier'
  | 'missing-coverage'
  | 'history-incomplete'
  | null {
  if (!isDisclosedRequest(request) || !isDisclosedState(result.state)) return 'undisclosed-marking';
  if (result.status !== 'committed') return null;
  const { entry, state } = result;
  if (entry.requestId !== request.requestId || !sameAppendRequest(requestFromEntry(entry), request))
    return 'request-id-conflict';
  const requestRows = state.log.filter((item) => item.requestId === request.requestId);
  if (requestRows.length !== 1 || canon(requestRows[0]) !== canon(entry)) return 'request-id-conflict';
  if ((state.pendingAppends ?? []).some((item) => item.requestId === request.requestId)) return 'request-id-conflict';
  const retainedIssue = knownRequestIssue(state, request, entry);
  if (retainedIssue) return retainedIssue;
  if (current) {
    const currentRowsForRequest = current.log.filter((item) => item.requestId === request.requestId);
    if (currentRowsForRequest.length > 1) return 'request-id-conflict';
    if (currentRowsForRequest.length === 1 && canon(currentRowsForRequest[0]) !== canon(entry))
      return 'request-id-conflict';
    if (current.log.some((item) => item.sequence === entry.sequence && canon(item) !== canon(entry)))
      return 'invalid-frontier';
    if (
      current.actSequence !== undefined &&
      Number.isSafeInteger(current.actSequence) &&
      current.actSequence > state.actSequence! &&
      currentRowsForRequest.length !== 1
    )
      return 'history-incomplete';
  }
  if (result.replayed) return null;
  return completeHistoryIssue(state);
}

/**
 * Pure checked append transition for a caller-owned ordered act log.
 * Hosts persist every returned state; a committed append also atomically records its recoverable write intent.
 * The frontier is the last issued one-based sequence; it is never inferred from log length.
 */
export function appendAct(state: State, request: ActAppendRequest): AppendActResult {
  // Reject non-disclosed requests before retry comparison; do not alias distinct raw requests.
  if (!isDisclosedRequest(request) || !isDisclosedState(state))
    return { status: 'refused', reason: 'undisclosed-marking', state };
  if (!ACTS.includes(request.act)) throw new Error(`Unknown act "${request.act}"; expected one of ${ACTS.join(', ')}`);

  if (typeof request.requestId !== 'string' || request.requestId.length === 0) {
    return { status: 'refused', reason: 'request-id-conflict', state };
  }

  const priorEntries = state.log.filter((entry) => entry.requestId === request.requestId);
  if (priorEntries.length > 1) return { status: 'refused', reason: 'request-id-conflict', state };
  const priorEntry = priorEntries[0];
  if (priorEntry) {
    const issue = knownRequestIssue(state, request, priorEntry);
    if (issue === 'request-id-conflict') {
      return { status: 'refused', reason: 'request-id-conflict', state };
    }
    if (issue) return refusal(state, request, issue);
    return { status: 'committed', state, entry: priorEntry, replayed: true };
  }

  const pending = state.pendingAppends ?? [];
  const pendingEntries = pending.filter((entry) => entry.requestId === request.requestId);
  if (pendingEntries.length > 1) return { status: 'refused', reason: 'request-id-conflict', state };
  const pendingEntry = pendingEntries[0];
  if (pendingEntry) {
    if (!sameAppendRequest(pendingEntry, request)) {
      return { status: 'refused', reason: 'request-id-conflict', state };
    }
    // Exhaustion is terminal for this chain. Other refusals can be retried with
    // the same captured request after the trusted owner repairs unknown state.
    if (pendingEntry.state === 'pending_sequence' && pendingEntry.reason === 'sequence-exhausted') {
      return { status: 'refused', reason: pendingEntry.reason, state, pending: pendingEntry };
    }
  }

  if (state.actSequence === undefined) return refusal(state, request, 'missing-frontier');
  if (!Number.isSafeInteger(state.actSequence) || state.actSequence < 0) {
    return refusal(state, request, 'invalid-frontier');
  }
  if (state.actSequence === Number.MAX_SAFE_INTEGER) return refusal(state, request, 'sequence-exhausted');
  const sequence = state.actSequence + 1;
  if (!Number.isSafeInteger(sequence) || sequence <= state.actSequence) {
    return refusal(state, request, 'sequence-exhausted');
  }
  if (state.log.some((entry) => entry.sequence === sequence)) {
    return refusal(state, request, 'invalid-frontier');
  }
  const historyIssue = completeHistoryIssue(state);
  if (historyIssue === 'request-id-conflict') return { status: 'refused', reason: historyIssue, state };
  if (historyIssue) return refusal(state, request, historyIssue);

  if (request.id === undefined) return { status: 'refused', reason: 'missing-target', state };

  const entry: LogEntry = {
    sequence,
    requestId: request.requestId,
    id: request.id,
    act: request.act,
    value: request.value == null ? request.value : structuredClone(request.value),
    at: request.at ?? new Date().toISOString(),
    ...(request.about !== undefined && { about: structuredClone(request.about) }),
    ...(request.binding !== undefined && { binding: structuredClone(request.binding) }),
  };

  const next = {
    ...state,
    log: [...state.log, entry],
    actSequence: sequence,
    pendingAppends: pending.filter((item) => item.requestId !== request.requestId),
    ...(state.actHistoryCoverage !== undefined && {
      actHistoryCoverage: nextActHistoryCoverage(state.actHistoryCoverage, state.actSequence, sequence),
    }),
  };
  return { status: 'committed', state: next, entry, replayed: false };
}

function nextActHistoryCoverage(coverage: ActHistoryCoverage, frontier: number, sequence: number): ActHistoryCoverage {
  const range = coverage.sequenceRange;
  if (range === null && coverage.state === 'complete' && frontier === 0) {
    return { state: 'complete', sequenceRange: [sequence, sequence] };
  }
  if (range && coverage.state === 'complete' && range[1] === frontier) {
    return { state: 'complete', sequenceRange: [range[0], sequence] };
  }
  const low = range ? Math.min(range[0], sequence) : sequence;
  const high = range ? Math.max(range[1], sequence) : sequence;
  return { state: 'partial', sequenceRange: [low, high] };
}

/** Append one act. Returns a new state; the old one is untouched. */
export function record(
  state: State,
  id: string,
  act: Act,
  value: ActValue | null = null,
  at: string = new Date().toISOString(),
  about?: Snapshot,
): State {
  const result = appendAct(state, { requestId: newActRequestId(), id, act, value, at, ...(about && { about }) });
  if (result.status === 'refused') {
    throw new Error(`Cannot record act without a checked sequence append: ${result.reason}`);
  }
  return result.state;
}

/** What an act is about, kept with it: markings, rule and place, never body text. */
/** A marking-valued derived value is a string or carries text; anything else is typed content, kept whole. */
const textOf = (v: unknown): string | null => {
  if (typeof v === 'string') return v;
  const t = (v as { text?: unknown } | null | undefined)?.text;
  return typeof t === 'string' ? t : null;
};
/** A marking by what it shows: its text and its typed masks. A snapshot's bare text has none. */
export function face(m: MarkingLike | null | undefined): string | null {
  if (m == null) return null;
  const safe = typeof m === 'string' ? { text: m } : disclosedMarking(m);
  const masks: Array<{ offset: number; mask: Mask }> = [];
  let offset = 0;
  const encoder = new TextEncoder();
  for (const layer of safe.layers ?? []) {
    for (const token of layer.tokens) {
      if (token.mask) masks.push({ offset, mask: token.mask });
      offset += encoder.encode(token.t).length;
    }
  }
  return canon({ text: safe.text, masks });
}
const sameAsWritten = (about: Snapshot, f: Subject): boolean =>
  face(about.marking ?? about.as_written) === face(f.marking?.as_written ?? null);
const sameResult = (about: Snapshot, r: MarkingLike | null | undefined): boolean =>
  face(about.result_marking ?? about.result) === face(r ?? null);
const typed = (v: unknown): string | null => (v && textOf(v) == null ? canon(v) : null);
/** An artifact, not a finding: only an artifact has a kind. */
export const isArtifact = (x: Subject): x is ArtifactView => !!x.kind;
const ruleOf = (f: Subject): string | null => (f.rule ? `${f.rule.scheme}:${f.rule.predicate}` : (f.kind ?? null));
export const snapshot = (f: Subject): Snapshot =>
  disclosedSnapshot(
    structuredClone<Snapshot>({
      // a record, not a view of a document that may change in place
      rule: ruleOf(f),
      anchor: f.anchor,
      kind: f.kind,
      as_written: f.marking?.as_written?.text ?? null,
      result: f.outcome?.result?.text ?? textOf(f.derived_value),
      // The marking whole, layers and typed masks with it, so the receipt redraws it masked.
      ...(f.marking?.as_written && { marking: f.marking.as_written }),
      // The result whole too: a mask added under the same text is another marking.
      ...((f.outcome?.result ?? (textOf(f.derived_value) != null ? f.derived_value : null)) && {
        result_marking: (f.outcome?.result ?? f.derived_value) as MarkingLike,
      }),
      // A typed derived value (a notice's content) isn't text: kept whole, so an apply is of this one.
      ...(typed(f.derived_value) && { content: typed(f.derived_value) as string }),
      // Where an artifact goes: an apply was approved for this place.
      ...(f.kind && { placement: f.placement ?? null, scope: f.scope ?? null }),
      // What taking the act back restores, whole (fallback, because and all): Marque's own words, never body text.
      ...(f.outcome && { outcome: f.outcome }),
      ...(f.asks && { asks: f.asks }),
      needs_person: f.needs_person,
      blocks: f.blocks,
      ...(f.state && { state: f.state }),
      ...(f.fields && { fields: f.fields }),
      ...(f.evaluationBasis && { evaluationBasis: f.evaluationBasis }),
    }),
  );

/** Seen only quiets (docs/DERIVATION.md): a Noticeable becomes Quiet; nothing else moves. */
/** Seen is of a result, not an id: ids survive re-lints, so a new result
 *  under the same id is unseen again. */
const shown = (f: Subject): string | null => {
  const r = f.outcome?.result ?? f.derived_value;
  return r == null
    ? null
    : typeof r === 'string'
      ? r
      : textOf(r) != null
        ? canon(disclosedMarking(r as MarkingInput))
        : canon(r);
}; // whole: masks and layers too // typed content by its whole value
const wasSeen = (state: State, f: Subject): boolean => state.seen.some((s) => s.id === f.id && s.result === shown(f));
export function see(state: State, f: Subject): State {
  return wasSeen(state, f) ? state : { ...state, seen: [...state.seen, { id: f.id, result: shown(f) }] };
}

export const last = (state: State, id: string): LogEntry | null => state.log.findLast((e) => e.id === id) || null;
const history = (state: State, id: string): LogEntry[] => state.log.filter((e) => e.id === id);
type Edit = LogEntry & { act: 'answered' | 'changed' };
const edits = (e: LogEntry | null | undefined): e is Edit => e?.act === 'answered' || e?.act === 'changed';
const putOff = (e: LogEntry | null | undefined): e is LogEntry & { act: 'deferred' | 'declined' } =>
  e?.act === 'deferred' || e?.act === 'declined';
/** The person said what it is, rather than putting it off. */
const settled = (e: LogEntry | null | undefined): e is Edit & { value: ActValue } => edits(e) && e.value != null;
/** Log lines the current lint hasn't seen. */
const since = (state: State): LogEntry[] => state.log.slice(state.linted ?? 0);
/** The person's last act on `id` that still overlays: an edit only until the next lint. */
function live(state: State, id: string): LogEntry | null {
  const e = last(state, id);
  return edits(e) && state.log.lastIndexOf(e) < (state.linted ?? 0) ? null : e;
}

/** Does the act in force on `id` ask the host to change the document? An
 *  answer or an override does; so does undoing one a lint already wrote.
 *  Undoing one nobody wrote yet cancels it and writes nothing. */
function writes(state: State, id: string): boolean {
  let e = last(state, id);
  // Deferring a reopened question doesn't cancel the take-back before it: that still has to be written.
  if (putOff(e)) {
    const p = history(state, id).findLast((x) => !putOff(x));
    if (edits(p) && p.value == null) e = p;
  }
  if (!e || state.log.lastIndexOf(e) < (state.linted ?? 0)) return false;
  return settled(e) || e.act === 'kept_as_written' || (edits(e) && !!reversed(state, id, e));
}

/** The last still-live physical change; it remains outstanding past lint until the host confirms its token. */
function writeIntent(state: State, id: string): LogEntry | null {
  let e = last(state, id);
  if (putOff(e)) e = history(state, id).findLast((x) => !putOff(x)) || null;
  return edits(e) && (settled(e) || (e.value == null && !!reversed(state, id, e))) ? e : null;
}

/** A token is unique within the host-persisted append-only state. */
export const writeToken = (e: LogEntry): string => `${e.id}@${e.sequence}`;
/** Bind host acknowledgement to the exact evaluated source/context/policy basis. */
export function writeConfirmationToken(token: string, basis: unknown): string | null {
  // A masked reading has no content-independent confirmation identity in this contract.
  if (basis && typeof basis === 'object' && 'replacements' in basis) {
    const replacements = (basis as { replacements?: unknown }).replacements;
    if (!replacements || typeof replacements !== 'object' || Array.isArray(replacements)) return null;
    for (const item of Object.values(replacements)) {
      if (!item || typeof item !== 'object' || !('kind' in item)) return null;
      const replacement = item as { kind: unknown; reading?: unknown };
      if (replacement.kind !== 'reading') {
        if (!['free_answer', 'artifact_field', 'artifact'].includes(String(replacement.kind))) return null;
        continue;
      }
      if (!replacement.reading || typeof replacement.reading !== 'object') return null;
      const result = (replacement.reading as { result?: unknown }).result;
      if (result == null) continue;
      if (typeof result !== 'object' || Array.isArray(result)) return null;
      const marking = result as { text?: unknown; masks?: unknown; layers?: unknown };
      if (typeof marking.text !== 'string') return null;
      if (marking.masks !== undefined && (!Array.isArray(marking.masks) || marking.masks.length > 0)) return null;
      if (marking.layers !== undefined) {
        if (!Array.isArray(marking.layers)) return null;
        for (const layer of marking.layers) {
          if (!layer || typeof layer !== 'object' || !Array.isArray(layer.tokens)) return null;
          for (const part of layer.tokens) {
            if (!part || typeof part !== 'object' || typeof part.t !== 'string' || part.mask != null) return null;
          }
        }
      }
    }
  }
  return `${token}#${canon(basis)}`;
}

/** The written answer or override a null `changed` since the lint takes back, if any. */
function reversed(state: State, id: string, e: LogEntry | null = last(state, id)): LogEntry | null {
  const n = state.linted ?? 0;
  if (!edits(e) || e.value != null || state.log.lastIndexOf(e) < n) return null;
  return state.log.slice(0, n).findLast((x) => x.id === id && (settled(x) || x.act === 'kept_as_written')) || null;
}

/** The host re-linted: the first `n` acts are in the new findings. Never moves back. */
export const linted = (state: State, n: number = state.log.length): State => ({
  ...state,
  linted: Math.max(state.linted ?? 0, Math.min(n, state.log.length)),
});

/** JSON with object keys sorted, arrays in order: the same question reserialised is the same question. */
export const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((n) => [n, (x as Record<string, unknown>)[n]]),
        )
      : x,
  );

/** A basis equality check for question, artifact and host-currentness bindings. */
export const sameBasis = (a: unknown, b: unknown): boolean => a != null && b != null && canon(a) === canon(b);

/** Effective readiness is affirmative engine evidence plus host-confirmed current work. */
export function effectiveReady(doc: Doc, host: Host = {}): boolean {
  const evaluation = doc.document.evaluation;
  if (
    !evaluation ||
    evaluation.completion !== 'complete' ||
    !evaluation.snapshotReady ||
    evaluation.requirements.some((r) => r.mandatory && r.status !== 'satisfied' && r.status !== 'permitted') ||
    doc.document.blocking.length > 0 ||
    (doc.document.pending?.length ?? 0) > 0 ||
    !sameBasis(evaluation.basis, host.currentBasis)
  )
    return false;
  const writeTokens = [...(doc.document.awaitingWrites ?? []), ...(host.requiredWrites ?? [])].map((token) =>
    writeConfirmationToken(token, evaluation.basis),
  );
  if (writeTokens.some((token) => token === null || !(host.confirmedWrites ?? []).includes(token))) return false;
  if (
    (host.requiredAcceptanceChecks ?? []).some((id) => {
      const token = writeConfirmationToken(id, evaluation.basis);
      return token === null || host.acceptanceChecks?.[id] !== token;
    })
  )
    return false;
  return true;
}
/** A content-free, unambiguous source/evaluation binding for a masked disposition. */
export const hasDefinitiveSourceBasis = (
  prior: EvaluationBasis | null | undefined,
  current: EvaluationBasis | null | undefined,
): boolean => {
  if (
    !prior ||
    !current ||
    writeConfirmationToken('', prior) === null ||
    writeConfirmationToken('', current) === null ||
    !sameBasis(prior, current)
  )
    return false;
  if (!prior.sourceRevisions || typeof prior.sourceRevisions !== 'object' || Array.isArray(prior.sourceRevisions))
    return false;
  const sources = Object.entries(prior.sourceRevisions);
  // Until the subject carries an explicit source binding, a multi-source basis is ambiguous.
  return (
    sources.length === 1 &&
    !!sources[0]![0].trim() &&
    typeof sources[0]![1] === 'string' &&
    !!sources[0]![1].trim() &&
    [
      prior.selectionRevision,
      prior.relationshipRevision,
      prior.contextRevision,
      prior.policyRevision,
      prior.declarationsRevision,
      prior.scope,
      prior.operation,
      prior.evaluationContextRevision,
      prior.targetProfile,
    ].every((part) => typeof part === 'string' && !!part.trim())
  );
};
/** Masked displays are not evidence that their hidden sources are the same. */
const maskedCurrentnessKnown = (entry: LogEntry, subject: Subject): boolean => {
  const markings: (MarkingLike | null | undefined)[] = [
    entry.about?.marking,
    entry.about?.result_marking,
    entry.value?.reading?.result,
    subject.marking?.as_written,
    subject.outcome?.result,
    textOf(subject.derived_value) != null ? (subject.derived_value as MarkingLike) : undefined,
  ];
  return (
    markings.every(canWriteMarking) || hasDefinitiveSourceBasis(entry.about?.evaluationBasis, subject.evaluationBasis)
  );
};
/** The finding isn't the one the act was taken on: another marking or question under the same id. */
const moved = (e: LogEntry, f: Subject): boolean =>
  !maskedCurrentnessKnown(e, f) ||
  (!!e.about &&
    // The whole question, not only its words: a new field type or format changes what an answer means.
    // Another rule under the same id is another finding, whatever it says.
    ((e.about.rule ?? null) !== ruleOf(f) ||
      !sameAsWritten(e.about, f) ||
      canon(e.about.asks ?? null) !== canon(disclosedAsks(f.asks) ?? null) ||
      !sameResult(e.about, f.outcome?.result) ||
      canon(e.about.evaluationBasis ?? null) !== canon(f.evaluationBasis ?? null) ||
      // Another place is another finding; a span moves with edits above it, so only the paragraph or page counts.
      ('anchor' in e.about && place(e.about.anchor) !== place(f.anchor))));
const place = (a: Anchor | null | undefined): string =>
  canon({ kind: a?.kind ?? null, portion: a?.portion ?? null, page: a?.page ?? null });
const stale = (e: LogEntry, f: Subject): boolean =>
  moved(e, f) ||
  // A reading picked is stale once the finding no longer offers it, from the readings or the question's own options.
  // The whole reading, not only its marking: what it asserts is what gets applied and audited.
  (!!e.value?.reading &&
    ![...(f.outcome?.readings || []), ...optionsOf(f)].some(
      (r) => canon(disclosedReading(r)) === canon(e.value?.reading),
    ));
const optionsOf = (f: Subject) => {
  const o = f.asks?.options;
  return Array.isArray(o) ? o : [];
};
/** The finding as it was before a written act, from that act's snapshot. */
const restore = (f: FindingView, was: Snapshot): FindingView => ({
  ...f,
  asks: was.asks ?? null,
  outcome: { ...f.outcome, ...was.outcome },
  needs_person: was.needs_person,
  blocks: was.blocks,
});
/** The finding the person answered: after a pending take-back of a written answer, the question it reopened. */
function answeredOn(state: State, f: FindingView, e: LogEntry): FindingView {
  const h = history(state, f.id),
    n = state.linted ?? 0;
  const prev = h.slice(0, h.indexOf(e)).findLast((x) => !putOff(x)); // a deferral in between keeps the question reopened
  if (!prev || !edits(prev) || prev.value != null || state.log.lastIndexOf(prev) < n) return f;
  const back = state.log.slice(0, n).findLast((x) => x.id === f.id && (settled(x) || x.act === 'kept_as_written'));
  return back?.about?.outcome ? restore(f, back.about) : f;
}
/** An artifact op is stale once the artifact isn't the one it was taken on. */
const staleOp = (e: LogEntry, a: ArtifactView): boolean =>
  !maskedCurrentnessKnown(e, a) ||
  (!!e.about &&
    (e.about.state !== a.state ||
      canon(e.about.evaluationBasis ?? null) !== canon(a.evaluationBasis ?? null) ||
      !sameResult(e.about, textOf(a.derived_value) != null ? (a.derived_value as MarkingLike) : null) ||
      (e.about.content ?? null) !== typed(a.derived_value) ||
      ('placement' in e.about &&
        (e.about.placement !== (a.placement ?? null) || e.about.scope !== (a.scope ?? null))) ||
      // A typed field is stale once the field is gone, asks for something else, or the lint now gives it another
      // value than the one the person edited: not the source (under any earlier local act, by `from`), not the
      // field as the person saw it, and not the person's own value written in.
      Object.keys(e.value?.fields || {}).some((k) => {
        const was = e.about?.fields?.[k],
          now = a.fields?.[k];
        return (
          !now ||
          (was &&
            (schema(was) !== schema(now) ||
              canon(was.evaluationBasis ?? null) !== canon(now.evaluationBasis ?? null) ||
              (![was.from, source(was)].includes(source(now)) && now.value !== e.value?.fields?.[k])))
        );
      })));
// oxlint-disable-next-line no-unused-vars -- the named slots are what's dropped
const schema = ({ state, value, source, from, ...fl }: ArtifactField): string => canon(fl);
const source = (fl: ArtifactField): string =>
  canon({ state: fl.state ?? null, value: fl.value ?? null, source: fl.source ?? null });

const edited = (e: LogEntry | null | undefined): LogEntry | null => (edits(e) ? e : null);
/** On a view (render and help share it): the person's decision on this finding: the act in force, or, once a lint has
 *  written it and nothing is asked again, the last one in the history. A stale
 *  view has no decision: the lint dropped the person's last one. Nor is a
 *  written answer whose marking the engine has since moved off. */
const holds = (e: LogEntry | null, f: Subject): LogEntry | null => {
  if (e && !maskedCurrentnessKnown(e, f)) return null;
  // A prose answer becomes a marking only once the engine derives one; only a typed marking compares.
  const r = e?.value?.reading?.result?.text ?? (e?.about?.asks?.field?.type === 'marking' ? e.value?.free : null);
  const norm = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim();
  const now = norm(f.outcome?.result?.text),
    was = norm(f.marking?.as_written?.text);
  // Asked of this marking: the one it was asked about, or the one a marking answer wrote.
  // A prose answer's written marking can't be told from a new one, so it holds only on its own.
  // Another rule under the same id is another finding, whatever its marking.
  if (e?.about && (e.about.rule ?? null) !== ruleOf(f)) return null;
  const same = !e?.about || was === norm(e.about.as_written) || (r != null && was === now);
  return same && (r == null || norm(r) === now) ? e : null;
};
export const decision = (f: Subject): LogEntry | null =>
  edited(f.person) ||
  (!f.stale && f.needs_person === 'none' && !f.asks ? holds(edited(f.history?.findLast((e) => edited(e))), f) : null);
/** The person's own answer stands on this finding, live or already written. */
export const answered = (f: Subject): boolean => decision(f)?.value != null;
/** One finding or artifact as it stands with the person's acts on it. */
export function view<T extends Subject>(f: T, state: State): T {
  const v = overlay(f, state);
  // Seen is of the result shown: a new one the person put there hasn't been looked at yet.
  // A copy: a host that edits the view mustn't reach into the log.
  return structuredClone(v.seen && shown(v) !== shown(f) ? { ...v, seen: wasSeen(state, v) } : v) as T;
}

function overlay(f: Subject, state: State): Subject {
  // `person` is the act still in force; `history` keeps every act for the audit.
  const e = live(state, f.id);
  const over = { seen: !!f.seen || wasSeen(state, f), person: e, history: history(state, f.id) };
  if (isArtifact(f)) return artifactView({ ...f, ...over }, state);
  const v: FindingView = { ...f, ...over };
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
      const result =
        e.value.reading?.result ??
        (on.asks?.field?.type === 'marking' ? { text: e.value.free as string } : on.outcome?.result);
      // The kind stays the engine's: the answer is generated until the host applies it.
      return {
        ...v,
        asked: on.asks,
        outcome: { ...on.outcome, result, fallback: undefined },
        asks: null,
        needs_person: 'none',
        blocks: 'never',
      };
    }
    case 'kept_as_written':
      // The person kept one marking against one fix; a different one under the same id, or a question
      // asked of it since, is open again.
      if (moved(e, f)) return { ...v, person: null, stale: true };
      return {
        ...v,
        overridden: true,
        outcome: { ...f.outcome, kind: 'kept_as_written', result: f.marking?.as_written, readings: [] },
        needs_person: 'none',
        blocks: 'never',
      };
    default: {
      // deferred, declined: still open, as the question a pending take-back reopened if there is one
      const on = answeredOn(state, f, e);
      // Put off on another question: the one asked now hasn't been put off.
      if (moved(e, on)) return { ...v, person: null, stale: true };
      return {
        ...v,
        ...(on !== f && { asks: on.asks, outcome: on.outcome, needs_person: on.needs_person, blocks: on.blocks }),
        deferred: e.act,
      };
    }
  }
}

function artifactView(a: ArtifactView, state: State): ArtifactView {
  let out = a;
  const ops = since(state).filter((e) => e.id === a.id);
  // An apply, a removal or a typed field taken on another value or state of this artifact doesn't carry over.
  // Each op is checked on its own: a stale later field leaves an earlier one that still holds.
  let valid = ops.filter((e) => !staleOp(e, out));
  // A field opened by a local answer to the one it waits on goes with that answer: it was filled in its context.
  const typedOf = (list: LogEntry[]): Record<string, string> =>
    Object.assign({}, ...list.map((e) => e.value?.fields).filter(Boolean));
  for (let keep = valid; ; valid = keep) {
    const t = typedOf(valid);
    const now = (j: string) => {
      const fl = out.fields?.[j];
      return t[j] ?? (fl?.state === 'known' || fl?.state === 'derived' ? fl.value : null);
    };
    keep = valid.filter((e) =>
      Object.keys(e.value?.fields || {}).every((k) => {
        const was = e.about?.fields?.[k];
        return !was?.from || !was.waits_on || now(was.waits_on) === (e.about?.fields?.[was.waits_on]?.value ?? null);
      }),
    );
    if (keep.length === valid.length) break;
  }
  if (ops.length && !valid.length) return { ...out, person: null, stale: true };
  if (a.fields) {
    const typed = typedOf(valid);
    // `from`: the field as the lint gave it, so a later act on it is checked against the source, not this overlay.
    const fields: Record<string, ArtifactField> = Object.fromEntries(
      Object.entries(a.fields).map(([k, fl]): [string, ArtifactField] => [
        k,
        typed[k] ? { ...fl, state: 'known', value: typed[k], source: 'person', from: source(fl) } : fl,
      ]),
    );
    const has = (fl: ArtifactField | undefined): boolean => fl?.state === 'known' || fl?.state === 'derived';
    // A field that waited on one now filled is the person's to fill next.
    for (const [k, fl] of Object.entries(fields)) {
      if (fl.state === 'waiting' && fl.waits_on != null && has(fields[fl.waits_on]))
        fields[k] = { ...fl, state: 'blank', from: source(fl) };
    }
    const open = Object.values(fields).some((fl) => !has(fl));
    out = { ...out, fields, needs_person: open ? a.needs_person : 'none' };
  }
  const asked = (ops.length ? valid[valid.length - 1] : live(state, a.id))?.value;
  // A block the person has now filled in waits to be written, like an apply.
  if (asked?.apply || asked?.remove || (ops.length && asked?.fields && out.needs_person === 'none'))
    out = { ...out, applying: true };
  return out;
}

/**
 * The whole document with the person's acts on it. `blocking` keeps the
 * engine's list and drops what the person has answered; every edit since
 * the lint waits in `pending` until the host applies it and re-lints. `ready` needs both
 * empty. `withdrawn` keeps the acts on ids the latest lint no longer lists,
 * for the receipt. Nothing else appears here the engine didn't list.
 */
export function docView(doc: Doc, state: State): Doc {
  // What each finding's decision moves: the artifacts that depend on it, by kind.
  const moves = (id: string): ArtifactKind[] =>
    doc.document.artifacts.filter((a) => a.depends_on?.includes(id)).map((a) => a.kind);
  const findings = doc.findings.map((f) => {
    const v = view(f, state),
      m = moves(f.id);
    return m.length ? { ...v, moves: m } : v;
  });
  const artifacts = doc.document.artifacts.map((a) => view(a, state));
  const all = new Map([...findings, ...artifacts].map((x) => [x.id, x]));
  // Semantic engine blockers are authoritative. Local presentation overlays never erase them.
  const blocking = doc.document.blocking;
  // Every write since the lint waits for it, blocker or not: an alternative taken moves the banner too.
  // A write to a finding the lint withdrew has nowhere to go; its acts stay in `withdrawn`.
  const pending = [
    ...new Set([
      ...(doc.document.pending ?? []),
      ...since(state)
        .map((e) => e.id)
        .filter((id) => all.has(id) && !all.get(id)?.stale && writes(state, id)),
    ]),
  ];
  const awaitingWrites = [
    ...new Set([
      ...(doc.document.awaitingWrites ?? []),
      ...[...all.keys()]
        .map((id) => writeIntent(state, id))
        .filter((e): e is LogEntry => !!e)
        .map(writeToken),
    ]),
  ];
  const withdrawn = [...new Set(state.log.map((e) => e.id))]
    .filter((id) => !all.has(id))
    .map((id) =>
      structuredClone({ id, about: history(state, id).findLast((e) => e.about)?.about, history: history(state, id) }),
    );
  return {
    ...doc,
    findings,
    document: { ...doc.document, artifacts, blocking, pending, awaitingWrites, withdrawn },
  };
}

/** Project the exact hypothetical replacements currently represented by the overlaid document view. */
export function acceptedReplacements(doc: Doc): Record<string, HypotheticalReplacement> {
  const replacements: Record<string, HypotheticalReplacement> = {};
  for (const finding of doc.findings) {
    const value = finding.person?.value;
    if (value?.reading) {
      if (canWriteAct(value)) replacements[finding.id] = { kind: 'reading', reading: value.reading };
    } else if (value?.free != null) replacements[finding.id] = { kind: 'free_answer', value: value.free };
  }
  for (const artifact of doc.document.artifacts) {
    for (const [field, item] of Object.entries(artifact.fields ?? {})) {
      if (item.source === 'person' && item.value != null)
        replacements[`${artifact.id}.${field}`] = { kind: 'artifact_field', field, value: item.value };
    }
    const value = artifact.person?.value;
    if (value?.apply) replacements[artifact.id] = { kind: 'artifact', action: 'apply' };
    if (value?.remove) replacements[artifact.id] = { kind: 'artifact', action: 'remove' };
  }
  return replacements;
}
