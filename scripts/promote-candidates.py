#!/usr/bin/env python3
"""Promote explicitly selected discovery candidates to documentary products."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def slug(value: str) -> str:
    plain = "".join(char for char in unicodedata.normalize("NFD", value) if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")[:55]


def product_from(candidate: dict[str, Any]) -> dict[str, Any]:
    source_id = str(candidate["sourceId"])
    external_id = str(candidate["externalId"])
    fingerprint = hashlib.sha1(f"{source_id}:{external_id}".encode("utf-8")).hexdigest()[:8]
    return {
        "id": f"open-{slug(candidate['label'])}-{fingerprint}",
        "category": candidate["category"],
        "brand": candidate["brand"],
        "name": candidate["label"],
        "reference": external_id,
        "series": "Source ouverte validée manuellement",
        "year": None,
        "newPrice": None,
        "usedPrice": None,
        "confidence": candidate.get("confidence", "Faible"),
        "status": "Documentaire",
        "notes": "Candidat promu manuellement depuis une source ouverte. Les caractéristiques détaillées doivent encore être confirmées sur une fiche constructeur.",
        "performance": None,
        "specs": {
            "Identifiant source": external_id,
            "Source ouverte": source_id,
            "Type d’entrée": candidate.get("kind", "product-candidate"),
        },
        "strengths": ["Référence issue d’une source enregistrée", "Promotion humaine explicite"],
        "weaknesses": ["Caractéristiques, année et prix encore à vérifier"],
        "usage": "Identification et recherche documentaire",
        "source": candidate["url"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Promouvoir des candidats vérifiés dans le catalogue documentaire")
    parser.add_argument("--ids", nargs="+", required=True, help="Identifiants candidate-… à promouvoir")
    parser.add_argument("--input", type=Path, default=ROOT / "src/catalog/discovery.generated.json")
    parser.add_argument("--output", type=Path, default=ROOT / "src/catalog/promoted.generated.json")
    args = parser.parse_args()
    available = {candidate["id"]: candidate for candidate in load(args.input).get("candidates", [])}
    missing = [candidate_id for candidate_id in args.ids if candidate_id not in available]
    if missing:
        print(f"Candidats introuvables: {', '.join(missing)}")
        return 1
    previous = load(args.output) if args.output.exists() else []
    products = {product["id"]: product for product in previous}
    for candidate_id in args.ids:
        product = product_from(available[candidate_id])
        products[product["id"]] = product
    ordered = sorted(products.values(), key=lambda product: (product["category"], product["brand"].lower(), product["name"].lower()))
    args.output.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"promoted": len(args.ids), "catalogTotal": len(ordered)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
