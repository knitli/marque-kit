# SPDX-FileCopyrightText: 2026 Knitli Inc.
#
# SPDX-License-Identifier: AGPL-3.0-only

from __future__ import annotations

import argparse
import copy
import datetime as dt
import importlib.util
import json
import subprocess
import sys
import tomllib
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "decision-lint.py"
SPEC = importlib.util.spec_from_file_location("decision_lint", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
decision_lint = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = decision_lint
SPEC.loader.exec_module(decision_lint)


def example_data() -> dict:
    with (HERE / "fixtures/example.toml").open("rb") as handle:
        return tomllib.load(handle)


def record(data: dict | None = None, *, decision_id: str = "MD-0042"):
    value = copy.deepcopy(data or example_data())
    value["id"] = decision_id
    return decision_lint.Decision(Path(f"/tmp/{decision_id}.toml"), value)


class RecordSchemaTests(unittest.TestCase):
    def test_proposal_example_is_valid(self) -> None:
        self.assertEqual(decision_lint.validate_record(record()), [])

    def test_every_required_top_level_field_is_enforced(self) -> None:
        for key in decision_lint.TOP_KEYS:
            with self.subTest(key=key):
                data = example_data()
                del data[key]
                candidate = decision_lint.Decision(Path("/tmp/MD-0042.toml"), data)
                errors = decision_lint.validate_record(candidate)
                self.assertTrue(any("missing keys" in error and key in error for error in errors))

    def test_unknown_table_key_fails_closed(self) -> None:
        value = record()
        value.data["scope"]["guess"] = True
        self.assertTrue(
            any("unknown keys" in error for error in decision_lint.validate_record(value))
        )

    def test_historical_evidence_need_not_exist_in_current_tree(self) -> None:
        value = record()
        value.data["evidence"] = [
            {
                "kind": "repository",
                "path": "docs/a-renamed-historical-record.md",
                "commit": "0" * 40,
                "note": "The path is resolved at its commit, not against the working tree.",
            }
        ]
        self.assertEqual(decision_lint.validate_record(value), [])

    def test_local_datetimes_are_rejected_for_date_fields(self) -> None:
        for field in ("decided_at", "recorded_at"):
            with self.subTest(field=field):
                value = record()
                value.data[field] = dt.datetime(2026, 8, 15, 12, 0)
                errors = decision_lint.validate_record(value)
                self.assertTrue(any(field in error and "local date" in error for error in errors))

        value = record()
        value.data["lifecycle"]["review_by"] = dt.datetime(2026, 8, 15, 12, 0)
        errors = decision_lint.validate_record(value)
        self.assertTrue(any("review_by" in error for error in errors))


class ApplicabilityTests(unittest.TestCase):
    def test_selector_families_form_a_union_and_profile_filters(self) -> None:
        first = record(decision_id="MD-0001")
        second = record(decision_id="MD-0002")
        second.data["scope"]["paths"] = ["apps/office-addin/**"]
        second.data["scope"]["areas"] = ["kit.audit"]
        second.data["scope"]["profiles"] = ["strict"]
        matches = decision_lint.applicable(
            [first, second],
            paths=["packages/kit/src/render.ts"],
            areas=["kit.audit"],
        )
        self.assertEqual([item.id for item in matches], ["MD-0001", "MD-0002"])
        filtered = decision_lint.applicable(
            [first, second],
            areas=["kit.audit"],
            profiles=["baseline"],
        )
        self.assertEqual(filtered, [])

    def test_rule_ids_are_extracted_from_wire_and_constructor_forms(self) -> None:
        patch = """\
diff --git a/example.rs b/example.rs
--- a/example.rs
+++ b/example.rs
@@ -1 +1,4 @@
-let old = \"capco:portion.sci.old-rule\";
+let id = RuleId::new(
+    \"capco\",
+    \"portion.sci.new-rule\",
+);
"""
        self.assertEqual(
            decision_lint.extract_rule_ids(patch),
            ["capco:portion.sci.new-rule", "capco:portion.sci.old-rule"],
        )


class LifecycleTests(unittest.TestCase):
    def test_bidirectional_supersession_is_required(self) -> None:
        old = record(decision_id="MD-0001")
        old.data["status"] = "superseded"
        old.data["lifecycle"]["superseded_by"] = ["MD-0002"]
        new = record(decision_id="MD-0002")
        with self.assertRaisesRegex(decision_lint.DecisionError, "does not point back"):
            decision_lint.validate_lifecycle([old, new])

    def test_supersession_cycles_fail(self) -> None:
        first = record(decision_id="MD-0001")
        second = record(decision_id="MD-0002")
        for candidate in (first, second):
            candidate.data["status"] = "superseded"
        first.data["lifecycle"] = {
            "supersedes": [second.id],
            "superseded_by": [second.id],
            "review_by": "",
        }
        second.data["lifecycle"] = {
            "supersedes": [first.id],
            "superseded_by": [first.id],
            "review_by": "",
        }
        with self.assertRaisesRegex(decision_lint.DecisionError, "supersession cycle"):
            decision_lint.validate_lifecycle([first, second])

    def test_overdue_active_review_fails(self) -> None:
        binding = record()
        binding.data["lifecycle"]["review_by"] = dt.date(2026, 8, 14)
        with self.assertRaisesRegex(decision_lint.DecisionError, "is overdue"):
            decision_lint.validate_lifecycle(
                [binding], today=dt.date(2026, 8, 15)
            )


class ImpactContractTests(unittest.TestCase):
    def parse(self, status: str, decisions=(), supersedes=(), reason=""):
        return decision_lint.parse_impact(
            decision_lint.impact_block(status, decisions, supersedes, reason)
        )

    def test_none_status(self) -> None:
        impact = self.parse("none", reason="No selectors matched.")
        decision_lint.validate_impact(impact, [record()], [])

    def test_complies_status(self) -> None:
        binding = record()
        impact = self.parse("complies", decisions=[binding.id])
        decision_lint.validate_impact(impact, [binding], [binding])

    def test_supersedes_status(self) -> None:
        old = record(decision_id="MD-0001")
        old.data["status"] = "superseded"
        old.data["lifecycle"]["superseded_by"] = ["MD-0002"]
        new = record(decision_id="MD-0002")
        new.data["lifecycle"]["supersedes"] = ["MD-0001"]
        impact = self.parse("supersedes", decisions=[new.id], supersedes=[old.id])
        decision_lint.validate_impact(impact, [old, new], [new])

    def test_ruling_required_blocks_merge(self) -> None:
        binding = record()
        impact = self.parse(
            "ruling_required",
            decisions=[binding.id],
            reason="The requested behavior conflicts with the active ruling.",
        )
        with self.assertRaisesRegex(
            decision_lint.DecisionError, "required before this PR can merge"
        ):
            decision_lint.validate_impact(impact, [binding], [binding])

    def test_duplicate_or_unknown_impact_shape_fails_closed(self) -> None:
        block = decision_lint.impact_block("none", [], [], "No selectors matched.")
        with self.assertRaises(decision_lint.DecisionError):
            decision_lint.parse_impact(block + "\n" + block)
        bad = block.replace(
            'reason = "No selectors matched."',
            'reason = "No selectors matched."\nextra = true',
        )
        with self.assertRaisesRegex(decision_lint.DecisionError, "unknown keys"):
            decision_lint.parse_impact(bad)


class PrRefResolutionTests(unittest.TestCase):
    """`--pr` must resolve the same base/head SHAs CI's webhook payload uses,
    not a hand-picked local ref that can drift after another PR merges."""

    def _completed(self, returncode: int, stdout: str = "", stderr: str = ""):
        return subprocess.CompletedProcess([], returncode, stdout=stdout, stderr=stderr)

    def test_resolve_pr_refs_reads_base_head_body_and_fetches_both_commits(self) -> None:
        gh_stdout = json.dumps(
            {"baseRefOid": "base123", "headRefOid": "head456", "body": "PR body text"}
        )
        calls: list[list[str]] = []

        def fake_run(cmd, **kwargs):
            calls.append(cmd)
            if cmd[:2] == ["gh", "pr"]:
                return self._completed(0, stdout=gh_stdout)
            return self._completed(0)

        with mock.patch.object(decision_lint.subprocess, "run", side_effect=fake_run):
            base, head, body = decision_lint.resolve_pr_refs(1234)

        self.assertEqual((base, head, body), ("base123", "head456", "PR body text"))
        self.assertEqual(calls[0], ["gh", "pr", "view", "1234", "--json", "baseRefOid,headRefOid,body"])
        self.assertEqual(
            calls[1], ["git", "fetch", "origin", "main", "refs/pull/1234/head", "--quiet"]
        )

    def test_resolve_pr_refs_fails_closed_on_gh_error(self) -> None:
        with mock.patch.object(
            decision_lint.subprocess,
            "run",
            return_value=self._completed(1, stderr="not authenticated"),
        ):
            with self.assertRaisesRegex(decision_lint.DecisionError, "gh pr view 1234 failed"):
                decision_lint.resolve_pr_refs(1234)

    def test_resolve_pr_refs_fails_closed_on_fetch_error(self) -> None:
        gh_stdout = json.dumps({"baseRefOid": "b", "headRefOid": "h", "body": ""})

        def fake_run(cmd, **kwargs):
            if cmd[:2] == ["gh", "pr"]:
                return self._completed(0, stdout=gh_stdout)
            return self._completed(1, stderr="could not resolve host")

        with mock.patch.object(decision_lint.subprocess, "run", side_effect=fake_run):
            with self.assertRaisesRegex(decision_lint.DecisionError, "git fetch for PR #1234 failed"):
                decision_lint.resolve_pr_refs(1234)

    def test_resolve_refs_rejects_pr_with_base_or_head(self) -> None:
        args = argparse.Namespace(command="changed", pr=1234, base="x", head=None)
        with self.assertRaisesRegex(decision_lint.DecisionError, "mutually exclusive"):
            decision_lint._resolve_refs(args)

    def test_resolve_refs_requires_pr_or_both_base_and_head(self) -> None:
        args = argparse.Namespace(command="changed", pr=None, base="x", head=None)
        with self.assertRaisesRegex(decision_lint.DecisionError, "requires --base and --head, or --pr"):
            decision_lint._resolve_refs(args)

    def test_resolve_refs_passes_through_explicit_base_and_head(self) -> None:
        args = argparse.Namespace(command="changed", pr=None, base="b", head="h")
        self.assertEqual(decision_lint._resolve_refs(args), ("b", "h", None))


if __name__ == "__main__":
    unittest.main()
