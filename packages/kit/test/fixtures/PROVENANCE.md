<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.
SPDX-License-Identifier: AGPL-3.0-only
-->

# Source marking fixtures

These fictional JSON payloads are Knitli test fixtures, with synthetic document and viewer identifiers. The kit copies are byte-identical to the matching fixtures in `packages/core/test/fixtures/`: `native-source-marking.fixture` corresponds to `native-source-marking-v2.fixture`, and `native-source-marking-synthetic-v1.fixture` has the same name in both directories. Their license is recorded in `REUSE.toml`.

The v2 fixture is the exact output of `replacement/native-wire/examples/source_marking_harness.rs` at native commit `b723549c3e512fd127f0934a921f9c11cb9749b2`, replaying the reviewed fictional `producer-input.json`; its SHA-256 is `5af1592d87637129fceeef6ca9fc21f644eb030c7f41fef16fe407626af33ea2`. The harness uses a synthetic authorization callback, not a real provider. The built-pane browser test feeds these exact fixture bytes to a synthetic Office provider. The v1 payload exercises rejection on the live path; it is not an authorized provider response.

The protected source-marking fixture was regenerated with the same harness from current Marque commit `1edd1ff2951841227555d723402d37c62e03baee`, using the fictional marking `(S//REL TO USA, XYZ-CANARY, )`. Its bytes are identical to the mounted fixture: SHA-256 `5af1592d87637129fceeef6ca9fc21f644eb030c7f41fef16fe407626af33ea2`.

## Ordinary source projection fixtures

The following two fixtures are `document` values emitted by the compiled WASM package from Marque source commit `1edd1ff2951841227555d723402d37c62e03baee` (`/private/tmp/marque-113-wasm-node/marque_wasm.js`). Inputs are fictional synthetic marking text. `rust-ordinary-restricted-owner-unresolved.fixture` exercises a foreign Restricted candidate with an unresolved owner and C22 implied-USA audience evidence. The public projection contains only typed evidence and byte spans; it contains neither raw `GBR` nor `XYZK` source bytes. `rust-ordinary-partial-foreign-projection.fixture` comes from a 1,501-candidate input whose bounded projection stopped at the work limit; it records zero candidate rows emitted and a `projection_cutoff` for `work`. These are Rust-produced projections, not hand-authored expectations.

`rust-ordinary-audience-variants.fixture` is the exact document record from the Node WASM build of Marque commit `38e3ef83f1955f25430c05dbfb5eaee2b5ec2de2`, using `(S)\n(S//REL TO USA, GBR, FVEY//DISPLAY ONLY CAN)\n(S//REL TO USA, XYZ)\n` as fictional input. Its SHA-256 is `e210185d2f7589b4672f920489ee25f32adacd1789e4793d181a4552394dc1d3`. The matched CLI `check --format json -` emitted identical audience evidence. The example preserves the distinction between an examined-empty foreign receive set, an unknown member, individual countries, and a group; their claim support and occurrence bindings remain separate.
