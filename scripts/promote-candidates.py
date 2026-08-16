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


def product_from(candidate: dict[str, Any], verification: dict[str, Any]) -> dict[str, Any]:
    source_id = str(candidate["sourceId"])
    external_id = str(candidate["externalId"])
    fingerprint = hashlib.sha1(f"{source_id}:{external_id}".encode("utf-8")).hexdigest()[:8]
    details = verification["product"]
    specs = dict(details["specs"])
    specs.update({"Identifiant découverte": external_id, "Source découverte": source_id})
    return {
        "id": f"open-{slug(candidate['label'])}-{fingerprint}",
        "candidateId": candidate["id"],
        "category": candidate["category"],
        "brand": candidate["brand"],
        "name": candidate["label"],
        "reference": details["reference"],
        "series": details["series"],
        "year": details["year"],
        "newPrice": None,
        "usedPrice": None,
        "confidence": "Bonne",
        "status": "Documentaire",
        "notes": details["notes"],
        "performance": None,
        "specs": specs,
        "strengths": details["strengths"],
        "weaknesses": details["weaknesses"],
        "usage": details["usage"],
        "source": verification["officialUrl"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Promouvoir des candidats vérifiés dans le catalogue documentaire")
    parser.add_argument("--ids", nargs="+", required=True, help="Identifiants candidate-… à promouvoir")
    parser.add_argument("--input", type=Path, default=ROOT / "src/catalog/discovery.generated.json")
    parser.add_argument("--output", type=Path, default=ROOT / "src/catalog/promoted.generated.json")
    parser.add_argument("--verification", type=Path, default=ROOT / "src/catalog/candidate-verification.generated.json")
    args = parser.parse_args()
    available = {candidate["id"]: candidate for candidate in load(args.input).get("candidates", [])}
    missing = [candidate_id for candidate_id in args.ids if candidate_id not in available]
    if missing:
        print(f"Candidats introuvables: {', '.join(missing)}")
        return 1
    blocked = [candidate_id for candidate_id in args.ids if not available[candidate_id].get("promotable")]
    if blocked:
        print("Promotion refusée pour les candidats non commerciaux, dupliqués ou insuffisamment qualifiés:")
        for candidate_id in blocked:
            candidate = available[candidate_id]
            print(f"- {candidate_id}: {candidate.get('promotionBlocker') or candidate.get('triageReason')}")
        return 2
    verifications = {item["candidateId"]: item for item in load(args.verification).get("candidates", [])}
    unverified = [candidate_id for candidate_id in args.ids if verifications.get(candidate_id, {}).get("status") != "verified"]
    if unverified:
        print("Promotion refusée sans correspondance constructeur exacte:")
        for candidate_id in unverified:
            verification = verifications.get(candidate_id, {})
            print(f"- {candidate_id}: {verification.get('reason', 'preuve constructeur absente')}")
        return 3
    previous = load(args.output) if args.output.exists() else []
    products = {product["id"]: product for product in previous}
    for candidate_id in args.ids:
        product = product_from(available[candidate_id], verifications[candidate_id])
        products[product["id"]] = product
    ordered = sorted(products.values(), key=lambda product: (product["category"], product["brand"].lower(), product["name"].lower()))
    args.output.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"promoted": len(args.ids), "catalogTotal": len(ordered)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
