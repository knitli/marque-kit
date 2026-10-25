// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * What the document should say, from the pane's view of it. The host applies:
 * every fix Marque wrote and every answer the person gave is an edit to the memo
 * as written, and the document is the memo with those edits in. Taking an act
 * back takes its edit out, so the text goes back with the question.
 */

import { docView } from '@marque/kit-core/state';
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

/** The banner the document carries: Marque's derived value once it's applied, or none. */
export function banner(view: Doc): string | null {
  const a = view.document.artifacts.find((x: ArtifactView) => x.kind === 'front_marking');
  return a && (a.applying || a.state === 'present') ? textOf(a.derived_value) : null;
}

/**
 * The lint after the host wrote what the person did. There's no engine yet, so this stands in for
 * one, as the demo's does: what was written is now the document's, an answer reads as applied, and
 * what blocks is what still needs a person.
 * shortcut: a stand-in for the engine's re-lint; it goes when the WASM engine lints the document.
 */
export function relint(applied: Doc, state: State): Doc {
  const v = docView(applied, state);
  const strip = <T extends Subject>({ person: _p, history: _h, applying, ...x }: T): T =>
    (applying
      ? { ...x, state: (x as ArtifactView).state === 'present_not_required' ? 'absent_not_required' : 'present' }
      : x) as T;
  const settled = (f: FindingView): FindingView =>
    f.asked ? { ...strip(f), outcome: { ...f.outcome, kind: 'applied' } } : strip(f);
  const blocking = [...v.findings, ...v.document.artifacts]
    .filter((x) => x.needs_person === 'required' && x.blocks !== 'never')
    .map((x) => x.id);
  return {
    ...v,
    findings: v.findings.map(settled),
    document: { ...v.document, artifacts: v.document.artifacts.map(strip), blocking, pending: [], withdrawn: [] },
  };
}
