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

The sample route is read-only: the kit's pane shows the fictional memo findings (`fixtures/`) and never writes to the open document. Where `WordApi 1.3` and `WordApiHiddenDocument 1.3` are supported, **Open sample in a new document** creates a separate fictional memo; use Home → **Markings** there to navigate it. Other hosts keep the static sample view.

- **Jump.** When the fictional sample memo is open, selecting a row jumps to its marking in Word; for the missing portion mark, the start of ¶4. On another document, sample spans do not match and the pane does not edit it.
- **Cursor-follow** (DECISIONS #8). The cursor landing in a paragraph with a finding opens that finding's card, through the kit's `update({ open })`.

`src/locate.ts` turns the engine's UTF-8 byte spans into what Word can find: a paragraph, the text, and which occurrence of it. `test/locate.test.ts` holds it to the memo.

Without an installed trusted workspace provider, the pane is a read-only sample. Actions are not recorded or applied, and the optional sample button opens a separate document without changing the current one. The pane does not fall back to fixture relint for a real document.

## Trusted Word workspace integration

The Office route accepts an installation-injected `window.marqueOfficeWorkspace` with a `provider` and the actual Word host adapter. The provider opens a document-scoped session with an authoritative document/chain binding, state, current snapshot and basis. Before any append attempt, `stageAppend(request)` must durably capture that exact immutable intent; `append(request)` then atomically commits or returns its refusal, and retries use the same key. Staged intents are returned with session state for the pane's normal recovery path. The provider keeps committed writes recoverable through both Word acknowledgement and fresh evaluation, so a restart after a saved write acknowledgement resumes evaluation without applying the edit twice. The host adapter must revalidate the exact active document while applying a committed entry and return a typed acknowledgement. The pane checks the same document before and after each asynchronous boundary.

This repository contains the provider-neutral contract only. It has no authenticated workspace service or production Word adapter, so it cannot create a real session on its own. Do not use browser storage, document metadata, sidecars or a local file as a replacement workspace. `test/workspace.test.ts` uses an atomic filesystem-backed **LOCAL TEST** store across independent opens to exercise staged-intent recovery, append replay, concurrent appends, ordered write recovery, switched-document refusal and stale acknowledgements; it is not deployed storage and its fake host does not validate live Word behavior.

On every open, the provider includes the exact outstanding staged and refused requests in `session.state.pendingAppends` for the bound document and chain. The pane resumes those requests with their original keys.

The provider and Word host must be installed by the trusted host integration before the task pane starts. Without them, only the sample route is available. The Word manifest still targets localhost until a hosting destination is selected.

## Run it in Word

1. Trust a localhost certificate, once. This adds a certificate to your keychain, so it's yours to run:
   `npx office-addin-dev-certs install`
2. `pnpm dev` in this directory serves the pane at https://localhost:3000.
3. Sideload `manifest.xml`. On a Mac, copy it into `~/Library/Containers/com.microsoft.Word/Data/Documents/wef/` (make the folder if it isn't there) and restart Word. On Windows or Word on the web, upload it from Home → Add-ins → My Add-ins → Upload My Add-in.
4. In Word: Home → **Markings**.

In dev, the pane's errors, and a note when the document isn't the memo, go to `apps/office-addin/.dev.log` (git-ignored): inside Word there's no console to read them from.

`pnpm build` writes `dist/` for hosting; the manifest's URLs point at localhost until there is somewhere to host it.

Known limitations / Help wanted:

- Whether classic Outlook's send runtime runs WebAssembly. If not, the gate works from the pane's last lint.
- The hosting page's Content Security Policy must allow WebAssembly to compile (`'wasm-unsafe-eval'`).
- A trusted authenticated Word workspace provider and live Word adapter, including their identity, retention, deletion and concurrency guarantees.

## Read-only source marking

A separate trusted installation may provide `window.marqueOfficeSourceMarking` before the pane starts. Its session binds the active Word document, chain, source and revision, contribution, scope, and viewer to a permission-filtered native source view. The installation must supply the current binding independently, revoke it on any document, revision, selection, viewer or permission change before further results are shown, and read only that current source. The pane checks the active document and all binding fields around asynchronous reads, revokes old views on invalidation and ignores late replies. It displays only the disclosed marking; this capability does not authorize a document edit or establish CAB readiness.

This repository does not install that provider or authenticate a Word document or viewer. Without the separately supplied capability, no source marking is shown. The browser controls under `test/source-marking-browser/` use synthetic doubles and do not qualify a live Word or provider installation.

After the workspace build, run `node apps/office-addin/test/source-marking-browser/run.mjs` from the workspace root to check the built pane in headless Chrome. Set `CHROME_BIN` if Chrome is installed elsewhere. The runner starts its own local server and test-only Office capability; it needs loopback ports 46881 and 46882.
