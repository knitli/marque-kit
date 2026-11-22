<!-- SPDX-FileCopyrightText: 2026 Knitli Inc. -->
<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# Ordinary CAB preview qualification

The optional synthetic Word host grants the existing questions operation separately
from preview. Preview requires an independently obtained current source examination,
an opaque accepted answer group, authorization for the entire raw request and
response, independently qualified expected receipt and answer-group fingerprint,
and a per-viewer list of displayable fields. The workspace checks these expected
commitments against both responses, including when an executor returns a cached
response for the same source but a different answer group. The host must invalidate
before changes to the document, layout, viewer, grant, provider or answers. Opaque
references must distinguish changed values, or the host must revoke and reissue
on every change. No live Word provider is established by these tests.

The receipt and preview fingerprint are unkeyed commitments. They can confirm
guesses about low-entropy source or answer references, so their recipient must
be authorized for those inputs. They provide neither authentication nor secrecy;
the workspace never displays them or opaque references.

The user can request a preview after current questions are shown. A projected
present field represents only the missing-field/presence disposition; neither
answer text nor authority is validated, and no write or readiness is established.
The original current questions remain visible alongside the hypothetical result.

The DOM suite uses synthetic host/provider framing and exercises authorization,
revocation and asynchronous races. Its optional actual-product test uses the
source-examination capable WASM build supplied through `MARQUE_163_WASM`.
Run from `packages/kit` with Node 26 and the installed workspace dependencies:

```sh
vp test test/dom/ordinary-cab-preview-adversarial.test.ts
```

Exact artifact hashes and final real-product results are recorded after the
reviewed engine artifact is available. Local `node_modules` symlinks are not
part of this change.

The scoped development run used these local inputs:

- Preview: `/private/tmp/marque-162-scoped-product/wasm/marque_wasm.js`, entry SHA-256 `e6ffaacb4f348a1d187afb276672f1d31554cb9388103054fdfbb31e0844cc0a`, binary SHA-256 `0e147e73067d2f73d49c0103c9733f56f879c32bff2f317eba5e2a147f6974d6`. A clean temporary copy with `type: commonjs` was supplied as `MARQUE_163_WASM`.
- The selected-audience and questions inputs, hashes, registry and bounded full-suite runner are recorded in [the prior verification](../ordinary-cab-161/VERIFY.md).
- The existing historical selected-audience artifact mismatch was separately checked using that runbook's mismatch mode.

On this source, the three-product full suite passed 50 Node tests and 238 DOM
tests with one historical mismatch test skipped in the full run; that mismatch
control passed separately. The preview suite passed 30 tests with the scoped
preview artifact. Core and kit `vp pack` and Office `vp build` passed. These
results do not qualify a live Office host or the final reviewed engine artifact.

The frozen engine product at commit `b70da29df51b0f3d41cb0e99bb6d2f2ea930c55e`
was then replayed using `/private/tmp/marque-162-reviewed-product/wasm/marque_wasm.js`:
entry SHA-256 `e6ffaacb4f348a1d187afb276672f1d31554cb9388103054fdfbb31e0844cc0a`,
binary SHA-256 `4fce456eb5744de3c46a2cc74462fdce01317066f008b595e16b6ea20e67bf26`.
With the other inputs above unchanged, the full suite again passed 50 Node and
238 DOM tests, with the historical mismatch separately passed. The focused
preview suite passed 30/30. The Node package was copied to a clean temporary
directory with a CommonJS manifest; its hashes were checked before and after.
The full suite used the prior bounded runner with `MARQUE_163_WASM` set to that
copy, and the focused command above used the same environment variable.

After the hosted analysis cleanup, the frozen-product focused suite again passed
30/30, the three-product full suite again passed 50 Node and 238 DOM tests with
the same intentional mismatch skip, and all three package builds passed. The
cleanup retains exact commitment validation and the same host currentness checks.
