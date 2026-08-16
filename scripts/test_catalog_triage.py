#!/usr/bin/env python3
"""Regression tests for deterministic catalog candidate triage."""

from __future__ import annotations

import unittest

from catalog_triage import classify, triage


def candidate(label: str, description: str = "processeur de bureau", category: str = "cpu", **extra: object) -> dict:
    return {
        "id": "candidate-test",
        "label": label,
        "description": description,
        "category": category,
        "duplicate": False,
        **extra,
    }


class CatalogTriageTests(unittest.TestCase):
    def test_recognizes_precise_retail_models(self) -> None:
        self.assertEqual(classify(candidate("AMD Ryzen 5 3600"))[0], "retail-product")
        self.assertEqual(classify(candidate("GeForce RTX 4070 Ti", category="gpu"))[0], "retail-product")

    def test_separates_product_families(self) -> None:
        self.assertEqual(classify(candidate("Intel Core i7", "famille de processeurs"))[0], "product-family")
        self.assertEqual(classify(candidate("Radeon RX 7000", "série de cartes graphiques", "gpu"))[0], "product-family")

    def test_separates_integrated_components(self) -> None:
        self.assertEqual(classify(candidate("AMD Radeon 760M", "integrated GPU", "gpu"))[0], "component-model")

    def test_separates_hardware_identifiers(self) -> None:
        item = candidate("NVIDIA PCI device", category="gpu", sourceId="pci-ids", kind="hardware-identifier")
        self.assertEqual(classify(item)[0], "hardware-identifier")

    def test_rejects_services(self) -> None:
        self.assertEqual(classify(candidate("GeForce Now", "cloud gaming service", "gpu"))[0], "false-positive")

    def test_only_unique_retail_products_are_promotable(self) -> None:
        self.assertTrue(triage(candidate("AMD Ryzen 5 3600"))["promotable"])
        self.assertFalse(triage(candidate("AMD Ryzen 5 3600", duplicate=True))["promotable"])
        self.assertFalse(triage(candidate("Ryzen", "processor family"))["promotable"])


if __name__ == "__main__":
    unittest.main()
