# SPDX-FileCopyrightText: 2026 Knitli Inc.
#
# SPDX-License-Identifier: AGPL-3.0-only
"""Validate, search, and enforce the kit's maintainer-decision registry.

The registry is deliberately stdlib-only and closed-schema.  A repository
artifact is binding only when it is represented by one of the validated TOML
records under docs/maintainer-decisions/decisions.
"""

from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import json
import re
import subprocess
import sys
import tomllib
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence

REPO = Path(__file__).resolve().parents[2]
REGISTRY = REPO / "docs/maintainer-decisions/decisions"
INDEX = REPO / "docs/maintainer-decisions/decision-index.md"
DOCS = REPO / "docs/maintainer-decisions"

TOP_KEYS = {
    "schema",
    "id",
    "title",
    "status",
    "decided_at",
    "recorded_at",
    "authority",
    "decision",
    "rationale",
    "rejected",
    "examples",
    "scope",
    "evidence",
    "lifecycle",
    "enforcement",
}
SCOPE_KEYS = {
    "areas",
    "paths",
    "rule_ids",
    "profiles",
    "applies_when",
    "excludes",
}
EVIDENCE_KEYS = {
    "kind",
    "url",
    "author",
    "evidence_id",
    "path",
    "commit",
    "note",
}
LIFECYCLE_KEYS = {"supersedes", "superseded_by", "review_by"}
ENFORCEMENT_KEYS = {"mode", "guards"}
STATUSES = {"active", "superseded", "withdrawn", "deferred", "one_off"}
AUTHORITIES = {"direct", "attributed_confirmed"}
MODES = {"semantic", "structural", "test", "ci", "documentation"}
IMPACT_KEYS = {"status", "decisions", "supersedes", "reason"}
IMPACT_STATUSES = {"none", "complies", "supersedes", "ruling_required"}
ID_RE = re.compile(r"MD-\d{4}")
RULE_ID_RE = re.compile(r"\b(?:capco|engine|test):[a-z0-9][a-z0-9.-]*\b")
RULE_ID_CALL_RE = re.compile(
    r'RuleId::new\(\s*"(?P<scheme>capco|engine|test)"\s*,\s*'
    r'"(?P<predicate>[a-z0-9][a-z0-9.-]*)"\s*,?\s*\)',
    re.DOTALL,
)
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
FENCE_RE = re.compile(r"```toml\s*\n(.*?)```", re.DOTALL | re.IGNORECASE)


@dataclass(frozen=True)
class Decision:
    path: Path
    data: dict[str, Any]

    @property
    def id(self) -> str:
        return self.data["id"]

    @property
    def active(self) -> bool:
        return self.data["status"] in {"active", "deferred", "one_off"}


class DecisionError(ValueError):
    """A fail-closed registry or impact-contract error."""


def _closed_table(
    value: Any, expected: set[str], where: str, errors: list[str]
) -> dict[str, Any]:
    if not isinstance(value, dict):
        errors.append(f"{where}: must be a table")
        return {}
    missing = expected - value.keys()
    unknown = value.keys() - expected
    if missing:
        errors.append(f"{where}: missing keys: {', '.join(sorted(missing))}")
    if unknown:
        errors.append(f"{where}: unknown keys: {', '.join(sorted(unknown))}")
    return value


def _string(value: Any, where: str, errors: list[str], *, nonempty: bool = False) -> None:
    if not isinstance(value, str) or (nonempty and not value.strip()):
        qualifier = " nonempty" if nonempty else ""
        errors.append(f"{where}: must be a{qualifier} string")


def _strings(value: Any, where: str, errors: list[str]) -> None:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        errors.append(f"{where}: must be an array of strings")
    elif len(value) != len(set(value)):
        errors.append(f"{where}: duplicate values are not allowed")


def validate_record(record: Decision) -> list[str]:
    data = record.data
    errors: list[str] = []
    if not isinstance(data, dict):
        return [f"{record.path}: TOML root must be a table"]
    _closed_table(data, TOP_KEYS, str(record.path), errors)

    if data.get("schema") != 1:
        errors.append(f"{record.path}: schema must be 1")
    decision_id = data.get("id")
    if not isinstance(decision_id, str) or ID_RE.fullmatch(decision_id) is None:
        errors.append(f"{record.path}: id must match MD-NNNN")
    elif record.path.name != f"{decision_id}.toml":
        errors.append(f"{record.path}: filename must be {decision_id}.toml")
    _string(data.get("title"), f"{record.path}: title", errors, nonempty=True)
    if data.get("status") not in STATUSES:
        errors.append(f"{record.path}: invalid status {data.get('status')!r}")
    decided_at = data.get("decided_at")
    recorded_at = data.get("recorded_at")
    if type(decided_at) is not dt.date:
        errors.append(f"{record.path}: decided_at must be a TOML local date")
    if type(recorded_at) is not dt.date:
        errors.append(f"{record.path}: recorded_at must be a TOML local date")
    elif type(decided_at) is dt.date and recorded_at < decided_at:
        errors.append(f"{record.path}: recorded_at cannot precede decided_at")
    if data.get("authority") not in AUTHORITIES:
        errors.append(f"{record.path}: invalid authority {data.get('authority')!r}")
    _string(data.get("decision"), f"{record.path}: decision", errors, nonempty=True)
    _string(data.get("rationale"), f"{record.path}: rationale", errors)
    _strings(data.get("rejected"), f"{record.path}: rejected", errors)
    _strings(data.get("examples"), f"{record.path}: examples", errors)

    scope = _closed_table(data.get("scope"), SCOPE_KEYS, f"{record.path}: scope", errors)
    for key in ("areas", "paths", "rule_ids", "profiles", "excludes"):
        _strings(scope.get(key), f"{record.path}: scope.{key}", errors)
    _string(scope.get("applies_when"), f"{record.path}: scope.applies_when", errors)
    if not any(scope.get(key) for key in ("areas", "paths", "rule_ids")):
        errors.append(f"{record.path}: scope needs an area, path, or rule ID selector")
    if not scope.get("profiles"):
        errors.append(f"{record.path}: scope.profiles must not be empty")
    for selector in scope.get("paths", []):
        if selector.startswith("/") or ".." in Path(selector).parts:
            errors.append(f"{record.path}: path selector must be repository-relative: {selector}")
    for rule_id in scope.get("rule_ids", []):
        if RULE_ID_RE.fullmatch(rule_id) is None:
            errors.append(f"{record.path}: invalid wire rule ID selector {rule_id!r}")

    evidence = data.get("evidence")
    if not isinstance(evidence, list) or not evidence:
        errors.append(f"{record.path}: at least one evidence table is required")
    else:
        for index, item in enumerate(evidence):
            where = f"{record.path}: evidence[{index}]"
            if not isinstance(item, dict):
                errors.append(f"{where}: must be a table")
                continue
            table = item
            unknown = set(table) - EVIDENCE_KEYS
            if unknown:
                errors.append(f"{where}: unknown keys: {', '.join(sorted(unknown))}")
            _string(table.get("kind"), f"{where}.kind", errors, nonempty=True)
            external = bool(table.get("url") and table.get("evidence_id"))
            repository = bool(table.get("path") and table.get("commit"))
            if not (external or repository):
                errors.append(
                    f"{where}: needs url + evidence_id or repository path + commit"
                )
            for key, value in table.items():
                if key != "kind":
                    _string(value, f"{where}.{key}", errors, nonempty=True)
            if repository:
                if re.fullmatch(r"[0-9a-f]{40}", table["commit"]) is None:
                    errors.append(f"{where}: commit must be a full lowercase Git SHA")

    lifecycle = _closed_table(
        data.get("lifecycle"), LIFECYCLE_KEYS, f"{record.path}: lifecycle", errors
    )
    _strings(lifecycle.get("supersedes"), f"{record.path}: lifecycle.supersedes", errors)
    _strings(
        lifecycle.get("superseded_by"), f"{record.path}: lifecycle.superseded_by", errors
    )
    review_by = lifecycle.get("review_by")
    if not isinstance(review_by, str) and type(review_by) is not dt.date:
        errors.append(f"{record.path}: lifecycle.review_by must be an empty string or date")
    elif isinstance(review_by, str) and review_by:
        errors.append(f"{record.path}: lifecycle.review_by string must be empty; use a TOML date")

    enforcement = _closed_table(
        data.get("enforcement"), ENFORCEMENT_KEYS, f"{record.path}: enforcement", errors
    )
    if enforcement.get("mode") not in MODES:
        errors.append(f"{record.path}: invalid enforcement mode {enforcement.get('mode')!r}")
    _strings(enforcement.get("guards"), f"{record.path}: enforcement.guards", errors)
    return errors


def load_registry(registry: Path = REGISTRY) -> list[Decision]:
    if not registry.is_dir():
        raise DecisionError(f"registry directory does not exist: {registry}")
    records: list[Decision] = []
    errors: list[str] = []
    for path in sorted(registry.glob("*.toml")):
        try:
            with path.open("rb") as handle:
                data = tomllib.load(handle)
        except (OSError, tomllib.TOMLDecodeError) as error:
            errors.append(f"{path}: {error}")
            continue
        record = Decision(path, data)
        errors.extend(validate_record(record))
        records.append(record)
    if not records:
        errors.append(f"{registry}: registry contains no decision records")
    ids = [record.data.get("id") for record in records if isinstance(record.data.get("id"), str)]
    duplicates = [item for item, count in Counter(ids).items() if count > 1]
    if duplicates:
        errors.append(f"duplicate decision IDs: {', '.join(sorted(duplicates))}")
    if errors:
        raise DecisionError("\n".join(errors))
    return records


def validate_lifecycle(records: Sequence[Decision], *, today: dt.date | None = None) -> None:
    by_id = {record.id: record for record in records}
    errors: list[str] = []
    today = today or dt.date.today()
    for record in records:
        lifecycle = record.data["lifecycle"]
        supersedes = lifecycle["supersedes"]
        superseded_by = lifecycle["superseded_by"]
        if record.data["status"] == "superseded" and not superseded_by:
            errors.append(f"{record.id}: superseded status requires lifecycle.superseded_by")
        if record.data["status"] != "superseded" and superseded_by:
            errors.append(f"{record.id}: only superseded records may name superseded_by")
        for old_id in supersedes:
            old = by_id.get(old_id)
            if old is None:
                errors.append(f"{record.id}: supersedes unknown decision {old_id}")
            elif record.id not in old.data["lifecycle"]["superseded_by"]:
                errors.append(f"{record.id}: {old_id} does not point back through superseded_by")
            elif record.data["decided_at"] < old.data["decided_at"]:
                errors.append(f"{record.id}: cannot supersede later decision {old_id}")
        for new_id in superseded_by:
            new = by_id.get(new_id)
            if new is None:
                errors.append(f"{record.id}: superseded_by names unknown decision {new_id}")
            elif record.id not in new.data["lifecycle"]["supersedes"]:
                errors.append(f"{record.id}: {new_id} does not point back through supersedes")
        review_by = lifecycle["review_by"]
        if isinstance(review_by, dt.date) and review_by < today and record.active:
            errors.append(f"{record.id}: review_by {review_by.isoformat()} is overdue")

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(decision_id: str, trail: list[str]) -> None:
        if decision_id in visiting:
            cycle = trail[trail.index(decision_id) :] + [decision_id]
            errors.append(f"lifecycle supersession cycle: {' -> '.join(cycle)}")
            return
        if decision_id in visited:
            return
        visiting.add(decision_id)
        trail.append(decision_id)
        for old_id in by_id[decision_id].data["lifecycle"]["supersedes"]:
            if old_id in by_id:
                visit(old_id, trail)
        trail.pop()
        visiting.remove(decision_id)
        visited.add(decision_id)

    for decision_id in sorted(by_id):
        visit(decision_id, [])
    if errors:
        raise DecisionError("\n".join(errors))


def validate_repository_evidence(records: Sequence[Decision]) -> None:
    errors: list[str] = []
    checked: set[tuple[str, str]] = set()
    for record in records:
        for evidence in record.data["evidence"]:
            if not (evidence.get("path") and evidence.get("commit")):
                continue
            locator = (evidence["commit"], evidence["path"])
            if locator in checked:
                continue
            checked.add(locator)
            result = subprocess.run(
                ["git", "cat-file", "-e", f"{locator[0]}:{locator[1]}"],
                cwd=REPO,
                text=True,
                capture_output=True,
                check=False,
            )
            if result.returncode:
                errors.append(
                    f"{record.id}: repository evidence does not exist at "
                    f"{locator[0]}:{locator[1]}"
                )
    if errors:
        raise DecisionError("\n".join(errors))


def _slug(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^\w\- ]", "", text)
    return text.replace(" ", "-")


def validate_markdown_links(root: Path = DOCS) -> None:
    errors: list[str] = []
    for source in sorted(root.rglob("*.md")):
        for raw_target in LINK_RE.findall(source.read_text(encoding="utf-8")):
            target = raw_target.strip().strip("<>")
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target_path, _, anchor = target.partition("#")
            resolved = (source.parent / target_path).resolve()
            if not resolved.exists():
                errors.append(f"{source.relative_to(REPO)}: missing link target {target_path}")
                continue
            if anchor and resolved.suffix.lower() == ".md":
                if re.fullmatch(r"L\d+(?:-L\d+)?", anchor):
                    continue
                headings = {
                    _slug(match.group(1))
                    for match in re.finditer(
                        r"^#{1,6}\s+(.+?)\s*$", resolved.read_text(encoding="utf-8"), re.MULTILINE
                    )
                }
                if anchor.lower() not in headings:
                    errors.append(
                        f"{source.relative_to(REPO)}: missing heading anchor #{anchor} in "
                        f"{resolved.relative_to(REPO)}"
                    )
    if errors:
        raise DecisionError("\n".join(errors))


def render_index(records: Sequence[Decision]) -> str:
    counts = Counter(record.data["status"] for record in records)
    lines = [
        "<!--",
        "SPDX-FileCopyrightText: 2026 Knitli Inc.",
        "SPDX-License-" + "Identifier: AGPL-3.0-only",
        "",
        "Generated by tools/decision-lint/decision-lint.py index. Do not edit.",
        "-->",
        "",
        "# Maintainer decision index",
        "",
        f"Registry: **{len(records)} decisions** — "
        + ", ".join(f"{status}: {counts[status]}" for status in sorted(counts))
        + ".",
        "",
        "| ID | Status | Decision | Areas |",
        "|---|---|---|---|",
    ]
    for record in sorted(records, key=lambda item: item.id):
        data = record.data
        link = f"decisions/{record.path.name}"
        areas = ", ".join(f"`{area}`" for area in data["scope"]["areas"]) or "—"
        lines.append(f"| [{record.id}]({link}) | {data['status']} | {data['title']} | {areas} |")
    lines.extend(["", "This file is a generated view. The TOML records are authoritative.", ""])
    return "\n".join(lines)


def lint_registry(*, check_index: bool = True) -> list[Decision]:
    records = load_registry()
    validate_lifecycle(records)
    validate_repository_evidence(records)
    validate_markdown_links()
    if check_index:
        expected = render_index(records)
        actual = INDEX.read_text(encoding="utf-8") if INDEX.exists() else ""
        if actual != expected:
            raise DecisionError(
                f"{INDEX.relative_to(REPO)} is stale; run "
                "python3 tools/decision-lint/decision-lint.py index"
            )
    return records


def applicable(
    records: Sequence[Decision],
    *,
    paths: Sequence[str] = (),
    areas: Sequence[str] = (),
    rule_ids: Sequence[str] = (),
    profiles: Sequence[str] = (),
    active_only: bool = True,
) -> list[Decision]:
    selected: list[Decision] = []
    for record in records:
        if active_only and not record.active:
            continue
        scope = record.data["scope"]
        profile_match = not profiles or "all" in scope["profiles"] or bool(
            set(profiles) & set(scope["profiles"])
        )
        if not profile_match:
            continue
        path_match = any(
            fnmatch.fnmatchcase(path, selector)
            for path in paths
            for selector in scope["paths"]
        )
        area_match = bool(set(areas) & set(scope["areas"]))
        rule_match = bool(set(rule_ids) & set(scope["rule_ids"]))
        if path_match or area_match or rule_match:
            selected.append(record)
    return sorted(selected, key=lambda item: item.id)


def git_changed(base: str, head: str) -> tuple[list[str], list[str]]:
    names = subprocess.run(
        ["git", "diff", "--name-only", base, head],
        cwd=REPO,
        text=True,
        capture_output=True,
        check=False,
    )
    if names.returncode:
        raise DecisionError(f"git diff --name-only failed: {names.stderr.strip()}")
    patch = subprocess.run(
        ["git", "diff", "--unified=0", base, head],
        cwd=REPO,
        text=True,
        capture_output=True,
        check=False,
    )
    if patch.returncode:
        raise DecisionError(f"git diff failed: {patch.stderr.strip()}")
    paths = [line for line in names.stdout.splitlines() if line]
    rule_ids = extract_rule_ids(patch.stdout)
    return paths, rule_ids


def resolve_pr_refs(pr_number: int) -> tuple[str, str, str]:
    """Resolve a PR's exact base SHA, head SHA, and current body via `gh`.

    A hand-picked ``--base origin/main`` drifts the moment another PR merges
    after the local fetch — the resulting diff (and so the applicable-decision
    set) silently disagrees with what CI's ``pull_request`` webhook payload
    used, which pins ``base.sha``/``head.sha`` to the exact commits GitHub
    diffed. ``--pr`` reproduces that payload directly instead of reconstructing
    it from a local ref that may be stale, so a local run and CI agree.
    """
    result = subprocess.run(
        ["gh", "pr", "view", str(pr_number), "--json", "baseRefOid,headRefOid,body"],
        cwd=REPO,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise DecisionError(
            f"gh pr view {pr_number} failed (is `gh` installed and authenticated?): "
            f"{result.stderr.strip()}"
        )
    data = json.loads(result.stdout)
    base_sha = data["baseRefOid"]
    head_sha = data["headRefOid"]
    # Ensure both commits exist locally — the caller's worktree may never have
    # fetched this PR's head, or may have fetched main at an older tip than
    # the base GitHub actually diffed against.
    fetch = subprocess.run(
        ["git", "fetch", "origin", "main", f"refs/pull/{pr_number}/head", "--quiet"],
        cwd=REPO,
        text=True,
        capture_output=True,
        check=False,
    )
    if fetch.returncode:
        raise DecisionError(f"git fetch for PR #{pr_number} failed: {fetch.stderr.strip()}")
    return base_sha, head_sha, data.get("body", "")


def extract_rule_ids(patch: str) -> list[str]:
    """Return wire IDs from wire literals and changed RuleId constructor calls."""
    rule_ids = set(RULE_ID_RE.findall(patch))
    changed_source = "\n".join(
        line[1:]
        for line in patch.splitlines()
        if line.startswith(("+", "-")) and not line.startswith(("+++", "---"))
    )
    rule_ids.update(
        f"{match.group('scheme')}:{match.group('predicate')}"
        for match in RULE_ID_CALL_RE.finditer(changed_source)
    )
    return sorted(rule_ids)


def impact_block(
    status: str, decisions: Sequence[str], supersedes: Sequence[str], reason: str
) -> str:
    def array(values: Sequence[str]) -> str:
        return "[" + ", ".join(f'"{value}"' for value in values) + "]"

    return "\n".join(
        [
            "```toml",
            "[maintainer_decision_impact]",
            f'status = "{status}"',
            f"decisions = {array(decisions)}",
            f"supersedes = {array(supersedes)}",
            f'reason = "{reason}"',
            "```",
        ]
    )


def parse_impact(body: str) -> dict[str, Any]:
    candidates = [
        block
        for block in FENCE_RE.findall(body)
        if "[maintainer_decision_impact]" in block
    ]
    if len(candidates) != 1:
        raise DecisionError(
            "PR body must contain exactly one fenced TOML maintainer_decision_impact block"
        )
    try:
        parsed = tomllib.loads(candidates[0])
    except tomllib.TOMLDecodeError as error:
        raise DecisionError(f"maintainer decision impact block is invalid TOML: {error}") from error
    if set(parsed) != {"maintainer_decision_impact"}:
        raise DecisionError("impact TOML may contain only [maintainer_decision_impact]")
    impact = parsed["maintainer_decision_impact"]
    if not isinstance(impact, dict):
        raise DecisionError("maintainer_decision_impact must be a TOML table")
    missing = IMPACT_KEYS - impact.keys()
    unknown = impact.keys() - IMPACT_KEYS
    errors: list[str] = []
    if missing:
        errors.append(f"impact block missing keys: {', '.join(sorted(missing))}")
    if unknown:
        errors.append(f"impact block has unknown keys: {', '.join(sorted(unknown))}")
    if impact.get("status") not in IMPACT_STATUSES:
        errors.append(f"invalid impact status {impact.get('status')!r}")
    for key in ("decisions", "supersedes"):
        value = impact.get(key)
        if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
            errors.append(f"impact.{key} must be an array of strings")
        elif len(value) != len(set(value)):
            errors.append(f"impact.{key} contains duplicates")
    if not isinstance(impact.get("reason"), str):
        errors.append("impact.reason must be a string")
    if errors:
        raise DecisionError("\n".join(errors))
    return impact


def validate_impact(
    impact: dict[str, Any], records: Sequence[Decision], candidates: Sequence[Decision]
) -> None:
    by_id = {record.id: record for record in records}
    status = impact["status"]
    decisions = impact["decisions"]
    supersedes = impact["supersedes"]
    reason = impact["reason"].strip()
    errors: list[str] = []
    for decision_id in decisions:
        record = by_id.get(decision_id)
        if record is None:
            errors.append(f"impact names unknown decision {decision_id}")
        elif not record.active:
            errors.append(f"impact uses inactive decision {decision_id} as authority")
    if status == "none":
        if decisions or supersedes:
            errors.append("status none requires empty decisions and supersedes arrays")
        if not reason:
            errors.append("status none requires a reason describing the completed lookup")
        if candidates:
            errors.append(
                "status none is invalid because selectors match: "
                + ", ".join(record.id for record in candidates)
            )
    elif status == "complies":
        if supersedes:
            errors.append("status complies requires an empty supersedes array")
        if not decisions:
            errors.append("status complies requires at least one acknowledged decision")
        missing = {record.id for record in candidates} - set(decisions)
        if missing:
            errors.append(f"unacknowledged applicable decisions: {', '.join(sorted(missing))}")
    elif status == "supersedes":
        if not decisions or not supersedes:
            errors.append("status supersedes requires both decisions and supersedes IDs")
        for old_id in supersedes:
            old = by_id.get(old_id)
            if old is None:
                errors.append(f"supersedes names unknown decision {old_id}")
                continue
            linked = any(
                old_id in by_id[new_id].data["lifecycle"]["supersedes"]
                for new_id in decisions
                if new_id in by_id
            )
            if not linked:
                errors.append(f"no decision in decisions supersedes {old_id}")
        missing = {record.id for record in candidates} - set(decisions)
        if missing:
            errors.append(f"unacknowledged applicable decisions: {', '.join(sorted(missing))}")
    elif status == "ruling_required":
        if supersedes:
            errors.append("status ruling_required requires an empty supersedes array")
        if not decisions:
            errors.append("status ruling_required requires at least one possible conflict")
        if not reason:
            errors.append("status ruling_required requires the unresolved question in reason")
        missing = {record.id for record in candidates} - set(decisions)
        if missing:
            errors.append(f"unacknowledged possible conflicts: {', '.join(sorted(missing))}")
        errors.append("a maintainer ruling is required before this PR can merge")
    if errors:
        raise DecisionError("\n".join(errors))


def print_records(records: Iterable[Decision]) -> None:
    records = list(records)
    if not records:
        print("No matching maintainer decisions.")
        return
    for record in records:
        data = record.data
        print(f"{record.id} [{data['status']}] {data['title']}")
        print(f"  {data['decision'].strip()}")
        scope = data["scope"]
        if scope["applies_when"]:
            print(f"  Applies when: {scope['applies_when']}")
        if scope["excludes"]:
            print(f"  Excludes: {'; '.join(scope['excludes'])}")
        print(f"  Record: {record.path.relative_to(REPO)}")


def command_search(args: argparse.Namespace, records: Sequence[Decision]) -> int:
    terms = [term.casefold() for term in args.terms]
    matches: list[Decision] = []
    for record in records:
        data = record.data
        evidence = " ".join(
            " ".join(str(value) for value in item.values())
            for item in data["evidence"]
        )
        haystack = " ".join(
            [
                record.id,
                data["title"],
                data["decision"],
                " ".join(data["rejected"]),
                " ".join(data["scope"]["areas"]),
                " ".join(data["scope"]["paths"]),
                " ".join(data["scope"]["rule_ids"]),
                evidence,
            ]
        ).casefold()
        if all(term in haystack for term in terms):
            matches.append(record)
    print_records(matches)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("lint", help="validate registry, lifecycle, links, and index")
    subparsers.add_parser("index", help="regenerate the Markdown decision index")
    search = subparsers.add_parser("search", help="search binding decision text and metadata")
    search.add_argument("terms", nargs="+", help="terms that must all match")
    applicable_parser = subparsers.add_parser("applicable", help="find active applicable decisions")
    applicable_parser.add_argument("--paths", nargs="*", default=[])
    applicable_parser.add_argument("--areas", nargs="*", default=[])
    applicable_parser.add_argument("--rule-ids", nargs="*", default=[])
    applicable_parser.add_argument("--profiles", nargs="*", default=[])
    changed = subparsers.add_parser("changed", help="derive applicable decisions for a git diff")
    changed.add_argument("--base")
    changed.add_argument("--head")
    changed.add_argument(
        "--pr",
        type=int,
        help="resolve --base/--head from a GitHub PR's exact base/head SHAs via `gh` "
        "(mutually exclusive with --base/--head; avoids drift against a stale local main)",
    )
    check_pr = subparsers.add_parser("check-pr", help="validate a PR impact block against its diff")
    check_pr.add_argument("--base")
    check_pr.add_argument("--head")
    check_pr.add_argument(
        "--pr",
        type=int,
        help="resolve --base/--head (and --body-file, if omitted) from a GitHub PR via `gh`",
    )
    check_pr.add_argument("--body-file", type=Path)
    return parser


def _resolve_refs(args: argparse.Namespace) -> tuple[str, str, str | None]:
    """Resolve (base, head, pr_body) for `changed`/`check-pr` from --pr or --base/--head."""
    if args.pr is not None:
        if args.base or args.head:
            raise DecisionError("--pr is mutually exclusive with --base/--head")
        return resolve_pr_refs(args.pr)
    if not (args.base and args.head):
        raise DecisionError(f"{args.command} requires --base and --head, or --pr")
    return args.base, args.head, None


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "index":
            records = load_registry()
            validate_lifecycle(records)
            INDEX.write_text(render_index(records), encoding="utf-8")
            print(f"decision-lint: wrote {INDEX.relative_to(REPO)}")
            return 0
        records = lint_registry()
        if args.command == "lint":
            print(f"decision-lint: clean — {len(records)} binding decisions")
            return 0
        if args.command == "search":
            return command_search(args, records)
        if args.command == "applicable":
            if not (args.paths or args.areas or args.rule_ids):
                raise DecisionError("applicable requires at least one path, area, or rule ID")
            print_records(
                applicable(
                    records,
                    paths=args.paths,
                    areas=args.areas,
                    rule_ids=args.rule_ids,
                    profiles=args.profiles,
                )
            )
            return 0
        base, head, pr_body = _resolve_refs(args)
        paths, rule_ids = git_changed(base, head)
        candidates = applicable(records, paths=paths, rule_ids=rule_ids)
        if args.command == "changed":
            print_records(candidates)
            if candidates:
                print()
                print(impact_block("complies", [record.id for record in candidates], [], ""))
            else:
                print()
                print(impact_block("none", [], [], "Decision lookup found no matching selectors."))
            return 0
        if args.body_file is not None:
            body = args.body_file.read_text(encoding="utf-8")
        elif pr_body is not None:
            body = pr_body
        else:
            raise DecisionError("check-pr requires --body-file, or --pr to fetch the current PR body")
        impact = parse_impact(body)
        validate_impact(impact, records, candidates)
        print(
            "decision-lint: PR impact clean — acknowledged "
            f"{len(candidates)} applicable decision(s)"
        )
        return 0
    except (DecisionError, OSError) as error:
        print(f"decision-lint: FAIL:\n{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
