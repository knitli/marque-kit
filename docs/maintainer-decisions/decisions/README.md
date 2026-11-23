<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# Binding maintainer decisions

The TOML files in this directory are the kit's binding maintainer decisions. They cover product and design choices that apply to this repo only: the rungs, the shapes and colors, the prompt, state and undo, theming, packaging, licensing. Engine behavior is decided in the Marque engine project, not here. Records here do not cite that project.

`MD-0001` to `MD-0026` were first kept as a table in `docs/DECISIONS.md`, from 13 Oct to 9 Nov 2026. Each record's evidence names the commit that added its row. The owner confirmed the list on 23 Nov 2026 and they were moved here. Source comments and tests cite them by ID.

## Before you change code

Look up the decisions that apply to the paths you will touch:

```bash
python3 tools/decision-lint/decision-lint.py applicable --paths packages/kit/src/render.ts
python3 tools/decision-lint/decision-lint.py search "free answer"
```

Read every returned record, including `applies_when` and `excludes`. If the requested work conflicts with an active record, stop and get a new ruling from the maintainer. Code, issues and agent recommendations cannot resolve the conflict.

## The PR impact block

Every PR body carries exactly one fenced TOML block. `changed` prints it for a branch:

```bash
python3 tools/decision-lint/decision-lint.py changed --pr 1234
python3 tools/decision-lint/decision-lint.py changed --base origin/main --head HEAD
```

```toml
[maintainer_decision_impact]
status = "complies"
decisions = ["MD-0011"]
supersedes = []
reason = ""
```

The `Maintainer decisions` workflow checks it with `check-pr` and fails closed. `none` needs empty ID arrays and a reason recording the lookup. `supersedes` passes only when the new record and both lifecycle links are in the same change. `ruling_required` blocks the merge. PRs opened by `dependabot[bot]`, `github-actions[bot]` and `release-please[bot]` are exempt.

## Recording and lifecycle

One `MD-NNNN.toml` file per ruling. Don't rewrite an earlier decision to make a later one look timeless. A changed decision gets a new ID and names the old record in `lifecycle.supersedes`; the old record becomes `superseded`, with the reverse `superseded_by` link. A correction that only repairs transcription keeps its evidence and says what changed.

The maintainer adds or approves records. An agent may draft one but may not adopt it as maintainer authority.

After any registry edit, run:

```bash
python3 tools/decision-lint/decision-lint.py index
python3 tools/decision-lint/decision-lint.py lint
python3 -m unittest discover -s tools/decision-lint/tests -p 'test_*.py'
```

[`decision-index.md`](../decision-index.md) is generated for browsing; the TOML records are authoritative. [`capco-facts.md`](../capco-facts.md) lists the manual passages the memo and examples rely on; it is reference, not a decision.
