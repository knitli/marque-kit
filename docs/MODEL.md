<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense
-->


# The model: rungs, state, anchors, hosts, help

The conceptual boards from the first day of design: the attention ladder, the two layers of state, theme vs behaviour, where findings attach, the decision prompt, three hosts, tooltips vs popovers, help in three tiers. Later component boards supersede details here; the principles stand.

_Extracted from the Marque UI kit design canvas (boards: Attention, States, Boundary, Anchors, Decision, Hosts, Tooltips, Help), 21 Oct 2026. The canvas is the visual record; this file is the text the kit is built to. Edit here from now on._


---

## Attention is a ladder — the same finding at five weights
Five questions set the rung, not severity: is it worth seeing, how consequential is it, is it already resolved, does it need a person, and does it need one now.

| Quiet
|
Marque and the host finished it correctly. Nothing to do, nothing to approve.

Worth seeing?no
Consequential?any
Resolved?yes
Needs a person?no
Now?—


3 FIXED



Inspectable on request. Never announced.

Example: a stray space inside a marking, fixed. | Noticeable
Something changed or was added. The person should be able to see that, without being asked to do anything.

Worth seeing?yes
Consequential?any
Resolved?yes
Needs a person?no
Now?—


(S//REL TO USA, GBR)


A thin underline: it changed. Inspect it if you like; nothing asks to be clicked.

Example: REL TO USA GBR corrected to REL TO USA, GBR. | Advisory
blue

The result is valid, but Marque suspects it is not what the author meant. The alternative is one action away — never applied for you.

Worth seeing?yes
Consequential?any
Resolved?yes, validly
Needs a person?optional
Now?no


(S//NF)
on focus, tap or hover:
Kept US-only. If this can go to the UK, the document can stay releasable. Change it
Dotted underline: you can act. Result and alternative stay two things.

Example: a US-only paragraph in a document released to the UK — valid, probably unintended. | Action required
gold

Marque needs a fact or a decision only a person has. Asked when they are ready — not mid-sentence.

Worth seeing?yes
Consequential?any
Resolved?no
Needs a person?yes
Now?when ready



One question
Who produced this information?

US, UK, AUS together
UK and AUS
UK, some AUS
Not my call


A question about the information, not the marking.

Example: a joint marking that leaves out the U.S. and names a producer who can't receive it. Three readings fit; only the author knows which. | Blocking
gold

The person is trying to send, submit or finalize, and something above is still open. Stops the operation, never the drafting.

Worth seeing?yes
Consequential?any
Resolved?no
Needs a person?yes
Now?before this proceeds



Send
Can't send yet — 1 question needs you

The same question that was Action required a minute ago. Nothing new — only the moment changed.

Example: the author hits Send with that question unanswered. |
Carriers, in order: nothing · a thin underline · a dotted underline, blue — you can act · a double border, gold — you must act · the same gold, and the operation waits.


---

Two layers of state — Marque determines, the host applies, a person completes
Five rungs, three owners. None of them is "success" on its own.
Marque — determines
Host — applies
Person — completes
Identified
a requirement, or a fault
Generated
a marking, banner, CAB, notice
Applied / represented
as text, metadata, or a component
Completed
the person supplied what was missing
Ready
a final check at send or finalize
complete
has blanks
Generated is not applied. Applied is not complete. Complete is not ready — readiness is checked again at send, even when everything above happened earlier.


---

## A UI kit, not a style — what hosts may change, and what they may not
Most integrators will ship the default as it comes. So the default is the design we want, in full. Hosts that re-theme change the surface; the behaviour underneath is the product.

| Theme — change freely
|
Typefaces — as long as a marking is never wrapped mid-token, dimmed, or tinted.
Colours — every token re-points, the two semantic colours included. They stay two, stay distinct from each other and from everything else, and appear nowhere else in the kit.
Radii, borders, shadows, spacing, density.
Placement — a pane, a popover, inline, a margin, a status bar. The host decides where; the kit decides what.
Icons — any set, or none.
Motion — any timing, or none.
The host's own strings — button labels, pane titles. Marque's explanations and questions stay Marque's. | Behaviour — fixed
Five attention rungs, each with a fixed ask: nothing · see · can act · must act · the operation waits.
Two layers of state. Generated is never shown as applied; applied never as complete; complete never as ready.
Routine corrections are not approved one by one.
A question asks for the fact, never the syntax. Every option says what follows, cascades included.
"I don't know" and "not my call" are always offered. The safer result stands.
A finding anchors to whatever owns the requirement — a span, a paragraph, the document, the page.
A question tied to text that has since changed withdraws itself.
Readiness is checked again at send or finalize, whatever was shown earlier.
Lint and fix tell the same story about the same condition.
Markings are quoted exactly as written — never restyled, dimmed, or wrapped mid-token.
The text is judged, never the person.
Every distinction survives without colour, hover, pointer, or position. |
The test for any theme: strip every colour, font and radius. If a distinction disappears, it was living in the theme layer — move it into behaviour.


---

## Where a finding attaches — most of what matters has no text span
A correction can point at the characters it replaces. A missing mark, a CAB, a notice cannot. The kit anchors each finding to the thing that owns the requirement.

SECRET//REL TO USA, GBR
3
(U)
(S//REL TO USA, GBR)
1
2
(C//REL TO USA, GBR)
Classified by: [name, position]
Derived from: [source]
Declassify on: [date or event]
4
generated by Marque · placed by the host · blanks for a person
[required notice — document or page scope — may never be text at all]
5
SECRET//REL TO USA, GBR
1
Inline correction
Span: yes. Anchor: the characters it replaces.
Default: quiet to noticeable.
The host may apply it automatically or on request. The explanation is the same either way.
2
Missing portion mark
Span: none. Anchor: the paragraph that owns the requirement.
Default: low while drafting; action required at send.
Nothing to underline. The kit points at the paragraph, and the answer is a fact about it.
3
Document banner
Span: sometimes. Anchor: the document; recomputed as content changes.
Default: quiet.
The host defines what the banner covers. The changing result is the notice — nobody is told "the banner changed".
4
Classification authority block
Span: none. Anchor: the document.
Default: low while drafting; blocking at finalize.
Marque generates it and may leave blanks. The host decides where it lives. Completing it and placing it are two separate interactions.
5
Required warning or notice
Span: none. Anchor: the document, or the page.
Default: quiet when the host can represent it.
May become text, metadata, or a rendered component. The kit never assumes editable text. Page scope has to stay in sync with the page.
Dashed = nothing exists here yet. Thin underline = a span Marque changed (noticeable). Numbered squares are this wire's callouts, not UI.


---

## The decision prompt — ask for the fact, not the syntax
Action required · anchored to paragraph 3 · shown when the person opens it, or at send. A marking that can't be right as written, three readings that fit, and only the author knows which.

One question
ownership
paragraph 3
(//JOINT S AUS GBR//REL TO USA, GBR)
This can't be right as written. A joint marking always includes the U.S., and every country that produced the information jointly has to be able to receive it.
Who collected or produced this information?
Your answer
The U.S., the UK and Australia, togetherMarque's best guess
Becomes (//JOINT S AUS GBR USA//REL TO USA, AUS, GBR) — the U.S. joins the producers, Australia joins the receivers.
The UK and Australia together, without the U.S.
Becomes (//AUS GBR S//REL TO USA, AUS, GBR) — foreign joint information, releasable back to both producers.
Rare: if the UK passed it on without saying Australia may have it back, the receivers stay USA, GBR.
The UK, with some information from Australia
Becomes (//GBR S//FGI AUS//REL TO USA, GBR) — British information carrying Australian foreign government information.
Something else, I don't know, or it's not my call
Nothing changes yet. The paragraph stays flagged as unresolved, and the question waits for whoever finalizes the document.
Answer
Ask me at send
Show the rule
Plain language first: "joint" means produced together, and the U.S. is always one of the producers; everyone who produced it jointly can receive it. Then the source text, cited: [CAPCO citation].
Tied to paragraph 3 as it reads now. If the paragraph changes, this question is withdrawn — and asked again only if it still applies.
Ownership is the axis that asks
Four axes: level, ownership, releasability, controls. Nearly every question Marque has to put to a person is about who owns the information.
The text is judged, not the person
"Can't be right as written" — never "you left out USA".
One likely reading, with alternatives
Marque's best guess is labelled as a guess. The rare sub-case lives under its option, not as a fourth.
The person picks a meaning; Marque writes the marking
The resulting marking is shown so a reviewer can verify it — not so the author has to parse it.
"Not my call" is always there
Nothing is guessed on their behalf. The question moves to whoever finalizes, at the point it blocks.
Where gold goes
The panel edge and the Answer action. Nothing else on this screen.


---

## Three hosts — same semantics, different surfaces
Marque's determination is identical in all three. What changes is where generated content lands, when readiness is checked, and what the host can show.

| Word-like editor
|






SECRET//FGI AUS GBR//REL TO USA, GBR
(U)

(S//REL TO USA, GBR)

(//JOINT S AUS GBR//REL TO USA, GBR)

CAB — inserted here by the host


Marque
3 fixed · 1 question
¶3 — one question
Banner updated
CAB — 2 blanks
Show what changed



Persistent document, mature undo. Generated content is inserted at a document location the host chooses. Findings live inline and in a pane — and the pane never becomes a second workflow. | Email compose

To
Subject(U)

(U)




Banner, CAB and notices are built into the outgoing message on send. Nothing to place while writing.


Send
1 paragraph has no marking — needs you before send


Generate-on-send. Readiness is checked at Send and drafting is never interrupted. The missing mark was known the whole time; it only became blocking when the person reached for the button. | Web application




SYSTEM: TOP SECRET//SI
THIS VIEW: SECRET




12 of 240 records
(S)
(U)
(C)
(S)
(U)


Classification
This view: SECRET
Covers the 12 records shown, after filters.
Authority block — a component, not text
Notices — 1, applied as metadata



Two numbers, never confused: what the system may process, and what this view actually holds. The host defines the scope — visible, filtered, loaded. Generated content is a component or metadata, not text in a box. |


---

## Tooltips and popovers — the finding card, cut down to fit under a marking
Two components, four jobs. A tooltip is read-only. Anything with an action in it is a popover. Both show what the pane already holds — they are shortcuts, never the only way.

| Help
|
quiet

What a marking means. Marque did nothing here; the person asked a question.

(U)



(U)
Unclassified. Nothing in this paragraph is classified.
Enter or tap: how this fits the document's marking, and the rule.


Tooltip. Hover after a short delay, keyboard focus, or tap. Esc closes. No buttons inside — Enter promotes it to a popover. | Changed
noticeable

What Marque corrected, and what was there before the text was replaced.

(S//REL TO USA, FVEY)



Marque added a comma.
Was(S//REL TO USA FVEY)
Enter or tap: why, and undo.


Tooltip. The original survives the replacement. Undo lives in the popover, never in the tooltip. | Alternative
advisory · blue

The valid result, the likely intent, and one action. The first thing on this board with a button.

(S//REL TO USA, GBR)



Paragraph 5 · releasability
This narrows the whole document to the UK.
If it can go to all Five Eyes, the document can.

Make it FVEY
Keep as is

Show the rule


Popover. Enter, click or tap opens it; focus moves in; Esc returns focus to the marking. It has actions, so it is never a tooltip. | Question
action required · gold

The same card as the pane, opened at the marking. Not a tooltip at all.

(//JOINT S AUS GBR//REL TO USA, GBR)



Paragraph 3 · ownership
Who collected or produced this information?

Answer
Ask me at finalize



Card. Answer opens the full question — here, or in the pane; the host chooses. Nothing about it depends on hover. |
| Triggers. Hover after a short delay, keyboard focus, tap. Nothing depends on hover alone: a tooltip is a shortcut to what the pane already holds. | Shape. One column, about 320px at most, opaque, no icons. The marking is quoted exactly, in the marking face, and never wraps mid-token. Plain language first; the rule one step further in. | Office hosts can't draw over the document. There, the pane follows the cursor: put the cursor in a marking and its card comes to the top. Same content, different surface. |
|---|---|---|


---

## Help in three tiers — Marque's words first, the manual's words quoted, the full passage on the reading surface
The help data carries two kinds of text held to two bars: authored plain language, and verbatim quotes pinned to CAPCO-2016. The reader must always be able to tell which is which. Shown for NF.

| Tier 1 · what it means
|

Tooltip, Instrument surface. The authored plain-language field, and how the marking is written. Two sentences at most.

(S//NF)



NFNOFORN
Marks information that may not be released in any form to a foreign government, person, or organization — even a close ally — without the originator's permission.
Written (S//NF) in a portion, NOFORN in a banner.
Enter or tap: the manual's words, and what it does here.


Source field: plain + examples. Authored, reviewed for clarity. Never a quote. | Tier 2 · the manual's words

Popover, Instrument surface. Plain first, then what it does in this document, then the manual's one-line definition — quoted and cited.


NFNOFORN
Esc

Marks information that may not be released in any form to a foreign government, person, or organization — even a close ally — without the originator's permission.

Here
Paragraph 4 carries NF, so the document banner does too. The document cannot go to the UK while it stands.


Tip
NOFORN and REL TO can't appear on the same portion: NOFORN means no foreign release at all, while REL TO names the countries it can go to.



The manual says
CAPCO-2016 §H.8 · p. 145

"NOFORN is an explicit foreign release marking used to indicate the information may not be released in any form to foreign governments, foreign nationals, foreign organizations, or non-US citizens without permission of the originator and in accordance with provisions of, ICD 403, NDP-1, and implementation guidance in this document."
Sponsor and basis: DNI / National Security Act of 1947, as amended, §103 (c)(5)

Read the full passage

Source fields: plain, tips, then short + citation + marking_sponsor; long, where it exists, expands under it. Quote fields only — never the section. The quote is set apart: a different face, quotation marks, a citation chip. | Tier 3 · the full passage

Reference surface — the reading register, not the instrument. Drills into the pane by default; opens in its own window where the host allows. Not a modal: reading a rule isn't a decision, and the marking should stay in view.


Back to the document
Open in its own window

Reference · CAPCO-2016 §H.8 · p. 145
NOFORN NF



Marque's reading
Marks information that may not be released in any form to a foreign government, person, or organization — even a close ally — without the originator's permission.


In this document
Paragraph 4 carries NF, so the banner does too. The document cannot go to the UK while it stands.


Practical
NOFORN and REL TO can't appear on the same portion: NOFORN means no foreign release at all, while REL TO names the countries it can go to.


Written
(S//NF) · TOP SECRET//NOFORN




The manual's words
Verbatim

"NOFORN is an explicit foreign release marking used to indicate the information may not be released in any form to foreign governments, foreign nationals, foreign organizations, or non-US citizens without permission of the originator and in accordance with provisions of, ICD 403, NDP-1, and implementation guidance in this document."
[The §H.8 NOFORN section — the manual sliced at build and keyed to this citation, a page or two, rendered from its markdown. The view lands on the quoted sentence above, highlighted, with the section around it. Emphasis is the manual's own.]
Sponsor and basis: DNI / National Security Act of 1947, as amended, §103 (c)(5)



Source: the citation's section — not a quote field. The manual is sliced at build and keyed to the typed citation; a section can run a page or two. short is a substring of it, so the view can scroll to it and highlight it. Marque's reading stays at the top so nobody has to start from the manual. |
| Countries and groups — tier 1 only
|
(S//REL TO USA, FVEY)
FVEY — Five Eyes: USA, AUS, CAN, GBR, NZL. | ·
(S//REL TO USA, CHE)
CHE — Switzerland. You wrote "Switzerland"; Marque wrote the trigraph. | Two bars, always visible. Marque's words are plain and reviewed for clarity. The manual's words are quoted byte-for-byte, cited to section and page, and set apart every time they appear.
A window, not a modal. The full passage drills into the pane by default, which works everywhere — Office included — and opens in its own window where the host allows. A modal would hide the marking the reader is trying to understand.
Length by tier. One: two sentences. Two: the manual's one-liner. Three: as long as the manual is, on the reading surface, with Marque's reading at the top. |
