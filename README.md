<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense
-->

# Marque UI kit

The parts a host shows a person when Marque finds something: the finding card, the decision prompt, the pane, the inline mark in the document, the banner and authority-block cards, the finalize gate, the derivation panel, the audit receipt, and the theme layer under all of them.

TypeScript and plain CSS. No framework, no runtime dependencies; each package's `dist/` is built with `vp pack`. It runs in a web page, a Word or Outlook task pane, and anything else with a DOM.

It is an embeddable widget, not a box of parts. The model is Stripe Elements: one framework-neutral `mount()` that owns its piece of the page, with thin wrappers per framework when a host needs one. Hosts can theme it freely (`--mq-*` tokens), but they can't rearrange it. The rungs, the free answer, "Not my call" and the override record are fixed by decision, so the kit ships whole surfaces rather than primitives to recompose.

## What's here

A pnpm workspace (DECISIONS #22). Packages import each other by name; the `source` export condition points tests, typecheck and the demo at `src/`.

```
packages/core/       @marque/kit-core: the logic with no DOM, so it runs anywhere, Outlook's send handler included
  src/types.ts         the contract as types: findings, artifacts, the state log, the vocabulary, the host
  src/state.ts         the kit's half of the ladder: what the person did (answered, changed, kept as written,
                       deferred, declined), keyed by finding id, append-only, plain JSON the host persists
  src/attention.ts     rung(), sections(), markClass(): which of the five rungs a finding sits on, and the pane's
                       four sections; what Outlook's send gate decides with
  test/                the fixtures held to the types; the rung table and the state layer, against the memo
packages/kit/        @marque/kit: the DOM and the CSS
  src/theme.css        the theme layer: --mq-* tokens (light default, dark, auto), how a marking fits,
                       the four shapes that carry meaning, control states, print, forced colors
  src/kit.css          the components, built only on theme.css
  src/marking.ts       the marking primitive: layers, tokens, four forms, never breaks inside a token
  src/render.ts        finding JSON → DOM: card(), row(), pane(), status(), artifact(), gate(), derivation(),
                       receipt(), and mount(): the pane wired to the kit's state, the one call a host needs
  src/help.ts          help in three tiers (tooltip, Why?, the manual section) and the vocabulary lookup;
                       writes no help text of its own, it renders the engine's
  src/theme.ts         the theme gate at mount: contrast and size floors, falling back to shipped values
  test/                the parser, the theme gate, lookup and citation landing under plain node
  test/dom/            the decided rules as they reach the DOM (card, gate, receipt), under vp test and happy-dom
packages/web/        @marque/kit-web: inline marks on a page's own text (placeholder)
packages/word/       @marque/kit-word: inline marks as content controls, selection-follow, the Purview label (placeholder)
packages/outlook/    @marque/kit-outlook: marks in the compose body, classification headers, the send gate (placeholder)
apps/office-addin/   the Word and Outlook add-in: manifest, task pane, Office.js ↔ WASM engine ↔ kit; so far the Word pane on the memo
fixtures/memo.txt            a six-paragraph memo with five things wrong
fixtures/memo.findings.json  what Marque should say about it, in the contract's shape
fixtures/memo.vocab.json     the engine's vocab and help JSON (ISMCAT + help_anchors.toml), for tiers 1–2 and lookup
fixtures/memo.manual.json    the CAPCO-2016 sections the memo cites, for tier 3
fixtures/extract.py          regenerates the two above from a marque-dev checkout; fails if a quote doesn't land
demo/index.html    the memo on the left, the pane on the right; answer ¶3 and watch the banner move
docs/              the design, extracted from the canvas: CONTRACT, DERIVATION, MODEL, THEME,
                   COMPONENTS, DECISIONS, ENGINE-ASKS
```

## Run it

```sh
pnpm check        # format, lint and typecheck (vp check)
pnpm test         # every package: node ≥ 26 runs test/*.test.ts directly; in the kit, vp test runs test/dom/ (happy-dom)
pnpm build        # each package's dist/: the modules, their .d.ts, and the kit's two stylesheets
pnpm demo         # vp dev; open /demo/
```

A host mounts the pane and listens:

```js
import { mount } from '@marque/kit';
const p = mount(el, { doc, state, vocab, moment: 'editing', onChange: (state, act) => save(state), onHelp, onJump });
p.update({ doc });              // after a re-lint; async hosts add { linted: n, seq }
p.update({ moment: 'finalize' }); // the host's moment; the kit never guesses it
p.update({ open: id });         // an Office host's cursor in a marking: its card opens, focus stays put
p.destroy();                    // when the pane goes away
```

`act` is null when only the seen list changed. An answer shows on its card at once but stays in `document.pending`, and the document is not ready, until the host applies it, re-lints and calls `p.update({ doc })`. `@marque/kit/help` has what a host needs to answer `onHelp` and `onLookup`. The contract's types and the state log are `@marque/kit-core/types` and `@marque/kit-core/state`. At mount the kit measures the host's `--mq-*` tokens against the contrast and size floors (`@marque/kit/theme`); a failing token falls back to the shipped value, and the report is `p.theme` and `onTheme(report)`. Under forced colors the system palette stands and only sizes and the mark font are measured. When the room the host gives the pane is under 240px, the report says `narrow: true` and the kit shows rows only: opening one calls `onOpen(f)` for the host to show it its own way.

The demo runs under `vp dev`, which serves the TypeScript source as modules.

## The idea in one paragraph

Marque emits findings. Each finding says what it found, what it did or needs, whether a person is required (`needs_person`) and whether it stops the document going out (`blocks`). The kit turns that into one of five rungs of attention — Quiet, Noticeable, Advisory, Action required, Blocking — using the host's moment (editing or finalize), and shows each rung with a shape, not just a color: a thin underline means changed, a blue dotted line means you *can* act, a gold double rule means you *must*, a dashed outline means something is missing. Gold is the only thing that asks for a person. The question comes first on a card; the marking is context; every question can be answered by typing; "not my call" is always there; and an override is recorded, never hidden.

## Reading order

1. [docs/CONTRACT.md](docs/CONTRACT.md): the finding shape the kit renders.
2. [docs/DERIVATION.md](docs/DERIVATION.md): how `needs_person` × `blocks` × moment becomes a rung, and which slots each rung shows.
3. [docs/MODEL.md](docs/MODEL.md): attention, the two layers of state, where findings attach, the decision prompt, the three hosts, help in three tiers.
4. [docs/THEME.md](docs/THEME.md): the tokens, the fit rules, the four forms of a long marking, the contrast gate.
5. [docs/COMPONENTS.md](docs/COMPONENTS.md): every component with its states.
6. [docs/DECISIONS.md](docs/DECISIONS.md): what the maintainer settled, dated, with the reason.
7. [docs/ENGINE-ASKS.md](docs/ENGINE-ASKS.md): what the engine doesn't emit yet, as issues on marque-dev.

## Where it came from

Designed on a canvas, 13–21 Oct 2026: [Marque UI kit — foundations](https://claude.ai/code/artifact/002b5170-ce55-4baf-8f4c-ce58c7e00a2f). The running notes for the engine are in [Marque UI kit — observations for the engine](https://claude.ai/code/artifact/2b6f1a9b-3d06-4fbe-bf45-7bdc3a2cfc8e). The canvas is the record of how the decisions were reached; this repo is where they are kept true.

The kit depends on Knitli's design-system *values* (vendored into `theme.css`), not its component bundle. Where a value departs from Knitli, the CSS says so and why.

## License

Marque Commercial License; see [LICENSE.md](LICENSE.md). Source-available with commercial-use restrictions, the same terms as [knitli/marque-dev](https://github.com/knitli/marque-dev).
