#!/usr/bin/env python3
"""Collect bounded, review-only evidence from allowlisted manufacturer product pages.

The collector never verifies or promotes a candidate. It stores identity signals and
structured properties so a human can review them later. It uses only the Python
standard library and is designed to progress through the queue over weekly runs.
"""

from __future__ import annotations

import argparse
import gzip
import html
import json
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_STATUSES = {"structured-product", "page-metadata", "insufficient-metadata"}
IDENTITY_FIELDS = ("name", "model", "sku", "mpn", "gtin", "gtin8", "gtin12", "gtin13", "gtin14", "productID")
GENERIC_TOKENS = {
    "a", "an", "and", "atx", "by", "computer", "desktop", "for", "gaming", "memory", "motherboard",
    "of", "official", "pc", "power", "product", "ram", "series", "supply", "the", "with",
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def clean_text(value: Any, limit: int = 500) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        value = value.get("name") or value.get("value") or ""
    if isinstance(value, list):
        value = next((item for item in value if item), "")
    plain = html.unescape(re.sub(r"<[^>]+>", " ", str(value)))
    return " ".join(plain.split())[:limit]


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    plain = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return " ".join(re.findall(r"[a-z0-9]+", plain.lower()))


def trusted_domain(url: str, allowed_domains: list[str]) -> bool:
    hostname = (urllib.parse.urlparse(url).hostname or "").lower()
    return any(hostname == domain.lower() or hostname.endswith(f".{domain.lower()}") for domain in allowed_domains)


class EvidenceHTMLParser(HTMLParser):
    """Read standard page metadata and JSON-LD without trying to interpret layout."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.canonical = ""
        self.json_ld: list[str] = []
        self.title_parts: list[str] = []
        self.h1_parts: list[str] = []
        self.capture: str | None = None
        self.capture_tag: str | None = None
        self.buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value for key, value in attrs}
        if tag == "script" and "ld+json" in str(values.get("type", "")).lower():
            self.capture, self.capture_tag, self.buffer = "json-ld", tag, []
        elif tag == "title" and self.capture is None:
            self.capture, self.capture_tag, self.buffer = "title", tag, []
        elif tag == "h1" and not self.h1_parts and self.capture is None:
            self.capture, self.capture_tag, self.buffer = "h1", tag, []
        elif tag == "meta":
            key = values.get("property") or values.get("name") or values.get("itemprop")
            content = values.get("content")
            if key and content:
                self.meta[str(key).lower()] = clean_text(content)
        elif tag == "link" and "canonical" in str(values.get("rel", "")).lower() and values.get("href"):
            self.canonical = str(values["href"])

    def handle_data(self, data: str) -> None:
        if self.capture:
            self.buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if not self.capture or tag != self.capture_tag:
            return
        value = "".join(self.buffer)
        if self.capture == "json-ld":
            self.json_ld.append(value)
        elif self.capture == "title":
            self.title_parts.append(value)
        elif self.capture == "h1":
            self.h1_parts.append(value)
        self.capture = self.capture_tag = None
        self.buffer = []


def json_objects(value: Any) -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    if isinstance(value, dict):
        objects.append(value)
        for nested in value.values():
            objects.extend(json_objects(nested))
    elif isinstance(value, list):
        for nested in value:
            objects.extend(json_objects(nested))
    return objects


def has_type(item: dict[str, Any], expected: str) -> bool:
    item_type = item.get("@type", "")
    values = item_type if isinstance(item_type, list) else [item_type]
    return any(str(value).rsplit("/", 1)[-1].lower() == expected.lower() for value in values)


def parse_page(raw: bytes, page_url: str, allowed_domains: list[str], property_limit: int) -> dict[str, Any]:
    parser = EvidenceHTMLParser()
    parser.feed(raw.decode("utf-8", errors="replace"))
    nodes: list[dict[str, Any]] = []
    for document in parser.json_ld:
        try:
            nodes.extend(json_objects(json.loads(document)))
        except (json.JSONDecodeError, TypeError):
            continue
    products = [node for node in nodes if has_type(node, "Product") or has_type(node, "ProductModel")]
    product = next((item for item in products if clean_text(item.get("name"))), products[0] if products else {})
    identity = {field: clean_text(product.get(field), 200) for field in IDENTITY_FIELDS}
    identity = {field: value for field, value in identity.items() if value}
    brand = clean_text(product.get("brand") or product.get("manufacturer"), 100)
    if brand:
        identity["brand"] = brand
    page_title = clean_text(
        identity.get("name")
        or parser.meta.get("og:title")
        or parser.meta.get("twitter:title")
        or " ".join(parser.h1_parts)
        or " ".join(parser.title_parts),
        240,
    )
    description = clean_text(product.get("description") or parser.meta.get("og:description") or parser.meta.get("description"))
    properties: list[dict[str, str]] = []
    additional = product.get("additionalProperty", []) if isinstance(product, dict) else []
    if isinstance(additional, dict):
        additional = [additional]
    if isinstance(additional, list):
        for prop in additional:
            if not isinstance(prop, dict):
                continue
            name, value = clean_text(prop.get("name") or prop.get("propertyID"), 120), clean_text(prop.get("value"), 240)
            if name and value and {"name": name, "value": value} not in properties:
                properties.append({"name": name, "value": value})
            if len(properties) >= property_limit:
                break
    canonical = urllib.parse.urljoin(page_url, parser.canonical) if parser.canonical else page_url
    if not trusted_domain(canonical, allowed_domains):
        canonical = page_url
    return {
        "pageTitle": page_title,
        "description": description,
        "canonicalUrl": canonical,
        "identity": identity,
        "properties": properties,
        "hasStructuredProduct": bool(product),
    }


def identity_score(candidate_label: str, page_title: str, brand: str) -> tuple[float, list[str]]:
    brand_tokens = set(normalize(brand).split())
    candidate_tokens = set(normalize(candidate_label).split()) - GENERIC_TOKENS - brand_tokens
    page_tokens = set(normalize(page_title).split()) - GENERIC_TOKENS - brand_tokens
    if not candidate_tokens or not page_tokens:
        return 0.0, []
    overlap = candidate_tokens & page_tokens
    dice = (2 * len(overlap)) / (len(candidate_tokens) + len(page_tokens))
    containment = len(overlap) / min(len(candidate_tokens), len(page_tokens))
    score = max(dice, containment)
    signals = sorted(overlap, key=lambda value: (-len(value), value))[:12]
    return round(score, 2), signals


def evidence_from_page(candidate: dict[str, Any], page: dict[str, Any], checked_at: str) -> dict[str, Any]:
    score, signals = identity_score(candidate["label"], page["pageTitle"], candidate["brand"])
    if page["hasStructuredProduct"]:
        status = "structured-product"
    elif page["pageTitle"] and score >= 0.35:
        status = "page-metadata"
    else:
        status = "insufficient-metadata"
    return {
        "candidateId": candidate["id"],
        "sourceId": candidate["sourceId"],
        "category": candidate["category"],
        "brand": candidate["brand"],
        "officialUrl": candidate["url"],
        "checkedAt": checked_at,
        "status": status,
        "identity": page["identity"],
        "page": {
            "title": page["pageTitle"],
            "description": page["description"],
            "canonicalUrl": page["canonicalUrl"],
        },
        "properties": page["properties"],
        "match": {"score": score, "signals": signals},
        "review": {
            "status": "pending",
            "reason": "Métadonnées collectées automatiquement ; identité, variante et caractéristiques à confirmer humainement.",
        },
    }


def request_bytes(url: str, user_agent: str, attempts: int = 2) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": user_agent, "Accept": "text/html,application/xhtml+xml", "Accept-Encoding": "gzip"})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                payload = response.read()
                return gzip.decompress(payload) if response.headers.get("Content-Encoding") == "gzip" else payload
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
            if attempt + 1 == attempts:
                raise
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError("unreachable")


def round_robin_candidates(candidates: list[dict[str, Any]], attempts_by_id: dict[str, int], limit: int) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        groups.setdefault(candidate["sourceId"], []).append(candidate)
    for group in groups.values():
        group.sort(key=lambda item: (attempts_by_id.get(item["id"], 0), item["id"]))
    selected: list[dict[str, Any]] = []
    source_ids = sorted(groups)
    while len(selected) < limit and any(groups.values()):
        for source_id in source_ids:
            if groups[source_id] and len(selected) < limit:
                selected.append(groups[source_id].pop(0))
    return selected


def collect_evidence(
    registry: dict[str, Any],
    candidates: list[dict[str, Any]],
    previous: dict[str, Any],
    run_date: str,
    limit: int,
    refresh: bool = False,
    requester: Callable[[str, str, int], bytes] = request_bytes,
    sleeper: Callable[[float], None] = time.sleep,
) -> tuple[dict[str, Any], list[str]]:
    policy = registry["policy"]
    sources = {
        source["id"]: source for source in registry["sources"]
        if source.get("enabled") and source.get("type") == "manufacturer-index"
    }
    manufacturer_domains = {
        brand: list(manufacturer.get("domains", []))
        for manufacturer in registry.get("manufacturerDomains", [])
        for brand in manufacturer.get("brands", [])
    }
    active = {
        candidate["id"]: candidate for candidate in candidates
        if candidate.get("sourceId") in sources
        and trusted_domain(candidate.get("url", ""), manufacturer_domains.get(candidate.get("brand"), []))
    }
    evidence = {item["candidateId"]: item for item in previous.get("evidence", []) if item.get("candidateId") in active}
    failures = {item["candidateId"]: item for item in previous.get("failures", []) if item.get("candidateId") in active}
    queue = [candidate for candidate_id, candidate in active.items() if refresh or candidate_id not in evidence]
    attempts_by_id = {candidate_id: int(item.get("attempts", 0)) for candidate_id, item in failures.items()}
    selected = round_robin_candidates(queue, attempts_by_id, limit)
    selected_by_source: dict[str, list[dict[str, Any]]] = {}
    for candidate in selected:
        selected_by_source.setdefault(candidate["sourceId"], []).append(candidate)
    errors: list[str] = []
    attempted = collected = 0
    delay = float(policy.get("minimumDelayMs", 1100)) / 1000
    property_limit = max(1, int(policy.get("manufacturerEvidencePropertyLimit", 50)))
    request_attempts = max(1, int(policy.get("retryAttempts", 2)))
    for source_id in sorted(selected_by_source):
        source = sources[source_id]
        allowed_domains = sorted({
            domain
            for candidate in selected_by_source[source_id]
            for domain in manufacturer_domains.get(candidate.get("brand"), [])
        })
        robots_allowed = True
        robots_url = source.get("robotsUrl")
        if robots_url:
            sleeper(delay)
            try:
                text = requester(robots_url, policy["userAgent"], request_attempts).decode("utf-8", errors="replace")
                robots = urllib.robotparser.RobotFileParser()
                robots.set_url(robots_url)
                robots.parse(text.splitlines())
                robots_allowed = all(robots.can_fetch(policy["userAgent"], candidate["url"]) for candidate in selected_by_source[source_id])
            except Exception as exc:
                robots_allowed = (
                    isinstance(exc, urllib.error.HTTPError)
                    and exc.code == 404
                    and source.get("allowMissingRobots") is True
                    and source.get("robotsUnavailableCheckedAt")
                )
            if not robots_allowed:
                errors.append(f"{source_id}:robots-blocked-or-unavailable")
                continue
        for candidate in selected_by_source[source_id]:
            attempted += 1
            sleeper(delay)
            try:
                raw = requester(candidate["url"], policy["userAgent"], request_attempts)
                page = parse_page(raw, candidate["url"], allowed_domains, property_limit)
                evidence[candidate["id"]] = evidence_from_page(candidate, page, run_date)
                failures.pop(candidate["id"], None)
                collected += 1
            except Exception as exc:
                old = failures.get(candidate["id"], {})
                failures[candidate["id"]] = {
                    "candidateId": candidate["id"],
                    "sourceId": candidate["sourceId"],
                    "officialUrl": candidate["url"],
                    "attempts": int(old.get("attempts", 0)) + 1,
                    "lastAttemptAt": run_date,
                    "error": type(exc).__name__,
                }
                errors.append(f"{candidate['id']}:{type(exc).__name__}")
    ordered_evidence = sorted(evidence.values(), key=lambda item: item["candidateId"])
    ordered_failures = sorted(failures.values(), key=lambda item: item["candidateId"])
    statuses = {status: sum(item["status"] == status for item in ordered_evidence) for status in sorted(EVIDENCE_STATUSES)}
    output = {
        "version": 1,
        "generatedAt": run_date,
        "summary": {
            "officialCandidates": len(active),
            "collected": len(ordered_evidence),
            "remaining": len(active) - len(ordered_evidence),
            "failures": len(ordered_failures),
            "byStatus": statuses,
        },
        "lastRun": {"attempted": attempted, "collected": collected, "limit": limit, "errors": errors},
        "evidence": ordered_evidence,
        "failures": ordered_failures,
    }
    return output, errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Collecter des preuves structurées depuis les fiches constructeur")
    parser.add_argument("--registry", type=Path, default=ROOT / "src/catalog/source-registry.json")
    parser.add_argument("--input", type=Path, default=ROOT / "src/catalog/discovery.generated.json")
    parser.add_argument("--output", type=Path, default=ROOT / "src/catalog/manufacturer-evidence.generated.json")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    registry = load_json(args.registry)
    registry["manufacturerDomains"] = load_json(ROOT / "src/catalog/manufacturer-registry.json").get("manufacturers", [])
    feed = load_json(args.input)
    previous = load_json(args.output) if args.output.exists() else {"evidence": [], "failures": []}
    budget = max(1, int(registry["policy"].get("manufacturerEvidencePageBudget", 20)))
    limit = min(budget, max(1, args.limit if args.limit is not None else budget))
    output, errors = collect_evidence(registry, feed.get("candidates", []), previous, date.today().isoformat(), limit, args.refresh)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"summary": output["summary"], "lastRun": output["lastRun"]}, ensure_ascii=False))
    return 2 if errors and not output["lastRun"]["collected"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
