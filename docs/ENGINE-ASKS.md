<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense
-->

# What the kit needs from the engine

The kit is built to the finding contract in [CONTRACT.md](CONTRACT.md). Where the lint wire differs today, the gap is filed on the engine as an issue. This page is the index; the issues hold the detail. Filed 17 Oct 2026 from the design session; the Linear mirror carries cluster and lineage.

Until these land, the kit renders from a hand-written oracle in the contract's shape (`fixtures/memo.findings.json`). The oracle is what the engine should emit for `fixtures/memo.txt`; the day the engine emits it, the fixture becomes a parity test.

| Issue | Ask | Why the kit needs it |
|---|---|---|
| [#2633](https://github.com/knitli/marque-dev/issues/2633) | Tracking issue for the set | Order and shared context. Suggested order: stable ids → layered markings → `asks` → readings → `depends_on` → person's acts → trace shape → artifacts → fallback → Live mode. |
| [#2634](https://github.com/knitli/marque-dev/issues/2634) | Markings as layered tokens with typed mask regions | So a marking never breaks inside a token and the unidentified parts are regions, not characters. `packages/kit/src/marking.ts` derives layers from the string until then. |
| [#2635](https://github.com/knitli/marque-dev/issues/2635) | One `asks` field for everything that needs a person | The decision prompt renders one shape. A free answer is always allowed. |
| [#2636](https://github.com/knitli/marque-dev/issues/2636) | Readings carry their rendered marking and the layer they change | The diff form tints the layer that differs; the kit can't compute that from a string. |
| [#2637](https://github.com/knitli/marque-dev/issues/2637) | `depends_on[]` only when readings differ in roll-up; `document.ready` / `blocking[]` | "If ¶5's alternative is taken, the banner becomes…" is only worth showing when it's true. |
| [#2638](https://github.com/knitli/marque-dev/issues/2638) | Conservative fallback | A boundary deployment with nobody to ask gets the most restrictive form that keeps every stated equity, e.g. `(S//FGI AUS GBR//NF)`. |
| [#2639](https://github.com/knitli/marque-dev/issues/2639) | Stable finding identity across re-lints | A Word content control tagged `mq:<id>` has to survive the next keystroke. |
| [#2640](https://github.com/knitli/marque-dev/issues/2640) | `DeploymentMode::Live` | Rung depends on the host moment (editing vs finalize); the engine should know it is being asked repeatedly. |
| [#2641](https://github.com/knitli/marque-dev/issues/2641) | CAB per-field state; Classified By from identity; dates discovered; OCA reasons from EO 13526 §1.4 | The authority-block card shows known / blank / waiting per field, not one blank block. |
| [#2642](https://github.com/knitli/marque-dev/issues/2642) | Decision-trace event shape for a derivation panel | "How Marque got here" lists axis → inputs → output → rule → citation. |
| [#2643](https://github.com/knitli/marque-dev/issues/2643) | Closed vocabulary for what a person did | answered · changed · kept as written · deferred · declined — on the wire in and in the audit out. A kept-as-written override is recorded, never hidden. |
| [#2644](https://github.com/knitli/marque-dev/issues/2644) | PlacementGuidance, fixability and derived value on every artifact | The banner card says "every page"; the CAB card says "first page"; both say whether Marque can write it. |
| [#2650](https://github.com/knitli/marque-dev/issues/2650) | Help entries for REL TO, JOINT, FGI; `plain` on TS, S, C, U and six others | Tier 1 shows only authored text. Without an entry the token gets no tooltip; the kit doesn't write one. |
| [#2651](https://github.com/knitli/marque-dev/issues/2651) | `member_of` on `/v1/vocab/trigraph/{code}` | The lookup shows which groups a country is in; today `answer()` inverts every tetragraph's members itself. |
| [#2652](https://github.com/knitli/marque-dev/issues/2652) | Serve the cited CAPCO-2016 section with the quote's offsets | Tier 3 lands on the quoted sentence. Until then hosts have only `fixtures/memo.manual.json`. |

Filed 21 Oct 2026 from the kit build (help tiers and lookup).

Decisions that bound these, already taken (dated in [DECISIONS.md](DECISIONS.md)): attention is computed kit-side from `needs_person` and `blocks`; no issue asks the engine to emit a rung. Markings are not content (constitution V, v2.8.0 / v2.11.0); nothing here touches content-ignorance.
