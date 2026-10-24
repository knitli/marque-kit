<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense
-->


# The theme layer

Tokens, the switch, fit, shapes, states, long markings, and the contrast audit. The source of truth for values is `packages/kit/src/theme.css` (v0.4); this file is the rationale and the rules. Light is the default theme (decided 16 Oct 2026).

_Extracted from the Marque UI kit design canvas (boards: Theme, ThemeTokens, Fit, ThemeStates, LongMarkings, Contrast), 21 Oct 2026. The canvas is the visual record; this file is the text the kit is built to. Edit here from now on._


---

## The theme layer — one card, four themes
Every card below is the same markup reading only --mq-* tokens from kit/marque-theme.css. The first two are the shipped themes. The third is a host override — fonts, accent, radii, nothing else. The fourth simulates Windows contrast themes, where fills disappear and the shapes have to do the work. Below the cards: the four inline shapes, and what the gate does with a bad override.

| LightShipped, and the default. What a Word or Outlook pane gets.
|
Action required

NEEDS YOUParagraph 3
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.
Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
I don't know, or it's not my call

AnswerAsk me at finalize
Why?CAPCO-2016 §H.3 p55

Noticeable

Added a comma to paragraph 2's marking.
(S//REL TO USA, FVEY)was (S//REL TO USA FVEY)
Why?CAPCO-2016 §H.8 p151

Inline, in the document
¶2 (S//REL TO USA, FVEY) changed
¶5 (S//REL TO USA, GBR) can act
¶3 (//JOINT S AUS GBR//REL TO USA, GBR) must act
¶4 ( ) absent | DarkShipped, opt-in. data-mq-theme="dark". Marque's own chrome, and anyone who asks.
Action required

NEEDS YOUParagraph 3
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.
Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
I don't know, or it's not my call

AnswerAsk me at finalize
Why?CAPCO-2016 §H.3 p55

Noticeable

Added a comma to paragraph 2's marking.
(S//REL TO USA, FVEY)was (S//REL TO USA FVEY)
Why?CAPCO-2016 §H.8 p151

Inline, in the document
¶2 (S//REL TO USA, FVEY) changed
¶5 (S//REL TO USA, GBR) can act
¶3 (//JOINT S AUS GBR//REL TO USA, GBR) must act
¶4 ( ) absent | Host override — "agency pane"Light, plus the host's own values on the kit root: system fonts, a navy accent, 6px corners. Gold stays gold.
Action required

NEEDS YOUParagraph 3
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.
Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
I don't know, or it's not my call

AnswerAsk me at finalize
Why?CAPCO-2016 §H.3 p55

Noticeable

Added a comma to paragraph 2's marking.
(S//REL TO USA, FVEY)was (S//REL TO USA FVEY)
Why?CAPCO-2016 §H.8 p151

Inline, in the document
¶2 (S//REL TO USA, FVEY) changed
¶5 (S//REL TO USA, GBR) can act
¶3 (//JOINT S AUS GBR//REL TO USA, GBR) must act
¶4 ( ) absent | Forced colours (simulated)Windows "High Contrast Black". Fills become Canvas, text CanvasText, links LinkText. Gold is gone; the double rule and the word NEEDS YOU carry "must act".
Action required

NEEDS YOUParagraph 3
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S., and every joint producer must be able to receive it.
Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
I don't know, or it's not my call

AnswerAsk me at finalize
Why?CAPCO-2016 §H.3 p55

Noticeable

Added a comma to paragraph 2's marking.
(S//REL TO USA, FVEY)was (S//REL TO USA FVEY)
Why?CAPCO-2016 §H.8 p151

Inline, in the document
¶2 (S//REL TO USA, FVEY) changed
¶5 (S//REL TO USA, GBR) can act
¶3 (//JOINT S AUS GBR//REL TO USA, GBR) must act
¶4 ( ) absent |
| What a host may set. Any --mq-* token, on the kit root, in CSS or through mq.theme.extend({…}). In practice: the four fonts, the colours, the radius and border, the spacing unit, the one motion duration. A host supplies light values, dark values, or both; the kit's dark still applies where the host gave none. What it may not. The shapes, which colour means what, how a marking is set, the focus ring, and the contrast floors. Those aren't tokens, so there is nothing to override. | How the theme is chosen. data-mq-theme on the kit root: light (the default — decided 16 Oct: dark-mode use in Word and Outlook is rare, documents are laid out as they will print), dark, or auto (opt-in; follows prefers-color-scheme). A host that knows its own scheme sets it explicitly: Office.js exposes officeTheme, and the add-in may set dark from it for the few who use it. Both themes set color-scheme, so native controls and scrollbars follow. | mq.theme.check() — host override "agency", attn set to #ffe066 with white ink
|---|---|
rejected attn-on / attn 1.30 floor 4.5 → shipped value used
rejected attn-ink / surface 1.78 floor 4.5 → shipped value used
rejected attn-ink / attn-tint 1.72 floor 4.5 → shipped value used
ok text / surface 15.11 · act-ink / surface 11.48 · focus / surface 11.48
12 pairs checked · 3 fell back · the pane rendered with the host's fonts, accent and corners, and Marque's gold. |


---

## The theme layer — 32 tokens, and the part that isn't tokens
The whole surface a host can touch is this table. Values are Knitli's, vendored into kit/marque-theme.css; the kit depends on Knitli's values, not its component bundle, so an Office add-in carries no React. Four values depart from Knitli for contrast on dark and say so. Everything under "Fixed" is behaviour the kit keeps regardless of theme — including how a marking fits its container (T3) and the control states (T4).

token
what it's for
light
dark
host may set
Ground and surfaces
--mq-ground
behind everything — the pane's own background
#f1f7ed
#262d28
yes
--mq-surface
cards, popovers, option boxes
#ffffff
#2e3630
yes
--mq-surface-sunken
wells; the collapsed "done quietly" section
#e4ecdd
#232a25
yes
Text — two steps only
--mq-text
body, headings, markings
#2f3732
#dde4d8
yes
--mq-text-muted
the "was", reasons, labels, citations at rest
#5c655e
#a3ada4
yes
Rules
--mq-rule
hairlines between rows and card sections
rgba(47,55,50,.16)
#414a44
yes
--mq-rule-strong
card and option borders. Dark departs from Knitli (#5a655d → #76827a) to clear 3:1
#2f3732
#76827a
yes
Act — blue. The system did it, or the person can
--mq-act
a blue fill: primary button, action stamp
#4464ad
#4464ad
yes
--mq-act-ink
blue as text or a line on the surface: Why?, citations, the dotted rule, the derived marking
#4464ad
#9db2e0
yes
--mq-act-on
text on an act fill
#ffffff
#ffffff
yes
--mq-act-tint
the derived marking's background
rgba(68,100,173,.10)
rgba(68,100,173,.18)
yes
--mq-act-hover
hover for act-ink and act
#33518f
#5273bd
yes
Attn — gold. A person must look
--mq-attn
a gold fill: NEEDS YOU, the Answer button
#cda824
#cda824
yes
--mq-attn-ink
gold as a rule or text: the double rule, a review marking. Dark uses Knitli's gold-300, its own "gold on a dark ground" reserve
#836a0e
#e3cd7c
yes
--mq-attn-on
text on a gold fill — always dark ink
#2f3732
#2f3732
yes
--mq-attn-tint
the review marking's background
rgba(205,168,36,.12)
rgba(205,168,36,.12)
yes
Error — the engine, not the marking
--mq-error
a brick fill, for the fail-closed state
#8f4f38
#8f4f38
yes
--mq-error-ink
brick as text; Knitli has no dark value, this one measures 4.79
#8f4f38
#d4907a
yes
--mq-error-on
text on an error fill
#ffffff
#ffffff
yes
Focus
--mq-focus
the 2px ring, 2px outside every focusable thing
#4464ad
#9db2e0
yes
Type
--mq-font-display
questions, headings, buttons
Archivo
Archivo
yes
--mq-font-body
everything else
Literata
Literata
yes
--mq-font-mark
markings, stamps, labels, citations. A monospace fallback is appended; markings never wrap
OCR-B
OCR-B
monospace only
--mq-font-code
the gate's report, config views
Fira Code
Fira Code
yes
--mq-size-xs … lg
12 · 13.5 · 15.5 · 16.5 · 21 px. Floors: xs ≥ 12, sm ≥ 13
—
—
within floors
Form and motion
--mq-radius
corners
0
2px
yes
--mq-border
card and control borders
2px
1px
yes
--mq-border-hair
hairlines
1px
1px
yes
--mq-unit
spacing unit; the kit uses multiples of it
4px
4px
yes
--mq-shadow-overlay
the kit's only shadow — a popover. A host may set none
0 8px 28px rgba(47,55,50,.18)
0 8px 28px rgba(0,0,0,.45)
yes
--mq-duration · --mq-ease
one duration, one curve; 0 under reduced motion
180ms
180ms
yes
| Fixed — not tokens, not overridable
|
.mq-changedthin underline in the text colour. Marque changed it; nothing to do.
.mq-can-actdotted underline, 2px, in act-ink. One action is available.
.mq-must-actdouble rule in attn-ink; on a card, a 4px double border. A person must answer.
.mq-absentdashed outline where a marking should be and isn't.
.mq-markthe mark font with a monospace fallback, 0.04em tracking, always LTR, no filter or opacity ever. Never truncated, scrolled or shrunk below 13px.
.mq-l · .mq-ia marking's layers and list items. Each is nowrap; the only break opportunities are between them. When the marking doesn't fit on one line it stacks one layer per line (.stacked); a layer that still doesn't fit breaks after ", " or before "/", with a one-character hanging indent. See T3.
.mq-fold · .mq-count · .differsthe four forms of a long marking — full, folded, summary, diff — and where each shows. A fold is UI text in act-ink, never OCR-B; a differing layer is never folded; the full form is always one click away and is the only form copy, audit and print carry. See T5.
@container ≤ 360pxan option's marking sits under its prose, the card footer stacks, card padding tightens one unit. The floor is 240px.
z 10 · 20 · 30popover on its card, tooltip on the pane, section window above the pane. Fixed.
@media printblack on white, no fills, no shadow, buttons hidden; shapes and words carry the states.
:focus-visible2px ring in --mq-focus, 2px outside. Never removed.
forced-colorsfills go to Canvas, text to CanvasText, links to LinkText; the shapes stay. Gold has no system colour, so the stamp also says it in words.
reduced-motion--mq-duration becomes 0.
meaninga host may recolour attn; whatever it is, it means "a person must look". Nothing else may mean that. | The gate — mq.theme.check() at mount
Reads the computed tokens and measures each pair. A pair under its floor is logged, reported to the host as theme.rejected[{token, measured, floor}], and that token falls back to the shipped value for the active theme. The card renders either way; it never renders unreadable. Shipped light and dark both clear every floor.
text / surface4.5 · light 12.26 · dark 9.58
text-muted / surface4.5 · 6.04 · 4.77
act-ink / surface4.5 · 5.72 · 5.86 — also the 3:1 floor for the dotted rule and radio dots
act-on / act4.5 · 5.72 · 5.72
act-ink / act-tint4.5 · 5.00 · 5.16 — the derived marking
attn-on / attn4.5 · 5.38 · 5.38 — NEEDS YOU, Answer
attn-ink / surface4.5 · 5.21 · 7.88 — also the double rule
attn-ink / attn-tint4.5 · 4.77 · 6.35 — the review marking
error-ink / surface4.5 · 6.28 · 4.78
focus / surface3.0 · 5.72 · 5.86
fonts, sizesmark font resolves to a monospace or falls back; size-xs ≥ 12px, size-sm ≥ 13px. |


---

## Markings that fit
v0.1 set every marking nowrap, which is Knitli's law for a marking in a sentence and the wrong law for a marking in a 320px pane: it broke out of every container. v0.2 keeps the part that matters — never break inside a token, never truncate, never shrink — and adds the part that was missing: when a marking doesn't fit, it is set one layer per line, the way a banner is read.

| What broke
|


v0.1 · nowrap · 300px
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)

44 characters of OCR-B at 13.5px is about 380px. The option box is 230px wide. Nothing in the card can give. | The rule where a marking may break, in order
(//JOINT S AUS GBR USA1//REL TO USA,2 AUS,2 GBR)
TOP SECRET1//SI-G3/TK1//RSEN3/ORCON3/NOFORN
(TS1//SI-G3ABCD3DEFG-MMM1//NF) (//JOINT S AUS3GBR3USA1//REL✕TO USA,2 GBR)

1Between layers, before a //. The first choice, and when the marking doesn't fit on one line, every layer takes its own line — so the same marking always wraps the same way.
2Inside a list, after a , . REL TO and DISPLAY ONLY lists. The comma stays on the line above; the continuation gets a one-character hanging indent.
3Inside a layer, between tokens — the country codes of an owner list, SCI compartments — and before a single / between systems or controls. Only if the layer alone doesn't fit; this is what a twelve-owner JOINT list needs.
✕Never inside a token — REL TO, TOP SECRET, DISPLAY ONLY, SI-G are each one token — never between ( and the first layer, and never by hiding anything. No ellipsis, no scroll, no font below 13px. Long markings get a fold the person can see and open (T5), not a cut. | What the kit renders the engine already knows the layers
<span class="mq-mark stacked">
 <span class="mq-l">(//JOINT S AUS GBR USA</span><wbr>
 <span class="mq-l">
 <span class="mq-i">//REL TO USA, </span><wbr>
 <span class="mq-i">AUS, </span><wbr>
 <span class="mq-i">GBR)</span>
 </span>
</span>

.mq-mark white-space: normal; hanging indent .65em
.mq-l, .mq-i white-space: nowrap — breaks only at <wbr>
.stacked .mq-l display: block — one layer per line
CSS alone wraps greedily — as many layers on a line as fit — which orphans GBR) on its own line. The kit's Marking measures once and adds .stacked the moment any break is needed. Copy still yields the plain marking: no inserted characters, only spans. |
The same card at three pane widths 440 (a web form) · 320 (Word's task pane) · 280 (the pane, narrowed). Light.
440px kit root
NEEDS YOUParagraph 3
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Answer
Ask me at finalize
Why?CAPCO-2016 §H.3 p55
320px kit root
NEEDS YOUParagraph 3
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Answer
Ask me at finalize
Why?CAPCO-2016 §H.3 p55
280px kit root
NEEDS YOUParagraph 3
Who collected or produced this information?
Paragraph 3 reads (//JOINT S AUS GBR//REL TO USA, GBR), which can't be right: a joint marking always includes the U.S.

Your answer
The U.S., the UK and Australia produced it together(//JOINT S AUS GBR USA//REL TO USA, AUS, GBR)
The UK and Australia, without the U.S.(//AUS GBR S//REL TO USA, AUS, GBR)
It's British, with some Australian information(//GBR S//FGI AUS//REL TO USA, GBR)
Answer
Ask me at finalize
Why?CAPCO-2016 §H.3 p55
What changes as the pane narrows. Nothing structural. The question wraps; the option prose wraps; a marking that no longer fits stacks its layers. Below 360px the footer's two links stack and the card's padding tightens by one unit — that is the whole of the responsive behaviour, written once in the kit file as a container query.
What never changes. The marking's size, its font, the tokens, the order of the layers, the radio, the gold.
The floor is 240px. Under it the kit renders only the collapsed row and tells the host it cannot lay out a card. Word's pane doesn't go that narrow; a web host could.
Banners, lists, SCI — at 290px, light and dark
| status strip · banner · 300pxThis documentSECRET//FGI AUS GBR//REL TO USA, GBR | banner with SCI and dissem · must actTOP SECRET//SI-G/TK//RSEN/ORCON/NOFORN | a long REL TO list · breaks after commas, hanging indent(S//REL TO USA, AUS, CAN, GBR, NZL, DEU, FRA, ITA) | SCI compartments stay together(TS//SI-G ABCD DEFG-MMM//NF) | short · fits, so it stays on one line(U//FOUO) (S//NF) (C//REL TO USA, GBR) | inside a sentenceComma added. Was (S//REL TO USA FVEY), now (S//REL TO USA, FVEY). The banner stays SECRET//FGI AUS GBR//REL TO USA, GBR while paragraph 3 is open. | status strip · banner · 300pxThis documentSECRET//FGI AUS GBR//REL TO USA, GBR | banner with SCI and dissem · must actTOP SECRET//SI-G/TK//RSEN/ORCON/NOFORN | a long REL TO list · breaks after commas, hanging indent(S//REL TO USA, AUS, CAN, GBR, NZL, DEU, FRA, ITA) | SCI compartments stay together(TS//SI-G ABCD DEFG-MMM//NF) | short · fits, so it stays on one line(U//FOUO) (S//NF) (C//REL TO USA, GBR) | inside a sentenceComma added. Was (S//REL TO USA FVEY), now (S//REL TO USA, FVEY). The banner stays SECRET//FGI AUS GBR//REL TO USA, GBR while paragraph 3 is open. |
|---|---|---|---|---|---|---|---|---|---|---|---|


---

## States, layers, density, print
The rest of what a theme has to say. Every control has four states and they are the same four on light and dark. Three layers, fixed. One spacing unit the host can tighten. Print is the audit's paper form.

| Options · light
|
Rest(S//REL TO USA, FVEY)
Hover — act tint, border unchanged(S//REL TO USA, FVEY)
Chosen — act-ink border and tint. Blue, not gold: the person acted.(S//REL TO USA, FVEY)
Disabled — the host locked the document(S//REL TO USA, FVEY)
Keyboard focus — 2px ring, 2px out(S//REL TO USA, FVEY) | Options · dark
Rest(S//REL TO USA, FVEY)
Hover — act tint, border unchanged(S//REL TO USA, FVEY)
Chosen — act-ink border and tint. Blue, not gold: the person acted.(S//REL TO USA, FVEY)
Disabled — the host locked the document(S//REL TO USA, FVEY)
Keyboard focus — 2px ring, 2px out(S//REL TO USA, FVEY) | Buttons and links · light
resthoverdisabled
AnswerAnswerAnswer
ApplyApplyApply
Keep as writtenKeep as writtenKeep as written
Ask me at finalizeAsk me at finalizeAsk me at finalize

Why?Why? (hover)CAPCO-2016 §H.8 p151focused
Gold is the one primary: it means a person must act now. Blue Apply is for the few places the person applies something Marque proposed and withheld. Secondary is for the recorded override. Ghost is for deferral. Press is a 1.5% scale, 0 under reduced motion. | Buttons and links · dark
resthoverdisabled
AnswerAnswerAnswer
ApplyApplyApply
Keep as writtenKeep as writtenKeep as written
Ask me at finalizeAsk me at finalizeAsk me at finalize

Why?Why? (hover)CAPCO-2016 §H.8 p151focused
Gold is the one primary: it means a person must act now. Blue Apply is for the few places the person applies something Marque proposed and withheld. Secondary is for the recorded override. Ghost is for deferral. Press is a 1.5% scale, 0 under reduced motion. |
| Three layers, fixed
|


Added a comma to paragraph 2's marking.
(S//REL TO USA, FVEY)was (S//REL TO USA FVEY)
Why?CAPCO-2016 §H.8 p151

FVEY — Five Eyes: AUS, CAN, GBR, NZL, USAz 20
WhyCountries in a REL TO list are separated by a comma and a space.z 10
card · z 0
section window · z 30, above the pane

A popover sits on its card and carries the kit's only shadow. A tooltip sits on everything in the pane, dark on light and light on dark. The section window is the host's to place; it is above the pane and never modal. | One unit for density


--mq-unit: 4px (default)
NEEDS YOU¶3Who produced this?Three readings fit.


--mq-unit: 3px (a dense host)
NEEDS YOU¶3Who produced this?Three readings fit.


Padding and gaps are multiples of one unit. Type sizes are not — they have floors, and density never shrinks a marking. A host that wants a tighter pane sets the unit; it does not touch the scale. | Print

Marque · session receipt · 2026-10-13
Paragraph 2 — comma added
(S//REL TO USA, FVEY)was (S//REL TO USA FVEY)
CAPCO-2016 §H.8 p151 · applied by the engine · classifier J. Doe
Paragraph 3 — kept as written, reported
(//JOINT S AUS GBR//REL TO USA, GBR)
Open question: who produced this information. Deferred to finalize by J. Doe.

Black on white, no fills, no shadow, buttons gone. The shapes carry the states: the underline says changed, the double rule says a person still has to look. Stacked markings stay stacked, so a printed banner reads layer by layer. |


---

## Long markings — the plan
Coalition building puts twenty countries in a REL list on a portion, and ten JOINT members get listed twice. Marque accepts up to 4,096 bytes — a little more than the longest lawful marking. Stacking alone makes a 320px pane a wall of OCR-B. So one marking has four forms, each for a place; the full form is always one click away and is the only one copy, audit and print ever carry.

How long is long at 320px, the width of Word's task pane
Five Eyes portion
21
characters · 1 line. Most markings.
(S//REL TO USA, FVEY)
Twelve-nation coalition portion
126
characters · 6 lines stacked. Common around the start of a conflict; three readings of it make eighteen lines.
(//JOINT S AUS BEL CAN DEU DNK FRA GBR ITA NLD NOR POL USA//REL TO USA, AUS, BEL, CAN, DEU, DNK, FRA, GBR, ITA, NLD, NOR, POL)
Marque's cap
4,096
bytes · ~170 lines stacked. Drawn a little past the longest marking the grammar allows; it will not occur, but the kit must not fall over if it does. Never rendered inline — the row says so in words and the popover scrolls.
Why not just stack. Stacking is correct and complete, and in a card it is the right answer up to about four lines. Past that the marking stops being read and starts being skipped — the opposite of what a decision card is for.
Why not cut. A marking is what the person is verifying. Anything that looks like the marking but isn't the whole marking is a lie in OCR-B. So every fold is visibly a fold, in a different face and colour, and opens in place.
Four forms of one marking light, then dark
Full · the reference form · popover
Paragraph 3 · as Marque will write it
(//JOINT S AUS BEL CAN DEU DNK FRA GBR ITA NLD NOR POL USA//REL TO USA, AUS, BEL, CAN, DEU, DNK, FRA, GBR, ITA, NLD, NOR, POL)
DNK — Denmark
Copy126 characters · 2 layers
Every layer, every item, hover help on every token. What copy, the audit, print and Why? carry. The one place a marking may scroll — past about 1,000 bytes it does.

Folded · in a card
Added the U.S. to paragraph 3's owner list.
(//JOINT S AUS BEL CAN +9 more//REL TO USA, AUS, BEL +9 more)
A joint marking always includes the U.S.

Why?CAPCO-2016 §H.3 p55
Layers stay. A list longer than the fold shows its heading and first three codes, then a count in UI text with the dotted "can act" rule — not OCR-B, so never mistaken for the marking. Opening is inline; the card grows.

Summary · in a row or strip
¶3Added the U.S. to the owner list
(//JOINT S AUS…USA · 12//REL TO USA…POL · 12)
This documentSECRET//REL TO USA…POL · 12
First layer verbatim; each long list as its heading and a count badge, first and last code shown. A row is a pointer, not a record: the full form is one click away.

Diff · in a decision
Who produced this information?
Your answer
All twelve, together(//JOINT S AUS BEL CAN DEU DNK FRA GBR ITA NLD NOR POL USA//REL TO USA, AUS, BEL +9 more · same in every reading)
The eleven, without the U.S.(//AUS BEL CAN DEU DNK FRA GBR ITA NLD NOR POL S//REL TO USA, AUS, BEL +9 more · same in every reading)
The UK, with information from the others(//GBR S//FGI AUS BEL CAN DEU DNK FRA ITA NLD NOR POL//REL TO USA, AUS, BEL +9 more · same in every reading)
Readings compared layer by layer. The layer that differs is always full and tinted — look here. Only a layer identical in every reading may fold, and the fold says so. A fold never hides a difference.

Full · the reference form · popover
Paragraph 3 · as Marque will write it
(//JOINT S AUS BEL CAN DEU DNK FRA GBR ITA NLD NOR POL USA//REL TO USA, AUS, BEL, CAN, DEU, DNK, FRA, GBR, ITA, NLD, NOR, POL)
DNK — Denmark
Copy126 characters · 2 layers
Every layer, every item, hover help on every token. What copy, the audit, print and Why? carry. The one place a marking may scroll — past about 1,000 bytes it does.

Folded · in a card
Added the U.S. to paragraph 3's owner list.
(//JOINT S AUS BEL CAN +9 more//REL TO USA, AUS, BEL +9 more)
A joint marking always includes the U.S.

Why?CAPCO-2016 §H.3 p55
Layers stay. A list longer than the fold shows its heading and first three codes, then a count in UI text with the dotted "can act" rule — not OCR-B, so never mistaken for the marking. Opening is inline; the card grows.

Summary · in a row or strip
¶3Added the U.S. to the owner list
(//JOINT S AUS…USA · 12//REL TO USA…POL · 12)
This documentSECRET//REL TO USA…POL · 12
First layer verbatim; each long list as its heading and a count badge, first and last code shown. A row is a pointer, not a record: the full form is one click away.

Diff · in a decision
Who produced this information?
Your answer
All twelve, together(//JOINT S AUS BEL CAN DEU DNK FRA GBR ITA NLD NOR POL USA//REL TO USA, AUS, BEL +9 more · same in every reading)
The eleven, without the U.S.(//AUS BEL CAN DEU DNK FRA GBR ITA NLD NOR POL S//REL TO USA, AUS, BEL +9 more · same in every reading)
The UK, with information from the others(//GBR S//FGI AUS BEL CAN DEU DNK FRA ITA NLD NOR POL//REL TO USA, AUS, BEL +9 more · same in every reading)
Readings compared layer by layer. The layer that differs is always full and tinted — look here. Only a layer identical in every reading may fold, and the fold says so. A fold never hides a difference.

| The rules
|

1The full marking always exists — in copy, in the audit, in print, in the Why? popover, and one click or hover from any other form. The popover is the only place a marking may scroll.
2A fold is never marking text. It is UI type, act-ink, dotted — the "can act" shape — and it names a count. It happens only at a list boundary, after the heading and the first three codes. In the document itself the kit never folds; the host's text is the host's.
3In a decision, a fold never hides a difference. Readings are compared layer by layer; a layer that differs is always full and tinted. Only a layer identical in every reading may fold, and its label says so.
4Rows and strips summarise when the stacked form would pass three lines: first layer verbatim, long lists as heading plus a count badge with first and last code.
5Pathological markings — the engine's PathologicalMarking, or anything past about 1,000 bytes — never render inline. The row says "a marking too long to show here"; the popover shows it and scrolls.
6Within a layer, break after a list comma first, between tokens next, before a slash last; never inside a token. Every continuation line carries a one-character hanging indent. | Where each form shows

placefullfoldedsummarydiff
The document (inline mark)host's text———
Collapsed row · status stripon click—yes—
Noticeable · Advisory card≤ 4 linespast that——
Decision card (readings)≤ 4 lines——past that
Why? popover · derivationalways———
Audit receipt · print · copyalwaysnevernevernever
Pathological (> ~1,000 bytes)popover only—row says so—

What the engine should emit for this to work without guessing: every marking as layered tokens (the kit never re-parses a string), and for each reading the layer or axis that differs from the others — AlternativeDescriptor already knows it is the ownership axis. Both are logged in the observations doc. |


---

## Contrast audit — every pair the finding card uses
WCAG 2.x ratios, computed from the Knitli tokens as shipped. Text needs 4.5:1 (all card text is under 18px). Non-text UI parts — borders that carry state, focus rings, radio dots, the Arrow — need 3:1. Tints are the token's alpha composited over the card's actual background.

| Reference
|
pairrationeedsresult
Aabody text on card12.264.5pass
Aamuted text on card6.044.5pass
Aafaint text on card5.184.5pass
Aalink (action-ink) on card5.724.5pass
AaWhy? link on mint ground5.254.5pass
Aaderived marking: blue-700 ink on 10% blue tint6.774.5pass
Aaderived marking border (blue-500) vs card5.723.0pass
Aareview marking: gold-700 ink on 12% gold tint4.774.5pass
Aareview marking border (gold-500) vs card2.283.0fail
Aaattention Stamp/Button: charcoal on gold5.384.5pass
Aagold fill vs white card (boundary)2.283.0fail
Aaaction Stamp: white on blue5.724.5pass
AaConfidenceTag derived: white on blue5.724.5pass
Aafocus ring (blue-500) vs white card5.723.0pass
Aafocus ring (blue-500) vs gold button (if drawn over it)2.513.0fail
Aaradio accent (blue-500) on white5.723.0pass
Aaradio accent (blue-500) on 12% gold tint5.233.0pass
AaArrow (blue-500) on white5.723.0pass
Aarule-strong border vs card12.263.0pass
Aaerror text on card6.284.5pass | Instrument
pairrationeedsresult
Aabody text on raised9.584.5pass
Aamuted text on raised4.774.5pass
Aafaint text on raised3.974.5fail
Aalink (action-ink blue-300) on raised5.864.5pass
AaWhy? link on charcoal ground6.644.5pass
Aaderived marking: blue-300 ink on 10% blue tint5.444.5pass
Aaderived marking border (blue-300) vs raised5.863.0pass
Aareview marking: gold-500 ink on 12% gold tint4.414.5fail
Aareview marking border (gold-500) vs raised5.473.0pass
Aaattention Stamp/Button: charcoal on gold5.384.5pass
Aagold fill vs raised (boundary)5.473.0pass
Aaaction Stamp: white on blue-5005.724.5pass
Aaaction Stamp fill (blue-500) vs raised (boundary)2.183.0fail
AaConfidenceTag derived: charcoal-700 on blue-3006.644.5pass
Aafocus ring (blue-300) vs raised5.863.0pass
Aafocus ring (blue-300) vs gold button (if drawn over it)1.073.0fail
Aaradio accent (blue-500) on raised2.183.0fail
Aaradio accent (blue-500) on 12% gold tint1.753.0fail
AaArrow (blue-500) on raised2.183.0fail
Aarule-strong border vs raised2.053.0fail
Aaerror text on raised1.984.5fail |
| Blue on blue is fine. The derived marking is blue-700 ink on a 10% blue tint: 6.8:1 on Reference, 5.4:1 on Instrument. It reads as "blue on blue" because the state is carried by hue; the kit adds a shape too — thin underline for changed, double rule for must-act, dotted for can-act — so colour never carries the meaning alone. Blue and gold are also the safe pair for the common colour-vision deficiencies: they differ in lightness, not just hue. | Blue touches gold in two places, and both are avoidable. The focus ring over a gold button is 2.5:1 (Reference) and 1.1:1 (Instrument) — but Knitli offsets the ring 2px outside the element, so it is judged against the card, where it passes. Blue radio dots on a gold tint pass on Reference (5.2) and fail on Instrument (1.8): the kit uses action-ink for the dot, not action, and never puts options on a gold tint. | Fix before the kit ships. On Instrument: the Arrow defaults to action (2.2:1) and should take action-ink; text-faint on a raised card is 3.97 (the token was measured on the ground, not the card); the review marking's gold-on-gold-tint is 4.41, a hair under. On Reference: a gold border on a white card is 2.28, so the review state needs its double rule, not the border alone. These are design-system issues to send back, not kit workarounds. |
|---|---|---|
