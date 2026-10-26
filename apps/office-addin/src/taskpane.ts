// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/// <reference types="office-js" />
/// <reference types="vite/client" />

/**
 * The Word task pane: the kit's pane on the sample memo's findings, with no engine.
 * Jump selects a finding's marking in the document; the cursor landing in a
 * paragraph with a finding opens its card (DECISIONS #8). What the person does is
 * written into the document, the banner into the header and footer, and the pane
 * re-lints; taking an act back takes its text out again. Word's own undo of an
 * answer is noticed and recorded as the answer taken back.
 *
 * Not yet: an engine (findings come from fixtures/, re-lints are a stand-in), the
 * authority block, help popovers and the lookup (their controls stay inert), the
 * inline marks (packages/word), Outlook.
 */

import '@marque/kit/theme.css';
import '@marque/kit/kit.css';
import { mount } from '@marque/kit';
import { button, el } from '@marque/kit/marking';
import { record, snapshot } from '@marque/kit-core/state';
import type { Doc, State, Subject, Vocab } from '@marque/kit-core/types';
import findingsUrl from '../../../fixtures/memo.findings.json?url';
import vocabUrl from '../../../fixtures/memo.vocab.json?url';
import memo from '../../../fixtures/memo.txt?raw';
import { locate, paragraphAt, written } from './locate.ts';
import { banner, edits, held, made, relint } from './write.ts';

/** In dev, what the pane would say to a console it doesn't have goes to the dev server's .dev.log. */
const log = (...what: unknown[]): void => {
  if (import.meta.env.DEV) void fetch('/__log', { method: 'POST', body: JSON.stringify(what) }).catch(() => {});
};
if (import.meta.env.DEV) {
  addEventListener('error', (e) => log('error', String(e.error ?? e.message)));
  addEventListener('unhandledrejection', (e) => log('unhandled', String(e.reason)));
}

/** The memo as the document should have it: its lines with every edit in, and each finding's span moved to match. */
interface Layout {
  lines: string[];
  at: (span: [number, number]) => [number, number];
  banner: string | null;
}
const layout = (doc: Doc, state: State): Layout => {
  const w = written(memo, edits(made(doc, state), memo));
  return { lines: w.text.replace(/\n$/, '').split('\n'), at: w.at, banner: banner(relint(doc, state)) };
};
let now: Layout = { lines: [], at: (s) => s, banner: null };

/** The document's paragraphs as text: what the engine will read, joined by "\n". */
const paragraphs = (): Promise<string[]> =>
  Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs.load('items/text');
    await ctx.sync();
    return ps.items.map((p) => p.text);
  });

/** The paragraphs with text in them, by index. Word drops the empty paragraphs it is given (the memo's
 *  blank lines), so the memo and the document are matched on these: the k-th in one is the k-th in the other. */
const full = (ps: string[]): number[] => ps.flatMap((p, i) => (p.trim() ? [i] : []));
/** A memo line's paragraph in the document, and a document paragraph's line in the memo; -1 for none. */
const toWord = (texts: string[], line: number): number => full(texts)[full(now.lines).indexOf(line)] ?? -1;
const toMemo = (texts: string[], index: number): number => full(now.lines)[full(texts).indexOf(index)] ?? -1;

/** Does the document say what these lines say? */
const says = (ps: string[], lines: string[]): boolean => {
  const got = full(ps).map((i) => ps[i]),
    want = full(lines).map((i) => lines[i]);
  return got.length === want.length && got.every((p, k) => p === want[k]);
};
/** The fixture's spans mean something only in a document that is the memo, as edited here. */
const isMemo = (ps: string[]): boolean => {
  const same = says(ps, now.lines);
  if (!same) {
    const got = full(ps).map((i) => ps[i]),
      want = full(now.lines).map((i) => now.lines[i]);
    const k = got.findIndex((p, n) => p !== want[n]);
    log('not the memo', { paragraphs: got.length, want: want.length, first: k, got: got[k], expected: want[k] });
  }
  return same;
};

/** The banner, top and bottom of every page: each section's headers and footers, first-page and even-page
 *  ones too, centered. Cleared when there's none. */
const setBanner = async (ctx: Word.RequestContext, text: string | null): Promise<void> => {
  const ss = ctx.document.sections.load('items');
  await ctx.sync();
  for (const s of ss.items)
    for (const type of ['Primary', 'FirstPage', 'EvenPages'] as const)
      for (const part of [s.getHeader(type), s.getFooter(type)]) {
        if (!text) part.clear();
        else part.insertText(text, 'Replace').paragraphs.getFirst().alignment = 'Centered';
      }
};

/** The banner as the document has it: the first section's header. */
const header = (ctx: Word.RequestContext): Word.Body =>
  ctx.document.sections.getFirst().getHeader('Primary').load('text');

/** Replace the document with the memo as it stands, a paragraph per line, and its banner. */
const insertMemo = (): Promise<void> =>
  Word.run(async (ctx) => {
    const body = ctx.document.body;
    body.clear();
    const [first = '', ...rest] = now.lines;
    body.paragraphs.getFirst().insertText(first, 'Replace');
    for (const l of rest) body.insertParagraph(l, 'End');
    await setBanner(ctx, now.banner);
    await ctx.sync();
  });

/** The part of `b` that differs from `a`: a's middle, b's middle, and where a's starts. */
const differs = (a: string, b: string): { was: string; is: string; at: number } => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return { was: a.slice(i, a.length - j), is: b.slice(i, b.length - j), at: i };
};

/** Write what changed from one layout to the next: in each paragraph, only the part that differs. A
 *  paragraph that already says the new line (Word's own undo put it there) is left alone. A document
 *  that says neither isn't the memo as the pane knows it: nothing is written, and the act stays pending. */
const write = (from: Layout, to: Layout): Promise<void> =>
  Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs.load('items/text');
    await ctx.sync();
    const texts = ps.items.map((p) => p.text);
    if (!says(texts, from.lines) && !says(texts, to.lines)) throw new Error('the document is not the memo');
    for (const [line, next] of to.lines.entries()) {
      const p = ps.items[toWord(texts, line)];
      const prev = from.lines[line] ?? '';
      if (!p || next === prev || p.text === next) continue;
      const d = differs(prev, next);
      // shortcut: an insertion, or a change longer than Word's 255-character search, rewrites the paragraph's
      // text whole. The Word adapter's content controls (packages/word) will hold each marking's range.
      if (!d.was || d.was.length > 255) {
        p.insertText(next, 'Replace');
        continue;
      }
      let nth = 0;
      for (let k = prev.indexOf(d.was); k !== -1 && k < d.at; k = prev.indexOf(d.was, k + 1)) nth++;
      const hits = p.search(d.was, { matchCase: true }).load('items');
      await ctx.sync();
      const r = hits.items[nth];
      if (!r) p.insertText(next, 'Replace');
      else if (d.is) r.insertText(d.is, 'Replace');
      else r.delete();
    }
    if (from.banner !== to.banner) await setBanner(ctx, to.banner);
    await ctx.sync();
  });

/** Select a finding's marking, or the start of its paragraph when nothing is written there. */
const jump = (f: Subject): Promise<void> =>
  Word.run(async (ctx) => {
    const span = f.anchor?.span;
    if (!span) return; // the banner and the authority block have no place in the body yet
    const ps = ctx.document.body.paragraphs.load('items/text');
    await ctx.sync();
    const texts = ps.items.map((p) => p.text);
    if (!isMemo(texts)) return;
    const [start, end] = now.at(span);
    const at = locate(now.lines, f.anchor?.kind === 'portion' ? [start, start] : [start, end]);
    const p = at && ps.items[toWord(texts, at.paragraph)];
    if (!at || !p) return;
    if (!at.text) {
      p.getRange('Start').select();
      return await ctx.sync();
    }
    // shortcut: Word's search takes at most 255 characters; a longer marking selects its paragraph instead.
    if (at.text.length > 255) {
      p.select();
      return await ctx.sync();
    }
    const hits = p.search(at.text, { matchCase: true }).load('items');
    await ctx.sync();
    hits.items[at.nth]?.select();
    await ctx.sync();
  });

/** The index of the paragraph the selection starts in, or -1. */
const selected = (): Promise<{ index: number; texts: string[]; head: string }> =>
  Word.run(async (ctx) => {
    const sel = ctx.document.getSelection();
    const ps = ctx.document.body.paragraphs.load('items/text');
    const h = header(ctx);
    await ctx.sync();
    // shortcut: one comparison per paragraph on every selection change; fine for a memo, slow for a long
    // document. The Word adapter's content controls (packages/word) will say which finding the cursor is in.
    const where = ps.items.map((p) => p.getRange('Whole').compareLocationWith(sel));
    await ctx.sync();
    const index = where.findIndex((r) => ['Contains', 'Equal', 'ContainsStart'].includes(r.value));
    return { index, texts: ps.items.map((p) => p.text), head: h.text.trim() };
  });

void Office.onReady(async (info) => {
  if (info.host !== Office.HostType.Word) return;
  const doc = (await (await fetch(findingsUrl)).json()) as Doc;
  const vocab = (await (await fetch(vocabUrl)).json()) as Vocab;
  // One write at a time, in the order the person acted. What each writes, and the re-lint after it,
  // come from Marque's findings and the log as of that act, never from an earlier re-lint.
  let queue = Promise.resolve();

  const pane = mount(document.querySelector<HTMLElement>('#pane')!, {
    doc,
    vocab,
    onJump: (f) => void jump(f),
    onChange(state: State, act) {
      if (!act) return; // only the seen list moved
      // The host applies: write the act into the document, then re-lint, so the card says done
      // only once the text is there. A failed write leaves the act pending, as the kit shows it.
      const to = layout(doc, state);
      queue = queue
        .then(() => write(now, to))
        .then(() => {
          now = to;
          note.hidden = !held(doc, state).size;
          pane.update({ doc: relint(doc, state), linted: state.log.length });
        })
        .catch((e: unknown) => log('write failed', String(e)));
    },
  });
  now = layout(doc, pane.state);

  // What this pane can't write yet goes back to its question; this says why, rather than leave it unexplained.
  const note = document.querySelector<HTMLElement>('#note')!;
  note.append(
    el(
      'p',
      'mq-p',
      'This sample pane can’t write every answer yet: one that isn’t a marking, a typed portion mark with more than its level or above the banner’s, or the authority block. Those questions stay open.',
    ),
  );

  // Spans mean something only in the memo itself: while the document isn't the memo, say so and offer it.
  // Kept in step on every selection change (typing is one) from the text cursor-follow reads anyway.
  const sample = document.querySelector<HTMLElement>('#sample')!;
  const show = (memo: boolean): boolean => {
    sample.hidden = memo;
    return memo;
  };
  sample.append(
    el('p', 'mq-p', 'These are the sample memo’s findings. Put the memo in this document to follow them here.'),
    button('act', 'Insert the sample memo', () => {
      void insertMemo()
        .then(paragraphs)
        .then((ps) => show(isMemo(ps)));
    }),
  );

  /** Word's undo took an act out of the document behind the pane's back: the act whose take-back
   *  makes the layout, body and banner, match the document again. Recorded as taken back, so the question comes back.
   *  Written or not: an answer the last re-lint applied no longer shows as the person's on the view. */
  const undone = (texts: string[], head: string): Subject | null => {
    const v = pane.view()!;
    for (const id of new Set([...pane.state.log].reverse().map((e) => e.id))) {
      const f = [...v.findings, ...v.document.artifacts].find((x) => x.id === id);
      const was = f && layout(doc, record(pane.state, id, 'changed', null, undefined, snapshot(f)));
      if (was && says(texts, was.lines) && head === (was.banner ?? '')) return f;
    }
    return null;
  };

  // Cursor-follow: the card for the paragraph the cursor is in comes up. Leaving it keeps the card open.
  const follow = async (): Promise<void> => {
    const { index, texts, head } = await selected();
    if (!says(texts, now.lines) || head !== (now.banner ?? '')) {
      const f = undone(texts, head);
      if (f) {
        log('undone in Word', f.id);
        pane.host.onAct?.(f, 'changed', null);
        return;
      }
    }
    if (!show(isMemo(texts))) return;
    const line = toMemo(texts, index);
    const v = pane.view()!;
    const f = [...v.findings, ...v.document.artifacts].find(
      (x) => x.anchor?.span && paragraphAt(now.lines, now.at(x.anchor.span)[0]) === line,
    );
    if (f && f.id !== pane.host.open) pane.update({ open: f.id });
  };

  show(isMemo(await paragraphs()));
  Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, () => {
    void follow();
  });
});
