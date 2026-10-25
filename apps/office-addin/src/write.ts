// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * What the document should say, from the pane's view of it. The host applies:
 * every fix Marque wrote and every answer the person gave is an edit to the memo
 * as written, and the document is the memo with those edits in. Taking an act
 * back takes its edit out, so the text goes back with the question.
 */

import { docView, last } from '@marque/kit-core/state';
import type { ArtifactView, Doc, FindingView, State, Subject } from '@marque/kit-core/types';

export interface Edit {
  span: [number, number];
  result: string;
}

const enc = new TextEncoder(),
  dec = new TextDecoder();
const textOf = (m: unknown): string | null => {
  const t = typeof m === 'string' ? m : (m as { text?: unknown } | null | undefined)?.text;
  return typeof t === 'string' ? t : null;
};

/** Where a missing portion mark goes in its portion: after the paragraph's number, if it has one.
 *  shortcut: the memo's "4. " numbering; the engine's anchor should say where, once it does. */
const markAt = (memo: Uint8Array, [start, end]: [number, number]): number =>
  start + enc.encode(/^\d+\.\s+/.exec(dec.decode(memo.subarray(start, end)))?.[0] ?? '').length;

/** What a finding shows now: the person's answer, Marque's fix, or the marking as written. */
const shown = (f: FindingView): string => textOf(f.outcome?.result) ?? textOf(f.marking?.as_written) ?? '';

/** The edits that make the memo say what the view says. One per finding whose text isn't as written. */
export function edits(view: Doc, memo: string): Edit[] {
  const bytes = enc.encode(memo);
  return view.findings.flatMap((f): Edit[] => {
    const span = f.anchor?.span;
    if (!span) return [];
    if (f.anchor?.kind === 'portion') {
      // Nothing was written: an answer goes in as the portion's mark, with a space before the text.
      const mark = textOf(f.outcome?.result);
      const at = markAt(bytes, span);
      return mark ? [{ span: [at, at], result: `${mark} ` }] : [];
    }
    const was = dec.decode(bytes.subarray(span[0], span[1]));
    const now = shown(f);
    return now === was ? [] : [{ span, result: now }];
  });
}

/** The banner a re-linted document carries: Marque's derived value once it's applied, or none. */
export function banner(linted: Doc): string | null {
  const a = linted.document.artifacts.find((x: ArtifactView) => x.kind === 'front_marking');
  return a?.state === 'present' ? textOf(a.derived_value) : null;
}

/** A marking's classification, lowest 0; -1 when it doesn't start with one. */
const level = (t: string | null): number => {
  const c = /^\(?\s*(TOP SECRET|TS|SECRET|S|CONFIDENTIAL|C|UNCLASSIFIED|U)\b/.exec(t ?? '')?.[1] ?? '';
  return ['U', 'C', 'S', 'TS'].indexOf(
    ({ UNCLASSIFIED: 'U', CONFIDENTIAL: 'C', SECRET: 'S', 'TOP SECRET': 'TS' } as Record<string, string>)[c] ?? c,
  );
};

/**
 * The acts this host can't write yet, by id: an answer that isn't a marking (prose, for the engine to
 * read), a portion above the banner (the banner would need deriving again), and the authority block.
 * They aren't written, and the re-lint leaves their findings as Marque had them: the question stays open.
 * shortcut: the stand-in's limits; the engine re-derives the banner and the Word adapter writes the block.
 */
export function held(doc: Doc, state: State): Set<string> {
  const v = docView(doc, { ...state, linted: 0 });
  const top = level(textOf(v.document.artifacts.find((a) => a.kind === 'front_marking')?.derived_value));
  const out = new Set<string>();
  for (const f of v.findings) {
    const e = last(state, f.id);
    if (f.stale || (e?.act !== 'answered' && e?.act !== 'changed') || e.value == null) continue;
    const t = textOf(f.outcome?.result);
    if (!t || level(t) > top) out.add(f.id);
  }
  for (const a of v.document.artifacts)
    if (a.kind !== 'front_marking' && last(state, a.id)?.act === 'answered') out.add(a.id);
  return out;
}

/** The log without the last act on each id this host can't write. */
const writable = (doc: Doc, state: State): State => {
  const h = held(doc, state);
  return h.size ? { ...state, log: state.log.filter((e) => !h.has(e.id) || e !== last(state, e.id)) } : state;
};

/** The document as the person's acts make it, from Marque's own findings and the whole log: every act
 *  this host can write overlays, written or not. A pure function of the two, so it never builds on an earlier view. */
export const made = (doc: Doc, state: State): Doc => docView(doc, { ...writable(doc, state), linted: 0 });

/**
 * The lint after the host wrote what the person did. There's no engine yet, so this stands in for
 * one: an answer in force reads as applied and is the document's from now on; anything else (an
 * override, a deferral, a take-back, nothing) leaves Marque's finding as it was, since the pane
 * overlays those itself. Artifacts follow the findings, so a banner moves with the alternatives taken.
 * Always from Marque's first lint, never from the last re-lint: taking an alternative back restores
 * what it replaced. What blocks is what still needs a person.
 * shortcut: a stand-in for the engine's re-lint; it goes when the WASM engine lints the document.
 */
export function relint(doc: Doc, all: State): Doc {
  const state = writable(doc, all);
  const v = made(doc, all);
  const strip = <T extends Subject>({ person: _p, history: _h, applying: _a, stale: _s, ...x }: T): T => x as T;
  // An artifact is in once applied and out once removed, whatever its derived value has moved to since:
  // the overlay checks an apply against the value it was taken on, and an alternative taken moves it.
  const put = (a: ArtifactView): ArtifactView => {
    const e = last(state, a.id),
      x = strip(a);
    if (e?.act !== 'answered') return x;
    return e.value?.apply ? { ...x, state: 'present' } : e.value?.remove ? { ...x, state: 'absent_not_required' } : x;
  };
  const answer = (f: FindingView): boolean => {
    const e = last(state, f.id);
    return !f.stale && (e?.act === 'answered' || e?.act === 'changed') && e.value != null;
  };
  const findings = doc.findings.map((f, i) => {
    const x = v.findings[i]!;
    return answer(x) ? { ...strip(x), outcome: { ...x.outcome, ...(x.asked && { kind: 'applied' as const }) } } : f;
  });
  const artifacts = v.document.artifacts.map(put);
  const blocking = [...findings, ...artifacts]
    .filter((x) => x.needs_person === 'required' && x.blocks !== 'never')
    .map((x) => x.id);
  return { ...doc, findings, document: { ...v.document, artifacts, blocking, pending: [], withdrawn: [] } };
}
