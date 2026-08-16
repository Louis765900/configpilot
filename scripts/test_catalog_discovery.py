#!/usr/bin/env python3
"""Regression tests for bounded, paginated catalog discovery and coverage."""

from __future__ import annotations

import importlib.util
import json
import unittest
import urllib.error
import urllib.parse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("discover_open_catalog", ROOT / "scripts/discover-open-catalog.py")
assert SPEC and SPEC.loader
DISCOVERY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DISCOVERY)


def registry(**policy: int) -> dict:
    return {
        "policy": {
            "minimumDelayMs": 0,
            "userAgent": "ConfigPilot-Test/1.0",
            "wikidataPageSize": 50,
            "wikidataMaxPagesPerQuery": 2,
            "requestBudget": 4,
            "maxLagSeconds": 5,
            "retryAttempts": 1,
            "publishAutomatically": False,
            **policy,
        },
        "sources": [{"id": "wikidata", "url": "https://www.wikidata.org/w/api.php"}],
        "queries": [{"category": "cpu", "brand": "AMD", "query": "AMD Ryzen"}],
    }


class CatalogDiscoveryTests(unittest.TestCase):
    def test_follows_wikidata_search_continuation_within_limits(self) -> None:
        requested: list[dict[str, list[str]]] = []

        def fake_request(url: str, _user_agent: str, attempts: int) -> bytes:
            self.assertEqual(attempts, 1)
            params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
            requested.append(params)
            page = 2 if "continue" in params else 1
            payload = {
                "search": [{
                    "id": f"Q{page}",
                    "label": f"AMD Ryzen {page} 3600",
                    "description": "AMD desktop processor",
                }]
            }
            if page == 1:
                payload["search-continue"] = 50
            return json.dumps(payload).encode()

        candidates, errors, metrics = DISCOVERY.wikidata_candidates(
            registry(), set(), "2026-08-16", requester=fake_request, sleeper=lambda _delay: None
        )

        self.assertEqual(errors, [])
        self.assertEqual(len(candidates), 2)
        self.assertEqual(metrics["pagesRequested"], 2)
        self.assertEqual(metrics["queriesCompleted"], 1)
        self.assertNotIn("continue", requested[0])
        self.assertEqual(requested[1]["continue"], ["50"])
        self.assertEqual(requested[0]["limit"], ["50"])
        self.assertEqual(requested[0]["maxlag"], ["5"])

    def test_stops_at_the_free_request_budget(self) -> None:
        def fake_request(_url: str, _user_agent: str, _attempts: int) -> bytes:
            return json.dumps({"search": [], "search-continue": 50}).encode()

        _candidates, errors, metrics = DISCOVERY.wikidata_candidates(
            registry(requestBudget=1), set(), "2026-08-16", requester=fake_request, sleeper=lambda _delay: None
        )

        self.assertEqual(metrics["pagesRequested"], 1)
        self.assertTrue(metrics["budgetExhausted"])
        self.assertEqual(errors, ["wikidata:request-budget-exhausted"])

    def test_respects_retry_after_when_wikidata_throttles(self) -> None:
        calls = 0
        delays: list[float] = []

        def flaky_request(url: str, _user_agent: str, _attempts: int) -> bytes:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise urllib.error.HTTPError(url, 429, "limited", {"Retry-After": "7"}, None)
            return b'{"search": []}'

        payload = DISCOVERY.request_json(
            "https://www.wikidata.org/w/api.php", "ConfigPilot-Test/1.0", 2,
            requester=flaky_request, sleeper=delays.append,
        )

        self.assertEqual(payload, {"search": []})
        self.assertEqual(calls, 2)
        self.assertEqual(delays, [7.0])

    def test_report_exposes_all_registered_categories(self) -> None:
        source_registry = json.loads((ROOT / "src/catalog/source-registry.json").read_text(encoding="utf-8"))
        report = DISCOVERY.build_coverage_report(
            source_registry, [], [], [], "2026-08-16", False, {}, [], None
        )

        self.assertEqual(report["totals"]["registeredQueries"], 89)
        self.assertEqual(report["totals"]["registeredCategories"], 9)
        self.assertEqual({row["category"] for row in report["coverage"]}, DISCOVERY.VALID_CATEGORIES)
        self.assertFalse(report["policy"]["publishAutomatically"])


if __name__ == "__main__":
    unittest.main()
