<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->


# The finding contract

All documents and markings in this repo are fictional examples.

The shape of a finding the kit consumes and the engine builds to. Each slot has a definition, a note on what the lint wire carries now, who supplies it (M = Marque, K = kit, H = host) and who reads it (U = shown to the person, (U) = on request, I = integrator only). Engine-side asks that fall out of this are tracked internally.

_Design specification for @knitli/marque-kit. Edit here._

**Adoption and migration status:** the readiness model was adopted on 14 November 2026 and is recorded in Marque MD-0043. Coordinated contract/runtime migration across engine, kit and internal callers remains pending; this document states the target and does not claim end-to-end conformance.


---

## The finding — the shape the kit consumes, and the engine builds to
Marque emits semantics: what it saw, said, did, asks, and whether a person is needed. The kit derives the rung and keeps the host's state. Each row says where its value comes from today. Shown for the JOINT case.


### A · Identity and place
**id**
Stable across re-lints while the marking and its place survive. The key for host state, deferrals, and withdrawing a stale question.
Not yet emitted: findings are keyed by rule + span, and spans move with every keystroke above them.
_M · I_
**rule**
**severity**
**basis**
Severity describes diagnostic seriousness and does not determine attention or readiness. basis is a tone switch: system_ideal means Marque is being better than the rule that bound the author, and the card never frames it as their error.
Today: rule · severity · basis, as is.
_M · I_
**anchor**
{ kind: span | portion | page | document | bundle, span?, portion? } — the thing that owns the requirement. A missing mark anchors to its portion; a CAB to the document; a correction to its span.
Not yet emitted in this shape: span + candidate_span on findings; scope + an optional span on document artifacts. Same facts, two shapes.
_M · I_
**marking**
**.as_written**
**.shape**
(//JOINT S AUS GBR//REL TO USA, GBR)
The recognized marking, in full; a masked shape where parts are unrecognized. Marque says it, so every surface shows the same thing. Not yet emitted: today the host reads the span itself.
_M · U_

The host supplies concealment as typed masks. A span covers UTF-8 bytes in the supplied marking text. An inline mask occupies a position among already disclosed tokens and carries no source characters. The renderer and action snapshots use the same disclosure projection. If inline masks cannot be bound to the supplied text, the kit displays the supplied mask types and withholds the ambiguous text.

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
Marque reports the supported semantic result, possible readings, proposed changes and unresolved requirements. A finding's `outcome.kind` is explanatory; it never grants or denies readiness by itself.

Preserve `available`, `chosen_over`, `choices`, `needs_fact`, `withheld` and `covered_by` where their meaning is clear. The engine-side `applied` label must distinguish a selected/proposed result from a host write; `generated` is a proposed name. Reserve `applied` and `completed` for host-confirmed actions represented in kit/host state and verified against a fresh evaluation. Update producers and consumers together.

Every offered reading carries its assertions, rendered result and changed layers/axes. Keep an authored reading distinct from a synthesized protective fallback. A fallback may be a permitted disposition for the operation while leaving author intent unresolved; it is not evidence that the author asserted it. Previews are hypothetical evaluations and do not enter the source record or clear blockers.
_M · U · I_

### D · What Marque asks, and of whom
**asks.kind**, **asks.text**, **asks.options[]**, **asks.field**
ownership — “Who collected or produced this information?” — options are the readings above; or a field to fill (a date). The kit always offers a free answer and “Not my call.” The question is semantic — the fact Marque lacks — so Marque writes it.
_M · U_

**needs_person** and **blocks** are separate engine statements. `needs_person` controls the person-facing rung together with the host's moment. `blocks` says whether an unmet semantic requirement prevents the requested operation. Neither is derived from severity or `outcome.kind`. Each blocker identifies its requirement, scope, supporting evidence or incompleteness, and an acceptable next action. A blocker may have `needs_person=none` when automatic host work can discharge it. A weak suspicion may need a person while `blocks=never`; failed or incomplete examination cannot establish readiness.
_M · I_

**depends_on[]** lists findings whose answer may change this finding's value. Artifact/field dependencies remain represented even when the banner does not change.
_M · I_

The kit never drops a blocker because an overlay changed `needs_person` to `none`. Seeing, deferring, declining, answering, keeping text or hiding a card cannot clear an engine blocker. A pending answer may change a hypothetical result, but the blocker remains until a complete current evaluation confirms the requirement is satisfied or permissibly disposed.

### E · The document, per lint
The document envelope reports readiness and blockers for one evaluated snapshot. It identifies enough context to tell whether the evaluation applies to the host's current outgoing revision, selected scope and policy, and states whether examination completed. A missing envelope, truncated/partial response, stale revision, missing required scope or absent completeness signal is **not ready**; an empty blocker list cannot stand in for an evaluation.

Engine snapshot readiness is true only when evaluation completed and no applicable mandatory requirement remains unsatisfied. A permitted fallback may satisfy a requirement without settling intent; retain that question and uncertainty separately.

Kit/host effective readiness is true only when snapshot readiness is current, required and accepted writes/placements are confirmed, no accepted change awaits application or evaluation, and named host acceptance checks pass. An unaccepted optional proposal is not a pending write. A selected result awaiting a required write is generated, not applied. A host write does not clear the blocker until a fresh evaluation confirms the current result. Partial updates may refresh displayed findings but cannot establish readiness or confirm unreturned scope.

Exact field names/layout and revision-token representation remain implementation choices under the selected Fact contract. Artifact rows and blocker reasons come from the same semantic evaluation, not from whether a row happens to be present in a projection.
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
Interaction state is persisted by the host. Identified and generated come from Marque; applied, completed, deferred and seen are host state. Snapshot readiness is Marque's conclusion for a complete evaluation; effective readiness also requires current outgoing state and confirmed host work.
_K · H · I_
**attention**
**action**
action required = needs_person × blocks × the host's moment × kit interaction state. DERIVATION.md specifies the rung function.
Answer
Ask me at finalize
Actions follow semantic asks, proposal eligibility and host state. An outcome label alone never authorizes a write.
_K · U_

### F.1 · The host loop — how acts reach the document

The kit captures; the host transaction appends and writes; Marque re-lints. `packages/core/src/state.ts` and `mount()` in `packages/kit/src/render.ts` implement the interaction loop; `packages/core/test/state.test.ts` records its examples. Readiness migration is pending as stated above.

**Historical markings and answers.** History and receipts show the act and its time. An installation can supply a current display for its details through `historyDisclosure`. Each display belongs to one request, sequence and subject in the active document and chain. Its evaluation basis and viewer disclosure revision must match the host’s current values. The kit withholds the payload on missing, stale or conflicting evidence, including for withdrawn findings. The authenticated workspace keeps the original audit record.

**The state.** Plain JSON persisted by the trusted host workspace: `{ log, seen, linted, actSequence, actHistoryCoverage, pendingAppends }`. This is private interaction history. It does not go into document metadata, a seal, or a portable sidecar.
- `log` is append-only: `{ sequence, requestId, id, act, value, at, about, binding? }`. `sequence` is a checked, one-based protocol sequence; `actSequence` is the last issued sequence, not a count inferred from `log.length`. The first append after `empty()` is sequence 1. Each request has a stable `requestId`; retrying it after a lost acknowledgement returns its existing entry, while reusing the key for different request content is refused. `act` is one of `answered`, `changed`, `kept_as_written`, `deferred` or `declined`. A `changed` with a null value takes the last decision back to Marque's result. `about` snapshots what the act concerned: rule, place, marking as written, Marque's outcome and question. `binding` carries known subject/question/revision/payload/source/basis references. These store no document body text.
- `actHistoryCoverage` describes the ordered history lane independently of the issuance watermark. Before issuing a new sequence, the core verifies that a `complete` declaration matches every retained row in order; a declaration cannot hide a missing, duplicate or out-of-order row. Legacy state with no watermark or coverage remains unknown; partial/unavailable history, or coverage that stops before the watermark, cannot prove an absent request key was never committed. The kit replays an exact key it can uniquely prove from a retained valid row within the known frontier, even when other history is incomplete. For a new key, it retains the exact request in `pendingAppends`, outside `log` and outside the engine's ordered history, until the trusted store can establish complete authoritative request history.
- `pendingAppends` may contain a durably staged request (`state: staged`) or a refused unsequenced request (`state: pending_sequence`, with a reason). The host stages the exact request before attempting the append, then atomically consumes that staged row when it records a commit or refusal. The same request key may be retried after the owner repairs missing history or a malformed watermark; success removes that pending copy atomically with the new ordered entry. At `Number.MAX_SAFE_INTEGER`, the checked arithmetic refuses before history-shape checks: the request remains unsequenced, while the existing log, watermark and coverage stay unchanged; exhaustion is terminal for that chain. The pane skips terminal refusals when advancing to another staged request but keeps them visible. A new user action requires a new request key.
- The host's append transaction durably records the checked state and a separate pending physical-write intent before acknowledging a commit. The write intent is keyed to the committed request/entry and basis; it remains recoverable across reload until the host has actually acknowledged the write and a confirming current evaluation arrives. A replay does not add another log row, but notifies the host with the same request key and entry so its idempotent outbox can resume unfinished physical work.
- `seen` is `[{ id, result }]`. Seeing is tied to a result, so a new result under a stable id is unseen again.
- `linted` is how many log lines the current lint already reflects.

**The loop.**
1. The person acts. The host durably stages the immutable request and `requestId` before the kit invokes its atomic append port. A committed acknowledgement is accepted only if the returned entry exactly matches the request and the shared core validator confirms coherent ordered history; the pane never adopts malformed acknowledgement state or dispatches its write. It then calls `onChange(state, notice)` with the exact committed request key and entry; `notice.replayed` says whether this was an acknowledgement retry. The host resumes only still-pending work by that key. A refusal is retained for recovery but does not call the document-write path. `act` is null when only bookkeeping moved (seen or the checkpoint); persist the state either way.
2. The host writes what the act asks for. The kit never edits the document.
3. The host re-lints and calls `update({ doc, linted, seq })`. `linted` is `state.log.length` when that lint began, and `seq` is the host's request counter. A synchronous host can omit both. A response whose `linted` is behind the checkpoint, or whose `seq` is older than the last one shown, is stale and ignored. Updates with the same `seq` may deliver partial results followed by the rest; the checkpoint never moves back. Partial results may refresh findings but cannot establish readiness or confirm unreturned scope.

**Between steps 1 and 3**, accepted work that requires a write is generated, not applied (DECISIONS #4).
- The card shows the answer as its headline, the marking it proposes, and “Waiting to be written” on an artifact.
- `document.pending` lists accepted writes awaiting application or confirming evaluation; effective readiness stays false while any remain. A valid answer that changes no physical text still needs engine evaluation of its assertions; a local overlay is not confirmation.
- The kit's projection merges its own outstanding work with incoming `document.pending` and `document.awaitingWrites`, preserving host-owned work. The host removes a pending item only after application and a confirming current evaluation; an awaiting-write token remains until that write is acknowledged and evaluated.
- Pending physical work includes an answer, override, artifact applied/removed, or take-back of an act already written. Taking back an act nobody wrote cancels it without a host write.
- A take-back of a written act reopens the finding from that act's snapshot: its question, readings and rung.

**After a complete current response for step 3**, engine findings and blockers are authoritative for that evaluated snapshot.
- Edits before the checkpoint no longer overlay, so a renewed question under the same id is open again.
- Overrides, deferrals and declines may continue to overlay presentation state where the engine has no corresponding act shape; they never erase a semantic blocker or count as a permitted disposition by themselves.
- An override holds only while the as-written marking and Marque's result still match its snapshot.
- Acts on ids the lint no longer lists move to `document.withdrawn` for the receipt, with their snapshots. They are never pending.

A write-confirmation token is unavailable (`null`) when its evaluation basis contains a masked reading. In that case a required write or named acceptance check stays unconfirmed. The Word adapter also holds physical edits that would use a masked display as replacement text.

**Effective readiness** requires an affirmative complete/current engine snapshot with no mandatory blocker, the host's confirmation that required and accepted writes/placements match the outgoing document, no accepted work awaiting application or re-evaluation, and any named host acceptance check passing. An unaccepted optional proposal does not count as pending work. The host may place a derived artifact at its finalize/send gate when the contract allows it, but it is not shown as written before success.

For a native Classification Authority Block (CAB) snapshot, the host calls `parseNativeJson(text, maxBytes)` from the core package's `native-wire` export and places the returned envelope in `document.native_evaluation`. The `native-cab` export's `readCabSnapshot` requires the requested target, profile and an independently obtained current evaluation basis. It returns the engine's scoped requirements, artifacts and host-work status, or `null` when the binding cannot be established. The caller sets a UTF-8 byte limit for each JSON input. This route covers one CAB evaluation. Whole-document finalize and send require a wider evaluation.

A v2 CAB finding carries either an issued subject or the engine’s reason that identity is unavailable. Its requirement, explanation and requested action can still be displayed. An unavailable subject cannot anchor a question, a result or a host write. The pane shows the missing identity alongside the surviving finding. A fresh evaluation of the confirmed target revision supplies the current field states.

In Word, the installation can return a `native_cab` session for the active document. It supplies the wire JSON, document and chain, a separate scope request, and the installation’s `nativeMaxBytes` limit. The pane displays the CAB field states and source coverage read-only. An optional `readNativeCab()` refresh clears the previous scope immediately. A late reply, a document switch, or a missing current binding leaves those details unavailable.

Restricted viewers use a separate `native_semantic_results` session. It accepts only the source-free `knitli.native-semantic-results.v1` projection, an independently current document/viewer/principal context, and a matching host-issued grant; it never accepts a legacy evaluation or source-marking binding. The selected row list discloses its count and order, so each emitted row must be explicitly in the grant. Coverage, meaning, support kinds, and dependency shape are separately gated; dependency counts are visible only when that row's dependency permission is granted, and links use compact output-local ordinals or `unavailable`. The wire grant id is a match token, never authority. This read is not a readiness verdict and cannot authorize writes or finalization. No concrete production Office provider is installed in this repository; the installation must keep legacy evaluation and source-marking data within its trusted side for restricted viewers and return only this sanitized session.

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
This contract is the target for the coordinated pre-release rewrite. This document update does not establish runtime conformance; the complete readiness envelope, completeness propagation and host-confirmed effective readiness still require end-to-end evidence.
