// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

/// <reference types="office-js" />
/// <reference types="vite/client" />

/**
 * The Word task pane: real actions require the installation's trusted provider;
 * without one, the sample findings remain read-only.
 * Jump selects a finding's marking in the document; the cursor landing in a
 * paragraph with a finding opens its card (DECISIONS #8).
 *
 * Not yet: the engine (findings come from fixtures/, re-lints are a stand-in), the
 * authority block, help popovers and the lookup (their controls stay inert), the
 * inline marks (packages/word), Outlook.
 */

import '@knitli/marque-kit/theme.css';
import '@knitli/marque-kit/kit.css';
import { mount } from '@knitli/marque-kit';
import { button, el } from '@knitli/marque-kit/marking';
import { sameBasis } from '@knitli/marque-kit-core/state';
import type { Doc, State, Subject, Vocab } from '@knitli/marque-kit-core/types';
import findingsUrl from '../../../fixtures/memo.findings.json?url';
import vocabUrl from '../../../fixtures/memo.vocab.json?url';
import memo from '../../../fixtures/memo.txt?raw';
import { locate, paragraphAt, written } from './locate.ts';
import { banner, edits, made, relint, undoneSubject } from './write.ts';
import { isSameWordDocument } from './workspace.ts';
import type { OfficeCurrentEvaluation, OfficeWordSession } from './workspace.ts';

/** In dev, what the pane would say to a console it doesn't have goes to the dev server's .dev.log. */
const log = (event: 'error' | 'unhandled' | 'not the memo' | 'undone in Word', ...counts: number[]): void => {
  if (import.meta.env.DEV)
    void fetch('/__log', { method: 'POST', body: JSON.stringify([event, ...counts]) }).catch(() => {});
};
if (import.meta.env.DEV) {
  addEventListener('error', () => log('error'));
  addEventListener('unhandledrejection', () => log('unhandled'));
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
/** The fixture's spans mean something only in the unchanged fictional sample memo. */
const isMemo = (ps: string[]): boolean => {
  const same = says(ps, now.lines);
  if (!same) {
    const got = full(ps).map((i) => ps[i]),
      want = full(now.lines).map((i) => now.lines[i]);
    const k = got.findIndex((p, n) => p !== want[n]);
    log('not the memo', got.length, want.length, k);
  }
  return same;
};

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

/** The first-page header used only to confirm that the open Word document is the sample memo. */
const header = (ctx: Word.RequestContext): Word.Body =>
  ctx.document.sections.getFirst().getHeader('Primary').load('text');

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
  const installation = window.marqueOfficeWorkspace;
  if (installation) {
    let session: OfficeWordSession | null;
    let bound = false;
    try {
      session = await installation.provider.openWord(installation.wordHost);
      bound = !!session && (await isSameWordDocument(installation.wordHost, session));
    } catch {
      session = null;
    }
    if (session && sameBasis(session.doc.document.evaluation?.basis, session.basis) && bound) {
      mountWorkspace(session, installation.wordHost);
      return;
    }
  }
  const doc = (await (await fetch(findingsUrl)).json()) as Doc;
  const vocab = (await (await fetch(vocabUrl)).json()) as Vocab;
  const pane = mount(document.querySelector<HTMLElement>('#pane')!, {
    doc,
    vocab,
    readOnly: true,
    onJump: (f) => void jump(f),
  });
  now = layout(doc, pane.state);

  // Keep the disconnected state visible even while the sample memo's own note is hidden.
  const note = document.querySelector<HTMLElement>('#note')!;
  note.hidden = false;
  note.append(
    el(
      'p',
      'mq-p',
      'Sample mode only: no trusted workspace is connected. You can inspect and navigate the fictional findings; opening the sample creates a separate document and leaves this one unchanged.',
    ),
  );

  // Spans mean something only in the sample memo itself; the note stays read-only on any other document.
  const sample = document.querySelector<HTMLElement>('#sample')!;
  const show = (memo: boolean): boolean => {
    sample.hidden = memo;
    return memo;
  };
  const canCreateSample =
    Office.context.requirements.isSetSupported('WordApi', '1.3') &&
    Office.context.requirements.isSetSupported('WordApiHiddenDocument', '1.3');
  const sampleStatus = el('p', 'mq-p');
  sampleStatus.setAttribute('role', 'status');
  sample.append(
    el(
      'p',
      'mq-p',
      'These findings describe the fictional sample memo. Navigation works when that memo is open in Word.',
    ),
    button('act', 'Open sample in a new document', () => {
      if (!canCreateSample) {
        sampleStatus.textContent = 'This Word host cannot open the sample in a separate document.';
        return;
      }
      void Word.run(async (ctx) => {
        const created = ctx.application.createDocument();
        await ctx.sync();
        const [first = '', ...rest] = now.lines;
        created.body.insertText(first, 'Replace');
        for (const line of rest) created.body.insertParagraph(line, 'End');
        await ctx.sync();
        created.open();
        await ctx.sync();
      }).catch(() => {
        sampleStatus.textContent = 'Word could not open the sample in a separate document.';
      });
    }),
    ...(!canCreateSample
      ? [el('p', 'mq-p', 'Opening the sample separately requires WordApi 1.3 and WordApiHiddenDocument 1.3.')]
      : []),
    sampleStatus,
  );

  /** Word's undo took an act out of the document behind the pane's back: the act whose take-back
   *  makes the layout, body and banner, match the document again. Recorded as taken back, so the question comes back.
   *  Written or not: an answer the last re-lint applied no longer shows as the person's on the view. */
  const undone = (texts: string[], head: string): Subject | null => {
    const v = pane.view()!;
    return undoneSubject(pane.state, [...v.findings, ...v.document.artifacts], (hypothesis) => {
      const was = layout(doc, hypothesis);
      return says(texts, was.lines) && head === (was.banner ?? '');
    });
  };

  // Cursor-follow: the card for the paragraph the cursor is in comes up. Leaving it keeps the card open.
  const follow = async (): Promise<void> => {
    const { index, texts, head } = await selected();
    if (!says(texts, now.lines) || head !== (now.banner ?? '')) {
      const f = undone(texts, head);
      if (f) {
        log('undone in Word');
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

/** A real-document route: only the injected trusted provider owns history, writes and evaluation. */
function mountWorkspace(
  session: OfficeWordSession,
  wordHost: NonNullable<Window['marqueOfficeWorkspace']>['wordHost'],
): void {
  const note = document.querySelector<HTMLElement>('#note')!;
  note.hidden = false;
  note.append(
    el(
      'p',
      'mq-p',
      'This document is connected to its trusted workspace. Its answers and evaluation come from that workspace.',
    ),
  );
  const recovery = el('div', 'mq-pane-foot');
  recovery.setAttribute('role', 'status');
  const recoveryText = el('p', 'mq-p');
  let failedRequestIds = new Set<string>();
  let recoveryScanFailed = false;
  const retry = button('ghost', 'Retry document update', () => {
    if (recoveryScanFailed) {
      recoveryScanFailed = false;
      void session
        .pendingWrites()
        .then((entries) => {
          for (const entry of [...entries].sort((a, b) => a.sequence - b.sequence)) {
            if (entry.requestId) scheduleRecovery(entry.requestId);
          }
        })
        .catch(() => {
          recoveryScanFailed = true;
          recoveryText.textContent =
            'The workspace could not recover saved document work. Nothing was marked complete.';
        });
    }
    for (const requestId of failedRequestIds) scheduleRecovery(requestId);
  });
  retry.disabled = true;
  recovery.append(recoveryText, retry);
  note.append(recovery);
  let basis = session.basis;
  let queue = Promise.resolve();
  const pendingRecovery = new Set<string>();
  let pane!: ReturnType<typeof mount>;
  const stillBound = () => isSameWordDocument(wordHost, session);
  const applyPending = async (requestId: string): Promise<void> => {
    if (!(await stillBound())) throw new Error('Switch back to the document this action belongs to, then retry.');
    const entry = (await session.pendingWrites()).find((item) => item.requestId === requestId);
    if (!entry) return; // The provider has already durably completed its write and evaluation.
    if (
      entry.binding?.documentId !== session.documentId ||
      entry.binding.chain !== session.chain ||
      !entry.binding.basis ||
      !(await stillBound())
    )
      throw new Error('This pending action no longer matches the document and evaluation it was taken on.');
    const ack = await session.applyCommitted(requestId, wordHost);
    if (
      ack.requestId !== requestId ||
      ack.documentId !== session.documentId ||
      !sameBasis(ack.basis, entry.binding.basis) ||
      !(await stillBound())
    )
      throw new Error('The host acknowledgement does not match the saved action.');
    const current: OfficeCurrentEvaluation = await session.evaluateCurrent(wordHost);
    if (
      current.documentId !== session.documentId ||
      current.chain !== session.chain ||
      !sameBasis(current.doc.document.evaluation?.basis, current.basis) ||
      !(await stillBound())
    )
      throw new Error('The workspace did not return a current evaluation for this document.');
    if (current.confirmedWriteAcks[requestId] !== ack.acknowledgement)
      throw new Error('The current evaluation has not confirmed the host write.');
    basis = current.basis;
    pane.host.currentBasis = current.basis;
    pane.host.requiredWrites = [...current.requiredWrites];
    pane.host.requiredAcceptanceChecks = [...current.requiredAcceptanceChecks];
    pane.host.confirmedWrites = [...current.confirmedWrites];
    pane.host.acceptanceChecks = { ...current.acceptanceChecks };
    pane.update({
      doc: current.doc,
      actBinding: { documentId: session.documentId, chain: session.chain, basis: current.basis },
    });
  };
  function scheduleRecovery(requestId: string): void {
    if (pendingRecovery.has(requestId)) return;
    pendingRecovery.add(requestId);
    queue = queue
      .then(() => applyPending(requestId))
      .then(
        () => {
          failedRequestIds.delete(requestId);
          pendingRecovery.delete(requestId);
          if (!failedRequestIds.size && !recoveryScanFailed) {
            recoveryText.textContent = '';
            retry.disabled = true;
          }
        },
        () => {
          failedRequestIds.add(requestId);
          pendingRecovery.delete(requestId);
          recoveryText.textContent =
            'A saved action still needs a document update or fresh evaluation. It has not been marked complete.';
          retry.disabled = false;
        },
      );
  }
  pane = mount(document.querySelector<HTMLElement>('#pane')!, {
    doc: session.doc,
    state: session.state,
    vocab: session.vocab,
    engine: 'ok',
    currentBasis: basis,
    actBinding: { documentId: session.documentId, chain: session.chain, basis },
    requiredWrites: [...session.requiredWrites],
    requiredAcceptanceChecks: [...session.requiredAcceptanceChecks],
    confirmedWrites: [...session.confirmedWrites],
    acceptanceChecks: { ...session.acceptanceChecks },
    onJump: (subject) => {
      if (wordHost.jump)
        void stillBound().then(async (ok) => {
          if (ok) await wordHost.jump!(subject.id, session.documentId);
        });
    },
    onAppend: async (request) => {
      if (!(await stillBound())) throw new Error('The active Word document changed.');
      if (request.binding?.documentId !== session.documentId || request.binding.chain !== session.chain) {
        return { status: 'refused', reason: 'request-id-conflict', state: pane.state };
      }
      await session.stageAppend(structuredClone(request));
      if (!(await stillBound())) throw new Error('The active Word document changed after the intent was saved.');
      const result = await session.append(request);
      if (!(await stillBound())) throw new Error('The active Word document changed.');
      return result;
    },
    onChange(_state, act) {
      if (!act) return;
      scheduleRecovery(act.requestId);
    },
  });
  // Recover independently persisted committed work after a pane restart.
  void session
    .pendingWrites()
    .then((entries) => {
      for (const entry of [...entries].sort((a, b) => a.sequence - b.sequence)) {
        if (entry.requestId) scheduleRecovery(entry.requestId);
      }
    })
    .catch(() => {
      recoveryScanFailed = true;
      recoveryText.textContent = 'The workspace could not recover saved document work. Nothing was marked complete.';
      retry.disabled = false;
    });
}
