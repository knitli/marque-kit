<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# Marque UI kit

The parts a host shows a person when Marque finds something: the finding card, the decision prompt, the pane, the inline mark in the document, the banner and authority-block cards, the finalize gate, the derivation panel, the audit receipt, and the theme layer under all of them.

TypeScript and plain CSS. No framework, no runtime dependencies. It runs in a web page, a Word or Outlook task pane, and anything else with a DOM. A marking can also be written as an HTML string on a server, for pages that work with no script and a strict Content Security Policy.

It is an embeddable widget, not a box of parts. The model is Stripe Elements: one framework-neutral `mount()` that owns its piece of the page. Hosts can theme it freely (`--mq-*` tokens), but they can't rearrange it. The rungs, the free answer, "Not my call" and the override record are fixed, so the kit ships whole surfaces rather than primitives to recompose.

## Packages

| Package | Path | Status | What it is |
|---|---|---|---|
| [`@knitli/marque-kit-core`](packages/core/README.md) | `packages/core` | published | The logic with no DOM: the contract as types, the state log, the rungs, markings as HTML strings, and readers for the engine's native wire. Runs on a server or in Outlook's send handler. |
| [`@knitli/marque-kit`](packages/kit/README.md) | `packages/kit` | published | The DOM and the CSS: `mount()`, the components, help, the theme gate, `theme.css` and `kit.css`. |
| [`@knitli/marque-kit-web`](packages/web/README.md) | `packages/web` | placeholder | Inline marks on a page's own text. |
| [`@knitli/marque-kit-word`](packages/word/README.md) | `packages/word` | placeholder | Inline marks in Word: content controls, selection-follow. |
| [`@knitli/marque-kit-outlook`](packages/outlook/README.md) | `packages/outlook` | placeholder | Marks in the compose body, classification headers, the send gate. |
| [Office add-in](apps/office-addin/README.md) | `apps/office-addin` | private | The Word task pane: the sample memo, plus views that run only behind a trusted provider. |

The placeholders are published so their names and versions exist; they export nothing yet. Every package needs Node 24 or later (`engines: >=24`). Working on the repo needs Node 26.

The rest of the repo:

```
docs/        the design the code implements (reading order below), and the decision registry
tools/       decision-lint: checks the decision registry and each PR's impact block
fixtures/    the fictional six-paragraph memo every example uses, what Marque should say about it
             (memo.findings.json), the vocab and help JSON, the cited manual sections, and their extractors
demo/        the memo on the left, the pane on the right; answer ¶3 and watch the banner move
evidence/    verification notes for runs paired with a specific engine build; not rerun by CI
```

## Run it

```sh
pnpm install
pnpm check        # format, lint and typecheck (vp check)
pnpm test         # every package: node runs test/*.test.ts; in the kit, vp test runs test/dom/ under happy-dom
pnpm build        # each package's dist/: modules, .d.ts, and the kit's two stylesheets
pnpm demo         # vp dev; open /demo/
```

Packages import each other by name. The `source` export condition points tests, typecheck and the demo at `src/`, so nothing needs building first. To embed the kit, start with [packages/kit/README.md](packages/kit/README.md). To render a marking on a server, see [packages/core/README.md](packages/core/README.md).

## The idea in one paragraph

Marque emits findings. Each finding says what it found, what it did or needs, whether a person is required (`needs_person`) and whether it stops the document going out (`blocks`). The kit turns that into one of five rungs of attention (Quiet, Noticeable, Advisory, Action required, Blocking) using the host's moment (editing or finalize). It shows each rung with a shape, not just a color: a thin underline means changed, a blue dotted line means you *can* act, a gold double rule means you *must*, a dashed outline means something is missing. Gold is the only thing that asks for a person. The question comes first on a card; the marking is context; every question can be answered by typing; "not my call" is always there; and an override is recorded, never hidden.

## Reading order

1. [docs/CONTRACT.md](docs/CONTRACT.md): the finding shape the kit renders, and the host loop.
2. [docs/DERIVATION.md](docs/DERIVATION.md): how `needs_person` × `blocks` × moment becomes a rung, and which slots each rung shows.
3. [docs/MODEL.md](docs/MODEL.md): attention, the two layers of state, where findings attach, the decision prompt, the three hosts, help in three tiers.
4. [docs/THEME.md](docs/THEME.md): the tokens, the fit rules, the four forms of a long marking, the contrast gate, hosting fonts offline.
5. [docs/COMPONENTS.md](docs/COMPONENTS.md): every component with its states.
6. [docs/maintainer-decisions/](docs/maintainer-decisions/decision-index.md): the binding decisions, `MD-0001`…`MD-0026`, checked by `tools/decision-lint`.
7. [docs/ENGINE-ASKS.md](docs/ENGINE-ASKS.md): what the engine doesn't emit yet.

[AGENTS.md](AGENTS.md) holds the rules for working here: what is fixed, the marking and copy rules, and the checks to run. [RELEASING.md](RELEASING.md) covers versions and publishing.

## Where it came from

Designed on a canvas, 13–21 Oct 2026. All documents and markings in this repo are fictional examples.

The kit depends on Knitli's design-system *values* (vendored into `theme.css`), not its component bundle. Where a value departs from Knitli, the CSS says so and why.

## License

Dual-licensed: AGPL-3.0-only or a Knitli commercial license; see [LICENSE.md](LICENSE.md). The full AGPL text is in [LICENSES/AGPL-3.0-only.txt](LICENSES/AGPL-3.0-only.txt). Marque, Knitli and Imprint are Knitli trademarks; see [TRADEMARK.md](TRADEMARK.md). Contributions require Knitli's CLA; see [CONTRIBUTING.md](CONTRIBUTING.md).
