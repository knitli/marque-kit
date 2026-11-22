<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.
SPDX-License-Identifier: AGPL-3.0-only
-->

# Source marking fixtures

These fictional JSON payloads are Knitli test fixtures, with synthetic document and viewer identifiers. The kit copies are byte-identical to the matching fixtures in `packages/core/test/fixtures/`: `native-source-marking.fixture` corresponds to `native-source-marking-v2.fixture`, and `native-source-marking-synthetic-v1.fixture` has the same name in both directories. Their license is recorded in `REUSE.toml`.

The v2 fixture is the exact output of `replacement/native-wire/examples/source_marking_harness.rs` at native commit `b723549c3e512fd127f0934a921f9c11cb9749b2`, replaying the reviewed fictional `producer-input.json`; its SHA-256 is `5af1592d87637129fceeef6ca9fc21f644eb030c7f41fef16fe407626af33ea2`. The harness uses a synthetic authorization callback, not a real provider. The built-pane browser test feeds these exact fixture bytes to a synthetic Office provider. The v1 payload exercises rejection on the live path; it is not an authorized provider response.
