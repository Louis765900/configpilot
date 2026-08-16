#!/usr/bin/env python3
"""End-to-end tests for the manufacturer verification promotion gate."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/promote-candidates.py"
VERIFIED_ID = "candidate-87fc5afcdbba2fc5"
AMBIGUOUS_ID = "candidate-1ae6b737a3d09a6d"


class CatalogPromotionTests(unittest.TestCase):
    def run_promotion(self, candidate_id: str, output: Path, input_path: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--ids", candidate_id, "--input", str(input_path), "--output", str(output)],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def write_fixture(self, directory: str, candidate_id: str) -> Path:
        fixture = {
            "version": 2,
            "candidates": [{
                "id": candidate_id,
                "sourceId": "wikidata",
                "externalId": "QTEST",
                "label": "Lian Li O11 Dynamic Evo XL" if candidate_id == VERIFIED_ID else "Arc A770",
                "brand": "Lian Li" if candidate_id == VERIFIED_ID else "Intel",
                "category": "case" if candidate_id == VERIFIED_ID else "gpu",
                "promotable": True,
            }],
        }
        path = Path(directory) / "candidates.json"
        path.write_text(json.dumps(fixture), encoding="utf-8")
        return path

    def test_refuses_an_ambiguous_variant(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            input_path = self.write_fixture(directory, AMBIGUOUS_ID)
            result = self.run_promotion(AMBIGUOUS_ID, Path(directory) / "promoted.json", input_path)
        self.assertEqual(result.returncode, 3)
        self.assertIn("8 Go et 16 Go", result.stdout)

    def test_promotes_with_the_official_source_and_enriched_specs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "promoted.json"
            input_path = self.write_fixture(directory, VERIFIED_ID)
            result = self.run_promotion(VERIFIED_ID, output, input_path)
            products = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(products[0]["candidateId"], VERIFIED_ID)
        self.assertEqual(products[0]["source"], "https://lian-li.com/product/o11-dynamic-evo-xl/")
        self.assertEqual(products[0]["specs"]["GPU max (mm)"], 460)


if __name__ == "__main__":
    unittest.main()
