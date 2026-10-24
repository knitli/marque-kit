// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/// <reference types="office-js" />
/// <reference types="vite/client" />

/**
 * The Word task pane, first slice: the kit's pane on the sample memo's findings,
 * with no engine. Jump selects a finding's marking in the document; the cursor
 * landing in a paragraph with a finding opens its card (DECISIONS #8).
 *
 * Not yet: an engine (findings come from fixtures/), applying an answer to the
 * document, help popovers and the lookup (their controls stay inert), the inline
 * marks (packages/word), Outlook.
 */

import '@marque/kit/theme.css';
import '@marque/kit/kit.css';
import { mount } from '@marque/kit';
import { button, el } from '@marque/kit/marking';
import type { Doc, Subject, Vocab } from '@marque/kit-core/types';
import findingsUrl from '../../../fixtures/memo.findings.json?url';
import vocabUrl from '../../../fixtures/memo.vocab.json?url';
import memo from '../../../fixtures/memo.txt?raw';
import { locate, paragraphAt, written } from './locate.ts';

/** The memo as a host would have it: with the fixes Marque wrote (applied, or the safe reading
 *  chosen over the author's) written in, and each finding's span moved to match. Set at ready. */
let memoDoc: { lines: string[]; at: (span: [number, number]) => [number, number] } = { lines: [], at: (s) => s };

/** The document's paragraphs as text: what the engine will read, joined by "\n". */
const paragraphs = (): Promise<string[]> =>
  Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs.load('items/text');
    await ctx.sync();
    return ps.items.map((p) => p.text);
  });

/** The fixture's spans are offsets into memo.txt: they mean something only in a document that is the memo. */
const isMemo = (ps: string[]): boolean => ps.join('\n') === memoDoc.lines.join('\n');

/** Replace the document with the memo, Marque's fixes written in, a paragraph per line. */
const insertMemo = (): Promise<void> =>
  Word.run(async (ctx) => {
    const body = ctx.document.body;
    body.clear();
    const [first = '', ...rest] = memoDoc.lines;
    body.paragraphs.getFirst().insertText(first, 'Replace');
    for (const l of rest) body.insertParagraph(l, 'End');
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
    const [start, end] = memoDoc.at(span);
    const at = locate(texts, f.anchor?.kind === 'portion' ? [start, start] : [start, end]);
    const p = at && ps.items[at.paragraph];
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
const selected = (): Promise<{ index: number; texts: string[] }> =>
  Word.run(async (ctx) => {
    const sel = ctx.document.getSelection();
    const ps = ctx.document.body.paragraphs.load('items/text');
    await ctx.sync();
    // shortcut: one comparison per paragraph on every selection change; fine for a memo, slow for a long
    // document. The Word adapter's content controls (packages/word) will say which finding the cursor is in.
    const where = ps.items.map((p) => p.getRange('Whole').compareLocationWith(sel));
    await ctx.sync();
    const index = where.findIndex((r) => ['Contains', 'Equal', 'ContainsStart'].includes(r.value));
    return { index, texts: ps.items.map((p) => p.text) };
  });

void Office.onReady(async (info) => {
  if (info.host !== Office.HostType.Word) return;
  const doc = (await (await fetch(findingsUrl)).json()) as Doc;
  const fixed = written(
    memo,
    doc.findings.flatMap((f) =>
      f.anchor?.span && f.outcome?.result && (f.outcome.kind === 'applied' || f.outcome.kind === 'chosen_over')
        ? [{ span: f.anchor.span, result: f.outcome.result.text }]
        : [],
    ),
  );
  memoDoc = { lines: fixed.text.replace(/\n$/, '').split('\n'), at: fixed.at };
  const vocab = (await (await fetch(vocabUrl)).json()) as Vocab;
  const all = (): Subject[] => [...doc.findings, ...doc.document.artifacts];

  const pane = mount(document.querySelector<HTMLElement>('#pane')!, { doc, vocab, onJump: (f) => void jump(f) });

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

  // Cursor-follow: the card for the paragraph the cursor is in comes up. Leaving it keeps the card open.
  const follow = async (): Promise<void> => {
    const { index, texts } = await selected();
    if (!show(isMemo(texts))) return;
    const f = all().find((x) => x.anchor?.span && paragraphAt(texts, memoDoc.at(x.anchor.span)[0]) === index);
    if (f && f.id !== pane.host.open) pane.update({ open: f.id });
  };

  show(isMemo(await paragraphs()));
  Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, () => {
    void follow();
  });
});
