<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->


# The components

The inventory in build order, then one section per component: what it is, its rules, its copy rules, and what it reads from the engine. Every component was designed on one memo (see `fixtures/memo.txt`); the expected findings are in `fixtures/memo.findings.json`.

_Extracted from the Marque UI kit design canvas (boards: Inventory, C2-Marking, C3-Finding, C4-Decision, C5-Help, C6-Pane, C8-Inline, C9-Artifact, C10-Gate, C11-Derivation, C12-Receipt, C13-Vocab), 21 Oct 2026. The canvas is the visual record; this file is the text the kit is built to. Edit here from now on._


---

## The kit's components, in build order
Ordered by what the first host (a Word-like pane) needs to work end to end, not by size. Each row says what the component reads from the finding contract and what Knitli already provides. Stamp, Button, ConfidenceTag and Arrow are Knitli primitives the kit uses as-is; they are not listed. Status: built names the board where a first full version lives (updated 14 Oct, overnight build); wire means a wireframe only; — means not started.

0 · Foundation nothing ships without these
#
component
what it does
reads
from Knitli
status
1
Theme layer
light + dark, host overrides
Two shipped themes (Reference light, Instrument dark) plus the host override surface: fonts, colors, radii. The meaning-carrying shapes — thin underline = changed, dotted = can act, double rule = must act, dashed = absent — are not overridable. Theme is set once per pane with data-theme.
— (kit-side)
tokens.css, both surfaces
v0.3 · T1–T5
2
Marking
the text primitive
A marking rendered verbatim in OCR-B, never wrapped or dimmed, with derived / review / plain states. The kit adds what Knitli's lacks: a masked region for bytes Marque couldn't identify ((TS//______//REL TO USA, KOR, ___)), FGI source concealment, and a per-token hover target for tier-1 help.
marking.as_written · .shape · outcome.result
Marking (base)
v1 · C2
3
Finding card
one component, five rungs
The card at every rung. Quiet is a collapsed row; Noticeable is the comma card; Advisory is the one-action card (blue); Action required carries the question (gold, double rule); Blocking is the same card with defer removed. Override exposure follows the citation's source.
the whole contract
Card, Stamp, Marking
v3 · C3
4
Decision prompt
the asks renderer
Lives inside the finding card. Options with the marking each produces, "I don't know / not my call", "ask me at finalize", and a free field for the prompts that need a value (a document date). States the dependency when there is one: "the banner waits on this."
asks · outcome.readings[] · depends_on
Field, Button
v1 · C4
5
Help, three tiers
tooltip · Why? · section
Tier 1: per-token tooltip from help_anchors (what REL TO means, who is in FVEY). Tier 2: the Why? popover — plain reason, the manual's quoted line, the citation, the override link. Tier 3: the section window that opens the manual at the cited passage. Popover and window, never modal.
says.help[] · says.citation · .caveat
Callout (base)
v1 · C5
1 · The pane what makes a host usable
6
Findings pane
the list and its sections
The container the host mounts. Sections by rung — Needs you, Worth a look, Before you finalize, Done quietly — with the collapsed finding row as the item. Carries empty states ("Nothing needs you"), the fail-closed state, and the engine-unavailable state.
a list of findings · document.ready
—
v1 · C6
7
Document status
strip or ribbon tile
One line the host can place anywhere: the count that needs a person, the resolved banner as it stands, and whether the document is ready. The host decides where it lives; the kit decides what it says.
document.ready · .blocking[] · the banner artifact
Stamp, Marking
v1 · C6
8
Inline mark
in the document itself
The mark on the marking's span inside the editor: underline, dotted, double rule, dashed placeholder for a missing portion mark. One behavior, several adapters — a web overlay where the host allows drawing, Word's own formatting plus selection-follow where it doesn't.
anchor · attention · artifact.state
—
v1 · C8
9
Artifact card
banner · CAB · notice · caveat
The document-level findings: a banner derived from the portions (with what it waits on), an authority block with per-field blanks a person fills, a notice with its placement guidance. One card, kinds by artifact.kind; it says what is missing, not what is wrong, when there is nothing written yet.
document.artifacts[] · placement · depends_on
Card, Field, Marking
v1 · C9
10
Finalize gate
where Action required becomes Blocking
The host calls it at the moment that matters — send, save, publish. It lists what is still open, in the pane's own words, and offers the answers inline. Nothing new to learn: it is the Needs-you section with defer removed.
document.blocking[] · needs_person · blocks
Button
v1 · C10
2 · The trust surface why a classifier believes it
11
Derivation panel
how Marque got here
For a banner or a portion: the fold from facts to result, each step with its rule and citation. Knitli's panel is the frame; the kit feeds it the resolution trace.
outcome.because · the decision trace
DerivationPanel, Arrow
v1 · C11
12
Audit receipt
the session, readable
The audit stream rendered for a person: what changed, by whom, when, under which rule — including overrides kept as written. Verifiable against the session root. The same component serves a single document and a batch.
the audit stream
Receipt, DataTable
v1 · C12
13
Vocabulary lookup
trigraphs · tetragraphs · members
The data API as a surface: look up a country or tetragraph, list a tetragraph's members, see a token's help. Feeds tier-1 tooltips and stands alone as a small browser.
the vocab endpoints
DataTable, Field
v1 · C13
3 · Later hosts and roles after the first pane ships
14
Batch results table
many documents
Completion-order results correlated by id, counts by rung, drill-in to a document's pane.
batch results
DataTable
—
15
Policy & rules settings
the config author's view
Which rules are on, severity overrides, aliases and macros — shown as what .marque.toml already says, never as a place to widen what the engine does.
config, rule catalog
Field, DataTable
—
Cross-cutting, not components: keyboard focus order and live-region announcements for every rung change (a new Action required is announced; a Quiet change is not); reduced-motion; the color-independent shapes above; copy rules from the message-clarity guide. Not in the kit: the apply/edit step and any format adapter — the kit renders decisions, the host applies them.


---

## Marking — the text primitive
Component 2. Everything else in the kit renders markings through this. Four states, three sizes, two masks, help on every token, and the fit and long-marking rules from T3 and T5 — in both themes.

States · light
(S//REL TO USA, GBR)plain — as written or as read
(S//REL TO USA, GBR)derived — Marque wrote it; blue says the system did
(//JOINT S AUS GBR//REL TO USA, GBR)review — a person must look; gold
(S//REL TO USA GBR)unverified — no basis in the source yet
Sizes
(S//REL TO USA, GBR)xs · 12px · a collapsed row. Never smaller.
(S//REL TO USA, GBR)sm · 13.5px · the default, in cards and options
SECRET//FGI AUS GBR//NOFORNmd · 16.5px · a banner in the status strip; stacks like any other
States · dark
(S//REL TO USA, GBR)plain — as written or as read
(S//REL TO USA, GBR)derived — Marque wrote it; blue says the system did
(//JOINT S AUS GBR//REL TO USA, GBR)review — a person must look; gold
(S//REL TO USA GBR)unverified — no basis in the source yet
Sizes
(S//REL TO USA, GBR)xs · 12px · a collapsed row. Never smaller.
(S//REL TO USA, GBR)sm · 13.5px · the default, in cards and options
SECRET//FGI AUS GBR//NOFORNmd · 16.5px · a banner in the status strip; stacks like any other
What this component is
The text primitive every other component uses. It renders a marking verbatim in the mark font — never wrapped inside a token, never dimmed, never truncated — and carries four states, three sizes, two masks, and help on each token. It reads the marking as layers and tokens from the engine; it never parses a string. Copy yields the plain marking (minus masked bytes).

Props
1marking — layered tokens (what the engine emits), or a string for the host's own text.
2state — plain · derived · review · unverified.
3size — xs · sm · md. Floors apply; density never changes these.
4form — full · folded · summary · diff (see T5). Default full; stacks itself when it must wrap.
5masks — unidentified spans and concealed codes arrive from the engine as typed regions; the kit draws them, never decides them.
6help — token ids resolved against the vocabulary for tier-1 tooltips and the spoken form.
Two masks · light
(TS//__________________//REL TO USA, KOR, _____)Unidentified. Marque could not read these bytes. It shows where they are and how long they are, as underscores — never the bytes. The recognized tokens around them are shown in full. Hover: "18 characters Marque couldn't identify."
(//FGI ███ S//REL TO USA, GBR)Concealed. Marque read the owner code and must not show it: the source is concealed under the manual's FGI rules. Blocks, one per character, everywhere the marking appears — before-image, result, every reading. Only the presence of FGI is disclosed. Hover: "Source concealed."
(//FGI S//REL TO USA, GBR)What Marque writes when the source must stay concealed: FGI with no code. That is a lawful marking, not a mask, so it is set plainly.
Two masks · dark
(TS//__________________//REL TO USA, KOR, _____)Unidentified. Marque could not read these bytes. It shows where they are and how long they are, as underscores — never the bytes. The recognized tokens around them are shown in full. Hover: "18 characters Marque couldn't identify."
(//FGI ███ S//REL TO USA, GBR)Concealed. Marque read the owner code and must not show it: the source is concealed under the manual's FGI rules. Blocks, one per character, everywhere the marking appears — before-image, result, every reading. Only the presence of FGI is disclosed. Hover: "Source concealed."
(//FGI S//REL TO USA, GBR)What Marque writes when the source must stay concealed: FGI with no code. That is a lawful marking, not a mask, so it is set plainly.
Why two masks
Underscores say "we couldn't read this"; blocks say "we read this and may not show it." A classifier needs to tell those apart at a glance: the first means the document has a problem, the second means Marque is doing its job. Both are drawn the same way on every surface — in the card, in the row, in the receipt, in print — because a mask that appears in one place and not another is a leak.

Engine side. Masks must arrive as typed regions on the layered marking (kind: unidentified · concealed; span; length), not as pre-rendered underscores in a string — otherwise a marking that legitimately contains underscores is indistinguishable from a mask. Logged.

Help on a token · light
(S//REL TO USA, FVEY)
FVEY — Five Eyes: AUS, CAN, GBR, NZL, USA. Members · §Annex A
At rest a marking looks like a marking. Hover or focus a token that has help and it takes a dotted rule in act-ink; the tier-1 tooltip opens after 300ms, dark on light and light on dark, and never covers the marking itself. Keyboard: Tab reaches each token; Escape closes.
Spoken form
Screen readers get the marking read as words, not as punctuation: "Secret, releasable to U-S-A and F-V-E-Y" — built from the vocabulary's names, trigraphs spelled. The visible text stays verbatim; the spoken form is an aria-label.
Help on a token · dark
(S//REL TO USA, FVEY)
FVEY — Five Eyes: AUS, CAN, GBR, NZL, USA. Members · §Annex A
At rest a marking looks like a marking. Hover or focus a token that has help and it takes a dotted rule in act-ink; the tier-1 tooltip opens after 300ms, dark on light and light on dark, and never covers the marking itself. Keyboard: Tab reaches each token; Escape closes.
Spoken form
Screen readers get the marking read as words, not as punctuation: "Secret, releasable to U-S-A and F-V-E-Y" — built from the vocabulary's names, trigraphs spelled. The visible text stays verbatim; the spoken form is an aria-label.
Fixed, whatever the theme
·Mark font with a forced monospace fallback; 0.04em tracking; LTR; no filter, opacity or shadow.
·Breaks only between layers, list items and tokens; stacks one layer per line when it must wrap; one-character hanging indent.
·Never truncated, scrolled or shrunk below 13px, except the xs size in a collapsed row (12px) which is a pointer to the full form.
·Color never carries a state alone: derived and review have a border and tint; masks have a shape; help has a rule on hover.
In context · light
¶2Comma added(S//REL TO USA, FVEY)CHANGED
This documentSECRET//FGI AUS GBR//NOFORN
Comma added between countries. Was (S//REL TO USA FVEY), now (S//REL TO USA, FVEY).

2. (S//REL TO USA, FVEY) The host's own text, in the host's own font. The kit never restyles a marking inside the document; it only adds a shape.

In context · dark
¶2Comma added(S//REL TO USA, FVEY)CHANGED
This documentSECRET//FGI AUS GBR//NOFORN
Comma added between countries. Was (S//REL TO USA FVEY), now (S//REL TO USA, FVEY).

2. (S//REL TO USA, FVEY) The host's own text, in the host's own font. The kit never restyles a marking inside the document; it only adds a shape.

In context
Four places the same marking appears: a collapsed row (xs, a pointer), the status strip (md, stacked), inside a sentence (sm, inline, keeps its own break rules while the prose wraps around it), and the document itself — where the kit draws only the shape and leaves the host's font alone.



---

## Finding card — every rung, and after
Component 3. The same card at all five rungs on both themes, then the four states it can be in after the person touches it. The pane width is 340px throughout. The Advisory is paragraph 5, marked both NOFORN and REL TO; Marque kept NOFORN and the banner follows it.

The five rungs · lightQuiet · Noticeable · Advisory · Action required · Blocking — one component, cut down differently. 340px panes.
Quiet · a row in "Done quietly"
¶6Extra space removed(S//REL TO USA, GBR)CHANGED
¶1Extra space removedCHANGED
now (C//REL TO USA, GBR) was (C//REL TO USA, GBR)
One space after the comma, not two.

Why?CAPCO-2016 §H.8 p151
Nothing to do, so nothing but a row. Open it and the card is the Noticeable card without the headline. Quiet is the host's default for determined fixes with high confidence; a host may promote a rule to Noticeable, never the reverse past Noticeable.

Noticeable · a change worth a glance
Added a comma to paragraph 2's marking.
(S//REL TO USA, FVEY)was (S//REL TO USA FVEY)
Why?CAPCO-2016 §H.8 p151
Thin underline in the document; a plain card here. No Undo: the manual requires the comma. The override is one link inside Why? and is recorded.

Advisory · the safe reading, with the author's other reading offered
ALTERNATIVEParagraph 5
Paragraph 5 makes the whole document NOFORN.
It was marked (S//NF/REL TO USA, GBR) — both NOFORN and releasable to the UK, which the manual doesn't allow. Marque kept (S//NF), the safe reading, since it can't know which you meant. The banner follows it.

Banner, from what is known so far:SECRET//FGI AUS GBR//NOFORN
If paragraph 5 may go to the UK, as you also wrote, make it (S//REL TO USA, GBR) and the banner becomes SECRET//FGI AUS GBR//REL TO USA, GBR.

Make it REL TO USA, GBR
Leave it NOFORN
Why?CAPCO-2016 §H.8 p145
Dotted border and a blue stamp: the person can act. The safe reading is one the author wrote, so offering the other is not a new release decision — it's resolving their own contradiction. Leaving it needs no justification; nothing is recorded as an override.

Action required · a question
NEEDS YOUParagraph 3
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Something else — I'll type it
I don't know, or it's not my call
Banner, from what is known so far:SECRET//FGI AUS GBR//NOFORN
Answer
Ask me at finalize
Why?CAPCO-2016 §H.3 p55
Double gold border, gold stamp, the question as the headline, the marking as context, every reading with the marking it produces, a typed answer and "not my call" always available. The banner line shows what Marque can already resolve from the facts it has.

Blocking · the same finding, at the moment that matters
BLOCKS SENDINGParagraph 3
You tried to send. This has to be answered first; nothing else is holding the document.

Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Something else — I'll type it
I don't know, or it's not my call
Banner, from what is known so far:SECRET//FGI AUS GBR//NOFORN
If no one can answer — at a network boundary, say — Marque's most restrictive resolution keeps every stated equity:(S//FGI AUS GBR//NF)The host decides whether to apply it or hold.
Answer
Save as draft instead
Why?CAPCO-2016 §H.3 p55
Defer is gone; one line says why the card is in front of the person now, and one names the fallback Marque would take unattended — the most restrictive form that keeps every stated equity. Whether a host applies that or holds is the host's call.

The five rungs · dark
Quiet · a row in "Done quietly"
¶6Extra space removed(S//REL TO USA, GBR)CHANGED
¶1Extra space removedCHANGED
now (C//REL TO USA, GBR) was (C//REL TO USA, GBR)
One space after the comma, not two.

Why?CAPCO-2016 §H.8 p151
Nothing to do, so nothing but a row. Open it and the card is the Noticeable card without the headline. Quiet is the host's default for determined fixes with high confidence; a host may promote a rule to Noticeable, never the reverse past Noticeable.

Noticeable · a change worth a glance
Added a comma to paragraph 2's marking.
(S//REL TO USA, FVEY)was (S//REL TO USA FVEY)
Why?CAPCO-2016 §H.8 p151
Thin underline in the document; a plain card here. No Undo: the manual requires the comma. The override is one link inside Why? and is recorded.

Advisory · the safe reading, with the author's other reading offered
ALTERNATIVEParagraph 5
Paragraph 5 makes the whole document NOFORN.
It was marked (S//NF/REL TO USA, GBR) — both NOFORN and releasable to the UK, which the manual doesn't allow. Marque kept (S//NF), the safe reading, since it can't know which you meant. The banner follows it.

Banner, from what is known so far:SECRET//FGI AUS GBR//NOFORN
If paragraph 5 may go to the UK, as you also wrote, make it (S//REL TO USA, GBR) and the banner becomes SECRET//FGI AUS GBR//REL TO USA, GBR.

Make it REL TO USA, GBR
Leave it NOFORN
Why?CAPCO-2016 §H.8 p145
Dotted border and a blue stamp: the person can act. The safe reading is one the author wrote, so offering the other is not a new release decision — it's resolving their own contradiction. Leaving it needs no justification; nothing is recorded as an override.

Action required · a question
NEEDS YOUParagraph 3
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Something else — I'll type it
I don't know, or it's not my call
Banner, from what is known so far:SECRET//FGI AUS GBR//NOFORN
Answer
Ask me at finalize
Why?CAPCO-2016 §H.3 p55
Double gold border, gold stamp, the question as the headline, the marking as context, every reading with the marking it produces, a typed answer and "not my call" always available. The banner line shows what Marque can already resolve from the facts it has.

Blocking · the same finding, at the moment that matters
BLOCKS SENDINGParagraph 3
You tried to send. This has to be answered first; nothing else is holding the document.

Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Something else — I'll type it
I don't know, or it's not my call
Banner, from what is known so far:SECRET//FGI AUS GBR//NOFORN
If no one can answer — at a network boundary, say — Marque's most restrictive resolution keeps every stated equity:(S//FGI AUS GBR//NF)The host decides whether to apply it or hold.
Answer
Save as draft instead
Why?CAPCO-2016 §H.3 p55
Defer is gone; one line says why the card is in front of the person now, and one names the fallback Marque would take unattended — the most restrictive form that keeps every stated equity. Whether a host applies that or holds is the host's call.

After the person touches itanswered · deferred · kept as written · advisory taken
Answered
ANSWEREDParagraph 3
The U.S., the UK and Australia produced it together.
(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
Banner unchanged — every reading rolls up the same way:SECRET//FGI AUS GBR//NOFORN
Change my answer
Why?CAPCO-2016 §H.3 p55
The answer becomes the headline; the marking becomes derived. Changing an answer is a first-class ghost action, not an override — the person is the authority here, and the audit records both answers. Here every reading rolls up to the same banner, and the card says so rather than implying a change.

Deferred · now under "Before you finalize"
¶3Who produced this information?AT FINALIZE
¶4No portion marking yetAT FINALIZE
Deferral moves the row, keeps the gold off it until the moment comes, and never answers for the person. The card reappears unchanged, as Blocking, when the host calls the gate.

Kept as written · reported
Kept as written. Marque will report it.
REPORTED
(S//REL TO USA FVEY)Marque's reading (S//REL TO USA, FVEY)
Fix it after allCAPCO-2016 §H.8 p151
The one recorded override. The card says so in words and stamps it; the receipt carries it; the finding stays open in the audit even though the pane is quiet about it.

Advisory taken
Paragraph 5 now goes to the UK.
(S//REL TO USA, GBR)was (S//NF/REL TO USA, GBR)
Banner changes:SECRET//FGI AUS GBR//REL TO USA, GBR
Undo
Why?CAPCO-2016 §H.8 p145
The person chose this, so Undo is first-class. The card drops to Noticeable, and the banner line shows the consequence: the document is no longer NOFORN.

What stays constant across rungs. The anchor label (¶3), the marking as the primitive, the Why? and citation footer, the plain-sentence headline, and the rule that gold means a person must act and blue means they can. What changes is only how much of the contract is shown — Matrix A on board 1c, made real.
Advisory vs Action required. Advisory when the safe reading is one the author wrote (¶5: NOFORN was half of what they typed); Action required when the safe form is one nobody wrote (¶3: the fallback (S//FGI AUS GBR//NF) is a form, not a reading). Decided 16 Oct.
Copy rules applied. Headlines are sentences about the document, never about Marque. Reasons name the rule in plain words and never the severity. The chosen reading on an Advisory is called safe, never correct. System-ideal findings never use an error voice.


---

## Decision prompt — the asks renderer
Component 4. Lives inside the finding card; this board isolates it. Four shapes a question takes — a choice of readings, a value, a reading of a value, and the person declining — with the commit, deferral and routing the kit adds, in both themes at 400px.

Four shapes of a question · lightwhat the engine asks, and how the kit lets a person answer it
Choices · asks.kind = options · with the commit refused
NEEDS YOUParagraph 3
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Something else — I'll type it
I don't know, or it's not my call
Type the marking
Marque checks what you type against the grammar before it applies it, and keeps the question open if it can't read it.
Pick one reading, type one, or say it's not your call.
Answer
Ask me at finalize
Why?CAPCO-2016 §H.3 p55
Every question can be answered three ways: a reading, a typed marking, or "not my call". Choosing a reading never applies it; Answer is the commit. Answer is never disabled — pressing it with nothing chosen says what's missing, in the field's own error voice. Arrow keys move between readings; Enter on a reading chooses it; Enter on Answer commits.

A value · asks.kind = field · prompt: missing document date
NEEDS YOUWhole document
When was this document written?
Marque needs the date of origin to check the declassification instructions against it, and couldn't find one on the document.

Date written
Eight digits, year first — for 14 October 2026, 20261014. The manual's own format.
Use today, 20261014
It's on the document — let me point to it
Waits on this:Declassify On
Answer
Ask me at finalize
Why?CAPCO-2016 §E.1 p31
The field is set in the mark font because the person is checking a value, not reading prose. Two shortcuts the host can honor: today's date, and pointing at the document (the host returns a selection; the kit parses it). The dependency names the artifact that waits.

A reading of a value · prompt: ambiguous date
NEEDS YOUPage 1 · header
The document says 12/06/2024. Which date is that?
Both orders are in use, and the day and month are both twelve or under, so Marque can't tell.

Your answer
12 June 2024 — day, then month20240612
6 December 2024 — month, then day20241206
Neither — I'll type it
Date written
Use eight digits, YYYYMMDD — for 12 June 2024, 20240612.
Waits on this:Declassify On
Answer
Ask me at finalize
Why?CAPCO-2016 §E.1 p31
Options and a field in one prompt: the readings carry the value each produces, in the manual's format; "neither" opens the field. Validation is one sentence with the right answer in it, never "invalid input".

Routed · the person said "not my call"
OPEN · NOT YOURSParagraph 3
Who produced paragraph 3 — left for someone else.
Marque keeps the question open and reports it. The document can't be finalized until someone answers; the host decides who.

Still standing:(//JOINT S AUS GBR//REL TO USA, GBR)
Hand to
— the host's reviewer list —
Originator of paragraph 3
Classification advisory officer
Supplied by the host. Marque never stores a name; the audit records only that the finding was routed.
Hand it on
Actually, I can answer
Why?CAPCO-2016 §H.3 p55
Declining is an answer in its own right, not a deferral: the finding stays Action required for whoever gets it, and Blocking at finalize for everyone. The engine has no shape for this yet (logged).

Four shapes of a question · dark
Choices · asks.kind = options · with the commit refused
NEEDS YOUParagraph 3
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Something else — I'll type it
I don't know, or it's not my call
Pick one reading, or "not my call".
Answer
Ask me at finalize
Why?CAPCO-2016 §H.3 p55
Every question can be answered three ways: a reading, a typed marking, or "not my call". Choosing a reading never applies it; Answer is the commit. Answer is never disabled — pressing it with nothing chosen says what's missing, in the field's own error voice. Arrow keys move between readings; Enter on a reading chooses it; Enter on Answer commits.

A value · asks.kind = field · prompt: missing document date
NEEDS YOUWhole document
When was this document written?
Marque needs the date of origin to check the declassification instructions against it, and couldn't find one on the document.

Date written
Eight digits, year first — for 14 October 2026, 20261014. The manual's own format.
Use today, 20261014
It's on the document — let me point to it
Waits on this:Declassify On
Answer
Ask me at finalize
Why?CAPCO-2016 §E.1 p31
The field is set in the mark font because the person is checking a value, not reading prose. Two shortcuts the host can honor: today's date, and pointing at the document (the host returns a selection; the kit parses it). The dependency names the artifact that waits.

A reading of a value · prompt: ambiguous date
NEEDS YOUPage 1 · header
The document says 12/06/2024. Which date is that?
Both orders are in use, and the day and month are both twelve or under, so Marque can't tell.

Your answer
12 June 2024 — day, then month20240612
6 December 2024 — month, then day20241206
Neither — I'll type it
Date written
Use eight digits, YYYYMMDD — for 12 June 2024, 20240612.
Waits on this:Declassify On
Answer
Ask me at finalize
Why?CAPCO-2016 §E.1 p31
Options and a field in one prompt: the readings carry the value each produces, in the manual's format; "neither" opens the field. Validation is one sentence with the right answer in it, never "invalid input".

Routed · the person said "not my call"
OPEN · NOT YOURSParagraph 3
Who produced paragraph 3 — left for someone else.
Marque keeps the question open and reports it. The document can't be finalized until someone answers; the host decides who.

Still standing:(//JOINT S AUS GBR//REL TO USA, GBR)
Hand to
— the host's reviewer list —
Originator of paragraph 3
Classification advisory officer
Supplied by the host. Marque never stores a name; the audit records only that the finding was routed.
Hand it on
Actually, I can answer
Why?CAPCO-2016 §H.3 p55
Declining is an answer in its own right, not a deferral: the finding stays Action required for whoever gets it, and Blocking at finalize for everyone. The engine has no shape for this yet (logged).

What the engine supplies
1asks.kind — options · field · both. Today this is split across Plural, lint_decision.options and prompt (date-discovery only); the kit wants one field.
2asks.text — the question, as a sentence a classifier would ask. The kit never composes it from parts.
3asks.options[] — each with the facts it asserts, the plain reading, and the marking or value it produces. Readings and results travel together.
4asks.field — type, format, hint, and the artifact that waits on it.
5depends_on — only when readings differ in roll-up. If every reading rolls up the same way, nothing waits, and the card says so.
What the kit adds
·The commit. Choosing never applies; Answer does. One click undoes a wrong radio; one click cannot undo a wrong marking in a document that has already been sent.
·Three standing answers on every question: "something else — I'll type it" (a free answer, always — the engine's classifier-judgment cases are mostly things it doesn't handle yet, not things a person can't resolve), "ask me at finalize" (defer — the question comes back, as Blocking) and "not my call" (route — it stays open for someone else).
·Validation in one sentence with the right answer in it. Fields the person is checking are set in the mark font.
·Focus. Opening a question from the pane puts focus on the first reading; Escape returns it to the row. A screen reader hears the question, then the readings as "1 of 3", each with its spoken marking.
Copy rules
·Questions are about the information, not the marking: "Who produced this information?", not "Resolve the ownership axis."
·Readings are stated as facts a person could know: "The UK and Australia, without the U.S." Never "Option B".
·The reason Marque is asking comes after the question, and names the rule in words.
·Dates in the manual's own format, shown next to the words: 20240612 beside "12 June 2024".


---

## Help in three tiers — tooltip, Why?, the section
Component 5. A token, a rule, the manual. Tier 1 is the per-token tooltip (or, in Word, the selection-follow panel); tier 2 is the Why? popover with the rule and the quoted line; tier 3 is the manual section itself, landing on that line. Both themes.

Tiers 1 and 2 · lighta token · a rule
Tier 1 · token tooltip · web host
Added a comma to paragraph 2's marking.
(S//REL TO USA, FVEY)was (S//REL TO USA FVEY)
FVEY — Five Eyes: AUS, CAN, GBR, NZL, USA. A tetragraph; stands for its members in a REL TO list.
Register, Annex A
Hover 300ms or focus: the token takes the dotted rule, the tooltip opens below it, never over the marking. One sentence of meaning, one of use, one line of source. Escape or moving away closes it. Text comes from the per-token help the data API serves.

Tier 1 · selection follows · Word host
2. (S//REL TO USA, FVEY) Word can't draw a tooltip over the document, so the person selects the marking and the pane answers.

Selected · paragraph 2CHANGED
(S//REL TO USA, FVEY)
S Secret.
REL TO Releasable only to the countries listed; not releasable to any other foreign government. USA is always first.
FVEY Five Eyes: AUS, CAN, GBR, NZL, USA.
Why was it changed?CAPCO-2016 §H.8 p151
In Word the whole marking's tokens are listed in the pane for the selected paragraph. Same text, same source, no hover. The pane follows the selection; nothing is drawn in the document.

Tier 2 · Why? · a manual-bound rule
Why
Countries in a REL TO list are separated by a comma and a space. The manual requires it; it isn't a style choice.
"After "USA", list the required one or more trigraph country codes in alphabetical order followed by tetragraph codes listed in alphabetical order. Each code is separated by a comma and a space."
CAPCO-2016 · §H.8 · Authorized for release to · p151Read the section
Keep it as written — Marque still reports it in the audit.
Three things, always in this order: the rule in plain words, the manual's own sentence, the citation with a way in. The override link appears only on rules the person may override, and says what overriding costs.

Tier 2 · Why? · an advisory
Why
A portion can't be both NOFORN and releasable. Paragraph 5 said both, so Marque kept NOFORN — the safe reading — and offers the REL TO you also wrote. Because paragraph 5 is NOFORN, the whole document is.
"Cannot be used with REL TO, RELIDO, EYES ONLY, or DISPLAY ONLY."
CAPCO-2016 · §H.8 · Not releasable to foreign nationals · p145Read the section
Nothing to override: the safe reading is one you wrote. Either choice is yours, and neither is recorded as an override.
Same shape for an advisory. The quoted line is the NOFORN section's own relationship rule. The last line says plainly that there is no override, because both readings are the author's.

Tiers 1 and 2 · dark
Tier 1 · token tooltip · web host
Added a comma to paragraph 2's marking.
(S//REL TO USA, FVEY)was (S//REL TO USA FVEY)
FVEY — Five Eyes: AUS, CAN, GBR, NZL, USA. A tetragraph; stands for its members in a REL TO list.
Register, Annex A
Hover 300ms or focus: the token takes the dotted rule, the tooltip opens below it, never over the marking. One sentence of meaning, one of use, one line of source. Escape or moving away closes it. Text comes from the per-token help the data API serves.

Tier 1 · selection follows · Word host
2. (S//REL TO USA, FVEY) Word can't draw a tooltip over the document, so the person selects the marking and the pane answers.

Selected · paragraph 2CHANGED
(S//REL TO USA, FVEY)
S Secret.
REL TO Releasable only to the countries listed; not releasable to any other foreign government. USA is always first.
FVEY Five Eyes: AUS, CAN, GBR, NZL, USA.
Why was it changed?CAPCO-2016 §H.8 p151
In Word the whole marking's tokens are listed in the pane for the selected paragraph. Same text, same source, no hover. The pane follows the selection; nothing is drawn in the document.

Tier 2 · Why? · a manual-bound rule
Why
Countries in a REL TO list are separated by a comma and a space. The manual requires it; it isn't a style choice.
"After "USA", list the required one or more trigraph country codes in alphabetical order followed by tetragraph codes listed in alphabetical order. Each code is separated by a comma and a space."
CAPCO-2016 · §H.8 · Authorized for release to · p151Read the section
Keep it as written — Marque still reports it in the audit.
Three things, always in this order: the rule in plain words, the manual's own sentence, the citation with a way in. The override link appears only on rules the person may override, and says what overriding costs.

Tier 2 · Why? · an advisory
Why
A portion can't be both NOFORN and releasable. Paragraph 5 said both, so Marque kept NOFORN — the safe reading — and offers the REL TO you also wrote. Because paragraph 5 is NOFORN, the whole document is.
"Cannot be used with REL TO, RELIDO, EYES ONLY, or DISPLAY ONLY."
CAPCO-2016 · §H.8 · Not releasable to foreign nationals · p145Read the section
Nothing to override: the safe reading is one you wrote. Either choice is yours, and neither is recorded as an override.
Same shape for an advisory. The quoted line is the NOFORN section's own relationship rule. The last line says plainly that there is no override, because both readings are the author's.

Tier 3 · the manual itself
Tier 3 · the section · light
CAPCO-2016 · §H.8 · Dissemination control markingsAuthorized for release to p150–151
Previous
Next
Whole manual
Close
Authorized banner line marking title: AUTHORIZED FOR RELEASE TO [USA, LIST] · Abbreviation: REL TO [USA, LIST] · Portion mark: REL TO [USA, LIST], or REL when the portion's list is the same as the banner's.

Definition. REL TO is an explicit foreign disclosure and release marking to indicate the information has been predetermined by the originator to be releasable or has been released to the foreign country(ies)/international organization(s) indicated through established foreign disclosure procedures and channels and implementation guidance in this document. It is NOFORN to all other foreign country(ies)/international organization(s) not indicated in the REL TO marking.

page 151

### Additional marking instructions
Applicable to unclassified and classified information.
"[USA, LIST]" pertains to the string that contains "USA" followed by one or more Register, Annex B trigraph country code(s) or Register, Annex A tetragraph code(s), or Manual, Appendix B NATO/NAC markings used with the REL TO marking. "USA" must always appear first whenever the REL TO string is used to communicate release decisions either by the US or a Non-US entity.
After "USA", list the required one or more trigraph country codes in alphabetical order followed by tetragraph codes listed in alphabetical order. Each code is separated by a comma and a space.
"REL TO USA" or "REL USA" (i.e., there is not at least one country trigraph code or tetragraph code following the USA code), is not an authorized marking and is not allowed on US intelligence information.
Country trigraph codes/tetragraph codes are followed by a single forward slash if more dissemination controls follow or a double forward slash if non-IC dissemination control markings follow. If no markings follow, then no text or separating characters follow the last country code/tetragraph code.
### Relationship(s) to other markings
May be used with TOP SECRET, SECRET, CONFIDENTIAL, or UNCLASSIFIED.
Cannot be used with NOFORN or EYES ONLY.
May be used with RELIDO. May be used with DISPLAY ONLY.
The manual, sliced at build time into sections keyed by the typed citation, lands on the quoted sentence (highlighted) with the section around it. It is a window, never a modal: the pane stays usable, the person can keep it open while they work. Page breaks from the source are kept as labels so a printed manual and this view agree.

Tier 3 · the section · dark
CAPCO-2016 · §H.8 · Dissemination control markingsAuthorized for release to p150–151
Previous
Next
Whole manual
Close
Authorized banner line marking title: AUTHORIZED FOR RELEASE TO [USA, LIST] · Abbreviation: REL TO [USA, LIST] · Portion mark: REL TO [USA, LIST], or REL when the portion's list is the same as the banner's.

Definition. REL TO is an explicit foreign disclosure and release marking to indicate the information has been predetermined by the originator to be releasable or has been released to the foreign country(ies)/international organization(s) indicated through established foreign disclosure procedures and channels and implementation guidance in this document. It is NOFORN to all other foreign country(ies)/international organization(s) not indicated in the REL TO marking.

page 151

### Additional marking instructions
Applicable to unclassified and classified information.
"[USA, LIST]" pertains to the string that contains "USA" followed by one or more Register, Annex B trigraph country code(s) or Register, Annex A tetragraph code(s), or Manual, Appendix B NATO/NAC markings used with the REL TO marking. "USA" must always appear first whenever the REL TO string is used to communicate release decisions either by the US or a Non-US entity.
After "USA", list the required one or more trigraph country codes in alphabetical order followed by tetragraph codes listed in alphabetical order. Each code is separated by a comma and a space.
"REL TO USA" or "REL USA" (i.e., there is not at least one country trigraph code or tetragraph code following the USA code), is not an authorized marking and is not allowed on US intelligence information.
Country trigraph codes/tetragraph codes are followed by a single forward slash if more dissemination controls follow or a double forward slash if non-IC dissemination control markings follow. If no markings follow, then no text or separating characters follow the last country code/tetragraph code.
### Relationship(s) to other markings
May be used with TOP SECRET, SECRET, CONFIDENTIAL, or UNCLASSIFIED.
Cannot be used with NOFORN or EYES ONLY.
May be used with RELIDO. May be used with DISPLAY ONLY.
The manual, sliced at build time into sections keyed by the typed citation, lands on the quoted sentence (highlighted) with the section around it. It is a window, never a modal: the pane stays usable, the person can keep it open while they work. Page breaks from the source are kept as labels so a printed manual and this view agree.

Sources, one per tier
1Per-token help from the data API (the help-anchors file): one sentence of meaning, one of use, a source line. Tetragraphs also list their members.
2The rule's description and the citation's quoted line (says.text, says.citation.short). The kit renders them; it never writes a reason of its own.
3The manual, sliced at build into sections keyed by the typed citation, with the quoted span's offsets so the window can land on it. Can be a page or two; it scrolls.
Placement by host
·Web form. Tooltip anchored to the token; popover anchored to Why?; the window opens beside the pane, or over the page if there is no room, draggable.
·Word / Outlook. No drawing over the document: tier 1 is the selection-follow panel; tier 2 is the popover inside the pane; tier 3 opens as a separate Office dialog window, which the person can keep open.
·Batch review. Tier 1 and 2 as on the web; tier 3 as a side panel, since there is room.
Behavior
·Hover opens after 300ms; focus opens at once. Escape closes the innermost open thing and returns focus to where it came from.
·Popover max width 460px; it never covers the marking it explains. Window min width 520px; it never covers the pane.
·Never modal. A person reading the manual is still working; the document, the pane and the gate all keep working underneath.
·The quoted line is verbatim from the manual and re-verified at build; a citation that cannot land on its sentence does not ship.


---

## Findings pane and document status
Components 6 and 7. The pane at Word width (320) and web width (440), the five states it must have, and the status strip in its forms and states. Same memo as everywhere else.

The pane · lightsections by rung, the collapsed row as the item
320px · Word task pane · collapsed
(M)arque1 NEEDS YOU
This documentSECRET//FGI AUS GBR//NOFORNNot ready · 1 question · 1 missing mark
Needs you1
¶3Who produced this information?NEEDS YOU
Worth a look1
¶5Makes the whole document NOFORNALTERNATIVE
Before you finalize2
¶4No portion marking yetAT FINALIZE
CABClassified By and Derived From are blankAT FINALIZE
Done quietly3
¶2Comma added(S//REL TO USA, FVEY)CHANGED
¶1Extra space removedCHANGED
¶6Extra space removedCHANGED
Check before sendingReceipt
440px · web form · one row open
(M)arque1 NEEDS YOU
This documentSECRET//FGI AUS GBR//NOFORNNot ready · 1 question · 1 missing mark
Needs you1
¶3Who produced this information?NEEDS YOU
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Something else — I'll type it
I don't know, or it's not my call
Answer
Ask me at finalize
Why?CAPCO-2016 §H.3 p55
Worth a look1
¶5Makes the whole document NOFORNALTERNATIVE
Before you finalize2
¶4No portion marking yetAT FINALIZE
CABClassified By and Derived From are blankAT FINALIZE
Done quietly3
3 changes · showCHANGED
Check before sendingReceipt
What the pane is
The container a host mounts. Four sections, always in this order, each with the rung's shape as its mark: Needs you (double rule), Worth a look (dotted), Before you finalize (dashed), Done quietly (thin). A section with nothing in it is not shown. A row opens in place; one card open at a time; opening a row scrolls the document to the anchor where the host allows it.

Rules
1Order within a section is document order, never severity. The pane is a map of the document.
2Counts are of findings, and the head stamp counts only what needs a person now. "Before you finalize" is counted but not gold until the moment.
3Done quietly is collapsed by default to one row with a count. Nothing in it is ever hidden from the receipt.
4The footer offers the gate on demand ("Check before sending") and the receipt. The host calls the gate itself at its real moment.
5Live editing: a new finding enters its section with a 180ms fade and is announced ("Paragraph 3 needs you") if it is Action required; Quiet changes are not announced. Rows never reorder under the pointer.
The pane · dark
320px · Word task pane · collapsed
(M)arque1 NEEDS YOU
This documentSECRET//FGI AUS GBR//NOFORNNot ready · 1 question · 1 missing mark
Needs you1
¶3Who produced this information?NEEDS YOU
Worth a look1
¶5Makes the whole document NOFORNALTERNATIVE
Before you finalize2
¶4No portion marking yetAT FINALIZE
CABClassified By and Derived From are blankAT FINALIZE
Done quietly3
¶2Comma added(S//REL TO USA, FVEY)CHANGED
¶1Extra space removedCHANGED
¶6Extra space removedCHANGED
Check before sendingReceipt
440px · web form · one row open
(M)arque1 NEEDS YOU
This documentSECRET//FGI AUS GBR//NOFORNNot ready · 1 question · 1 missing mark
Needs you1
¶3Who produced this information?NEEDS YOU
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Something else — I'll type it
I don't know, or it's not my call
Answer
Ask me at finalize
Why?CAPCO-2016 §H.3 p55
Worth a look1
¶5Makes the whole document NOFORNALTERNATIVE
Before you finalize2
¶4No portion marking yetAT FINALIZE
CABClassified By and Derived From are blankAT FINALIZE
Done quietly3
3 changes · showCHANGED
Check before sendingReceipt
States the pane must haveempty · failed closed · not running · read-only · checking
Nothing needs you
(M)arqueREADY
This documentSECRET//FGI AUS GBR//NOFORNReady to send
Nothing needs you.
3 changes made quietly — show them.
Check before sendingReceipt
The good state is plain, not celebratory. No checkmark, no green: the Ready stamp is outlined because there is nothing to act on.

Failed closed
(M)arqueSTOPPED
Marque stopped before checking anything.
A component failed its integrity check, so nothing was read or changed. The document is as you left it.

Try again
Copy the report for your administrator
Brick, the one hue outside the brand: this is an engine failure, not a marking. It says what did and did not happen. No partial results are shown, because none were produced.

Not running
(M)arqueNOT CHECKED
The document hasn't been checked.
Marque isn't reachable from this pane. Markings on the page are as written.

Retry
Different from failed closed: nothing is wrong with Marque, it just isn't here. Neutral border, neutral words, one action.

Read only
(M)arque1 NEEDS YOU
This document is read-only.
Marque can show what it found but can't change the document. 3 fixes are waiting; answers you give are kept for when it can be edited.

Needs you1
¶3Who produced this information?NEEDS YOU
The host's state, not Marque's. Findings still show — a reader needs them too — and the pane says what will happen to answers.

Checking
(M)arqueCHECKING
Checking 6 portions…
Usually under a second. The pane fills in as results arrive, quietest first.

Rarely seen — Marque is fast — but a state the pane must have for a very large document. No spinner: a sentence and a count.

Document status · lightone line the host places anywhere
Ready
This documentSECRET//FGI AUS GBR//NOFORNREADY3 changes made quietly
Outline stamp. The banner is the headline: a classifier reads the banner first and the rest second.

Needs you
This documentSECRET//FGI AUS GBR//NOFORN1 NEEDS YOUand 1 missing mark before you finalize
Double gold border on the strip itself, so the state is visible from across the room.

Blocked · at finalize
This documentSECRET//FGI AUS GBR//NOFORNBLOCKED1 question has to be answered before it can be sent
Same strip; the words change to the moment. "Has to" not "must": the kit speaks like a colleague.

Ready, one override reported
This documentSECRET//FGI AUS GBR//NOFORNREADY1 REPORTEDone marking kept as written
Two stamps: ready is true, and so is the override. Neither hides the other.

Not checked
This document—NOT CHECKED
The strip exists before Marque has run, so the host's layout never jumps.

Ribbon tile · Word
Marque1 NEEDS YOUSECRET//FGI AUS GBR//NOFORN
The smallest form: three lines in a ribbon group. Stamp, then the banner at xs. Clicking opens the pane.

Document status · dark
Ready
This documentSECRET//FGI AUS GBR//NOFORNREADY3 changes made quietly
Outline stamp. The banner is the headline: a classifier reads the banner first and the rest second.

Needs you
This documentSECRET//FGI AUS GBR//NOFORN1 NEEDS YOUand 1 missing mark before you finalize
Double gold border on the strip itself, so the state is visible from across the room.

Blocked · at finalize
This documentSECRET//FGI AUS GBR//NOFORNBLOCKED1 question has to be answered before it can be sent
Same strip; the words change to the moment. "Has to" not "must": the kit speaks like a colleague.

Ready, one override reported
This documentSECRET//FGI AUS GBR//NOFORNREADY1 REPORTEDone marking kept as written
Two stamps: ready is true, and so is the override. Neither hides the other.

Not checked
This document—NOT CHECKED
The strip exists before Marque has run, so the host's layout never jumps.

Ribbon tile · Word
Marque1 NEEDS YOUSECRET//FGI AUS GBR//NOFORN
The smallest form: three lines in a ribbon group. Stamp, then the banner at xs. Clicking opens the pane.



---

## Inline mark — in the document itself
Component 8. The four shapes on the host's own text, and the three adapters that draw them: the web (Custom Highlight API, overlay fallback), Word (content controls plus underline styles, no color available), and Outlook (spans stripped on send). The document is the memo; the marks are the rungs from the pane.

Web host · the marks drawn over the texta 760px document column — letter width
SECRET//FGI AUS GBR//NOFORN

Apply banner
1. (U) This memorandum summarizes recent reporting on the subject and recommends next steps for the working group.

2. (S//REL TO USA, FVEY) Partner reporting over the period indicates continued interest in the region's port infrastructure.

3. (//JOINT S AUS GBR//REL TO USA, GBR) A joint assessment produced with Australian and British counterparts concludes that the pattern is consistent with earlier activity.

Who produced this information? — 3 readings · open in the pane
4. ( ) Analysts assess the activity is likely to continue through the next quarter.

5. (S//NF) British liaison has requested a follow-up briefing.

6. (C//REL TO USA, GBR) The working group will reconvene next month.

SECRET//FGI AUS GBR//NOFORN

Mechanics on the web
1CSS Custom Highlight API first. The kit registers a Highlight per shape with the host's ranges and styles it with ::highlight(mq-must-act): no DOM change, no wrapper spans, the range follows edits. Underline style and color are exactly the properties that API allows.
2Overlay as the fallback. Where the API is missing, the kit draws rects from Range.getClientRects() in a pointer-transparent layer above the text, and redraws on scroll, resize and input.
3Nothing is inserted into the host's text for a mark — except the placeholder for a missing portion mark, which uses the host's own placeholder mechanism and is removed on apply or finalize.
4Hover on a mark shows the tier-1 tooltip with the finding's headline and a way into the pane; click opens the row. The banner placeholder carries one chip: Apply.
5Generated, not applied. The dashed outline is the shape for "Marque has a value and hasn't written it". It applies at finalize, on the chip, or when the host says it may write.
What is drawn, by rung
·Quiet — nothing. ¶1 and ¶6 were fixed silently; the receipt has them.
·Noticeable — thin underline in the text color (¶2).
·Advisory — dotted, 2px, act-ink (¶5: Marque wrote the safe reading, (S//NF), and the dotted rule says the other reading is one click away).
·Action required and Blocking — double rule, attn-ink (¶3).
·Absent — dashed outline around a placeholder: ( ) for a portion mark, the derived value for a banner, greyed.
Word host · built from Word's own formattingcontent controls for tracking and the title tab; underline styles for the shape
Marque · banner (generated)SECRET//FGI AUS GBR//NOFORN

1. (U) This memorandum summarizes recent reporting on the subject and recommends next steps for the working group.

2. (S//REL TO USA, FVEY) Partner reporting over the period indicates continued interest in the region's port infrastructure.

3. Marque · needs you(//JOINT S AUS GBR//REL TO USA, GBR) A joint assessment produced with Australian and British counterparts concludes that the pattern is consistent with earlier activity.

4. ( ) Analysts assess the activity is likely to continue through the next quarter.

5. (S//NF) British liaison has requested a follow-up briefing.

6. (C//REL TO USA, GBR) The working group will reconvene next month.

Mechanics in Word
1A content control per marked span, tagged mq:<finding id>, titled in words ("Marque · needs you"), colored by rung. The tag is the kit's registry key; the title is what Word shows when the cursor lands there; the color draws the box. Appearance: bounding box, so nothing shows at rest except the underline.
2The shape as an underline style. Word's font API offers single, double, dotted and dashed underlines but no underline color — so in Word the shape carries the meaning alone, in the text color. That is why the shapes were chosen to work without color.
3A missing mark is a content control with placeholder text ( ) — grey, disappears when typed over. A generated banner is the same control in the header, holding the derived value as placeholder.
4Selection follows. No hover in Word: the pane watches the selection and shows the row for the control under it. The tier-1 panel from C5 is the same mechanism.
5Every mark is reversible and the kit owns the reversal. At mark time the adapter records the range's original underline; on apply, close, save or send it removes its controls (keeping the text) and restores the recorded formatting. The kit never leaves a mark in a document it did not author.
Outlook host · the compose body is HTMLmarks are spans, stripped on send
Toworking-group@…Subject(U) Summary and next steps
SECRET//FGI AUS GBR//NOFORN

2. (S//REL TO USA, FVEY) Partner reporting over the period indicates continued interest.

3. (//JOINT S AUS GBR//REL TO USA, GBR) A joint assessment produced with Australian and British counterparts…

5. (S//NF) British liaison has requested a follow-up briefing.

Mechanics in Outlook
1Spans with a data attribute. The compose body is get/set as HTML, so a mark is <span data-mq="…" style="…"> with the shape as an inline text-decoration. Color is allowed here; the shape still carries the meaning.
2Send is the gate. The ItemSend event lets the add-in hold the message: that is where Action required becomes Blocking, and where the kit strips its spans and applies or withholds the generated banner.
3Markings in the subject are text; the kit marks nothing there and shows the subject's finding in the pane only.
One component, three adapters
shape
web
Word
Outlook
changed
::highlight underline 1px currentColor
underline Single, control tagged
span, underline 1px
can act
underline dotted 2px act-ink
underline Dotted
span, dotted act-ink
must act
underline double attn-ink
underline Double, control gold, title "needs you"
span, double attn-ink
absent
host placeholder, dashed outline
control with placeholder text
span, dashed outline, grey
tooltip
on hover, over the mark
selection-follow in the pane
selection-follow in the pane
reversal
unregister the Highlight
remove control, restore recorded underline
strip spans on ItemSend


---

## Artifact card — banner, authority block, notice
Component 9. The document-level findings: things that should exist on the document and may not. One card, kinds by artifact.kind, in the three states that produce a finding. Both themes at 440px.

Artifact card · lightbanner · authority block · notice · and two other states
Banner · absent, required, derived
GENERATEDWhole document · top and bottom of every page
The document has no banner. Marque derived one from the portions.
SECRET//FGI AUS GBR//NOFORN
Highest classification across 6 portions; FGI for the Australian and British interest in paragraph 3; NOFORN because paragraph 5 is — one NOFORN portion makes the whole document NOFORN.

Paragraph 3's open question doesn't change it. Paragraph 5's alternative does — taken, the banner becomesSECRET//FGI AUS GBR//REL TO USA, GBR
Apply
Show how Marque got here
Why?CAPCO-2016 §H.3 p57
Dashed border: generated, not applied. Blue Apply: the person can; nothing forces it until finalize, when the host may let the kit write it. The placement line is the manual's, not the host's.

Authority block · one field known, one blank, one waiting
NEEDS VALUESFirst page
The authority block needs one thing only you know.
Classified By
From your Marque identity. Change it only if someone else made this classification decision.
Derived From
More than one source? Write "Multiple Sources" and the kit keeps a source list with the document.
Declassify On
waits on Derived FromCarried forward from the source — the longest duration if there are several. Marque fills it from any source date it can read; otherwise YYYYMMDD, an event, or an exemption such as 25X1.
Save
Ask me at finalize
Why?CAPCO-2016 §E.2 p32
Three fields, each with its own state: known from identity (blue, editable), blank-needs-a-person, waits-on-another. Marque knows who the classifier is and finds dates it can read; it never guesses a source. Hints quote the manual's requirements in plain words and the formats it demands.

Notice · absent, required, text known · a different document
GENERATEDTop of the document · left justified
This document needs a warning statement.
It carries TOP SECRET//TK//RSEN information designated as a Sensitive Analytical Technique, and the manual requires the statement below at the top of the document.

(U//FOUO) Warning: This document contains references to Sensitive Analytical Techniques (Sensitive TK Imagery Information)
Apply
Ask me at finalize
Why?CAPCO-2016 §H.8 p132
The kit shows the notice as text because the manual fixes the text. Where a host renders notices its own way, the card carries the content id and the placement, and the host draws it. The placement line is verbatim from the manual.

Three more · not canonical · not required · original classification
Declassify On put in the manual's format.CHANGED
20491231was 12/31/2049
Why?CAPCO-2016 §E.1 p31
NOT NEEDEDFirst page
This document is UNCLASSIFIED; it doesn't need an authority block.
One is present. Leaving it does no harm; removing it is tidier.

Remove it
Leave it
Why?CAPCO-2016 §E p31
NEEDS A REASONOriginal classification · first page
An original classification needs a reason from EO 13526.
Reason
— one or more of §1.4 (a)–(h) —
1.4(a) military plans, weapons systems, or operations
1.4(b) foreign government information
1.4(c) intelligence activities, sources or methods, or cryptology
1.4(d) foreign relations or foreign activities of the United States
1.4(e) scientific, technological, or economic matters relating to national security
1.4(f) U.S. Government programs for safeguarding nuclear materials or facilities
1.4(g) vulnerabilities or capabilities of systems, installations, infrastructures, projects, plans, or protection services
1.4(h) the development, production, or use of weapons of mass destruction
Marque serves the eight categories and checks that at least one is cited. Several may apply.
Why?CAPCO-2016 §E.1 p31
Same card, other states. A non-canonical artifact is a Noticeable fix. A present-but-not-required one is an Advisory in its own right: one action, blue, optional. An original classifier's block adds the Reason, chosen from the categories Marque serves.

Artifact card · dark
Banner · absent, required, derived
GENERATEDWhole document · top and bottom of every page
The document has no banner. Marque derived one from the portions.
SECRET//FGI AUS GBR//NOFORN
Highest classification across 6 portions; FGI for the Australian and British interest in paragraph 3; NOFORN because paragraph 5 is — one NOFORN portion makes the whole document NOFORN.

Paragraph 3's open question doesn't change it. Paragraph 5's alternative does — taken, the banner becomesSECRET//FGI AUS GBR//REL TO USA, GBR
Apply
Show how Marque got here
Why?CAPCO-2016 §H.3 p57
Dashed border: generated, not applied. Blue Apply: the person can; nothing forces it until finalize, when the host may let the kit write it. The placement line is the manual's, not the host's.

Authority block · one field known, one blank, one waiting
NEEDS VALUESFirst page
The authority block needs one thing only you know.
Classified By
From your Marque identity. Change it only if someone else made this classification decision.
Derived From
More than one source? Write "Multiple Sources" and the kit keeps a source list with the document.
Declassify On
waits on Derived FromCarried forward from the source — the longest duration if there are several. Marque fills it from any source date it can read; otherwise YYYYMMDD, an event, or an exemption such as 25X1.
Save
Ask me at finalize
Why?CAPCO-2016 §E.2 p32
Three fields, each with its own state: known from identity (blue, editable), blank-needs-a-person, waits-on-another. Marque knows who the classifier is and finds dates it can read; it never guesses a source. Hints quote the manual's requirements in plain words and the formats it demands.

Notice · absent, required, text known · a different document
GENERATEDTop of the document · left justified
This document needs a warning statement.
It carries TOP SECRET//TK//RSEN information designated as a Sensitive Analytical Technique, and the manual requires the statement below at the top of the document.

(U//FOUO) Warning: This document contains references to Sensitive Analytical Techniques (Sensitive TK Imagery Information)
Apply
Ask me at finalize
Why?CAPCO-2016 §H.8 p132
The kit shows the notice as text because the manual fixes the text. Where a host renders notices its own way, the card carries the content id and the placement, and the host draws it. The placement line is verbatim from the manual.

Three more · not canonical · not required · original classification
Declassify On put in the manual's format.CHANGED
20491231was 12/31/2049
Why?CAPCO-2016 §E.1 p31
NOT NEEDEDFirst page
This document is UNCLASSIFIED; it doesn't need an authority block.
One is present. Leaving it does no harm; removing it is tidier.

Remove it
Leave it
Why?CAPCO-2016 §E p31
NEEDS A REASONOriginal classification · first page
An original classification needs a reason from EO 13526.
Reason
— one or more of §1.4 (a)–(h) —
1.4(a) military plans, weapons systems, or operations
1.4(b) foreign government information
1.4(c) intelligence activities, sources or methods, or cryptology
1.4(d) foreign relations or foreign activities of the United States
1.4(e) scientific, technological, or economic matters relating to national security
1.4(f) U.S. Government programs for safeguarding nuclear materials or facilities
1.4(g) vulnerabilities or capabilities of systems, installations, infrastructures, projects, plans, or protection services
1.4(h) the development, production, or use of weapons of mass destruction
Marque serves the eight categories and checks that at least one is cited. Several may apply.
Why?CAPCO-2016 §E.1 p31
Same card, other states. A non-canonical artifact is a Noticeable fix. A present-but-not-required one is an Advisory in its own right: one action, blue, optional. An original classifier's block adds the Reason, chosen from the categories Marque serves.

One card, kinds by artifact.kind
1Kinds — banner (front marking), authority block, declassify instruction, notice, caveat layer. Same anatomy: a stamp for the state, the placement from the manual, a headline about the document, the value or the fields, actions, Why? and the citation.
2States — present · present-not-canonical · present-not-required · absent-but-required · absent-not-required. The card only exists for the middle three and for absent-but-required; the other two are receipt entries, not findings.
3Fixability — fixable means Marque has the value (banner, notice text, canonical date) and the card offers Apply. Flag-only means a person must supply it (names, sources), and the card offers fields.
4Placement is Marque's to state and the host's to honor: first page · every page · near the marking · the host decides. The card states it in the manual's words; the kit never assumes it may write to a header.
Says what is missing, not what is wrong
A card with no as-written opens on the anchor ("Whole document", "First page") and names the absence. "The document has no banner" is a fact; "Missing banner" is a verdict. The derivation sentence under a generated value is the short form of the derivation panel — enough to trust it, with "Show how" for the rest.

Fields
Values a person types into an authority block are in the body font (names, sources); values they are checking against a format are in the mark font (dates, exemptions). Marque never pre-fills a name, a source or a date it did not derive, and says plainly what it is waiting on.

Engine fields
·document.artifacts[] with kind, scope, state, derivation, placement, and a typed content id or canonical value.
·ResolvedArtifact.fixability decides Apply vs fields; derived_value is what Apply writes.
·The CAB needs per-field state (known · derived · blank · waiting), not one state for the block. Classified By comes from identity; Declassify On from dates Marque can read; Derived From waits on derivation resolution; Reason, for original classification, from EO 13526 §1.4.
·depends_on on the banner should be absent when every open reading rolls up the same way — the card above says so because the kit computed it; the engine should.


---

## Finalize gate — where Action required becomes Blocking
Component 10. The host calls it at its real moment. Blocked on the web and in a Word dialog; cleared a minute later. Same memo: paragraph 3, paragraph 4, the authority block.

Blocked · web form · 460px
BLOCKEDBefore this is sent
Three things need you before this can go.
Sending is held until they're answered. Nothing is changed in the document while you decide. The banner is ready and will be applied as it sends — NOFORN, unless you take paragraph 5's alternative first.

1
Paragraph 3 — who produced this information?
It reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Something else — I'll type it
I don't know, or it's not my call
Answer
Why?
2
Paragraph 4 has no portion marking.
Marque can't derive one — only you know what the paragraph holds. Type it, or say it's unclassified.

Mark it
It's unclassified: (U)
Why?
3
The authority block needs one value.
Classified By
Derived From
Declassify On
waits on Derived From
Save
Why?
Save as draft instead
What will be applied
Cleared · the same gate a minute later
READYBefore this is sent
Ready. Two things will be applied as it sends.
1
Paragraph 3 — answered: the U.S., the UK and Australia together.
(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
2
Paragraph 4 — marked unclassified.
(U)
3
Authority block — filled. Declassify On carried from the source: 20491231.
Will be applied:SECRET//FGI AUS GBR//REL TO USA, GBRtop and bottom of every page · the authority block on the first page
One marking was kept as written and will be reported: paragraph 2.

Send
Save as draft
Receipt
Blocked · Word dialog · 340px
BLOCKEDBefore this is sent
Three things need you before this can go.
Sending is held until they're answered. Nothing is changed in the document while you decide. The banner is ready and will be applied as it sends — NOFORN, unless you take paragraph 5's alternative first.

1
Paragraph 3 — who produced this information?
It reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Something else — I'll type it
I don't know, or it's not my call
Answer
Why?
2
Paragraph 4 has no portion marking.
Marque can't derive one — only you know what the paragraph holds. Type it, or say it's unclassified.

Mark it
It's unclassified: (U)
Why?
3
The authority block needs one value.
Classified By
Derived From
Declassify On
waits on Derived From
Save
Why?
Save as draft instead
What will be applied
What the gate is
The host calls it at the moment that matters — send, save-as-final, publish, submit — with the findings whose blocks is at finalize. The gate is the Needs-you section with defer removed and the answers inline: nothing new to learn at the worst moment. It also shows what Marque will apply on the way out, because that is the last chance to object.

Rules
1No "send anyway". Blocking is a rung, not a dialog setting. An organization that wants a question to be skippable configures that rule's rung in .marque.toml; the gate never offers to override it.
2Save as draft is always offered. The person is never trapped; the document just doesn't leave.
3Order is document order, same as the pane. Numbers, not severity.
4Each item commits on its own. Answering one re-evaluates the rest: an answer that resolves a dependency removes the dependent item, with a one-line note.
5The cleared gate restates what was decided in words and markings, names what will be written and where, and names what was kept as written. Then Send.
6Hosts. Web: a panel over the form, non-modal, focus inside. Word: an Office dialog, since the pane may be closed. Outlook: the ItemSend handler shows it and holds the message. Batch: the gate is the row that didn't pass.
Engine fields
document.blocking[], each finding's asks, document.ready, the artifacts with derived_value and placement. The gate adds nothing of its own; it is the host's moment applied to the kit's findings.



---

## Derivation panel — how Marque got here
Component 11. The banner's derivation for the memo, step by step, each step with its inputs, its one-sentence rule and its citation. The result restates what would change it. Both themes at 640px.

How Marque got the banner · light
1
Six portions read
¶1(U) ¶2(S//REL TO USA, FVEY) ¶3(//JOINT S AUS GBR//REL TO USA, GBR) ¶4none ¶5(S//NF) ¶6(C//REL TO USA, GBR)
Blue: Marque wrote it — ¶2 corrected, ¶5 resolved to its safe reading. Gold: a question is open. ¶4 has no marking yet, so it contributes nothing — and could change the result.CAPCO-2016 §C p25
2
Classification: the highest of all portions
SECRET
SECRET from ¶2, ¶3 and ¶5. A US document with a JOINT portion still carries a US classification; JOINT stays on the portion.CAPCO-2016 §H.3 p57
3
Ownership: the foreign interest in paragraph 3
//FGI AUS GBR
Australia and the UK own, or co-own, paragraph 3 under every open reading, so the banner carries FGI with both codes whichever way the question is answered.CAPCO-2016 §H.3 p57
4
Releasability: one NOFORN portion decides it
//NF //NOFORN
Paragraph 5 is NOFORN, so the banner is NOFORN whatever the other REL TO lists say. Were it REL TO USA, GBR instead, the lists would roll up to the UK — the only country in every list.CAPCO-2016 §H.3 p57
5
Result
SECRET//FGI AUS GBR//NOFORN
Generated, not yet applied. If paragraph 5 takes its alternative, step 4 becomes REL TO USA, GBR. If paragraph 4 turns out higher than SECRET, step 2 changes — which is why it is "before you finalize".CAPCO-2016 §D p28
How Marque got the banner · dark
1
Six portions read
¶1(U) ¶2(S//REL TO USA, FVEY) ¶3(//JOINT S AUS GBR//REL TO USA, GBR) ¶4none ¶5(S//NF) ¶6(C//REL TO USA, GBR)
Blue: Marque wrote it — ¶2 corrected, ¶5 resolved to its safe reading. Gold: a question is open. ¶4 has no marking yet, so it contributes nothing — and could change the result.CAPCO-2016 §C p25
2
Classification: the highest of all portions
SECRET
SECRET from ¶2, ¶3 and ¶5. A US document with a JOINT portion still carries a US classification; JOINT stays on the portion.CAPCO-2016 §H.3 p57
3
Ownership: the foreign interest in paragraph 3
//FGI AUS GBR
Australia and the UK own, or co-own, paragraph 3 under every open reading, so the banner carries FGI with both codes whichever way the question is answered.CAPCO-2016 §H.3 p57
4
Releasability: one NOFORN portion decides it
//NF //NOFORN
Paragraph 5 is NOFORN, so the banner is NOFORN whatever the other REL TO lists say. Were it REL TO USA, GBR instead, the lists would roll up to the UK — the only country in every list.CAPCO-2016 §H.3 p57
5
Result
SECRET//FGI AUS GBR//NOFORN
Generated, not yet applied. If paragraph 5 takes its alternative, step 4 becomes REL TO USA, GBR. If paragraph 4 turns out higher than SECRET, step 2 changes — which is why it is "before you finalize".CAPCO-2016 §D p28
What this is
"Show how Marque got here", for any derived value: the banner, a page roll-up, a corrected portion. Each step is a fold the engine performed, in the order it performed it, with the markings that went in, the marking that came out, one plain sentence, and the citation. It is the decision trace rendered for a person — the kit adds no reasoning of its own.

Rules
1Inputs are shown in their state. A corrected portion is blue, an open one gold, a missing one says "none" — so the reader sees what the result rests on and what could move it.
2One sentence per step, in words about the document: "the UK is the only country in every list", not "intersection over the REL axis".
3Every step cites. A fold with no citation is a bug in the trace, not a step to show.
4The result restates its conditions — what, if it changed, would change the result. That line is why the derivation panel exists: trust comes from knowing what the number depends on.
5Opens from the banner card's "Show how", the status strip, and a Noticeable card's Why? when the change came from a fold rather than a rule. Window or side panel, never modal.
Engine fields
The decision trace is always on (fold, closure, default-fill, supersession, divergence, fail-closed, constraint events). The kit needs each event with: the axis it touched, the inputs as layered markings with their states, the output, the rule or constraint id, and its citation. The per-rule dispatch overlay is not needed here.



---

## Audit receipt — the session, readable
Component 12. The audit for the memo as a person reads it: eleven lines from the first quiet fix to the send, with the override reported and the root verifiable. Both themes at 640px.

One document · light
Marque · session receiptMemo · 2 pages · 6 portions · 2026-10-14
classifierJ. Doe · DIA/XX
14:02:11
¶2 · comma added (S//REL TO USA FVEY)(S//REL TO USA, FVEY) · applied · CAPCO-2016 §H.8 p151Marque · determined
14:02:11
¶1, ¶6 · extra space removed · applied · CAPCO-2016 §H.8 p151Marque · determined
14:02:11
banner · generated SECRET//FGI AUS GBR//NOFORN · held for finalize · CAPCO-2016 §H.3 p57Marque · derived from 6 portions
14:02:12
¶3 · question: who produced this information · 3 readings offered · openMarque · plural, unranked
14:02:12
¶5 · (S//NF/REL TO USA, GBR)(S//NF) · safe reading applied · alternative (S//REL TO USA, GBR) offered · CAPCO-2016 §H.8 p145Marque · most restrictive
14:06:02
¶2 · kept as written (S//REL TO USA FVEY) · the comma fix reverted · reportedJ. Doe · override
14:09:15
¶3 · answered: the U.S., the UK and Australia together (//JOINT S AUS GBR USA//REL TO USA, AUS, GBR) · appliedJ. Doe · decision
14:10:02
¶5 · alternative taken (S//REL TO USA, GBR) · banner now SECRET//FGI AUS GBR//REL TO USA, GBR · appliedJ. Doe · decision
14:12:00
¶4 · marked (U) · appliedJ. Doe · decision
14:12:30
authority block · Classified By, Derived From filled · Declassify On carried 20491231 · appliedJ. Doe · values
14:12:45
finalize · banner applied top and bottom of 2 pages · authority block applied, first page · 1 finding reported · senthost · Word
session root · blake37f3a9c1e 02b4d6e8 9a1f33c7 5d0e8b2a 4c6f1d93 e7a2b058 1f9c4d7e 6b3a0c25schema marque-3.44 · ISM-v2022-DEC · CAPCO-2016 · interface O (Office) · principal signature verified
Verify
Print
One document · dark
Marque · session receiptMemo · 2 pages · 6 portions · 2026-10-14
classifierJ. Doe · DIA/XX
14:02:11
¶2 · comma added (S//REL TO USA FVEY)(S//REL TO USA, FVEY) · applied · CAPCO-2016 §H.8 p151Marque · determined
14:02:11
¶1, ¶6 · extra space removed · applied · CAPCO-2016 §H.8 p151Marque · determined
14:02:11
banner · generated SECRET//FGI AUS GBR//NOFORN · held for finalize · CAPCO-2016 §H.3 p57Marque · derived from 6 portions
14:02:12
¶3 · question: who produced this information · 3 readings offered · openMarque · plural, unranked
14:02:12
¶5 · (S//NF/REL TO USA, GBR)(S//NF) · safe reading applied · alternative (S//REL TO USA, GBR) offered · CAPCO-2016 §H.8 p145Marque · most restrictive
14:06:02
¶2 · kept as written (S//REL TO USA FVEY) · the comma fix reverted · reportedJ. Doe · override
14:09:15
¶3 · answered: the U.S., the UK and Australia together (//JOINT S AUS GBR USA//REL TO USA, AUS, GBR) · appliedJ. Doe · decision
14:10:02
¶5 · alternative taken (S//REL TO USA, GBR) · banner now SECRET//FGI AUS GBR//REL TO USA, GBR · appliedJ. Doe · decision
14:12:00
¶4 · marked (U) · appliedJ. Doe · decision
14:12:30
authority block · Classified By, Derived From filled · Declassify On carried 20491231 · appliedJ. Doe · values
14:12:45
finalize · banner applied top and bottom of 2 pages · authority block applied, first page · 1 finding reported · senthost · Word
session root · blake37f3a9c1e 02b4d6e8 9a1f33c7 5d0e8b2a 4c6f1d93 e7a2b058 1f9c4d7e 6b3a0c25schema marque-3.44 · ISM-v2022-DEC · CAPCO-2016 · interface O (Office) · principal signature verified
Verify
Print
What this is
The audit stream, rendered for a person: what changed, by whom, when, under which rule — including the question that was asked, the advisory that was declined, and the override that was kept and reported. Every line is a marking, a place, a rule, a time and an actor. No document text appears, because none is in the audit: the receipt is content-ignorant by construction, not by redaction.

Rules
1Markings verbatim, with the arrow drawn in CSS. Masked and concealed regions appear exactly as they do in the pane.
2Two actors, named plainly. "Marque" for the engine's own determinations; the classifier's id for decisions, values and overrides; "host" for what the host did at finalize. Each line also says the kind of act: determined, derived, decision, override.
3The override is a first-class line, bold "reported", and it stays in the receipt no matter how quiet the pane was about it.
4Verifiable. The session root is the stream's blake3; Verify recomputes it and checks the principal signature with no engine and no key custody — the same core the CLI and WASM use. Print is the paper form from T4.
5The same component serves a batch: one receipt per document, correlated by the echoed id, with a header row per document and the roots listed.
Engine fields
The AppliedFix envelope (rule, recognition, steps with citations, inverse), the session metadata (schema, versions, interface, identity, seal), the decision trace for asked/withheld/declined events, and the verify result. Rendering uses the shared renderer so CLI, WASM and this receipt agree byte for byte on what a line says.



---

## Vocabulary lookup — trigraphs, tetragraphs, members
Component 13. Look up a code or a marking and get what it is, what it means, who is in it, and where that comes from. Both themes at 520px.

Vocabulary lookup · light
Look up a country, tetragraph or marking
A trigraph (GBR), a tetragraph (FVEY), a marking (NF, REL TO), or a name (Switzerland).
marking
FVEY
kind
Tetragraph — stands for its members in a REL TO or DISPLAY ONLY list
name
Five Eyes
members
AUSAustraliaCANCanadaGBRUnited KingdomNZLNew ZealandUSAUnited States
use
After USA and any trigraphs, in alphabetical order with other tetragraphs. (S//REL TO USA, FVEY)
source
Register · Annex A
marking
GBR
kind
Trigraph — a country code
name
United Kingdom of Great Britain and Northern Ireland
member of
FVEYFive EyesNATONorth Atlantic Treaty Organization
source
Register · Annex B
markingNF
kindDissemination control — portion form of NOFORN
meansNot releasable to foreign governments, foreign nationals, foreign organizations or non-US citizens without the originator's permission.
withCannot be used with REL TO, RELIDO, EYES ONLY or DISPLAY ONLY.
sourceCAPCO-2016 §H.8 p145
Look up a country, tetragraph or marking
No marking is spelled "Switzerland". The country code is CHE — look up CHE.
Vocabulary lookup · dark
Look up a country, tetragraph or marking
A trigraph (GBR), a tetragraph (FVEY), a marking (NF, REL TO), or a name (Switzerland).
marking
FVEY
kind
Tetragraph — stands for its members in a REL TO or DISPLAY ONLY list
name
Five Eyes
members
AUSAustraliaCANCanadaGBRUnited KingdomNZLNew ZealandUSAUnited States
use
After USA and any trigraphs, in alphabetical order with other tetragraphs. (S//REL TO USA, FVEY)
source
Register · Annex A
marking
GBR
kind
Trigraph — a country code
name
United Kingdom of Great Britain and Northern Ireland
member of
FVEYFive EyesNATONorth Atlantic Treaty Organization
source
Register · Annex B
markingNF
kindDissemination control — portion form of NOFORN
meansNot releasable to foreign governments, foreign nationals, foreign organizations or non-US citizens without the originator's permission.
withCannot be used with REL TO, RELIDO, EYES ONLY or DISPLAY ONLY.
sourceCAPCO-2016 §H.8 p145
Look up a country, tetragraph or marking
No marking is spelled "Switzerland". The country code is CHE — look up CHE.
What this is
The data API as a surface: the same per-token facts that feed tier-1 tooltips, browsable on their own. Four kinds of answer — a tetragraph with its members, a trigraph with what it belongs to, a marking with what it means and what it excludes, and a miss that points at the right code. Lives in the pane's footer and in the help window; a web host may mount it alone.

Rules
1Codes are markings, set in the mark font; names and meanings are prose. Members are chips with the name beside the code, so a person learns the code by seeing it next to the country.
2Every answer cites its register — Annex A for tetragraphs, Annex B for trigraphs, the manual section for a marking. Vocabulary is build-time data from the pinned ISM/ISMCAT snapshot; the version shows in the footer.
3A miss is an answer. It says what was not found and offers the nearest real code. Never a blank list.
4Nothing here changes the document. Lookup is read-only; a person who wants to use a code goes back to the marking.
Engine fields
The vocab endpoints (trigraphs · tetragraphs · members · name · help) and the per-token help file. The membership and expansion data already drive the engine's REL TO reasoning; the kit reads them, never re-derives them.

