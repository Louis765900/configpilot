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

    def test_official_index_stays_on_allowlisted_domains_and_follows_bounded_pages(self) -> None:
        source_registry = {
            "policy": {
                "minimumDelayMs": 0,
                "userAgent": "ConfigPilot-Test/1.0",
                "manufacturerIndexPageBudget": 3,
                "manufacturerIndexCandidateLimit": 10,
                "retryAttempts": 1,
            },
            "sources": [{
                "id": "brand-official-index",
                "type": "manufacturer-index",
                "url": "https://brand.example/products/",
                "enabled": True,
            }],
            "manufacturerIndexes": [{
                "id": "brand-products",
                "sourceId": "brand-official-index",
                "brand": "Brand",
                "category": "case",
                "allowedDomains": ["brand.example"],
                "followUrlPatterns": [r"^/products/[^/]+/?$"],
                "productUrlPatterns": [r"^/products/[^/]+/[^/]+/?$"],
                "maxCandidates": 5,
                "maxFollowPages": 1,
            }],
        }
        pages = {
            "https://brand.example/products/": b'''<a href="/products/north/">North</a><a href="https://evil.example/products/north/fake/">Fake</a>''',
            "https://brand.example/products/north/": b'''<a href="/products/north/model-one/">Model One Learn more</a><a href="/products/north/model-two/">Model Two</a>''',
        }

        def fake_request(url: str, _user_agent: str, attempts: int) -> bytes:
            self.assertEqual(attempts, 1)
            return pages[url]

        candidates, errors, metrics = DISCOVERY.manufacturer_index_candidates(
            source_registry, set(), "2026-08-16", requester=fake_request, sleeper=lambda _delay: None
        )

        self.assertEqual(errors, [])
        self.assertEqual({item["label"] for item in candidates}, {"Brand Model One", "Brand Model Two"})
        self.assertTrue(all(item["url"].startswith("https://brand.example/") for item in candidates))
        self.assertEqual(metrics["manufacturerPagesRequested"], 2)
        self.assertEqual(metrics["manufacturerIndexesCompleted"], 1)

    def test_sitemap_index_filters_products_and_obeys_robots(self) -> None:
        source_registry = {
            "policy": {
                "minimumDelayMs": 0,
                "userAgent": "ConfigPilot-Test/1.0",
                "manufacturerIndexPageBudget": 2,
                "manufacturerIndexCandidateLimit": 10,
                "retryAttempts": 1,
            },
            "sources": [{
                "id": "memory-official-index",
                "type": "manufacturer-index",
                "url": "https://memory.example/sitemap.xml",
                "robotsUrl": "https://memory.example/robots.txt",
                "enabled": True,
            }],
            "manufacturerIndexes": [{
                "id": "memory-products",
                "sourceId": "memory-official-index",
                "brand": "MemoryCo",
                "category": "ram",
                "allowedDomains": ["memory.example"],
                "format": "sitemap",
                "productUrlPatterns": [r"^/products/[^/]+/?$"],
                "labelPatterns": [r"\bDDR5\b"],
                "maxCandidates": 5,
                "maxFollowPages": 0,
            }],
        }
        pages = {
            "https://memory.example/robots.txt": b"User-agent: *\nAllow: /\n",
            "https://memory.example/sitemap.xml": b'''<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://memory.example/products/venom-ddr5-performance-ram</loc></url><url><loc>https://memory.example/products/portable-ssd</loc></url><url><loc>https://evil.example/products/fake-ddr5</loc></url></urlset>''',
        }

        candidates, errors, metrics = DISCOVERY.manufacturer_index_candidates(
            source_registry, set(), "2026-08-16", requester=lambda url, _ua, _attempts: pages[url], sleeper=lambda _delay: None
        )

        self.assertEqual(errors, [])
        self.assertEqual([item["label"] for item in candidates], ["MemoryCo venom ddr5 performance ram"])
        self.assertEqual(metrics["manufacturerRobotsSucceeded"], 1)

        pages["https://memory.example/robots.txt"] = b"User-agent: *\nDisallow: /\n"
        candidates, errors, metrics = DISCOVERY.manufacturer_index_candidates(
            source_registry, set(), "2026-08-16", requester=lambda url, _ua, _attempts: pages[url], sleeper=lambda _delay: None
        )
        self.assertEqual(candidates, [])
        self.assertIn("manufacturer-index:memory-products:robots-disallowed", errors)
        self.assertEqual(metrics["manufacturerPagesRequested"], 0)

        source_registry["sources"][0]["allowMissingRobots"] = True
        source_registry["sources"][0]["robotsUnavailableCheckedAt"] = "2026-08-16"

        def missing_robots_request(url: str, _ua: str, _attempts: int) -> bytes:
            if url.endswith("robots.txt"):
                raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)
            return pages[url]

        candidates, errors, metrics = DISCOVERY.manufacturer_index_candidates(
            source_registry, set(), "2026-08-16", requester=missing_robots_request, sleeper=lambda _delay: None
        )
        self.assertEqual(errors, [])
        self.assertEqual(len(candidates), 1)
        self.assertEqual(metrics["manufacturerRobotsSucceeded"], 0)


if __name__ == "__main__":
    unittest.main()
