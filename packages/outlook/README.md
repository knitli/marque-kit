<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# @knitli/marque-kit-outlook

The Outlook adapter: marks in the compose body, classification headers, and the send gate.

**Not built yet.** This package is published to hold its name and version line; it exports nothing. For a working pane today, use [`@knitli/marque-kit`](https://www.npmjs.com/package/@knitli/marque-kit).

Planned (see [docs/COMPONENTS.md](https://github.com/knitli/marque-kit/blob/main/docs/COMPONENTS.md), "Mechanics in Outlook"):

- Marks as `<span data-mq>` in the compose HTML, stripped on send.
- Send is the gate: `OnMessageSend` holds the message. That handler may run without a DOM, so the gate will import `@knitli/marque-kit-core` only, never `@knitli/marque-kit`.
- Classification headers and the subject treated as places a marking appears: read, checked, written.
- Classification-label handling.

Part of the [Marque UI kit](https://github.com/knitli/marque-kit). Needs Node 24 or later.

## License

AGPL-3.0-only, or a Knitli commercial license. See [LICENSE.md](https://github.com/knitli/marque-kit/blob/main/LICENSE.md).
