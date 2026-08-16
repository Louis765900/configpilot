#!/usr/bin/env python3
"""Regression tests for bounded manufacturer evidence collection."""

from __future__ import annotations

import importlib.util
import unittest
import urllib.error
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("collect_manufacturer_evidence", ROOT / "scripts/collect-manufacturer-evidence.py")
assert SPEC and SPEC.loader
EVIDENCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EVIDENCE)


class ManufacturerEvidenceTests(unittest.TestCase):
    def test_extracts_json_ld_product_without_auto_verification(self) -> None:
        raw = b'''<html><head><link rel="canonical" href="https://brand.example/products/model-x"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Model X DDR5","model":"MX5","mpn":"MX5-32","brand":{"name":"Brand"},"additionalProperty":[{"@type":"PropertyValue","name":"Capacity","value":"32 GB"}]}</script></head></html>'''
        page = EVIDENCE.parse_page(raw, "https://brand.example/products/model-x", ["brand.example"], 10)
        candidate = {"id":"candidate-1","sourceId":"brand-index","category":"ram","brand":"Brand","label":"Brand Model X DDR5","url":"https://brand.example/products/model-x"}
        item = EVIDENCE.evidence_from_page(candidate, page, "2026-08-16")

        self.assertEqual(item["status"], "structured-product")
        self.assertEqual(item["identity"]["mpn"], "MX5-32")
        self.assertEqual(item["properties"], [{"name":"Capacity","value":"32 GB"}])
        self.assertEqual(item["review"]["status"], "pending")
        self.assertNotIn("verified", item)

    def test_falls_back_to_page_metadata_and_rejects_external_canonical(self) -> None:
        raw = b'''<html><head><title>Fallback title</title><meta property="og:title" content="Model Y ATX Case"><meta property="og:description" content="Official case"><link rel="canonical" href="https://evil.example/model-y"></head></html>'''
        page = EVIDENCE.parse_page(raw, "https://brand.example/products/model-y", ["brand.example"], 10)
        candidate = {"id":"candidate-2","sourceId":"brand-index","category":"case","brand":"Brand","label":"Brand Model Y","url":"https://brand.example/products/model-y"}
        item = EVIDENCE.evidence_from_page(candidate, page, "2026-08-16")

        self.assertEqual(item["status"], "page-metadata")
        self.assertEqual(item["page"]["canonicalUrl"], candidate["url"])
        self.assertGreater(item["match"]["score"], 0)

    def test_round_robin_spreads_the_budget_and_deprioritizes_failures(self) -> None:
        candidates = [
            {"id":"a1","sourceId":"a"},{"id":"a2","sourceId":"a"},
            {"id":"b1","sourceId":"b"},{"id":"b2","sourceId":"b"},
        ]
        selected = EVIDENCE.round_robin_candidates(candidates, {"a1": 2}, 3)
        self.assertEqual([item["id"] for item in selected], ["a2", "b1", "a1"])

    def test_collection_obeys_robots_and_keeps_failures_for_retry(self) -> None:
        registry = {
            "policy":{"minimumDelayMs":0,"userAgent":"ConfigPilot-Test/1.0","retryAttempts":1,"manufacturerEvidencePropertyLimit":10},
            "sources":[{"id":"brand-index","type":"manufacturer-index","url":"https://brand.example/index","robotsUrl":"https://brand.example/robots.txt","enabled":True}],
            "manufacturerDomains":[{"brands":["Brand"],"domains":["brand.example"]}],
        }
        candidate = {"id":"candidate-3","sourceId":"brand-index","category":"psu","brand":"Brand","label":"Brand Focus 750","url":"https://brand.example/products/focus-750"}
        pages = {
            "https://brand.example/robots.txt": b"User-agent: *\nAllow: /\n",
            candidate["url"]: b"<meta property='og:title' content='Brand Focus 750'>",
        }
        output, errors = EVIDENCE.collect_evidence(registry, [candidate], {}, "2026-08-16", 1, requester=lambda url, _ua, _attempts: pages[url], sleeper=lambda _delay: None)
        self.assertEqual(errors, [])
        self.assertEqual(output["summary"]["collected"], 1)

        pages["https://brand.example/robots.txt"] = b"User-agent: *\nDisallow: /\n"
        output, errors = EVIDENCE.collect_evidence(registry, [candidate], {}, "2026-08-16", 1, requester=lambda url, _ua, _attempts: pages[url], sleeper=lambda _delay: None)
        self.assertEqual(output["summary"]["collected"], 0)
        self.assertIn("brand-index:robots-blocked-or-unavailable", errors)

        pages["https://brand.example/robots.txt"] = b"User-agent: *\nAllow: /\n"
        def failed_page(url: str, _ua: str, _attempts: int) -> bytes:
            if url.endswith("robots.txt"):
                return pages[url]
            raise urllib.error.HTTPError(url, 503, "Unavailable", {}, None)
        output, errors = EVIDENCE.collect_evidence(registry, [candidate], {}, "2026-08-16", 1, requester=failed_page, sleeper=lambda _delay: None)
        self.assertEqual(output["failures"][0]["attempts"], 1)
        self.assertEqual(output["failures"][0]["error"], "HTTPError")


if __name__ == "__main__":
    unittest.main()
