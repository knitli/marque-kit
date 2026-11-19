// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Marking — the text primitive (component 2).
 *
 * Renders a classification marking verbatim, in the mark font, so that it
 * never breaks inside a token and never overflows its container. When the
 * engine supplies layers and tokens they are used
 * as-is; until then `parse()` derives them from the string with CAPCO's
 * separators — a fallback, and the reason the engine should emit layers.
 *
 * Rules (docs/THEME.md, "Fit" and "Long markings"):
 *   - break between layers first (before `//`), then after a list comma,
 *     then between tokens; never inside a token (REL TO, TOP SECRET, SI-G);
 *   - when any break is needed, stack: one layer per line;
 *   - never truncate, scroll or shrink below 13px;
 *   - four forms: full · folded · summary · diff.
 *
 * The structure and everything pure (parse, spoken, masked, the HTML string) are in
 * @knitli/marque-kit-core/marking, which has no DOM; they are re-exported here. This module
 * adds what needs a document: render() builds the elements, settle() measures, and
 * enhance() does both for markings that came from a server as html().
 */

import {
  normalize,
  spoken,
  tree,
  type MarkNode,
  type MarkOptions,
  type SpokenVocab,
} from '@knitli/marque-kit-core/marking';
import type { Layer, Marking, MarkingLike, Mask } from '@knitli/marque-kit-core/types';
import type { NativeSourceMarkingView } from '@knitli/marque-kit-core/native-wire';
import { isParsedNativeSourceMarkingView, parseNativeSourceMarkingJson } from '@knitli/marque-kit-core/native-wire';

// The pure half, from core, as this module has always exported it.
export {
  bare,
  escape,
  html,
  layers,
  masked,
  normalize,
  parse,
  serialize,
  spoken,
  tokens,
  tree,
} from '@knitli/marque-kit-core/marking';
export type { MarkNode, MarkOptions, SpokenVocab } from '@knitli/marque-kit-core/marking';
/** Options for render(): the same as html()'s. */
export type RenderOptions = MarkOptions;

/** An element with its class and text: the kit's one way to make one (render and help use it too). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string | null,
  text?: string | null,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
/** A kit button: never a form submit. */
export function button(cls: string, text: string, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const b = el('button', `mq-btn ${cls}`, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** The elements for a MarkNode: what html() writes as a string, as DOM. */
function build(n: MarkNode | string): Node {
  if (typeof n === 'string') return document.createTextNode(n);
  const e = document.createElement(n.tag);
  for (const [k, v] of n.attrs) e.setAttribute(k, v);
  for (const k of n.kids) e.appendChild(build(k));
  return e;
}

/**
 * Render a marking. The structure is core's tree(), the same one html() writes as a string.
 * @param marking  string or engine layered form
 * @param o.form       'full' (default) | 'folded' | 'summary' | 'diff'
 * @param o.state      derived | review | unverified
 * @param o.size       xs | sm | lg
 * @param o.stacked    force one layer per line (the kit measures otherwise)
 * @param o.fold       codes shown before a fold (3)
 * @param o.differs    layer indexes that differ between readings (diff form)
 * @param o.foldLabel  e.g. "9 more · same in every reading"
 * @param o.help       tokens with a help entry (says.help[]); each becomes a tier-1 target
 */
export function render(marking: MarkingLike, o: RenderOptions = {}): HTMLSpanElement {
  const m = normalize(marking);
  const root = build(tree(m, o)) as HTMLSpanElement;
  models.set(root, m);
  for (const f of root.querySelectorAll('.mq-fold'))
    f.addEventListener('click', () => {
      root.replaceWith(render(marking, { ...o, form: 'full', stacked: true }));
    });
  return root;
}

/**
 * After insertion: if the marking had to wrap, set it one layer per line so
 * it always wraps the same way (CSS alone wraps greedily and orphans `GBR)`).
 * Call once per render, and again on container resize if the host allows.
 */
/** Measure again after the room changed: a marking stacked at one width may fit at another. */
export function resettle(root: HTMLElement): HTMLElement {
  if (root.dataset.stack !== 'fixed') root.classList.remove('stacked');
  return settle(root);
}

export function settle(root: HTMLElement): HTMLElement {
  if (root.classList.contains('stacked') || root.classList.contains('summary')) return root;
  const one = root.getBoundingClientRect().height;
  const line = parseFloat(getComputedStyle(root).lineHeight) || 20;
  if (one > line * 1.5) root.classList.add('stacked');
  return root;
}

export type SourceMarkingSessionBinding = NativeSourceMarkingView['binding'];
export type SourceMarkingSessionProvider = {
  isCurrent(binding: Readonly<SourceMarkingSessionBinding>): boolean | Promise<boolean>;
  load(binding: Readonly<SourceMarkingSessionBinding>, maxBytes: number): Promise<string | null>;
};
export type SourceMarkingSessionCapability = {
  isCurrent(): Promise<boolean>;
  revoke(): void;
};
type SourceMarkingSessionRecord = {
  binding: Readonly<SourceMarkingSessionBinding>;
  maxBytes: number;
  provider: SourceMarkingSessionProvider;
  active: boolean;
};
const sourceMarkingSessions = new WeakMap<object, SourceMarkingSessionRecord>();
const sourceMarkingBindingKeys = ['chain_id', 'source_id', 'revision_id', 'contribution_id', 'scope_id', 'viewer_id'] as const;

/** Install-time host hook. Its loader must return the engine's current, trusted response for this binding. */
export function installSourceMarkingSession(
  binding: SourceMarkingSessionBinding,
  maxBytes: number,
  provider: SourceMarkingSessionProvider,
): SourceMarkingSessionCapability {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 32_768) {
    throw new RangeError('source marking byte cap');
  }
  if (
    sourceMarkingBindingKeys.some((key) => typeof binding[key] !== 'string' || !binding[key].trim()) ||
    Object.keys(binding).length !== sourceMarkingBindingKeys.length
  ) {
    throw new TypeError('source marking session binding');
  }
  const record: SourceMarkingSessionRecord = {
    binding: Object.freeze({ ...binding }),
    maxBytes,
    provider,
    active: true,
  };
  const capability: SourceMarkingSessionCapability = Object.freeze({
    isCurrent: async () => {
      if (!record.active) return false;
      try {
        const valid = await provider.isCurrent(record.binding);
        return record.active && valid;
      } catch {
        return false;
      }
    },
    revoke: () => { record.active = false; },
  });
  sourceMarkingSessions.set(capability, record);
  return capability;
}

/** Load through the installed host provider and render only its exact live response. */
export async function renderSourceMarkingView(session: SourceMarkingSessionCapability): Promise<HTMLSpanElement> {
  const record = sourceMarkingSessions.get(session);
  if (
    !record ||
    !(await session.isCurrent()) ||
    !record.active
  ) {
    throw new TypeError('source marking view session mismatch or expired');
  }
  let json: string | null;
  try {
    json = await record.provider.load(record.binding, record.maxBytes);
  } catch {
    throw new TypeError('source marking view unavailable');
  }
  if (!(await session.isCurrent()) || !record.active || typeof json !== 'string') {
    throw new TypeError('source marking view session mismatch or expired');
  }
  const view = parseNativeSourceMarkingJson(json, record.maxBytes);
  if (
    !isParsedNativeSourceMarkingView(view) ||
    sourceMarkingBindingKeys.some((key) => view.binding[key] !== record.binding[key])
  ) {
    throw new TypeError('source marking view session mismatch or expired');
  }
  const root = render(view.marking);
  root.setAttribute('aria-label', `Read-only source marking: ${spoken(view.marking)}`);
  return root;
}

// Each rendered marking keeps its model, so a pane can say its markings in its own vocabulary.
const models = new WeakMap<Element, Marking>();
/** The model of a marking the kit didn't draw: from its `data-model` (a folded one carries it), or none. */
function carried(n: HTMLElement): Marking | null {
  const json = n.dataset.model;
  if (!json) return null;
  try {
    const v = JSON.parse(json) as { layers?: unknown; masks?: unknown };
    if (!Array.isArray(v.layers)) return null;
    return normalize({
      text: n.dataset.text ?? '',
      layers: v.layers as Layer[],
      masks: Array.isArray(v.masks) ? (v.masks as Mask[]) : [],
    });
  } catch {
    return null;
  }
}
/** Say every marking under `node` again with `vocab` (a mount's own). A marking from html() keeps the
 *  label its server gave it, unless it carries its model. */
export function relabel(node: ParentNode, vocab: SpokenVocab): void {
  for (const n of node.querySelectorAll<HTMLElement>('.mq-mark')) {
    const m = models.get(n) ?? carried(n);
    if (m) n.setAttribute('aria-label', spoken(m, vocab));
  }
}

const FORM = new Set(['mq-mark', 'stacked', 'summary']);
/** Open a folded marking the kit didn't draw: its full form, stacked, with its state, size and label. */
export function unfold(mark: HTMLElement): HTMLSpanElement | null {
  const m = carried(mark);
  if (!m) return null;
  const cls = [...mark.classList].filter((c) => !FORM.has(c));
  const size = cls.find((c): c is 'xs' | 'lg' => c === 'xs' || c === 'lg');
  const state = cls.filter((c) => c !== size).join(' ') || undefined;
  // A layer that differs between readings stays marked when the fold opens (the diff form's whole point).
  const differs = [...mark.querySelectorAll(':scope > .mq-l')].flatMap((l, i) =>
    l.classList.contains('differs') ? [i] : [],
  );
  const full = render(m, { form: 'full', stacked: true, state, differs, ...(size ? { size } : {}) });
  const label = mark.getAttribute('aria-label');
  if (label) full.setAttribute('aria-label', label); // said in the server's vocabulary, as before
  mark.replaceWith(full);
  return full;
}

/**
 * Bring markings a server sent as html() to life, under `root` (or `root` itself):
 * settle each one (stack it if it had to wrap), measure again when the room changes,
 * and open a fold on click, Enter or Space. Markings render() made already do their own folds.
 * For tier-1 help on their tokens, also call `tips(root, vocab)` from @knitli/marque-kit/help.
 * Returns a function that stops it.
 */
export function enhance(root: HTMLElement): () => void {
  const marks = (): HTMLElement[] =>
    root.matches('.mq-mark') ? [root] : [...root.querySelectorAll<HTMLElement>('.mq-mark')];
  for (const m of marks()) settle(m);
  const open = (e: Event): void => {
    const f = e.target instanceof Element ? e.target.closest<HTMLElement>('.mq-fold') : null;
    const mark = f?.closest<HTMLElement>('.mq-mark');
    if (!f || !mark || !root.contains(f) || models.has(mark)) return;
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    unfold(mark);
  };
  root.addEventListener('click', open);
  root.addEventListener('keydown', open);
  // Only a change in width can change where a marking breaks; stacking changes height, not width.
  let width = root.clientWidth;
  const ro =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (root.clientWidth === width) return;
          width = root.clientWidth;
          for (const m of marks()) resettle(m);
        });
  ro?.observe(root);
  return () => {
    root.removeEventListener('click', open);
    root.removeEventListener('keydown', open);
    ro?.disconnect();
  };
}
