<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense
-->


# The finding contract

The shape of a finding the kit consumes and the engine builds to. Each slot has a definition, a "Today:" note on what the lint wire carries now, who supplies it (M = Marque, K = kit, H = host) and who reads it (U = shown to the person, (U) = on request, I = integrator only). Engine-side asks that fall out of this are filed under knitli/marque-dev#2633.

_Extracted from the Marque UI kit design canvas (boards: Artboard-61c3), 21 Oct 2026. The canvas is the visual record; this file is the text the kit is built to. Edit here from now on._


---

## The finding — the shape the kit consumes, and the engine builds to
Marque emits semantics: what it saw, said, did, asks, and whether a person is needed. The kit derives the rung and keeps the host's state. Each row says where its value comes from today. Shown for the JOINT case.


### A · Identity and place
**id**
Stable across re-lints while the marking and its place survive. The key for host state, deferrals, and withdrawing a stale question.
Today: none — findings are keyed by rule + span, and spans move with every keystroke above them.
_M · I_
**rule**
**severity**
**basis**
As today. severity is one input to attention, never the output. basis is a tone switch: system_ideal means Marque is being better than the rule that bound the author, and the card never frames it as their error.
Today: rule · severity · basis, as is.
_M · I_
**anchor**
{ kind: span | portion | page | document | bundle, span?, portion? } — the thing that owns the requirement. A missing mark anchors to its portion; a CAB to the document; a correction to its span.
Today: span + candidate_span on findings; scope + an optional span on document artifacts. Same facts, two shapes.
_M · I_
**marking**
**.as_written**
**.shape**
(//JOINT S AUS GBR//REL TO USA, GBR)
The recognized marking, in full; a masked shape where parts are unrecognized. Marque says it, so every surface shows the same thing. Today: the host reads the span itself; recognized_canonical exists only on decoder findings.
_M · U_

### B · What Marque says
**says.text**
**says.template**
This marking can't be right as written: a joint marking always includes the U.S., and every joint producer must be able to receive it.
One plain sentence from a closed template; judges the text, never the person. The template is the kit's styling and grouping key. Today: message.text · message.template, as is.
_M · U_
**says.citation**
**says.caveat**
says.help[]
CAPCO-2016 §H.3 · p. 57
Typed citation → the chip. The ISM caveat, when present, must show. help[] lists which tokens in the marking have help entries — the tooltip hooks. Today: citation · caveat as is; help lives on a separate vocab endpoint.
_M · (U) · I_

### C · What Marque did, or could
**outcome.kind**
choices — applied · available · chosen_over · choices · needs_fact · withheld · covered_by
One word for what happened. Today: read fix, alternatives, withholding_reason and sibling_repair together to work it out — board 1b has the mapping.
_M · I_
**outcome.result**
**outcome.because**
The marking after the repair, rendered — and, for a chosen reading, why it won: manual_prescribed · page_sibling · authored_token · most_restrictive, the protective tie-break that is explicitly not a claim about intent.
Today: ranking_evidence exists; the result marking renders only at fix time for structural repairs. The card needs it at lint time.
_M · U_
**outcome**
.readings[]
jointly_owned — produced by the U.S., the UK and Australia together → (//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
foreign_owned — produced by the UK and Australia, without the U.S. → (//AUS GBR S//REL TO USA, AUS, GBR)
[new value] — British, with some Australian information → (//GBR S//FGI AUS//REL TO USA, GBR)
Each lawful reading: { asserts, text, result }. Today: alternatives[] carry asserts and text but not the marking they produce; the third reading has no asserts value.
_M · U · I_
**outcome.reason**
**outcome.covered_by**
Why nothing was done, when nothing was; or which finding's repair already covers this one — collapsed into that card, never a second one.
Today: withholding_reason · sibling_repair, as is.
_M · I_

### D · What Marque asks, and of whom
**asks.kind**
**asks.text**
asks.options[]
**asks.field**
ownership — "Who collected or produced this information?" — options are the readings above; or a field to fill (a date). The kit always appends "I don't know, or it's not my call."
Kinds: ownership · source_disclosure · compartment · document_date · date_reading · confirm_intent. The question is semantic — the fact Marque lacks — so Marque writes it. Today: lint_decision.options and prompt carry the pieces; nothing carries the question.
_M · U_
**needs_person**
**blocks**
required · finalize — needs_person: none · optional · required; blocks: never · finalize · now
The two semantic halves of attention. Whether a person is needed and whether an open finding stops finalize are Marque's to say; when is the host's. Today: derivable from the outcome, not emitted — and every host would derive it differently.
_M · I_
depends_on[]
Ids whose answer may change this finding's value. The banner's result waits on paragraph 3.
How the pane says "computed now; may change" without inventing a fourth confidence state. Today: in the decision trace's cascade chains, not on the lint wire.
_M · I_

### E · The document, per lint
**document**
.artifacts[]
**.ready**
**.blocking[]**
Each artifact: { kind, scope, state, derived, placement, depends_on }. ready is true when nothing needs a person and nothing absent-but-required remains; blocking lists why not. Re-evaluated at finalize — a lint, not a memory.
Today: artifacts carry kind, scope, the five-state presence × requirement, derived_value and placement — this part is close. Nothing carries ready or blocking.
_M · U · I_

### F · Never on Marque's wire — the kit's state, keyed by id
**applied**
**completed**
**deferred_to**
**answered**
**seen**
identified
generated
**applied**
**completed**
ready
The host's half of the ladder, persisted by the host, read by the pane, the stamp and the gate. Identified and generated come from Marque; applied, completed, deferred and seen are the host's; ready is Marque's again, at finalize.
_K · H · I_
**attention**
**action**
action required = needs_person × blocks × the host's moment × seen. Board 1b is the function.
Answer
Ask me at finalize
Actions follow outcome.kind: applied → undo · available → apply · chosen_over → switch · choices or needs_fact → answer, defer · withheld → none, or the host's own edit.
_K · U_

### F.1 · The host loop — how acts reach the document

The kit records; the host writes; Marque re-lints. `src/state.ts` and `mount()` in `src/render.ts` implement this; the tests in `test/state.test.ts` are its examples.

**The state.** Plain JSON the host persists whole: `{ log, seen, linted }`.
- `log` is append-only: `{ id, act, value, at, about }`. `act` is one of answered · changed · kept_as_written · deferred · declined (marque-dev#2643). A `changed` with a null value takes the last decision back to Marque's result. `about` is a snapshot of what the act was about: rule, place, the marking as written, Marque's outcome and question. Markings and Marque's words only, never body text.
- `seen` is `[{ id, result }]`. Seeing is of a result, not an id, so a new result under a stable id is unseen again.
- `linted` is how many log lines the current lint already reflects.

**The loop.**
1. The person acts. The kit appends to the log and calls `onChange(state, act)`. `act` is null when only bookkeeping moved (seen, the checkpoint); persist the state either way.
2. The host writes what the act asks for. The kit never edits the document.
3. The host re-lints and calls `update({ doc, linted, seq })`. `linted` is `state.log.length` when that lint began, and `seq` is the host's request counter. A synchronous host can omit both. A response whose `linted` is behind the checkpoint, or whose `seq` is older than the last one shown, is stale and ignored; updates with the same `seq` are one lint sending partial results, then the rest. The checkpoint never moves back.

**Between steps 1 and 3** the act is generated, not applied (DECISIONS #4).
- The card shows it: the answer as the headline, the marking it asks for, and "Waiting to be written" on an artifact.
- `document.pending` lists it, and `ready` is false until a lint that includes it arrives.
- Pending means the act writes something: an answer, an override, an artifact applied or removed, or a take-back of one a lint already wrote. Taking back one nobody wrote cancels it and writes nothing.
- A take-back of a written act reopens the finding from that act's snapshot: the question, the readings and the rung it had.

**After step 3** the new findings are the truth.
- Edits before the checkpoint no longer overlay, so a renewed question under the same id is open again.
- Overrides, deferrals and declines still overlay, because the engine has no shape for them yet (#2643).
- An override holds only while the as-written marking and Marque's result match its snapshot.
- Acts on ids the lint no longer lists move to `document.withdrawn` for the receipt, with their snapshots. They are never pending.

**Ready** = nothing in `blocking` and nothing in `pending`. Marque decides `blocking`; the kit only removes what the person has settled. A fixable artifact Marque derived (the banner) is not a blocker, because the host may write it at the gate (C10).
Who supplies each slot
M — Marque emits it
K — the kit derives or keeps it
H — the host supplies it
Who needs it
U — the person, by default
(U) — the person, on request
I — the host, always
The line this draws
Marque says what it saw, what it means, what it did or could do, what it asks, whether a person is needed, and what blocks. The kit turns that into a rung and remembers what the person did. The host says when it is, and where things go.
Nothing presentational crosses into Marque. Nothing semantic is left for a host to guess.
Most of this exists
New on the wire: id · marking.as_written · outcome.kind · result markings · asks · needs_person · blocks · depends_on · ready. The rest is renaming and regrouping what is already emitted.
