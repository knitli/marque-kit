<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->


# Attention: needs_person × blocks × moment → rung

All documents and markings in this repo are fictional examples.

Attention lives in the kit, computed from the engine's semantic facts and host moment. The adopted readiness contract separates this presentation rung from operation readiness. The tables below define the kit target.

_Design specification for @knitli/marque-kit. Edit here._

**Adoption and migration status:** the readiness model was adopted on 14 November 2026. Coordinated engine/kit/caller migration and acceptance evidence remain pending, so this is the target contract rather than a conformance claim. An operation can remain unready while host work is pending even when `needs_person=none` and no person-facing action is shown.


---

## needs_person and blocks — attention is not readiness

The kit derives the attention rung from Marque's `needs_person` and `blocks`, plus the host's moment and kit interaction state. Rungs are presentation; they do not add or remove semantic requirements. Severity never sets a rung or readiness. `blocking` is an attention rung at the host's gate; semantic readiness is a separate calculation.

| Engine result | Meaning presented | Readiness treatment |
|---|---|---|
| Current `applied` label | Revise producer/consumer meaning together to distinguish selected/proposed from host-written; `generated` is a proposed engine-side name. | No automatic pass. A required duty remains until host write and fresh evaluation. |
| `available` | A supported proposal exists and could be accepted/applied. | Neither pass nor blocker by label. An unmet mandatory duty blocks even when a repair is available. |
| `chosen_over` | Marque selected/ranked a reading; this does not prove author intent or a physical write. | Depends on whether the reading is a permitted disposition. Confirmed evaluation can satisfy a requirement; unresolved author choice may remain Advisory or required. |
| `choices` / `needs_fact` | Multiple readings or a needed fact remain unresolved. | Block only when the underlying requirement is mandatory and no permitted disposition satisfies it. The kit offers a free answer and “Not my call.” |
| `withheld` | No automatic result is offered, with a reason. | The reason and unmet requirement determine blocking; repair absence does not reduce diagnostic severity. |
| `covered_by` | Another finding owns the overlapping correction. | Preserve the causal link; clear only when the owner's confirmed result satisfies the requirement. |
| `kept_as_written` (kit view) | The person declined one proposed edit and kept the text. | Never a waiver: protection is never lowered, and normal-severity reporting and protective page/banner resolution still apply. |

The authored NF/REL reading and a synthesized fallback remain distinct. The former may leave an optional intent question; the latter is not what the author wrote and remains a required question when a person is present. An unattended fallback is permitted only under policy and does not itself prove a host write. Required writes and artifact placement need confirmation followed by a complete current evaluation. A banner dependency is distinct from artifact-field dependencies: unchanged banner does not eliminate a changed CAB field or other artifact value.

When multiple pending answers affect one artifact, show a preview only from a joint hypothetical engine evaluation at a matched snapshot, context and answer revision. Do not combine individual previews in the kit. If joint evaluation is unavailable, show pending/unavailable. A completed joint preview must agree with the confirming evaluation under the same accepted assertions and context; the fresh complete evaluation may settle acts even if no preview was available.

## The rung, as a function

| needs_person | blocks | moment | rung |
|---|---|---|---|
| none | never, finalize or now | any | Quiet — Noticeable while a visible change is unseen; no person action is needed |
| optional | never | any | Advisory |
| optional | now | any | Blocking |
| optional | finalize | drafting | Advisory |
| optional | finalize | finalize | Blocking |
| required | never | any | Action required |
| required | finalize | drafting | Action required |
| required | finalize | finalize | Blocking |
| required | now | any | Blocking |

Blocking is the same finding at a different moment. Nothing appears at finalize that wasn't known while drafting; only the moment changed. Seen only quiets; it never clears a requirement or blocker. The moment is the host's (`editing`, `finalize`, `send`, or a host-specific moment). Marque does not choose it.

A missing envelope, partial response, stale revision, missing required scope or absent completeness signal is not readiness. An empty blocker list is not an affirmative result. Effective readiness also requires current outgoing state, confirmed accepted writes/placements, no accepted work awaiting evaluation, and any named host acceptance checks.


---


## Which slots show, by rung — and which exist, by anchor
The same card, cut down differently at each rung; and the same contract, filled differently for a span, a portion, a banner, a CAB, a notice. U = shown by default · (U) = on request · — = absent · I = the host always has it.

Matrix A · Slots × rung
| slot | Quiet | Noticeable | Advisory | Action required | Blocking |
|---|---|---|---|---|---|
| marking.as_written | (U) | U — with what it was | U | U | U |
| says.text | (U) | U | U | U — as the reason for the question | U |
| says.citation · caveat | (U) | (U) | (U) | (U) | (U) |
| outcome.result | (U) | U — what it became | U — the current result | — | — |
| outcome.because | — | (U) | U — "the safe reading; intent unknown" | — | — |
| outcome.readings[] | — | (U) — runners-up | U — the alternative, as one action | U — as the options | U — as the options |
| asks | — | — | — | U — the question, gold | U — the question, gold; the operation waits |
| depends_on | — | (U) | (U) | U — "the banner waits on this" | U |
| action | — | (U) — undo | U — one action, blue | U — answer · ask me at finalize | U — answer; defer is gone |
| host state | I | I | I | I | I |
Matrix B · Anchor kind × what the contract carries
| finding | anchor.kind | as_written | outcome.result | artifact.state | placement | depends_on |
|---|---|---|---|---|---|---|
| Inline correction | span | yes | yes — the corrected marking | — | — (replaces the span) | rarely |
| Missing portion mark | portion | none — nothing exists | only if a value can be derived | — | — (the portion's start) | — |
| Banner (front marking) | page · document | when present | yes — derived from the portions | present · non-canonical · absent-but-required | host-defined scope | yes — open findings it waits on |
| Authority block (CAB) | document | when present | partial — fields plus blanks for a person | all five states | caller_decides · first_page | yes |
| Warning or notice | document · page | usually none | a content id the host renders to text | all five states | first_page · every_page · near_marking · caller_decides | — |
| Caveat layer · declassify instruction | document | when present | yes | all five states | caller_decides | yes |
| A card with no as_written opens on the anchor — "paragraph 4" — and says what is missing, not what is wrong. | Placement is the host's to honor, Marque's to state. The kit renders a notice where the host puts it; it never assumes editable text. | Readings and results travel together. An option without the marking it produces is a question the person can't verify; a marking without its reading is syntax. |
