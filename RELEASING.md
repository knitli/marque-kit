<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# Releasing

Packages publish from [.github/workflows/publish.yml](.github/workflows/publish.yml): a version tag publishes to npm with trusted publishing and Sigstore provenance, attests the tarballs, Sigstore-signs the release checksums, and creates the GitHub release. Currently publishing: `@knitli/marque-kit-core` and `@knitli/marque-kit`, versioned in lockstep. The web, Word, and Outlook adapters are placeholders with no build; they are not published yet.

## One-time setup (manual; CI cannot do these)

1. **Make this repository public.** npm provenance and GitHub attestations link to the source commit and require a public repo and public packages.
2. **Bootstrap the packages.** Trusted publishing can only be configured for a package that already exists on npm. Publish `0.1.0` once by hand (`pnpm --filter @knitli/marque-kit-core publish --access public`, then the same for `@knitli/marque-kit`), or with a short-lived granular npm token. Never commit a token.
3. **Configure trusted publishing on npmjs.com** for each package (package → Settings → Trusted publishing): GitHub owner `knitli`, repository `marque-kit`, workflow filename `publish.yml`, environment `npm-publish`. After this, npm accepts publishes only from that workflow — remove any bootstrap token.
4. **Create the `npm-publish` GitHub environment** (repo → Settings → Environments) with required reviewers. That approval is the human gate: the publish job cannot run without it. Restrict deployment to version tags if desired.
5. Confirm there is **no `NPM_TOKEN` secret**. Trusted publishing exchanges the job's OIDC token (`id-token: write`); a static token defeats the point.

## Cutting a release

1. Bump `version` in `packages/core/package.json` and `packages/kit/package.json` to the same value; run `pnpm check`, `pnpm test`, `pnpm build`.
2. Tag `v<version>` (for example `v0.1.0`) and push the tag.
3. Approve the `npm-publish` environment deployment when GitHub asks.
4. Verify afterwards:

   ```sh
   npm view @knitli/marque-kit@<version> dist.attestations  # provenance present
   gh attestation verify knitli-marque-kit-<version>.tgz --repo knitli/marque-kit
   cosign verify-blob --bundle SHA256SUMS.sigstore.json \
     --certificate-identity "https://github.com/knitli/marque-kit/.github/workflows/publish.yml@refs/tags/v<version>" \
     --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
     SHA256SUMS
   ```

A manual run (`workflow_dispatch`) defaults to a dry run: it checks, tests, builds, packs, and attests, but publishes nothing and creates no release.

## When an adapter becomes publishable

Give it a build, a `dist/` in `files`, and a real version, then add its `pnpm --filter … pack` line and its `pnpm publish release-assets/…tgz` line to `publish.yml` (pack with pnpm, never `npm pack` — pnpm normalizes `workspace:*`, and the attested tarball must be the published one), bootstrap it once, and configure its trusted publisher on npmjs.com.
