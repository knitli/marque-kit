<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# Releasing

Every package under `packages/` is published to npm on its own semver line: `@knitli/marque-kit-core`, `@knitli/marque-kit`, `@knitli/marque-kit-web`, `@knitli/marque-kit-word` and `@knitli/marque-kit-outlook`. [release-please](https://github.com/googleapis/release-please) decides each version and writes each package's `CHANGELOG.md` from the commits on `main`. [.github/workflows/publish.yml](.github/workflows/publish.yml) runs it and publishes with npm trusted publishing and Sigstore provenance, attests the tarballs, Sigstore-signs the checksums, and attaches them to each package's GitHub release. `apps/office-addin` is private and never published.

## Commits decide versions

Commits on `main` (for a squash merge, the PR title) follow [Conventional Commits](https://www.conventionalcommits.org/). A commit counts toward every package whose directory it touches, whatever its scope says; the scope is for people reading the changelog.

| Commit | Bump while `0.x` | Bump from `1.0` | In the changelog |
|---|---|---|---|
| `fix:` | patch | patch | Bug Fixes |
| `feat:` | minor | minor | Features |
| `feat!:` or a `BREAKING CHANGE:` footer | minor | major | Breaking Changes |
| `perf:`, `revert:` | patch | patch | their own section |
| `docs:`, `chore:`, `ci:`, `test:`, `refactor:`, `style:`, `build:` | none | none | not listed |

A commit that doesn't parse is skipped. To force a version, put `Release-As: 1.0.0` in a commit body that touches the package.

The packages are configured in [release-please-config.json](release-please-config.json) (path → component, which names the tag); [.release-please-manifest.json](.release-please-manifest.json) holds each package's last released version. Release-please updates both; don't edit the manifest by hand except to repair it.

## Cutting a release

1. Merge work to `main`. Release-please opens, or updates, one PR titled `chore: release main` that bumps each affected `package.json` and `CHANGELOG.md`. Read the changelogs there; edit the PR if a line needs rewording.
2. Merge the release PR. On that push, release-please tags each released package `<component>-v<version>` (for example `core-v0.3.0`, `kit-v0.2.1`) and creates its GitHub release with the changelog as notes.
3. The same run checks, tests, builds, and packs only the released packages, then waits on the `npm-publish` environment. Approve it.
4. Each tarball is published to npm, and the tarball, `SHA256SUMS` and `SHA256SUMS.sigstore.json` are attached to its release.
5. Verify afterwards:

   ```sh
   npm view @knitli/marque-kit@<version> dist.attestations  # provenance present
   gh attestation verify knitli-marque-kit-<version>.tgz --repo knitli/marque-kit
   cosign verify-blob --bundle SHA256SUMS.sigstore.json \
     --certificate-identity "https://github.com/knitli/marque-kit/.github/workflows/publish.yml@refs/heads/main" \
     --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
     SHA256SUMS
   ```

The tags and GitHub releases exist before the approval. If the publish is rejected or fails, re-run the failed jobs of that workflow run; don't delete the tags.

A manual run (`workflow_dispatch`) is a dry run of every package: it checks, tests, builds, packs, attests, and runs `publish --dry-run`, but publishes nothing and touches no release.

### Core and the kit

`@knitli/marque-kit` depends on `workspace:^`, which packs as `^<core version>`. While core is `0.x`, a minor bump of core (0.2 → 0.3) falls outside the kit's published range, so the kit needs a release in the same release PR. If no commit since the kit's last release touched `packages/kit`, add one before merging the release PR, such as a `fix(kit):` commit that requires the new core range.

## One-time setup (manual; CI cannot do these)

1. **Trusted publishing on npmjs.com** for each package (package → Settings → Trusted publishing): GitHub owner `knitli`, repository `marque-kit`, workflow filename `publish.yml`, environment `npm-publish`. Remove any bootstrap token.
2. **The `npm-publish` GitHub environment** (repo → Settings → Environments) with required reviewers. Its deployment branches must allow `main`: publishing now runs on the push that merges the release PR, not on a tag.
3. **Let Actions open PRs**: repo → Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests". Release-please needs it.
4. Confirm there is **no `NPM_TOKEN` secret**. Trusted publishing exchanges the job's OIDC token (`id-token: write`); a static token defeats the point.

The release PR is opened with `GITHUB_TOKEN`, so CI does not run on it by itself. The publish run checks, tests and builds again before anything is published. To get CI on the release PR, give release-please a GitHub App token instead.

## Adding a package

Give it a build and a `dist/` in `files`, add its path and component to `release-please-config.json` and its current version to `.release-please-manifest.json`, bootstrap it on npm once, and configure its trusted publisher. Pack with pnpm, never `npm pack`: pnpm normalizes `workspace:` ranges, and the attested tarball must be the published one.
