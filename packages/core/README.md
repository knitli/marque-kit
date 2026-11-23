<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# @knitli/marque-kit-core

The Marque UI kit's logic with no DOM: the finding contract as types, the state log, the five rungs, markings as structure and as HTML strings, and readers for the engine's native wire. It runs where a page can't: on a server, or in Outlook's send handler. It never touches `document` or `window`.

Most hosts use it through [`@knitli/marque-kit`](https://www.npmjs.com/package/@knitli/marque-kit). Use it directly to render markings on a server, to decide what blocks without a DOM, or to type a host against the contract. No runtime dependencies. Needs Node 24 or later.

```sh
pnpm add @knitli/marque-kit-core
```

## Exports

| Import | What it gives you |
|---|---|
| `@knitli/marque-kit-core/types` | The contract as types: `Finding`, `Artifact`, `Doc`, `State`, `LogEntry`, `Vocab`, `Host`, and the rest. A slot the engine emits is named here first. |
| `@knitli/marque-kit-core/attention` | `rung()`: which of the five rungs a finding sits on, from `needs_person` × `blocks` × the host's moment. `sections()` sorts a document into the pane's four sections; `markClass()` gives a finding's inline-mark shape. |
| `@knitli/marque-kit-core/state` | The kit's state: an append-only log of what the person did, keyed by finding id. `appendAct()` checks a request before it is ordered; `view()` and `docView()` overlay the log on Marque's findings. The host persists it; it never goes on Marque's wire. |
| `@knitli/marque-kit-core/marking` | `parse()`, `tree()` (the marking's structure), `html()` (the same as an escaped HTML string), `spoken()` (what a screen reader says), `masked()`. |
| `@knitli/marque-kit-core/native-wire` | Types and bounded JSON parsers for the engine's native envelopes: evaluations, semantic results, source markings, evaluation bases. |
| `@knitli/marque-kit-core/native-cab` | `readCabSnapshot()`: one classification authority block snapshot, checked against a host-supplied target and current basis. |
| `@knitli/marque-kit-core/native-results` | `readNativeSemanticResults()`: semantic results disclosed under a host-authenticated grant for one viewer, document and revision. |

The native readers check scope and currentness that the host supplies; they do not authenticate the host or the engine.

## A marking from a server

`html()` writes the structure the kit's `render()` builds, as a string with classes and attributes only. It needs no script and no inline style, so it works under a strict Content Security Policy:

```js
// on the server (Node 24 or later; no DOM)
import { html } from '@knitli/marque-kit-core/marking';
const cell = `<td>${html('(S//REL TO USA, GBR)', { help: ['REL TO', 'GBR'] })}</td>`;
```

Serve the kit's `theme.css` and `kit.css` from your own origin, and put the markings inside `.mq` or an element with `data-mq-theme="light"`. Without script, a marking still never breaks inside a token. Where script runs, the kit's `enhance()` stacks markings that wrap; see [`@knitli/marque-kit`](https://www.npmjs.com/package/@knitli/marque-kit).

## The rung

```js
import { rung } from '@knitli/marque-kit-core/attention';
rung({ needs_person: 'required', blocks: 'finalize' }, 'editing');  // 'action'
rung({ needs_person: 'required', blocks: 'finalize' }, 'finalize'); // 'blocking'
```

The engine never emits a rung, and severity never sets one. The full table is [docs/DERIVATION.md](https://github.com/knitli/marque-kit/blob/main/docs/DERIVATION.md); the contract is [docs/CONTRACT.md](https://github.com/knitli/marque-kit/blob/main/docs/CONTRACT.md).

## License

AGPL-3.0-only, or a Knitli commercial license. See [LICENSE.md](https://github.com/knitli/marque-kit/blob/main/LICENSE.md).
