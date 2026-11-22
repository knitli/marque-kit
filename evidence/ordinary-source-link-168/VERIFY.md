<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# Linked-source Word preview verification

The synthetic Word host requires a separate current source grant before the
preview executor receives a linked source. The grant binds its viewer, exact
source identity and bytes, scope, owner, face and layout, and both raw-input
and raw-output disclosure. The pane rechecks the target, preview and source
grants around prepare and apply, cancels delayed results on invalidation, and
shows only authorized field-presence labels. Target-only preview remains
available without a source grant.

The tests cover missing and inconsistent grants, owner and readback changes,
oversized inputs, opaque source IDs, same-text source identity and revision
changes, provider changes during document reads, and refused links. Real WASM
tests cover a successful linked preview, source refusal, missing permission,
same-text changes during both stages, and prototype-like IDs. The DOM does
not disclose the fictional source text or references.

## Frozen product and results

The frozen engine was `403c81193a8ba1ec9b878d669e0eb6b85c80e058`. Its
Node WASM entry SHA-256 was
`e6ffaacb4f348a1d187afb276672f1d31554cb9388103054fdfbb31e0844cc0a`;
the sibling WASM SHA-256 was
`28206961e3c5afd102b49ab93563c401695c25cf597dca3630c4fb753cd21dbb`.
The bounded runner verified these hashes and its source files before and after
the run. The separate selected-audience pair used its existing #158 artifact
and vocabulary register, as recorded in [the earlier verification](../ordinary-cab-161/VERIFY.md).

The full workspace test run passed 50 Node tests and 299 DOM tests; the one
historical selected-audience mismatch case was run separately and passed.
TypeScript, changed-file lint and formatting checks passed, as did the core,
kit and Office builds. The full `vp check` still reports formatting problems
in 32 unchanged decision TOML files; this change did not alter them.

The frozen run used the following local inputs and Node 26:

```sh
MARQUE_163_WASM=/private/tmp/marque-166-reviewed-product/wasm/marque_wasm.js \
MARQUE_165_WASM=/private/tmp/marque-166-reviewed-product/wasm/marque_wasm.js \
MARQUE_166_WASM=/private/tmp/marque-166-reviewed-product/wasm/marque_wasm.js \
MARQUE_SELECTED_AUDIENCE_WASM=/private/tmp/marque-158-qualified-product/wasm/marque_wasm.js \
MARQUE_SELECTED_AUDIENCE_WASM_SHA256=09809de846dce86f992a2ed074ce4ebb30321f43f22731446b0d790ac023f2f2 \
MARQUE_SELECTED_AUDIENCE_REGISTRY=/private/tmp/marque-144-callers-native/debug/build/marque-ism-82ada71d93204867/out/values.rs \
node packages/kit/test/dom/run-ordinary-cab-161.mjs \
  /private/tmp/marque-166-reviewed-product/wasm/marque_wasm.js \
  e6ffaacb4f348a1d187afb276672f1d31554cb9388103054fdfbb31e0844cc0a \
  28206961e3c5afd102b49ab93563c401695c25cf597dca3630c4fb753cd21dbb full
```

This tests a synthetic host, not a live Word provider, actual access control or
Office invalidation delivery. It does not prove a document write, answer value,
authority or readiness.

## Formatting and guard review

The fixture was formatted with `vp fmt`; a deep comparison of its parsed JSON
before and after confirmed unchanged data. The source grant checks were split
into permission, current source, face/readback and link checks. Independent
comparison found their predicates and error handling preserved. Lizard reports
the original guard's cyclomatic complexity as 64 and the revised guard as 5;
the extracted checks range from 10 to 26.

After both changes, the frozen-engine focused suites passed 91 tests and the
full workspace run passed 50 Node and 299 DOM tests, with the historical
selected-audience mismatch covered separately. The runner again confirmed its
source and product hashes unchanged. TypeScript, changed-file lint and format
checks passed; `vp check` still reports the same 32 inherited TOML issues.
