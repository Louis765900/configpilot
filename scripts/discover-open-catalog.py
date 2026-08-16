#!/usr/bin/env python3
"""Discover PC component candidates from free, explicitly registered sources.

The script never publishes products. It only maintains a deterministic review queue.
It uses the Python standard library so it can run for free in GitHub Actions.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

from catalog_triage import triage


ROOT = Path(__file__).resolve().parents[1]
VALID_CATEGORIES = {"cpu", "gpu", "motherboard", "ram", "psu", "case", "storage", "cooling", "expansion"}
CATEGORY_TERMS = {
    "cpu": {"processor", "cpu", "ryzen", "core", "athlon", "xeon"},
    "gpu": {"graphics", "gpu", "geforce", "radeon", "video", "arc"},
    "motherboard": {"motherboard", "mainboard", "chipset", "rog", "aorus", "taichi", "classified", "n7"},
    "ram": {"memory", "ram", "ddr", "dimm", "vengeance", "trident", "fury", "ballistix"},
    "psu": {"power", "supply", "psu", "focus", "supernova"},
    "case": {"case", "chassis", "tower", "masterbox", "define", "o11"},
    "storage": {"ssd", "drive", "storage", "nvme", "firecuda"},
    "cooling": {"cooler", "cooling", "heatsink", "liquid", "freezer", "dark rock"},
    "expansion": {"pcie", "capture", "network", "ethernet", "wireless", "audio", "controller"},
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    plain = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return " ".join(re.findall(r"[a-z0-9]+", plain.lower()))


def candidate_key(source_id: str, external_id: str, category: str) -> str:
    raw = f"{source_id}:{external_id}:{category}"
    return f"candidate-{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:16]}"


def existing_identities(documentary_path: Path, promoted_path: Path, data_path: Path) -> set[str]:
    identities: set[str] = set()
    for catalog_path in (documentary_path, promoted_path):
        if catalog_path.exists():
            for product in load_json(catalog_path):
                identities.update({normalize(str(product.get("name", ""))), normalize(str(product.get("reference", "")))})
    if data_path.exists():
        source = data_path.read_text(encoding="utf-8")
        for match in re.finditer(r"\bp\('([^']*)','([^']*)','([^']*)','([^']*)','([^']*)'", source):
            identities.update({normalize(match.group(4)), normalize(match.group(5))})
    return {identity for identity in identities if identity}


def request_bytes(url: str, user_agent: str, attempts: int = 3) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": user_agent, "Accept-Encoding": "gzip"})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                payload = response.read()
                return gzip.decompress(payload) if response.headers.get("Content-Encoding") == "gzip" else payload
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
            if attempt + 1 == attempts:
                raise
            time.sleep(2 ** attempt * 2)
    raise RuntimeError("unreachable")


def confidence(score: float) -> str:
    return "Moyenne" if score >= 0.72 else "Faible"


def wikidata_candidates(registry: dict[str, Any], known: set[str], run_date: str) -> tuple[list[dict[str, Any]], list[str]]:
    source = next(item for item in registry["sources"] if item["id"] == "wikidata")
    delay = registry["policy"]["minimumDelayMs"] / 1000
    found: list[dict[str, Any]] = []
    errors: list[str] = []
    for index, query in enumerate(registry["queries"]):
        if query["category"] not in VALID_CATEGORIES:
            continue
        params = urllib.parse.urlencode({
            "action": "wbsearchentities", "search": query["query"], "language": "en", "uselang": "fr",
            "type": "item", "limit": "10", "format": "json", "formatversion": "2",
        })
        try:
            payload = json.loads(request_bytes(f"{source['url']}?{params}", registry["policy"]["userAgent"]).decode("utf-8"))
        except Exception as exc:  # continue other brands when a public endpoint throttles
            errors.append(f"wikidata:{query['brand']}:{type(exc).__name__}")
            time.sleep(delay)
            continue
        brand_tokens = set(normalize(query["brand"]).split())
        query_tokens = set(normalize(query["query"]).split())
        for hit in payload.get("search", []):
            label = str(hit.get("label", "")).strip()
            if not label or not hit.get("id"):
                continue
            description = str(hit.get("description", "Description non fournie")).strip()
            combined_tokens = set(normalize(f"{label} {description}").split())
            brand_match = bool(brand_tokens & combined_tokens)
            query_overlap = len(query_tokens & combined_tokens) / max(1, len(query_tokens))
            category_match = bool(CATEGORY_TERMS[query["category"]] & combined_tokens)
            score = (0.42 if brand_match else 0) + min(0.33, query_overlap * 0.4) + (0.25 if category_match else 0)
            if score < 0.42 or (not category_match and query_overlap < 0.65):
                continue
            external_id = str(hit["id"])
            identity = normalize(label)
            found.append({
                "id": candidate_key("wikidata", external_id, query["category"]),
                "sourceId": "wikidata", "externalId": external_id, "kind": "product-candidate",
                "label": label, "description": description, "url": f"https://www.wikidata.org/wiki/{external_id}",
                "brand": query["brand"], "category": query["category"], "query": query["query"],
                "confidence": confidence(score), "score": round(score, 2), "duplicate": identity in known,
                "status": "À vérifier", "firstSeenAt": run_date,
            })
        if index + 1 < len(registry["queries"]):
            time.sleep(delay)
    return found, errors


def infer_pci_category(name: str) -> str | None:
    value = normalize(name)
    if any(term in value for term in ("geforce", "radeon", "graphics", "display", "vga", "arc a")):
        return "gpu"
    if any(term in value for term in ("nvme", "sata", "raid", "ahci", "storage controller")):
        return "storage"
    if any(term in value for term in ("ethernet", "wireless", "wi fi", "bluetooth", "audio", "capture", "usb controller")):
        return "expansion"
    return None


def pci_candidates(registry: dict[str, Any], known: set[str], run_date: str) -> tuple[list[dict[str, Any]], list[str]]:
    source = next(item for item in registry["sources"] if item["id"] == "pci-ids")
    errors: list[str] = []
    try:
        raw = request_bytes(source["url"], registry["policy"]["userAgent"])
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        lines = raw.decode("utf-8", errors="replace").splitlines()
    except Exception as exc:
        return [], [f"pci-ids:{type(exc).__name__}"]
    vendors = {item["id"].lower(): item["brand"] for item in registry["pciVendors"]}
    current_vendor: tuple[str, str] | None = None
    per_group: dict[tuple[str, str], int] = {}
    found: list[dict[str, Any]] = []
    for line in lines:
        if not line or line.startswith("#") or line.startswith("C "):
            continue
        vendor_match = re.match(r"^([0-9a-fA-F]{4})\s+(.+)$", line)
        if vendor_match:
            vendor_id = vendor_match.group(1).lower()
            current_vendor = (vendor_id, vendors[vendor_id]) if vendor_id in vendors else None
            continue
        device_match = re.match(r"^\t([0-9a-fA-F]{4})\s+(.+)$", line)
        if not current_vendor or not device_match:
            continue
        device_id, device_name = device_match.group(1).lower(), device_match.group(2).strip()
        category = infer_pci_category(device_name)
        if not category:
            continue
        vendor_id, brand = current_vendor
        group = (brand, category)
        if per_group.get(group, 0) >= 25:
            continue
        per_group[group] = per_group.get(group, 0) + 1
        label = f"{brand} {device_name}"
        external_id = f"{vendor_id}:{device_id}"
        found.append({
            "id": candidate_key("pci-ids", external_id, category), "sourceId": "pci-ids", "externalId": external_id,
            "kind": "hardware-identifier", "label": label, "description": f"Identifiant matériel PCI {external_id}; modèle commercial à confirmer.",
            "url": f"https://pci-ids.ucw.cz/read/PC/{vendor_id}/{device_id}", "brand": brand, "category": category,
            "query": "pci.ids", "confidence": "Faible", "score": 0.45, "duplicate": normalize(label) in known,
            "status": "À vérifier", "firstSeenAt": run_date,
        })
    return found, errors


def merge_candidates(previous: list[dict[str, Any]], discovered: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    merged = {candidate["id"]: candidate for candidate in previous}
    for candidate in discovered:
        if candidate["id"] in merged:
            candidate["firstSeenAt"] = merged[candidate["id"]].get("firstSeenAt", candidate["firstSeenAt"])
        merged[candidate["id"]] = candidate
    ordered = sorted(merged.values(), key=lambda item: (item["duplicate"], item["category"], item["brand"].lower(), item["label"].lower(), item["id"]))
    return ordered[:limit]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", type=Path, default=ROOT / "src/catalog/source-registry.json")
    parser.add_argument("--output", type=Path, default=ROOT / "src/catalog/discovery.generated.json")
    parser.add_argument("--documentary", type=Path, default=ROOT / "src/catalog/documentary.generated.json")
    parser.add_argument("--promoted", type=Path, default=ROOT / "src/catalog/promoted.generated.json")
    parser.add_argument("--data", type=Path, default=ROOT / "src/data.ts")
    parser.add_argument("--hardware-output", type=Path, default=ROOT / "src/catalog/hardware-identifiers.generated.json")
    parser.add_argument("--rejected-output", type=Path, default=ROOT / "src/catalog/rejected.generated.json")
    parser.add_argument("--offline", action="store_true", help="Validate and normalize the existing queue without network calls")
    parser.add_argument("--fresh", action="store_true", help="Rebuild the queue instead of merging the previous candidates")
    args = parser.parse_args()
    registry = load_json(args.registry)
    previous_feed = load_json(args.output) if args.output.exists() and not args.fresh else {"version": 1, "candidates": []}
    previous_hardware = load_json(args.hardware_output) if args.hardware_output.exists() and not args.fresh else {"version": 1, "identifiers": []}
    previous_rejected = load_json(args.rejected_output) if args.rejected_output.exists() and not args.fresh else {"version": 1, "candidates": []}
    promoted_products = load_json(args.promoted) if args.promoted.exists() else []
    promoted_candidate_ids = {product.get("candidateId") for product in promoted_products}
    known = existing_identities(args.documentary, args.promoted, args.data)
    run_date = date.today().isoformat()
    discovered: list[dict[str, Any]] = []
    errors: list[str] = []
    if not args.offline:
        wiki, wiki_errors = wikidata_candidates(registry, known, run_date)
        pci, pci_errors = pci_candidates(registry, known, run_date)
        discovered.extend(wiki + pci)
        errors.extend(wiki_errors + pci_errors)
    previous = previous_feed.get("candidates", []) + previous_hardware.get("identifiers", []) + previous_rejected.get("candidates", [])
    candidates = [triage(candidate) for candidate in merge_candidates(previous, discovered, int(registry["policy"]["candidateLimit"]))]
    product_candidates = [candidate for candidate in candidates if candidate["triage"] not in {"hardware-identifier", "false-positive"} and candidate["id"] not in promoted_candidate_ids]
    hardware_identifiers = [candidate for candidate in candidates if candidate["triage"] == "hardware-identifier"]
    rejected_candidates = [candidate for candidate in candidates if candidate["triage"] == "false-positive"]
    payload = {"version": 2, "candidates": product_candidates}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.hardware_output.write_text(json.dumps({"version": 1, "identifiers": hardware_identifiers}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.rejected_output.write_text(json.dumps({"version": 1, "candidates": rejected_candidates}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts: dict[str, int] = {}
    for candidate in candidates:
        counts[candidate["triage"]] = counts.get(candidate["triage"], 0) + 1
    print(json.dumps({"existingProducts": len(known), "newObservations": len(discovered), "activeCandidates": len(product_candidates), "hardwareIdentifiers": len(hardware_identifiers), "rejected": len(rejected_candidates), "triage": counts, "errors": errors}, ensure_ascii=False))
    return 0 if not errors or discovered else 2


if __name__ == "__main__":
    raise SystemExit(main())
