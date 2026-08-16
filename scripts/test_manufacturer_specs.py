#!/usr/bin/env python3
"""Deterministic tests for manufacturer specification normalization."""

from __future__ import annotations

import importlib.util
import sys
import unittest
import urllib.error
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "scripts/fixtures/specs"
sys.path.insert(0, str(ROOT / "scripts"))
SPEC = importlib.util.spec_from_file_location("collect_manufacturer_specs", ROOT / "scripts/collect-manufacturer-specs.py")
assert SPEC and SPEC.loader
COLLECTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COLLECTOR)
NORMALIZATION = COLLECTOR.normalization


def normalize_fixture(name: str, category: str) -> dict:
    raw_fields = COLLECTOR.extract_raw_fields((FIXTURES / f"{name}.html").read_bytes(), 80)
    candidate = {
        "id": f"candidate-{name}", "sourceId": "brand-index", "category": category,
        "brand": "Brand", "url": "https://brand.example/products/sample",
    }
    return COLLECTOR.build_record(candidate, raw_fields, "2026-08-16")


def values(record: dict) -> dict:
    return {spec["field"]: spec["value"] for spec in record["specs"]}


class MotherboardSpecTests(unittest.TestCase):
    def test_reads_socket_chipset_memory_and_network_rows(self) -> None:
        record = normalize_fixture("motherboard", "motherboard")

        self.assertEqual(values(record), {
            "socket": "LGA1851", "chipset": "Z890", "formFactor": "ATX", "memoryType": "DDR5",
            "memorySlots": 4, "pcie": ["1× PCIe 5.0 x16", "2× PCIe 4.0 x1"],
            "wifi": "Wi-Fi 7", "ethernet": "2.5GbE",
        })
        self.assertEqual(record["missingFields"], [])
        self.assertEqual(record["review"]["status"], "pending")

    def test_keeps_the_raw_value_next_to_the_normalized_one(self) -> None:
        record = normalize_fixture("motherboard", "motherboard")
        socket = next(spec for spec in record["specs"] if spec["field"] == "socket")

        self.assertEqual(socket["rawField"], "CPU Socket")
        self.assertEqual(socket["rawValue"], "Intel® Socket LGA1851 for 15th Gen Intel Core processors")
        self.assertEqual(socket["method"], "spec-table")
        self.assertEqual(socket["confidence"], "medium")
        self.assertEqual(socket["sourceUrl"], "https://brand.example/products/sample")
        self.assertEqual(socket["collectedAt"], "2026-08-16")

    def test_an_absent_mention_never_becomes_a_negative_value(self) -> None:
        record = normalize_fixture("motherboard-partial", "motherboard")

        self.assertNotIn("wifi", values(record))
        self.assertEqual(record["missingFields"], ["formFactor", "pcie", "wifi", "ethernet"])

    def test_an_explicit_denial_is_recorded_as_false(self) -> None:
        specs = NORMALIZATION.normalize_specs(
            "motherboard", [{"field": "Wireless", "value": "N/A", "method": "spec-table"}],
            "https://brand.example/products/sample", "2026-08-16",
        )

        self.assertEqual([(spec["field"], spec["value"], spec["confidence"]) for spec in specs], [("wifi", False, "high")])


class MemorySpecTests(unittest.TestCase):
    def test_reads_structured_json_ld_properties(self) -> None:
        record = normalize_fixture("ram", "ram")

        self.assertEqual(values(record), {
            "memoryType": "DDR5", "capacity": 32, "moduleCount": 2,
            "speed": 6000, "latency": 30, "xmp": "XMP 3.0", "ecc": False,
        })
        self.assertEqual(record["missingFields"], ["expo"])
        self.assertTrue(all(spec["method"] == "json-ld" for spec in record["specs"]))

    def test_skips_a_table_that_lists_several_references_at_once(self) -> None:
        record = normalize_fixture("ram-sku-table", "ram")

        self.assertEqual([row["field"] for row in record["rawFields"]], ["Memory Type", "Kit Capacity", "Tested Latency"])
        self.assertEqual(values(record), {"memoryType": "DDR5", "capacity": 32, "moduleCount": 2, "latency": 46})

    def test_does_not_infer_expo_from_an_xmp_profile(self) -> None:
        specs = NORMALIZATION.normalize_specs(
            "ram", [{"field": "Profile", "value": "Intel XMP 3.0", "method": "json-ld"}],
            "https://brand.example/products/sample", "2026-08-16",
        )

        self.assertEqual([spec["field"] for spec in specs], ["xmp"])


class PowerSupplySpecTests(unittest.TestCase):
    def test_reads_power_certification_modularity_and_warranty(self) -> None:
        record = normalize_fixture("psu", "psu")

        self.assertEqual(values(record), {
            "wattage": 750, "efficiency": "80 PLUS Gold", "atxStandard": "ATX12V 3.1",
            "modularity": "Entièrement modulaire", "pcieConnectors": 4,
            "highPowerConnector": False, "warrantyYears": 12,
        })
        self.assertEqual(next(spec["unit"] for spec in record["specs"] if spec["field"] == "wattage"), "W")


class CaseSpecTests(unittest.TestCase):
    def test_reads_a_definition_list_of_clearances(self) -> None:
        record = normalize_fixture("case", "case")

        self.assertEqual(values(record), {
            "caseFormFactor": "Mid Tower", "motherboardSupport": ["ATX", "Micro-ATX", "Mini-ITX"],
            "maxGpuLength": 405, "maxCoolerHeight": 170,
            "radiators": ["360 mm", "280 mm"], "dimensions": "447 × 215 × 474 mm",
        })
        self.assertTrue(all(spec["method"] == "definition-list" for spec in record["specs"]))

    def test_reads_labelled_specification_lists_and_ignores_navigation(self) -> None:
        record = normalize_fixture("case-spec-list", "case")

        self.assertTrue(all(row["method"] == "spec-list" for row in record["rawFields"]))
        self.assertEqual(values(record), {
            "motherboardSupport": ["Mini-ITX"], "maxGpuLength": 322,
            "maxCoolerHeight": 77, "radiators": ["120 mm"],
        })
        self.assertEqual(record["missingFields"], ["caseFormFactor", "dimensions"])


class CoolingSpecTests(unittest.TestCase):
    def test_reads_sockets_radiator_and_fans_and_downgrades_prose(self) -> None:
        record = normalize_fixture("cooling", "cooling")

        self.assertEqual(values(record), {
            "coolerType": "AIO", "sockets": ["LGA1851", "LGA1700", "LGA1200", "AM5", "AM4"],
            "radiatorSize": 360, "fanCount": 3, "fanSize": 120,
        })
        self.assertEqual(record["missingFields"], ["coolerHeight", "dimensions"])
        cooler_type = next(spec for spec in record["specs"] if spec["field"] == "coolerType")
        self.assertEqual((cooler_type["method"], cooler_type["confidence"]), ("meta", "low"))

    def test_reads_the_height_axis_only_when_the_order_is_published(self) -> None:
        record = normalize_fixture("cooling-air", "cooling")

        self.assertEqual(values(record), {
            "coolerType": "Air", "coolerHeight": 157, "fanSize": 120, "dimensions": "129 × 136 × 157 mm",
        })
        self.assertEqual(record["missingFields"], ["sockets", "radiatorSize", "fanCount"])

    def test_ignores_a_radiator_size_hidden_in_a_three_axis_dimension(self) -> None:
        specs = NORMALIZATION.normalize_specs(
            "cooling", [{"field": "Radiator Dimensions", "value": "402×120×27 mm(L×W×H)", "method": "spec-table"}],
            "https://brand.example/products/sample", "2026-08-16",
        )

        self.assertNotIn("radiatorSize", [spec["field"] for spec in specs])

    def test_prose_only_feeds_the_allowlisted_fields(self) -> None:
        specs = NORMALIZATION.normalize_specs(
            "cooling", [{"field": "og:description", "value": "A 360 mm AIO for LGA1700 and AM5.", "method": "meta"}],
            "https://brand.example/products/sample", "2026-08-16",
        )

        self.assertEqual([spec["field"] for spec in specs], ["coolerType"])


class CollectionTests(unittest.TestCase):
    registry = {
        "policy": {
            "minimumDelayMs": 0, "userAgent": "ConfigPilot-Test/1.0", "retryAttempts": 1,
            "manufacturerSpecPageBudget": 20, "manufacturerSpecFieldLimit": 80,
        },
        "sources": [{
            "id": "brand-index", "type": "manufacturer-index", "url": "https://brand.example/index",
            "robotsUrl": "https://brand.example/robots.txt", "enabled": True,
        }],
        "manufacturerDomains": [{"brands": ["Brand"], "domains": ["brand.example"]}],
    }
    candidate = {
        "id": "candidate-1", "sourceId": "brand-index", "category": "psu", "brand": "Brand",
        "label": "Brand Focus 750", "url": "https://brand.example/products/focus-750",
    }
    evidence = {"evidence": [{"candidateId": "candidate-1", "status": "page-metadata"}]}

    def pages(self) -> dict[str, bytes]:
        return {
            "https://brand.example/robots.txt": b"User-agent: *\nAllow: /\n",
            self.candidate["url"]: (FIXTURES / "psu.html").read_bytes(),
        }

    def collect(self, pages: dict[str, bytes], previous: dict | None = None, **options) -> tuple[dict, list[str]]:
        return COLLECTOR.collect_specs(
            self.registry, [self.candidate], self.evidence, previous or {}, "2026-08-16", 1,
            requester=lambda url, _agent, _attempts: pages[url], sleeper=lambda _delay: None, **options,
        )

    def test_collects_within_the_budget_without_verifying_anything(self) -> None:
        output, errors = self.collect(self.pages())

        self.assertEqual(errors, [])
        self.assertEqual(output["summary"]["collected"], 1)
        self.assertEqual(output["summary"]["remaining"], 0)
        self.assertEqual(output["summary"]["byCategory"]["psu"]["normalizedValues"], 7)
        self.assertEqual(output["lastRun"]["normalizedValues"], 7)
        self.assertEqual(output["policy"]["publishAutomatically"], False)
        self.assertNotIn("verified", str(output))
        self.assertTrue(all(record["review"]["status"] == "pending" for record in output["records"]))

    def test_ignores_candidates_without_manufacturer_evidence(self) -> None:
        output, _errors = COLLECTOR.collect_specs(
            self.registry, [self.candidate], {"evidence": []}, {}, "2026-08-16", 1,
            requester=lambda _url, _agent, _attempts: b"", sleeper=lambda _delay: None,
        )

        self.assertEqual(output["summary"], COLLECTOR.summarize([], 0, 0))
        self.assertEqual(output["lastRun"]["attempted"], 0)

    def test_stops_on_a_blocking_robots_policy(self) -> None:
        pages = self.pages()
        pages["https://brand.example/robots.txt"] = b"User-agent: *\nDisallow: /\n"
        output, errors = self.collect(pages)

        self.assertEqual(output["summary"]["collected"], 0)
        self.assertIn("brand-index:robots-blocked-or-unavailable", errors)

    def test_keeps_failures_for_a_later_retry(self) -> None:
        pages = self.pages()

        def failing(url: str, _agent: str, _attempts: int) -> bytes:
            if url.endswith("robots.txt"):
                return pages[url]
            raise urllib.error.HTTPError(url, 503, "Unavailable", {}, None)

        output, errors = COLLECTOR.collect_specs(
            self.registry, [self.candidate], self.evidence, {}, "2026-08-16", 1,
            requester=failing, sleeper=lambda _delay: None,
        )

        self.assertEqual(output["failures"][0]["attempts"], 1)
        self.assertEqual(output["failures"][0]["error"], "HTTPError")
        self.assertEqual(errors, ["candidate-1:HTTPError"])

    def test_offline_mode_renormalizes_stored_raw_values_without_network(self) -> None:
        collected, _errors = self.collect(self.pages())

        def refuse(url: str, _agent: str, _attempts: int) -> bytes:
            raise AssertionError(f"offline mode must not request {url}")

        output, errors = COLLECTOR.collect_specs(
            self.registry, [self.candidate], self.evidence, collected, "2026-08-17", 1,
            offline=True, requester=refuse, sleeper=lambda _delay: None,
        )

        self.assertEqual(errors, [])
        self.assertEqual(output["lastRun"]["mode"], "offline")
        self.assertEqual(output["lastRun"]["limit"], 0)
        self.assertEqual(output["records"][0]["collectedAt"], "2026-08-16")
        self.assertEqual(output["summary"]["normalizedValues"], 7)


if __name__ == "__main__":
    unittest.main()
