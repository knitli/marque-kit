<!--
SPDX-FileCopyrightText: 2026 Knitli Inc.

SPDX-License-Identifier: AGPL-3.0-only
-->

# decision-lint

`decision-lint` is the dependency-free lookup and deterministic enforcement
tool for the kit's binding maintainer-decision registry (`docs/maintainer-decisions/`). It requires Python 3.11
or newer for the standard-library `tomllib` module.

```bash
python3 tools/decision-lint/decision-lint.py search "free answer"
python3 tools/decision-lint/decision-lint.py applicable --paths packages/kit/src/render.ts
python3 tools/decision-lint/decision-lint.py changed --base origin/main --head HEAD
python3 tools/decision-lint/decision-lint.py lint
python3 -m unittest discover -s tools/decision-lint/tests -p 'test_*.py'
```

`lint` validates the closed record schema, evidence locators, ID and filename
agreement, lifecycle graph, overdue reviews, relative decision-document links,
and the generated index. Run `index` after adding or changing a record.

`applicable` conservatively unions path, area, and rule-ID matches. A supplied
profile filters that candidate set. The returned `applies_when` and `excludes`
text is still a semantic condition for the author and reviewer; a glob is only
a lookup aid.

`changed` derives path candidates from a Git diff and
prints the structured PR impact block. CI uses `check-pr` to parse exactly one
such block from the PR body and fails closed on missing or unknown fields,
inactive authority, unacknowledged applicable decisions, invalid supersession,
or `ruling_required`.

The tool also extracts engine wire rule IDs (`capco:…`, `engine:…`) from a diff, for
records that name one in `scope.rule_ids`. No kit record does today; path
selectors do the matching here.
