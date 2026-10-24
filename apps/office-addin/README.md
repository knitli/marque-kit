<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense
-->

# Office add-in

The add-in a Word or Outlook user installs. It is an app, not a library: it ships the manifest and the task pane, and glues three things together in the user's own Office:

- **Office.js** reads the document or the message (text, selection, headers, the Purview label) and writes what the person decided. The host applies; the kit never does.
- **Marque's engine as WASM**, built and published from [knitli/marque-dev](https://github.com/knitli/marque-dev), lints the text in the pane. Spans are UTF-8 byte offsets into that text; mapping them to Word ranges is this app's job.
- **The kit** (`@marque/kit` in the pane, `@marque/kit-word` and `@marque/kit-outlook` in the document, `@marque/kit-core` in Outlook's send handler) shows the findings and records what the person did.

Not built yet: this directory holds the place. The first slice is the Word pane mounted on `fixtures/memo.findings.json`, with no engine, then selection-follow and jump, then the Word adapter.

Open questions it will answer:

- Whether classic Outlook's send runtime runs WebAssembly. If not, the gate works from the pane's last lint.
- The hosting page's Content Security Policy must allow WebAssembly to compile (`'wasm-unsafe-eval'`).
- Where the kit's state lives: document settings or a custom XML part in Word, item custom properties in Outlook.
