<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# Contributing

Thanks for your interest. This project is dual-licensed (AGPL-3.0-only or a Knitli commercial license; see [LICENSE.md](LICENSE.md)), which shapes how contributions are accepted.

## Bug reports and issues

Bug reports, reproduction cases, and design feedback are welcome and require no agreement. Please open an issue.

## Code contributions

Knitli can only offer contributions commercially if it holds the rights to do so. Every code contributor must therefore sign Knitli's Contributor License Agreement (CLA) — adapted from the Imprint CLA — before a pull request can be merged. The CLA grants Knitli the right to distribute your contribution under both the AGPL-3.0-only and Knitli's commercial license. You retain copyright in your contribution.

The CLA text lives in [CLA.md](CLA.md). By submitting code, docs, or anything else to this repository, you agree to it.

By submitting a contribution after signing the CLA, you agree it may be distributed under AGPL-3.0-only and under Knitli's commercial license.

## Trademarks

Contributions do not grant any right to use the Marque, Knitli, or Imprint marks. See [TRADEMARK.md](TRADEMARK.md).

## Development

```sh
pnpm check   # format, lint and typecheck
pnpm test    # every package
pnpm build   # each package's dist/
```

Every file carries an SPDX header (`AGPL-3.0-only`); CI runs `reuse lint`.
