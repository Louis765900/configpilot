#!/usr/bin/env python3
"""Fail fast when generated catalog files contain unsafe or invalid records."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = {"cpu", "gpu", "motherboard", "ram", "psu", "case", "storage", "cooling", "expansion"}


def main() -> int:
    documentary = json.loads((ROOT / "src/catalog/documentary.generated.json").read_text(encoding="utf-8"))
    promoted = json.loads((ROOT / "src/catalog/promoted.generated.json").read_text(encoding="utf-8"))
    discovery = json.loads((ROOT / "src/catalog/discovery.generated.json").read_text(encoding="utf-8"))
    hardware = json.loads((ROOT / "src/catalog/hardware-identifiers.generated.json").read_text(encoding="utf-8"))
    rejected = json.loads((ROOT / "src/catalog/rejected.generated.json").read_text(encoding="utf-8"))
    registry = json.loads((ROOT / "src/catalog/source-registry.json").read_text(encoding="utf-8"))
    errors: list[str] = []
    ids: set[str] = set()
    for product in documentary:
        if product.get("id") in ids:
            errors.append(f"duplicate product id: {product.get('id')}")
        ids.add(product.get("id", ""))
        if product.get("category") not in CATEGORIES:
            errors.append(f"invalid category: {product.get('id')}")
        if product.get("newPrice") is not None or product.get("usedPrice") is not None:
            errors.append(f"documentary price must be null: {product.get('id')}")
    for product in promoted:
        if product.get("id") in ids:
            errors.append(f"duplicate promoted product id: {product.get('id')}")
        ids.add(product.get("id", ""))
        if product.get("category") not in CATEGORIES or product.get("status") != "Documentaire":
            errors.append(f"invalid promoted product: {product.get('id')}")
        if product.get("newPrice") is not None or product.get("usedPrice") is not None:
            errors.append(f"promoted price must be null: {product.get('id')}")
        if not str(product.get("source", "")).startswith("https://"):
            errors.append(f"invalid promoted source: {product.get('id')}")
    candidate_ids: set[str] = set()
    source_ids = {source["id"] for source in registry["sources"] if source.get("enabled")}

    def validate_candidate(candidate: dict, expected_triage: set[str]) -> None:
        candidate_id = candidate.get("id", "")
        if candidate_id in candidate_ids:
            errors.append(f"duplicate candidate id: {candidate_id}")
        candidate_ids.add(candidate_id)
        if candidate.get("category") not in CATEGORIES:
            errors.append(f"invalid candidate category: {candidate_id}")
        if candidate.get("sourceId") not in source_ids:
            errors.append(f"unregistered source: {candidate_id}")
        if not str(candidate.get("url", "")).startswith("https://"):
            errors.append(f"non-https source: {candidate_id}")
        serialized = json.dumps(candidate, ensure_ascii=False)
        if re.search(r"[A-Za-z]:\\|/Users/|/home/", serialized):
            errors.append(f"local path leak: {candidate_id}")
        if candidate.get("status") != "À vérifier":
            errors.append(f"candidate auto-published: {candidate_id}")
        triage_type = candidate.get("triage")
        if triage_type not in expected_triage:
            errors.append(f"invalid triage {triage_type}: {candidate_id}")
        should_be_promotable = triage_type == "retail-product" and not candidate.get("duplicate")
        if bool(candidate.get("promotable")) != should_be_promotable:
            errors.append(f"invalid promotion flag: {candidate_id}")
        if not candidate.get("triageReason"):
            errors.append(f"missing triage reason: {candidate_id}")
        if not should_be_promotable and not candidate.get("promotionBlocker"):
            errors.append(f"missing promotion blocker: {candidate_id}")

    active = discovery.get("candidates", [])
    identifiers = hardware.get("identifiers", [])
    discarded = rejected.get("candidates", [])
    for candidate in active:
        validate_candidate(candidate, {"retail-product", "product-family", "component-model", "needs-review"})
    for candidate in identifiers:
        validate_candidate(candidate, {"hardware-identifier"})
        if candidate.get("sourceId") != "pci-ids":
            errors.append(f"non-PCI hardware identifier: {candidate.get('id', '')}")
    for candidate in discarded:
        validate_candidate(candidate, {"false-positive"})
    if errors:
        print("\n".join(errors))
        return 1
    print(json.dumps({
        "documentary": len(documentary),
        "promoted": len(promoted),
        "candidates": len(active),
        "hardwareIdentifiers": len(identifiers),
        "rejected": len(discarded),
        "sources": len(source_ids),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
