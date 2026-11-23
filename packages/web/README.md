<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# @knitli/marque-kit-web

The web adapter: inline marks on a page's own text.

**Not built yet.** This package is published to hold its name and version line; it exports nothing. For a working pane today, use [`@knitli/marque-kit`](https://www.npmjs.com/package/@knitli/marque-kit).

Planned (see [docs/COMPONENTS.md](https://github.com/knitli/marque-kit/blob/main/docs/COMPONENTS.md), "Inline mark"):

- The four shapes drawn on the host's own text with the CSS Custom Highlight API, one highlight per shape class from core's `markClass()`.
- Where that API is missing, an overlay positioned from `Range.getClientRects()`.
- Nothing inserted into the host's text for a mark.

Part of the [Marque UI kit](https://github.com/knitli/marque-kit). Needs Node 24 or later.

## License

AGPL-3.0-only, or a Knitli commercial license. See [LICENSE.md](https://github.com/knitli/marque-kit/blob/main/LICENSE.md).
