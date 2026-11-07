// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The shapes the kit reads and keeps (docs/CONTRACT.md): what Marque emits,
 * the person's acts on it (src/state.ts), and what a host hands the kit.
 * Types only; nothing here runs.
 */

/* ── markings ────────────────────────────────────────────────────────── */
/** A typed region the engine couldn't identify, or a source concealed. Never characters. */
export interface Mask {
  kind: 'concealed' | 'unidentified';
  /** [start, end) in UTF-8 bytes of the marking's text, as every span is. */
  span?: [number, number];
  /** A mask with no span is drawn at the end of this layer. */
  layer?: number;
  /** How many characters it stands for. */
  len?: number;
}

export interface Token {
  t: string;
  /** The vocabulary entry this token opens. */
  help?: string;
  /** A token that is only a mask: `{ t: '', mask }`. */
  mask?: Mask;
}

export interface Layer {
  tokens: Token[];
}

/** A marking as the engine emits it: layers and masks apply whole. */
export interface Marking {
  text: string;
  layers: Layer[];
  masks: Mask[];
}

/** What a caller may pass for a marking: the text, with or without the engine's layers and masks. */
export interface MarkingInput {
  text: string;
  layers?: Layer[];
  masks?: Mask[];
}

export type MarkingLike = string | MarkingInput;

/* ── what Marque says ────────────────────────────────────────────────── */
export interface Citation {
  source: string;
  section: string;
  page: number;
  /** The manual's words, verbatim. */
  short?: string | undefined;
}

export interface Says {
  text: string;
  template?: string;
  citation?: Citation | null;
  caveat?: string | null;
  /** Tokens in the marking with a help entry. */
  help?: string[];
}

export type Rung = 'quiet' | 'noticeable' | 'advisory' | 'action' | 'blocking';
export type NeedsPerson = 'none' | 'optional' | 'required';
export type Blocks = 'never' | 'finalize' | 'now';
/** The host's moment. Marque never knows it; 'finalize' and 'send' are the gate. */
export type Moment = 'editing' | 'finalize' | 'send' | (string & {});

export interface Anchor {
  kind: 'span' | 'portion' | 'page' | 'document' | 'bundle';
  span?: [number, number];
  portion?: number;
  page?: number;
}

export interface Rule {
  scheme: string;
  predicate: string;
}

/** One lawful reading of what the author meant, with the marking it produces. */
export interface Reading {
  asserts?: Record<string, unknown>;
  reading: string;
  result?: MarkingInput | null;
  changes?: string[];
}

export type OutcomeKind =
  | 'applied'
  | 'available'
  | 'chosen_over'
  | 'choices'
  | 'needs_fact'
  | 'withheld'
  | 'covered_by'
  /** Only on a view: the person kept the marking as written. */
  | 'kept_as_written';

export interface Outcome {
  kind: OutcomeKind;
  result?: MarkingInput | null;
  because?: string | null;
  readings?: Reading[];
  reason?: string | null;
  /** The most restrictive form that keeps every stated equity: what happens if nobody answers. */
  fallback?: { result: MarkingInput; basis?: string } | null | undefined;
  covered_by?: string | null;
}

export interface AskField {
  type: 'marking' | (string & {});
  format?: string | null;
  hint?: string | null;
  waits_on?: string | null;
}

export interface Asks {
  kind: string;
  text: string;
  /** The readings themselves, or 'outcome.readings' to take the finding's own. */
  options?: Reading[] | 'outcome.readings' | null;
  field?: AskField | null;
  free_answer?: boolean;
}

/* ── findings and artifacts ──────────────────────────────────────────── */
export interface Finding {
  id: string;
  rule: Rule;
  severity?: string;
  basis?: string;
  anchor?: Anchor;
  marking?: { as_written: MarkingInput | null; shape?: 'recognized' | 'absent' | (string & {}) };
  says: Says;
  outcome: Outcome;
  asks?: Asks | null;
  needs_person: NeedsPerson;
  blocks: Blocks;
  depends_on?: string[];
  scope?: string | null;
  seen?: boolean;
  // An artifact's own slots: never on a finding, so a finding and an artifact can be told apart by `kind`.
  kind?: undefined;
  state?: undefined;
  derived_value?: undefined;
  placement?: undefined;
  fields?: undefined;
  if_taken?: undefined;
  derivation?: undefined;
}

export type ArtifactKind = 'front_marking' | 'authority_block' | (string & {});
export type ArtifactState =
  | 'present'
  | 'absent_not_required'
  | 'absent_but_required'
  | 'present_not_required'
  | 'present_not_canonical';

/** A field a person fills on an artifact (the authority block). */
export interface ArtifactField {
  state: 'known' | 'derived' | 'blank' | 'waiting';
  value?: string | null;
  source?: string | null;
  hint?: string | null;
  format?: string | null;
  waits_on?: string | null;
  /** On a view: the field as the lint gave it, so a later act is checked against that. */
  from?: string;
}

export interface DerivationStep {
  axis: string;
  inputs: string[];
  output: string;
  citation?: Citation | null;
}

/** A notice's typed content: not a marking. */
export type Content = Record<string, unknown>;
/** What Marque derived for an artifact: a marking, or typed content. */
export type DerivedValue = MarkingLike | Content;

export interface Artifact {
  id: string;
  kind: ArtifactKind;
  scope?: string | null;
  state: ArtifactState;
  fixability?: 'fixable' | 'flag_only' | (string & {});
  placement?: string | null;
  derived_value?: DerivedValue | null;
  says: Says;
  derivation?: DerivationStep[];
  needs_person: NeedsPerson;
  blocks: Blocks;
  depends_on?: string[];
  /** The value if a finding's alternative is taken, by finding id. */
  if_taken?: Record<string, MarkingLike> | null;
  fields?: Record<string, ArtifactField>;
  seen?: boolean;
  // A finding's own slots: never on an artifact.
  rule?: undefined;
  marking?: undefined;
  outcome?: undefined;
  asks?: undefined;
  anchor?: undefined;
}

/* ── the kit's state (docs/CONTRACT.md §F.1) ─────────────────────────── */
export type Act = 'answered' | 'changed' | 'kept_as_written' | 'deferred' | 'declined';

/** What an act says: a reading picked, a value typed, an apply or removal, fields filled. */
export interface ActValue {
  reading?: Reading;
  index?: number;
  free?: string;
  apply?: boolean;
  remove?: boolean;
  fields?: Record<string, string>;
}

/** What an act was about when it was taken: markings, rule and place, never body text. */
export interface Snapshot {
  rule: string | null;
  anchor?: Anchor | undefined;
  kind?: string | undefined;
  as_written: string | null;
  result: string | null;
  marking?: MarkingInput;
  result_marking?: MarkingLike;
  content?: string;
  placement?: string | null;
  scope?: string | null;
  outcome?: Outcome;
  asks?: Asks | null;
  needs_person: NeedsPerson;
  blocks: Blocks;
  state?: ArtifactState;
  fields?: Record<string, ArtifactField>;
}

export interface LogEntry {
  id: string;
  act: Act;
  value: ActValue | null;
  at: string;
  about?: Snapshot;
}

export interface State {
  log: LogEntry[];
  seen: { id: string; result: string | null }[];
  /** How many log lines the current lint already reflects. */
  linted?: number;
}

/** What view() adds: the person's acts overlaid. Every slot is optional, so Marque's own finding is a view too. */
export interface Overlay {
  seen?: boolean;
  /** The act still in force. */
  person?: LogEntry | null;
  /** Every act on this id, for the audit. */
  history?: LogEntry[];
  /** The lint dropped the person's last act: it was taken on another finding. */
  stale?: boolean;
  overridden?: boolean;
  /** The question an answer settled. */
  asked?: Asks | null | undefined;
  deferred?: 'deferred' | 'declined';
  /** The artifacts a decision here moves, by kind. */
  moves?: ArtifactKind[];
  /** An artifact act waiting for the host to write it. */
  applying?: boolean;
}

export type FindingView = Finding & Overlay;
export type ArtifactView = Artifact & Overlay;
/** Either thing a person can act on. */
export type Subject = FindingView | ArtifactView;

/** Acts on an id the latest lint no longer lists: kept for the receipt. */
export interface Withdrawn {
  id: string;
  about: Snapshot | undefined;
  history: LogEntry[];
}

export interface DocumentState {
  ready: boolean;
  blocking: string[];
  artifacts: ArtifactView[];
  pending?: string[];
  withdrawn?: Withdrawn[];
}

/** The engine's document, or a view of it (docView). */
export interface Doc {
  schema?: string;
  note?: string;
  source?: unknown;
  findings: FindingView[];
  document: DocumentState;
}

/* ── vocabulary and manual ───────────────────────────────────────────── */
export interface HelpEntry {
  code?: string;
  short?: string | null;
  long?: string | null;
  /** "§H.8 p145" */
  citation?: string | null;
  examples?: { form: string; kind: string }[];
  plain?: string | null;
  tips?: string[];
  sponsor?: string | null;
  policy_basis?: string | null;
}

export interface Trigraph {
  code: string;
  name: string;
}

export interface Tetragraph {
  code: string;
  name: string;
  decomposable?: boolean;
  members?: string[];
}

/** The engine's vocab JSON. */
export interface Vocab {
  schema?: string;
  note?: string;
  version?: { ismcat?: string; help?: string };
  trigraphs?: Trigraph[];
  tetragraphs?: Tetragraph[];
  help?: Record<string, HelpEntry>;
}

/** The cited sections of the manual, sliced at build. */
export interface Manual {
  schema?: string;
  note?: string;
  source?: string;
  sections: { section: string; title: string; pages: [number, number]; text: string }[];
}

/* ── the host ────────────────────────────────────────────────────────── */
export type HelpRequest =
  | { kind: 'why'; finding: FindingView; rung: Rung; anchor: HTMLElement }
  | { kind: 'why' | 'derivation'; artifact: ArtifactView; anchor: HTMLElement }
  | { kind: 'citation'; citation: Citation; anchor: HTMLElement }
  | { kind: 'token'; code: string; anchor: HTMLElement }
  | { kind: 'section'; citation: Citation; plain?: string | null };

/** A token the theme gate rejected. */
export interface Rejected {
  token: string;
  measured: number;
  floor: number;
  /** Whether the shipped value could be put back. */
  fallback: boolean;
}

export interface ThemeReport {
  checked: number;
  rejected: Rejected[];
  width: number;
  narrow: boolean;
}

export type Tab = 'findings' | 'history';

export type EngineState = 'ok' | 'checking' | 'failed' | (string & {});

/** The thing the kit never decides. Every callback is optional; a missing one makes its control inert, not absent. */
export interface Host {
  moment?: Moment | undefined;
  engine?: EngineState | undefined;
  readOnly?: boolean | undefined;
  vocab?: Vocab | undefined;
  /** Under the width floor: rows only. */
  narrow?: boolean | undefined;
  /** The id whose card is open. */
  open?: string | null | undefined;
  /** What the pane shows once anything is done: the findings, or the History of acts (DECISIONS #24). */
  tab?: Tab | undefined;
  /** The person's acts, oldest first. History lists them; without any, there are no tabs. */
  log?: readonly LogEntry[] | undefined;
  onAct?: (f: Subject, act: Act, value?: ActValue | null) => void;
  onHelp?: (req: HelpRequest) => void;
  onJump?: (f: Subject) => void;
  onOpen?: (f: Subject | null) => void;
  onTab?: (tab: Tab) => void;
  onGate?: () => void;
  /** From the pane's button (its element), or a code picked in the lookup. */
  onLookup?: (target: HTMLElement | string) => void;
  onReceipt?: () => void;
  onRetry?: () => void;
  onReport?: () => void;
  onClose?: () => void;
  onChange?: (state: State, act: { id: string; act: Act; value: ActValue | null } | null) => void;
  onTheme?: (report: ThemeReport | null) => void;
}
