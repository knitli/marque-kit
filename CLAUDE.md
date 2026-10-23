<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense
-->

# CLAUDE.md

Guidance for working in this repo. The kit is the human-facing half of Marque; the engine is [knitli/marque-dev](https://github.com/knitli/marque-dev). Read that repo's CLAUDE.md, constitution and TENETS when a change touches what the engine emits or what a citation says.

## What this is

A UI kit for hosts that show Marque findings to a person: a web page, a Word or Outlook task pane, Marque's own surfaces. TypeScript and plain CSS, no framework, no runtime dependencies; `vp pack` builds `dist/` (DECISIONS #20). `src/` is the kit; `src/types.ts` is the contract in types; `docs/` is the design it implements; `fixtures/` is the memo every example uses; `demo/` renders it.

## Fixed, by decision (docs/DECISIONS.md)

These are not style preferences. Each has a dated maintainer decision behind it; change the decision first, then the code.

- **Five rungs, computed in the kit.** `rung()` in `src/render.ts` is the published derivation ([docs/DERIVATION.md](docs/DERIVATION.md)): `needs_person` × `blocks` × host moment. The engine never emits a rung; severity never sets one.
- **Gold = must act. Blue = can act.** Nothing else is gold. Gold appears on Action required and Blocking only.
- **Shape carries meaning, colour rides along.** Thin underline = changed; 2px dotted act-ink = can act; 3px double attn-ink = must act; dashed = absent. On cards: `.mq-card.can-act / .must-act / .absent`. A greyscale print and forced-colours mode still read.
- **Question first.** When a finding asks, the question is the card's heading; the marking is context; `says.text` explains; `Why?` and the citation sit in the footer.
- **A free answer is always possible. "Not my call" is always there.** Every prompt has the typed field and the routing button, whatever the options.
- **No Undo on a fix the person must own. An override is recorded.** "Keep as written" exists on Noticeable and Advisory; the audit reports the finding as-is.
- **Advisory when the safe reading is one the author wrote; Action required when the safe form is one nobody wrote.** The NF/REL TO portion is Advisory (REL TO offered back). The JOINT fallback `(S//FGI AUS GBR//NF)` is a fallback, not a reading.
- **Light is the default theme.** No attribute, or `data-mq-theme="light"`, on the kit root (`.mq`). `dark` and `auto` are opt-in. The theme attribute goes on the root, not on `<html>`.
- **Theme is free; behaviour is fixed.** Hosts may set `--mq-*` tokens. They may not change the rungs, the shapes' meanings, the fit rules, the free answer, "not my call", or the override record.
- **Judge the text, never the person.** Messages say what the marking is and what Marque did. Never "you forgot".

## Markings (src/marking.ts, docs/THEME.md "Fit" and "Long markings")

- A marking is `.mq-mark > .mq-l (layer) > .mq-i (token)`; all three `nowrap`; `<wbr>` between layers and between tokens. Break order: between layers (`//`) → after a list comma → between tokens → before `/`. **Never inside a token**: `REL TO`, `TOP SECRET`, `SI-G`, `DISPLAY ONLY`.
- If it had to wrap, `settle()` adds `.stacked`: one layer per line, hanging indent .65em. CSS alone wraps greedily and orphans `GBR)`.
- Never truncate, scroll or shrink below 13px (`--mq-size-sm`). `.xs` is 12px for the receipt only.
- Four forms: **full** (reference; copy, audit, print; the only one that may scroll, inside a popover), **folded** (`.mq-fold`: heading + first three codes + "+N more", act-ink), **summary** (`.mq-count` first…last · n), **diff** (`.differs` gold tint on the layer that differs between readings).
- Engine cap is 4096 bytes. Anything past ~1000 bytes is never inline; it goes to the full form in a popover.
- Masks are typed regions, not characters: `.mq-mask` (unidentified, `_`), `.mq-conceal` (source concealed, `█`). Concealed owner codes are masked everywhere, including before-images and offered alternatives (constitution V, MD-0016 / MD-0030).
- Until marque-dev#2634 lands, `parse()` derives layers from the string. That is a fallback; don't extend it into a grammar. When the engine emits `layers`, they are used as-is.

## Copy rules

- Plain language, for the classifier reading it. The banned-term table is marque-dev's `docs/message-clarity-style-guide.md`; it applies here too. No rule ids, type names or spec numbers in user-facing text.
- A recognized marking is quoted exactly, in the mark font, never paraphrased.
- Stamps are words ("Needs you", "Changed", "Done"), never icons alone.
- Citations: `CAPCO §H.8 p151` with the verbatim `short` quote. **Verify every citation against `crates/capco/docs/CAPCO-2016.md` in marque-dev before it lands.** A citation that can't be traced to a real passage is removed, not left pending (constitution VIII). The maintainer's note on §H.3 p57 is in docs/DECISIONS.md.
- EO 13526 §1.4 has eight categories, (a)–(h).

## The memo (fixtures/)

Every example in the docs and the demo uses the same six paragraphs. Keep it that way; a new example that needs a different case extends the memo rather than inventing a second document.

| ¶ | As written | Finding | Rung |
|---|---|---|---|
| 1 | `(U)` | — | — |
| 2 | `(S//REL TO USA FVEY)` | comma added (§H.8 p151) | Noticeable |
| 3 | `(//JOINT S AUS GBR//REL TO USA, GBR)` | ownership question, three readings + fallback (§H.3 p55) | Action required / Blocking |
| 4 | none | portion mark absent (§C p25); only the author knows | Action required / Blocking |
| 5 | `(S//NF/REL TO USA, GBR)` | NOFORN kept, REL TO offered back (§H.8 p145); banner becomes NOFORN (§H.3 p57) | Advisory |
| 6 | `(C//REL TO USA,  GBR)` | extra space removed | Quiet |

Banner derived: `SECRET//FGI AUS GBR//NOFORN`, or `…//REL TO USA, GBR` if ¶5's alternative is taken. CAB: Classified By known from identity; Derived From blank; Declassify On waits on Derived From.

`fixtures/memo.findings.json` is a hand-written oracle in the contract's shape. Rule predicate ids in it are illustrative until wired to the engine's catalog; spans are byte offsets into `memo.txt`. When the engine emits this shape, the file becomes a parity test.

## Never

- Never introduce a colour, size or shape outside `theme.css`. `kit.css` and `render.ts` read tokens and class names only.
- Never put a colour-only signal anywhere; every state has a shape or a word.
- Never render a template label or an internal id to a person.
- Never let a marking break inside a token, truncate, or shrink below 13px.
- Never show a generated value as applied; the host applies.
- Never hide an override.
- Never fabricate or copy a citation without re-verifying it at the new site.
- Never add a framework, a second build step, or a runtime dependency without a decision in docs/DECISIONS.md.
- Never type a contract slot as `any`, or widen one to quiet the checker. A shape the engine emits goes in `src/types.ts` first.

## Working here

- `pnpm check` (format, lint, typecheck) and `pnpm test` (node runs the `.ts` tests as written) before a commit. `pnpm fix` formats. `pnpm build` writes `dist/`. `pnpm demo` to look. Markdown and the two extracted fixtures aren't formatted: a renumbered list changes what a doc says. CI (`.github/workflows/ci.yml`) runs check, test and build on every PR and push to `main`.
- Check contrast when a token changes: the pairs and floors are `PAIRS` and `SIZES` in `src/theme.ts`. AA 4.5 on text pairs, 3.0 on lines and focus. `test/theme.test.ts` fails when `kit.css` or `theme.css` paints a pairing that isn't measured there or excused in the test with a reason; a new colour use means deciding which.
- The docs under `docs/` were extracted from the canvas on 21 Oct 2026 and are now the source. Edit them here; the canvas is history.
- Engine gaps go to marque-dev as issues, labelled `ui-kit` (+ `engine`, `audit`, `office`, `capco/ism` as they apply), and get a row in `docs/ENGINE-ASKS.md`. The Linear triage agent assigns cluster and lineage.
- Commits and PRs end with the attribution lines the session provides.
- SPDX header on every file: `SPDX-FileCopyrightText: 2026 Knitli Inc.` / `SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense`. A file that can't carry a comment (JSON, lockfiles, `memo.txt`) goes in `REUSE.toml`. CI runs `reuse lint`.
