<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->


# Attention: needs_person × blocks × moment → rung

All documents and markings in this repo are fictional examples.

Attention lives in the kit, computed from the engine's facts (decision, 16 Oct 2026). Table 1 maps every engine outcome to the contract's three semantic fields; Table 2 is the whole function from those fields plus the host's moment to one of five rungs: Quiet, Noticeable, Advisory, Action required, Blocking. Matrix A says which slots each rung shows; Matrix B what each anchor kind carries. This file is the published spec for that derivation.

_Design specification for @knitli/marque-kit. Edit here._


---

## needs_person and blocks — what Marque says; the rung — what the kit computes
Table 1 maps every outcome the engine produces today onto the contract's three semantic fields. Table 2 is the whole function from those fields plus the host's moment to a rung. Rows marked "decide" are yours.

| Today's outcome | outcome.kind | needs_person | blocks | Rung while drafting → at finalize |
|---|---|---|---|---|
| Determined, promoted | applied | none | never | Quiet. Noticeable when the marking visibly changed, until seen. |
| Determined, not promoted | available | optional | finalize if an error was left unapplied; else never | Advisory → Blocking only when an error was left unapplied. |
| Ranked — prescribed or chosen promoted | chosen_over | optional | never | Noticeable; the runners-up on request. |
| Ranked — most restrictive | chosen_over | optional | never | Advisory. The safe reading was taken and intent is unknown — exactly the blue dotted case. |
| Plural — several lawful readings, none ranked | choices | required | finalize | Action required → Blocking. The JOINT case sits here. |
| Withheld — needs a fact, with options or a prompt | needs_fact | required | finalize | Action required → Blocking. |
| Withheld — needs a fact, with nothing to choose from | needs_fact | required | finalize | Action required → Blocking. Decide: can the person type a free answer, or only acknowledge? |
| Withheld — acting automatically would be wrong; may be work in progress | withheld | optional | never | Advisory. Never blocks — "the warning stands permanently." |
| Withheld — the remedy is an edit outside the engine | withheld | host decides: none if the host performs it, else required | finalize if an error is unapplied | Quiet when the host does the edit; Action required when it can't. |
| Withheld — kept on purpose · needs a setting an administrator owns | withheld | none | never | Noticeable (info): kept on purpose · needs a setting an administrator owns. |
| Withheld — internal guard | withheld | none | never | Noticeable at most. It should never reach a person. |
| Withheld — too large to examine | withheld | required | finalize | Noticeable → Action required. Decide: a marking Marque couldn't read should not go out unexamined. |
| Critical system-policy violation | withheld | required (an administrator) | now | Blocking immediately. Never auto-fixes. |
| Covered — another finding's repair covers this span | covered_by | the owner's | the owner's | Collapsed into the owner's card. One span, one card. |
| Artifact absent-but-required, fixable — a derived value and a placement exist | available → applied | none once the host places it; optional until then | finalize | Quiet when placed; "before you finalize" when the host can't place it. |
| Artifact absent-but-required, flag-only — no edge can derive a value | needs_fact | required | finalize | "Before you finalize" → Blocking. The CAB with blanks lives here. |
| Artifact present-non-canonical | applied / available | none | never | Noticeable. |
| Artifact present-not-required — superfluous | withheld | optional | never | Advisory: may be work in progress; never deleted for you. |
| basis = system_ideal — on any row above | unchanged | unchanged | unchanged | Tone only: "Marque adds this; nobody was required to." Never an error voice. |
Table 2 · The rung, as a function
| needs_person | blocks | moment | rung |
|---|---|---|---|
| none | never | any | Quiet — Noticeable while a visible change is unseen |
| optional | never | any | Advisory — it never stops anything |
| optional | finalize | drafting | Advisory |
| optional | finalize | finalize | Blocking |
| required | finalize | drafting | Action required — deferred, it waits under "before you finalize" |
| required | finalize | finalize | Blocking |
| required | now | any | Blocking |
Blocking is the same finding at a different moment. Nothing appears at finalize that wasn't known while drafting; only the moment changed.
Seen only quiets. Marking a Noticeable as seen makes it Quiet. Seen never touches a required finding.
The moment is the host's. drafting · finalize · send — and a web app may have a fourth, navigate. Marque never knows which it is.
Severity never sets a rung. It sets blocks for an unapplied error, and nothing else.


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
