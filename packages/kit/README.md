<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# @knitli/marque-kit

The Marque UI kit: the finding card, the decision prompt, the pane, the finalize gate, the derivation panel, the audit receipt, help in three tiers, and the theme layer. It turns Marque's findings into one of five rungs of attention and shows each with a shape, not just a color.

TypeScript and plain CSS. No framework. Its only dependency is [`@knitli/marque-kit-core`](https://www.npmjs.com/package/@knitli/marque-kit-core), the same project's DOM-free half. Needs Node 24 or later where it is installed and a DOM where it runs.

```sh
pnpm add @knitli/marque-kit
```

## Exports

| Import | What it gives you |
|---|---|
| `@knitli/marque-kit` | `mount()`: the pane wired to the kit's state, the one call most hosts need. Also each component on its own: `card`, `row`, `pane`, `status`, `artifact`, `gate`, `derivation`, `receipt`; and `rung`, `markClass`, `sections` from core. |
| `@knitli/marque-kit/marking` | `render()` a marking as DOM, `settle()` to stack one that wraps, `enhance()` for markings a server wrote with core's `html()`, `unfold()`, `relabel()`; core's pure marking functions, re-exported. |
| `@knitli/marque-kit/help` | Help in three tiers (`tip`, `explain`, `why`, `passage`), the vocabulary `lookup`, `tips()` for tier-1 help on server markup, and `float()` for popovers. Renders the engine's help text; writes none of its own. |
| `@knitli/marque-kit/theme` | The theme gate: `check()` measures a root's `--mq-*` tokens against the contrast and size floors (`PAIRS`, `SIZES`); `watch()` re-checks. |
| `@knitli/marque-kit/theme.css` | The tokens (light default, `dark`, `auto`), the fit rules, the four shapes, print and forced colors. |
| `@knitli/marque-kit/kit.css` | The components, built only on `theme.css`. |

## Mount the pane

Load both stylesheets, then mount into an element:

```js
import '@knitli/marque-kit/theme.css';
import '@knitli/marque-kit/kit.css';
```

A host connects the pane to its trusted workspace. `trustedWorkspace` below is the host's own storage adapter, not an API supplied by this kit:

```js
import { mount } from '@knitli/marque-kit';
const state = await trustedWorkspace.loadState(documentId);
const p = mount(el, {
  doc,
  state,
  actBinding: await trustedWorkspace.currentActBinding(documentId),
  vocab,
  moment: 'editing',
  onAppend: async (request) => {
    // Persist the exact request before attempting its ordered append, so an uncertain outcome
    // can be retried after a pane restart with the same requestId.
    await trustedWorkspace.stageAppend(documentId, request);
    // The workspace atomically consumes the staged row with the checked result.
    // On commit it also persists a recoverable write-outbox item before returning;
    // on refusal it retains the unsequenced request and returns the refusal without writing.
    const result = await trustedWorkspace.append(documentId, request);
    return result; // { status: 'committed', state, entry, replayed } or { status: 'refused', state, reason, pending? }
  },
  onChange: (state, notice) => {
    if (notice) {
      // Run/recover only this request's still-pending write. The host deduplicates
      // by requestId, acknowledges the real write, then evaluates the document.
      void trustedWorkspace.resumePendingWrite(documentId, notice.requestId, notice.entry);
    } else {
      // Bookkeeping such as `seen`; committed state was already persisted by append.
      void trustedWorkspace.saveState(documentId, state);
    }
  },
  onHelp,
  onJump,
});
p.update({ doc });              // after a re-lint; async hosts add { linted: n, seq }
p.update({ moment: 'finalize' }); // the host's moment; the kit never guesses it
p.update({ open: id });         // an Office host's cursor in a marking: its card opens, focus stays put
p.destroy();                    // when the pane goes away
```

The trusted workspace must keep committed history, pending refusals, and the write outbox private to that host. A refused request stays outside ordered history; the same request key can be retried after the host repairs unknown history, while sequence exhaustion is terminal for that chain. A replay reports the original entry with `replayed: true`; the host resumes only its still-pending write by `requestId`, and does not create a second log row. A physical write is not confirmed until the host acknowledges it and a fresh evaluation reflects it. Do not store this interaction log in document metadata, a seal or a portable sidecar.

The repo's demo uses the same checked append helper over an in-memory variable so a normal answer can be demonstrated. Its state resets on reload and is not a trusted durable workspace. `@knitli/marque-kit/help` has what a host needs to answer `onHelp` and `onLookup`. The contract's types and state log are `@knitli/marque-kit-core/types` and `@knitli/marque-kit-core/state`. At mount the kit measures the host's `--mq-*` tokens against the contrast and size floors (`@knitli/marque-kit/theme`); a failing token falls back to the shipped value, and the report is `p.theme` and `onTheme(report)`. Under forced colors the system palette stands and only sizes and the mark font are measured. When the room the host gives the pane is under 240px, the report says `narrow: true` and the kit shows rows only: opening one calls `onOpen(f)` for the host to show it its own way.

## Theme

Hosts may set any `--mq-*` token on the kit root (`.mq`). Light is the default; put `data-mq-theme="dark"` or `"auto"` on the root, not on `<html>`, to opt in. Hosts may not change the rungs, the shapes' meanings, the fit rules, the free answer, "Not my call", or the override record. The tokens and floors are in [docs/THEME.md](https://github.com/knitli/marque-kit/blob/main/docs/THEME.md).

## Markings from a server

Core's `html()` writes a marking as an escaped string with no DOM (see [`@knitli/marque-kit-core`](https://www.npmjs.com/package/@knitli/marque-kit-core)). Serve `theme.css` and `kit.css` from your own origin, and put the markings inside `.mq` or an element with `data-mq-theme="light"`. With script off, the marking never breaks inside a token. Where script runs, enhance it:

```js
// in the browser, from a script file ('self')
import { enhance } from '@knitli/marque-kit/marking';
import { tips } from '@knitli/marque-kit/help';
const table = document.querySelector('#entries');
enhance(table);      // stack markings that wrap, re-measure on resize, open folds
tips(table, vocab);  // tier-1 help on each token
```

## Hosting offline

The kit fetches nothing. `theme.css` names Archivo, Literata, OCR-B and Fira Code but ships no `@font-face`, so an offline or air-gapped host serves the fonts itself: font files and a stylesheet with the `@font-face` rules, both from its own origin, which satisfies `font-src 'self'` and `style-src 'self'`. A font that isn't there falls back (system sans, Georgia, a monospace for markings); nothing breaks. [docs/THEME.md, "Hosting offline"](https://github.com/knitli/marque-kit/blob/main/docs/THEME.md) has the steps, the `--mq-font-*` tokens and the fallbacks. Which OCR-B to use is still an open question.

## The design

- [docs/CONTRACT.md](https://github.com/knitli/marque-kit/blob/main/docs/CONTRACT.md): the finding shape the kit renders, and the host loop.
- [docs/DERIVATION.md](https://github.com/knitli/marque-kit/blob/main/docs/DERIVATION.md): how a finding gets its rung.
- [docs/COMPONENTS.md](https://github.com/knitli/marque-kit/blob/main/docs/COMPONENTS.md): every component with its states.

## License

AGPL-3.0-only, or a Knitli commercial license. See [LICENSE.md](https://github.com/knitli/marque-kit/blob/main/LICENSE.md).
