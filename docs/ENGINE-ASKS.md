<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# Engine requirements (tracked internally)

All documents and markings in this repo are fictional examples.

The kit is built to the finding contract in [CONTRACT.md](CONTRACT.md). Where the engine differs today, the gap is tracked internally. This page is the checklist; the detail lives with the engine. Listed 17 Oct 2026 from the design session; docs/ is the source of truth. Suggested order: stable ids → layered markings → `asks` → readings → `depends_on` → person's acts → trace shape → artifacts → fallback → Live mode.

Until these land, the kit renders from a hand-written oracle in the contract's shape (`fixtures/memo.findings.json`). The oracle is what the engine should emit for `fixtures/memo.txt`; the day the engine emits it, the fixture becomes a parity test.

| Need | Why the kit needs it |
|---|---|
| Markings as layered tokens with typed mask regions | So a marking never breaks inside a token and the unidentified parts are regions, not characters. `packages/kit/src/marking.ts` derives layers from the string until then. |
| One `asks` field for everything that needs a person | The decision prompt renders one shape. A free answer is always allowed. |
| Readings carry their rendered marking and the layer they change | The diff form tints the layer that differs; the kit can't compute that from a string. |
| `depends_on[]` only when readings differ in roll-up; `document.ready` / `blocking[]` | "If ¶5's alternative is taken, the banner becomes…" is only worth showing when it's true. |
| Conservative fallback | An unattended deployment with nobody to ask gets the most restrictive form that keeps every stated equity, e.g. `(S//FGI AUS GBR//NF)`. |
| Stable finding identity across re-lints | A Word content control tagged `mq:<id>` has to survive the next keystroke. |
| `DeploymentMode::Live` | Rung depends on the host moment (editing vs finalize); the engine should know it is being asked repeatedly. |
| CAB per-field state; Classified By from identity; dates discovered; OCA reasons from EO 13526 §1.4 | The authority-block card shows known / blank / waiting per field, not one blank block. |
| Decision-trace event shape for a derivation panel | "How Marque got here" lists axis → inputs → output → rule → citation. |
| Closed vocabulary for what a person did | answered · changed · kept as written · deferred · declined — on the wire in and in the audit out. A kept-as-written override is recorded, never hidden. |
| PlacementGuidance, fixability and derived value on every artifact | The banner card says "every page"; the CAB card says "first page"; both say whether Marque can write it. |
| Help entries for REL TO, JOINT, FGI; `plain` on TS, S, C, U and six others | Tier 1 shows only authored text. Without an entry the token gets no tooltip; the kit doesn't write one. |
| `member_of` on the engine's vocab trigraph lookup | The lookup shows which groups a country is in; today `answer()` inverts every tetragraph's members itself. |
| Serve the cited CAPCO-2016 section with the quote's offsets | Tier 3 lands on the quoted sentence. Until then hosts have only `fixtures/memo.manual.json`. |

Listed 21 Oct 2026 from the kit build (help tiers and lookup).

Decisions that bound these, already taken (dated in [DECISIONS.md](DECISIONS.md)): attention is computed kit-side from `needs_person` and `blocks`; no requirement asks the engine to emit a rung. Markings are not document content; nothing here touches document text.
