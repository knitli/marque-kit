<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# Successor confirmation in the Word pane

The pane offers a separately granted, read-only comparison of an exact accepted
answer group against an independently observed successor. The host grant binds
the viewer, both document revisions and faces, the accepted preview and value
identities, successor observations and correspondence, raw input and output,
the whole-group outcome, and the individual field labels that may be shown. A
linked preview additionally requires the separate current source grant. The
pane rechecks the grants, provider and active document around the engine call,
clears results on invalidation and discards delayed or unbound responses.

The host independently qualifies the exact-request BLAKE3 receipt; the pane
will not show a confirmed or different result with a receipt for another
request. This is a binding check, not authentication of the evaluator. A trusted
installation must supply both the independently established grant and the
actual evaluator. No comparison applies or verifies a Word write, establishes
classification authority, or reports document readiness.

## Reviewed engine and checks

The reviewed engine commit was `43bac2905caecb1db39f791f0566ee9caff1484d`.
Its Node entry SHA-256 was
`6fe1cddefa54c8d0271b7cf5ac2e6d09e242fae81363017ca4f6aa31c477cce8`;
the sibling WASM SHA-256 was
`0143b463ea204a10516fa46641616ba8aa129f140e88e60cfd26c245eaf447e8`.
The evidence runner checked the entry, WASM and listed kit source hashes
before and after each run. The kit base was
`5537ffd4811cd17657bfae6bcdd6aa7cf5ffe18d`.

The focused suite passed 176 tests. The full workspace passed 367 DOM tests
and 50 Node tests; one historical selected-audience mismatch case was skipped
in the full run and passed separately against the #151 mismatch artifact. The
normal selected-audience tests used the existing #158 paired artifact and
register. TypeScript, changed-file lint and formatting, and the core, kit and
Office builds passed. The repository-wide `vp check` reported the same 32
pre-existing decision TOML formatting issues.

Real-engine pane cases include linked and unlinked confirmation, a single
accepted field, changed actual value identity, a changed accepted group with the
same field names and a swapped valid response, denied linked-source authority,
unavailable successor evidence, and delayed replies after same-text revision,
layout or identity changes. Mock host cases exercise raw input, raw output,
whole-group and field-label permissions independently, other grant and provider
changes, and no writes or private text in the pane.

A real-WASM pane test starts with a confirmed face, invalidates it and immediately
clears the old result. With identical successor text and a fresh readback of
pages 1 and 2 for the accepted field, the package inspector reports `split_page`
and unknown target state; confirmation is unavailable. A subsequent fresh L2
readback with the field on page 1 confirms again. This test supplies synthetic
host observations; it does not observe an installed Word session.

Separately, the existing placement-view test
`calls the inspector with observed pages and revokes a previous layout before reflow readback`
was rerun. Its synthetic Office.js page API and inspector stub first return an
on-face page 1 result, immediately remove it when a same-text L1-to-L2 reflow is
invalidated, and show the page 1–2 split only after a new L2 readback and
refresh. This is the placement view, not the confirmation result; neither its
Office.js objects nor its inspector are an installed Word session.

## Reproduction

The tests qualified confirmation receipts outside the engine with the
standalone [test helper](receipt-blake3.c), linked to the upstream BLAKE3
1.8.7 portable C sources. This independently constructs the framing and checks
the response against the exact submitted UTF-8 bytes; it is not a second
independent BLAKE3 algorithm implementation. The locally built executable had
SHA-256 `28bbe84052d2d596732ad7bbddeb39aa2c98953ba2c26137c967b369b9f7b4df`
and produced the standard empty-input digest
`af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262`.
The helper source SHA-256 was
`1198aee1316daa6a660a3c2e98c5160b4010680f1f000627650a92ad0ff0caa2`.

```sh
BLAKE3_C=/Users/adampoulemanos/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/blake3-1.8.7/c
cc -O2 -DBLAKE3_USE_NEON=0 -I "$BLAKE3_C" \
  evidence/ordinary-successor-confirmation-171/receipt-blake3.c \
  "$BLAKE3_C/blake3.c" "$BLAKE3_C/blake3_dispatch.c" "$BLAKE3_C/blake3_portable.c" \
  -o /private/tmp/marque-171-receipt-tool/rebuilt

MARQUE_163_WASM=/private/tmp/marque-170-reviewed-product/wasm/marque_wasm.js \
MARQUE_165_WASM=/private/tmp/marque-170-reviewed-product/wasm/marque_wasm.js \
MARQUE_166_WASM=/private/tmp/marque-170-reviewed-product/wasm/marque_wasm.js \
MARQUE_170_WASM=/private/tmp/marque-170-reviewed-product/wasm/marque_wasm.js \
MARQUE_170_BLAKE3=/private/tmp/marque-171-receipt-tool/rebuilt \
MARQUE_SELECTED_AUDIENCE_WASM=/private/tmp/marque-158-qualified-product/wasm/marque_wasm.js \
MARQUE_SELECTED_AUDIENCE_WASM_SHA256=09809de846dce86f992a2ed074ce4ebb30321f43f22731446b0d790ac023f2f2 \
MARQUE_SELECTED_AUDIENCE_REGISTRY=/private/tmp/marque-144-callers-native/debug/build/marque-ism-82ada71d93204867/out/values.rs \
node packages/kit/test/dom/run-ordinary-cab-161.mjs \
  /private/tmp/marque-170-reviewed-product/wasm/marque_wasm.js \
  6fe1cddefa54c8d0271b7cf5ac2e6d09e242fae81363017ca4f6aa31c477cce8 \
  0143b463ea204a10516fa46641616ba8aa129f140e88e60cfd26c245eaf447e8 full
```

The focused run uses the same command with `focused` instead of `full`. The
placement-view control can be rerun from `packages/kit` with:

```sh
node ../../node_modules/vite-plus/bin/vp test --run test/dom/native-cab-placement.test.ts \
  -t 'calls the inspector with observed pages and revokes a previous layout before reflow readback'
```

These checks use a synthetic host and supplied grants. This repository does not
provide a live authenticated Word provider, establish actual viewer permissions,
or demonstrate that Office delivers the required invalidations. Those remain
installation responsibilities.
