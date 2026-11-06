<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# Office add-in

The add-in a Word or Outlook user installs. It is an app, not a library: it ships the manifest and the task pane, and glues three things together in the user's own Office:

- **Office.js** reads the document or the message (text, selection, headers, the Purview label) and writes what the person decided. The host applies; the kit never does.
- **Marque's engine** runs in the pane and lints the text there. Spans are UTF-8 byte offsets into that text; mapping them to Word ranges is this app's job.
- **The kit** (`@knitli/marque-kit` in the pane, `@knitli/marque-kit-word` and `@knitli/marque-kit-outlook` in the document, `@knitli/marque-kit-core` in Outlook's send handler) shows the findings and records what the person did.

## What works

The first slice, in Word only and with no engine: the kit's pane on the sample memo's findings (`fixtures/`).

- **Insert the sample memo.** The fixture's spans are offsets into `memo.txt`, so they mean something only in a document that is the memo. Until it is, the pane says so and offers to put it in, with the fixes Marque wrote (¶2, ¶5, ¶6) written in, as a host would: the pane never says "Changed" about text the document doesn't have. `written()` moves each span to match.
- **Jump.** Opening a row selects its marking in the document; for the missing portion mark, the start of ¶4.
- **Cursor-follow** (DECISIONS #8). The cursor landing in a paragraph with a finding opens that finding's card, through the kit's `update({ open })`.

`src/locate.ts` turns the engine's UTF-8 byte spans into what Word can find: a paragraph, the text, and which occurrence of it. `test/locate.test.ts` holds it to the memo.

Not yet: an engine; applying an answer to the document (an answer stays pending, as the kit shows it); help popovers and the vocabulary lookup (their controls are inert); the inline marks (`packages/word`); Outlook.

## Run it in Word

1. Trust a localhost certificate, once. This adds a certificate to your keychain, so it's yours to run:
   `npx office-addin-dev-certs install`
2. `pnpm dev` in this directory serves the pane at https://localhost:3000.
3. Sideload `manifest.xml`. On a Mac, copy it into `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/` (make the folder if it isn't there) and restart Word. On Windows or Word on the web, upload it from Home → Add-ins → My Add-ins → Upload My Add-in.
4. In Word: Home → **Markings**.

In dev, the pane's errors, and a note when the document isn't the memo, go to `apps/office-addin/.dev.log` (git-ignored): inside Word there's no console to read them from.

Word drops the empty paragraphs it is given, so the memo's blank lines don't survive the insert. The pane matches the memo and the document on the paragraphs with text in them.

`pnpm build` writes `dist/` for hosting; the manifest's URLs point at localhost until there is somewhere to host it.

Known limitations / Help wanted:

- Whether classic Outlook's send runtime runs WebAssembly. If not, the gate works from the pane's last lint.
- The hosting page's Content Security Policy must allow WebAssembly to compile (`'wasm-unsafe-eval'`).
- Where the kit's state lives: document settings or a custom XML part in Word, item custom properties in Outlook.
