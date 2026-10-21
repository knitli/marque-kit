<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense
-->

# Marque UI kit

The parts a host shows a person when Marque finds something: the finding card, the decision prompt, the pane, the inline mark in the document, the banner and authority-block cards, the finalize gate, the derivation panel, the audit receipt, and the theme layer under all of them.

Plain CSS and ES modules. No framework, no build step. It runs in a web page, a Word or Outlook task pane, and anything else with a DOM.

## What's here

```
src/theme.css      the theme layer: --mq-* tokens (light default, dark, auto), how a marking fits,
                   the four shapes that carry meaning, control states, print, forced colours
src/kit.css        the components, built only on theme.css
src/marking.js     the marking primitive: layers, tokens, four forms, never breaks inside a token
src/render.js      finding JSON → DOM: rung(), markClass(), card(), row(), pane(), status(), artifact(), gate(),
                   derivation(), receipt(), and mount(): the pane wired to the kit's state, the one call a host needs
src/state.js       the kit's half of the ladder: what the person did (answered, changed, kept as written,
                   deferred, declined), keyed by finding id, append-only, plain JSON the host persists
fixtures/memo.txt            a six-paragraph memo with five things wrong
fixtures/memo.findings.json  what Marque should say about it, in the contract's shape
demo/index.html    the memo on the left, the pane on the right; answer ¶3 and watch the banner move
docs/              the design, extracted from the canvas: CONTRACT, DERIVATION, MODEL, THEME,
                   COMPONENTS, DECISIONS, ENGINE-ASKS
test/              the parser, the rung table and the state layer under plain node
```

## Run it

```sh
npm run check      # syntax + the parser, rung and state tests (node ≥ 20)
npm run demo       # then open http://localhost:8765/demo/
```

A host mounts the pane and listens:

```js
import { mount } from '@marque/kit';
const p = mount(el, { doc, state, moment: 'editing', onChange: (state, act) => save(state), onHelp, onJump });
p.update({ doc });              // after a re-lint
p.update({ moment: 'finalize' }); // the host's moment; the kit never guesses it
```

The demo is static files over any HTTP server; it needs one only because ES modules won't load from `file://`.

## The idea in one paragraph

Marque emits findings. Each finding says what it found, what it did or needs, whether a person is required (`needs_person`) and whether it stops the document going out (`blocks`). The kit turns that into one of five rungs of attention — Quiet, Noticeable, Advisory, Action required, Blocking — using the host's moment (editing or finalize), and shows each rung with a shape, not just a colour: a thin underline means changed, a blue dotted line means you *can* act, a gold double rule means you *must*, a dashed outline means something is missing. Gold is the only thing that asks for a person. The question comes first on a card; the marking is context; every question can be answered by typing; "not my call" is always there; and an override is recorded, never hidden.

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
