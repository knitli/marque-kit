// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: AGPL-3.0-only

// The memo with paragraph 3 turned back into a question (three readings and a fallback). The memo
// fixture now applies that correction itself, so the flow tests that need a question put this one in.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Doc, FindingView } from '../src/types.ts';

// By path: under happy-dom, URL is the page's, and won't open a file.
export const CHOICES_ID = 'f-p3-ownership';

export const choicesFinding = (): FindingView =>
  JSON.parse(readFileSync(join(import.meta.dirname, 'choices-finding.json'), 'utf8')) as FindingView;

export const withChoices = (doc: Doc): Doc => ({
  ...doc,
  document: { ...doc.document, blocking: [CHOICES_ID, ...doc.document.blocking] },
  findings: doc.findings.map((x) => (x.id === CHOICES_ID ? choicesFinding() : x)),
});
