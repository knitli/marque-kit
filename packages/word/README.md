<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# @knitli/marque-kit-word

The Word adapter: inline marks in the document, and the pane following the selection.

**Not built yet.** This package is published to hold its name and version line; it exports nothing. For a working pane today, use [`@knitli/marque-kit`](https://www.npmjs.com/package/@knitli/marque-kit).

Planned (see [docs/COMPONENTS.md](https://github.com/knitli/marque-kit/blob/main/docs/COMPONENTS.md), "Mechanics in Word"):

- A content control per marked span, tagged `mq:<finding id>` and titled in words.
- The shape as an underline style. Word has no underline color, so the shape carries the meaning alone.
- The pane follows the selection.
- Every mark reversible: the original formatting is recorded and restored.
- The kit's state persisted with the document, and classification-label handling.

It needs finding ids that stay stable across re-lints. Today the Word pane lives in the repo's private Office add-in (`apps/office-addin`), which draws no inline marks.

Part of the [Marque UI kit](https://github.com/knitli/marque-kit). Needs Node 24 or later.

## License

AGPL-3.0-only, or a Knitli commercial license. See [LICENSE.md](https://github.com/knitli/marque-kit/blob/main/LICENSE.md).
