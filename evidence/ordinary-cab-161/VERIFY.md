<!-- SPDX-FileCopyrightText: 2026 Knitli Inc. -->
<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# Ordinary CAB questions verification

The tests use a synthetic trusted Office host. They do not establish a live Word provider or permission grant. The new questions operation and selected-audience operation use separate artifacts; a historical selected-audience digest mismatch is not a CAB layout change.

The qualifying local inputs were:

- Selected-audience Node package: `/private/tmp/marque-158-qualified-product/wasm/marque_wasm.js`, sibling WASM SHA-256 `09809de846dce86f992a2ed074ce4ebb30321f43f22731446b0d790ac023f2f2`.
- Selected-audience build register: `/private/tmp/marque-144-callers-native/debug/build/marque-ism-82ada71d93204867/out/values.rs`. The test independently checks all 340 values and the generated vocabulary digest.
- Reviewed ordinary CAB questions Node package: `/private/tmp/marque-159-reviewed-product/wasm/marque_wasm.js`, entry SHA-256 `52fa7d22d56a77c3d66838f451d446b2be306de7fe0110657ad3aeccf6b7926d`, sibling WASM SHA-256 `57947c33fefa166c5db77961ae81ab41da84b7af32678566dc057f53e439457c`. Engine commit `195c067ce60ad7db3749a7b4f98cca6fdb7711ae` (#2952).
- Historical mismatch control: `/private/tmp/marque-151-node-pkg/marque_wasm.js`, sibling WASM SHA-256 `7252bbb879a78c5f2f94b82db51ad5eb747a09a4b1436b653388132259054965`.

Set `MARQUE_SELECTED_AUDIENCE_WASM`, `MARQUE_SELECTED_AUDIENCE_REGISTRY`, and `MARQUE_159_WASM` to the corresponding Node entry/register, stage the exact ordinary WASM through the bounded evidence runner, then run `vp run -r test`. Run the selected-audience historical mismatch with `packages/kit/test/dom/run-selected-audience.mjs` in `mismatch` mode and the historical hash above. The suite and package builds do not require these private paths; they are inputs to this particular evidence run.

The independently current CAB grant is tested against an actual ordinary WASM response. The readout is withheld for missing raw authority, wrong viewer or chain, stale basis, or invalidated layout. Only granted fields are presented using local static labels. This does not attest the live provider, prove a Word write, or issue an answer.

From the checkout root, the final dual-product suite used:

```sh
MARQUE_SELECTED_AUDIENCE_WASM=/private/tmp/marque-158-qualified-product/wasm/marque_wasm.js \
MARQUE_SELECTED_AUDIENCE_WASM_SHA256=09809de846dce86f992a2ed074ce4ebb30321f43f22731446b0d790ac023f2f2 \
MARQUE_SELECTED_AUDIENCE_REGISTRY=/private/tmp/marque-144-callers-native/debug/build/marque-ism-82ada71d93204867/out/values.rs \
node packages/kit/test/dom/run-ordinary-cab-161.mjs \
  /private/tmp/marque-159-reviewed-product/wasm/marque_wasm.js \
  52fa7d22d56a77c3d66838f451d446b2be306de7fe0110657ad3aeccf6b7926d \
  57947c33fefa166c5db77961ae81ab41da84b7af32678566dc057f53e439457c full
```

The runner verifies both artifact hashes, temporarily stages the verified package, checks source hashes before and after, and removes its staging. The full run passed 50 Node tests and 208 DOM tests; its one intentional historical-artifact mismatch skip passed separately using the historical mismatch command above. The focused reviewed-product run passed 17 tests. Core, kit and Office package builds passed. These results apply to the synthetic host and local inputs above.
