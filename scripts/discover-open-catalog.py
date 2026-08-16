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
import urllib.robotparser
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable

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


class LinkCollector(HTMLParser):
    """Collect links and their visible/alternative labels from an index page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.current_href: str | None = None
        self.current_text: list[str] = []
        self.current_heading: list[str] = []
        self.in_heading = False
        self.links: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "a" and values.get("href") and self.current_href is None:
            self.current_href = str(values["href"])
            self.current_text = []
            self.current_heading = []
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"} and self.current_href:
            self.in_heading = True
        elif tag == "img" and self.current_href and values.get("alt"):
            self.current_text.append(str(values["alt"]))

    def handle_data(self, data: str) -> None:
        if self.current_href:
            self.current_text.append(data)
            if self.in_heading:
                self.current_heading.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.current_href:
            label = self.current_heading if any(part.strip() for part in self.current_heading) else self.current_text
            self.links.append((self.current_href, " ".join(label)))
            self.current_href = None
            self.current_text = []
            self.current_heading = []
            self.in_heading = False
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.in_heading = False


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    plain = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return " ".join(re.findall(r"[a-z0-9]+", plain.lower()))


def candidate_key(source_id: str, external_id: str, category: str) -> str:
    raw = f"{source_id}:{external_id}:{category}"
    return f"candidate-{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:16]}"


def trusted_domain(url: str, allowed_domains: list[str]) -> bool:
    hostname = (urllib.parse.urlparse(url).hostname or "").lower()
    return any(hostname == domain.lower() or hostname.endswith(f".{domain.lower()}") for domain in allowed_domains)


def clean_index_label(value: str, url: str, path_segment: int = -1) -> str:
    label = " ".join(value.split())
    label = re.sub(r"\b(Learn more|Where to buy|Buy now|Compare|See more|See less|Explore)\b", " ", label, flags=re.I)
    label = " ".join(label.split()).strip(" -|·")
    if len(label) >= 3 and label.lower() not in {"product", "products", "image", "all"}:
        return label
    segments = [urllib.parse.unquote(part) for part in urllib.parse.urlparse(url).path.split("/") if part]
    if not segments:
        return ""
    try:
        slug = segments[path_segment]
    except IndexError:
        slug = segments[-1]
    slug = re.sub(r"\.(?:s?html?|php)$", "", slug, flags=re.I)
    return " ".join(slug.replace("_", "-").split("-")).strip()


def extract_index_links(html: str, base_url: str, path_segment: int = -1) -> list[dict[str, str]]:
    parser = LinkCollector()
    parser.feed(html)
    links: dict[str, str] = {}
    for href, raw_label in parser.links:
        absolute = urllib.parse.urljoin(base_url, href)
        parsed = urllib.parse.urlparse(absolute)
        if parsed.scheme != "https":
            continue
        canonical = urllib.parse.urlunparse((parsed.scheme, parsed.netloc.lower(), parsed.path, "", "", ""))
        label = clean_index_label(raw_label, canonical, path_segment)
        if label and (canonical not in links or len(label) > len(links[canonical])):
            links[canonical] = label
    return [{"url": url, "label": label} for url, label in links.items()]


def extract_sitemap_links(xml: str, path_segment: int = -1) -> list[dict[str, str]]:
    """Extract canonical HTTPS URLs from a sitemap, regardless of its XML namespace."""
    root = ET.fromstring(xml)
    links: dict[str, str] = {}
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] != "loc" or not element.text:
            continue
        parsed = urllib.parse.urlparse(element.text.strip())
        if parsed.scheme != "https":
            continue
        canonical = urllib.parse.urlunparse((parsed.scheme, parsed.netloc.lower(), parsed.path, "", "", ""))
        label = clean_index_label("", canonical, path_segment)
        if label:
            links[canonical] = label
    return [{"url": url, "label": label} for url, label in links.items()]


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
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            if attempt + 1 == attempts:
                raise
            retry_after = 0.0
            if isinstance(exc, urllib.error.HTTPError):
                try:
                    retry_after = float(exc.headers.get("Retry-After", "0"))
                except (TypeError, ValueError):
                    retry_after = 0.0
            time.sleep(max(retry_after, 2 ** attempt * 2))
    raise RuntimeError("unreachable")


def request_json(
    url: str,
    user_agent: str,
    attempts: int,
    requester: Callable[[str, str, int], bytes] = request_bytes,
    sleeper: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """Read JSON and retry API-level throttling responses such as maxlag."""
    for attempt in range(attempts):
        try:
            payload = json.loads(requester(url, user_agent, 1).decode("utf-8"))
            error = payload.get("error")
            if error:
                raise RuntimeError(f"wikidata:{error.get('code', 'api-error')}")
            return payload
        except (json.JSONDecodeError, OSError, RuntimeError, TimeoutError) as exc:
            if attempt + 1 == attempts:
                raise
            retry_after = 0.0
            if isinstance(exc, urllib.error.HTTPError):
                try:
                    retry_after = float(exc.headers.get("Retry-After", "0"))
                except (TypeError, ValueError):
                    retry_after = 0.0
            sleeper(max(retry_after, 2 ** attempt * 2))
    raise RuntimeError("unreachable")


def confidence(score: float) -> str:
    return "Moyenne" if score >= 0.72 else "Faible"


def wikidata_candidates(
    registry: dict[str, Any],
    known: set[str],
    run_date: str,
    requester: Callable[[str, str, int], bytes] = request_bytes,
    sleeper: Callable[[float], None] = time.sleep,
) -> tuple[list[dict[str, Any]], list[str], dict[str, Any]]:
    source = next(item for item in registry["sources"] if item["id"] == "wikidata")
    policy = registry["policy"]
    delay = policy["minimumDelayMs"] / 1000
    page_size = min(50, max(1, int(policy.get("wikidataPageSize", 50))))
    max_pages = max(1, int(policy.get("wikidataMaxPagesPerQuery", 1)))
    request_budget = max(1, int(policy.get("requestBudget", len(registry["queries"]) * max_pages)))
    attempts = max(1, int(policy.get("retryAttempts", 3)))
    max_lag = max(1, int(policy.get("maxLagSeconds", 5)))
    found: list[dict[str, Any]] = []
    errors: list[str] = []
    metrics: dict[str, Any] = {
        "queriesAttempted": 0,
        "queriesCompleted": 0,
        "pagesRequested": 0,
        "requestsSucceeded": 0,
        "budgetExhausted": False,
    }
    request_count = 0
    for query in registry["queries"]:
        if query["category"] not in VALID_CATEGORIES:
            continue
        if metrics["pagesRequested"] >= request_budget:
            metrics["budgetExhausted"] = True
            if "wikidata:request-budget-exhausted" not in errors:
                errors.append("wikidata:request-budget-exhausted")
            break
        metrics["queriesAttempted"] += 1
        brand_tokens = set(normalize(query["brand"]).split())
        query_tokens = set(normalize(query["query"]).split())
        continuation: int | None = None
        query_failed = False
        for _page_number in range(max_pages):
            if metrics["pagesRequested"] >= request_budget:
                metrics["budgetExhausted"] = True
                if "wikidata:request-budget-exhausted" not in errors:
                    errors.append("wikidata:request-budget-exhausted")
                query_failed = True
                break
            if request_count:
                sleeper(delay)
            params_values: dict[str, str] = {
                "action": "wbsearchentities", "search": query["query"], "language": "en", "uselang": "fr",
                "type": "item", "limit": str(page_size), "format": "json", "formatversion": "2",
                "maxlag": str(max_lag),
            }
            if continuation is not None:
                params_values["continue"] = str(continuation)
            params = urllib.parse.urlencode(params_values)
            metrics["pagesRequested"] += 1
            request_count += 1
            try:
                payload = request_json(
                    f"{source['url']}?{params}", policy["userAgent"], attempts, requester, sleeper
                )
                metrics["requestsSucceeded"] += 1
            except Exception as exc:  # continue other brands when a public endpoint throttles
                errors.append(f"wikidata:{query['category']}:{query['brand']}:{type(exc).__name__}")
                query_failed = True
                break
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
            next_page = payload.get("search-continue")
            if next_page is None:
                break
            continuation = int(next_page)
        if not query_failed:
            metrics["queriesCompleted"] += 1
    return found, errors, metrics


def manufacturer_index_candidates(
    registry: dict[str, Any],
    known: set[str],
    run_date: str,
    requester: Callable[[str, str, int], bytes] = request_bytes,
    sleeper: Callable[[float], None] = time.sleep,
) -> tuple[list[dict[str, Any]], list[str], dict[str, Any]]:
    """Discover candidate names and URLs from explicitly allowlisted official indexes."""
    policy = registry["policy"]
    delay = policy["minimumDelayMs"] / 1000
    page_budget = max(1, int(policy.get("manufacturerIndexPageBudget", 20)))
    candidate_limit = max(1, int(policy.get("manufacturerIndexCandidateLimit", 500)))
    attempts = max(1, int(policy.get("retryAttempts", 3)))
    sources = {source["id"]: source for source in registry["sources"] if source.get("enabled")}
    found: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    metrics: dict[str, Any] = {
        "manufacturerIndexesAttempted": 0,
        "manufacturerIndexesCompleted": 0,
        "manufacturerPagesRequested": 0,
        "manufacturerRequestsSucceeded": 0,
        "manufacturerRobotsRequested": 0,
        "manufacturerRobotsSucceeded": 0,
        "manufacturerBudgetExhausted": False,
    }
    for index in registry.get("manufacturerIndexes", []):
        if len(found) >= candidate_limit or metrics["manufacturerPagesRequested"] >= page_budget:
            metrics["manufacturerBudgetExhausted"] = True
            break
        source = sources.get(index["sourceId"])
        if not source or index.get("category") not in VALID_CATEGORIES:
            errors.append(f"manufacturer-index:{index.get('id', 'unknown')}:disabled-or-invalid")
            continue
        allowed_domains = list(index.get("allowedDomains", []))
        if not trusted_domain(source["url"], allowed_domains):
            errors.append(f"manufacturer-index:{index['id']}:untrusted-index-url")
            continue
        product_patterns = [re.compile(pattern, re.I) for pattern in index.get("productUrlPatterns", [])]
        follow_patterns = [re.compile(pattern, re.I) for pattern in index.get("followUrlPatterns", [])]
        label_patterns = [re.compile(pattern, re.I) for pattern in index.get("labelPatterns", [])]
        max_candidates = max(1, int(index.get("maxCandidates", 100)))
        max_follow_pages = max(0, int(index.get("maxFollowPages", 0)))
        path_segment = int(index.get("labelFromPathSegment", -1))
        index_format = index.get("format", "html")
        queue = [source["url"]]
        queued = {source["url"]}
        visited: set[str] = set()
        index_found = 0
        index_failed = False
        metrics["manufacturerIndexesAttempted"] += 1
        robots_url = source.get("robotsUrl")
        if robots_url:
            sleeper(delay)
            metrics["manufacturerRobotsRequested"] += 1
            try:
                robots_text = requester(robots_url, policy["userAgent"], attempts).decode("utf-8", errors="replace")
                robots = urllib.robotparser.RobotFileParser()
                robots.set_url(robots_url)
                robots.parse(robots_text.splitlines())
                metrics["manufacturerRobotsSucceeded"] += 1
                if not robots.can_fetch(policy["userAgent"], source["url"]):
                    errors.append(f"manufacturer-index:{index['id']}:robots-disallowed")
                    continue
            except Exception as exc:
                missing_allowed = (
                    isinstance(exc, urllib.error.HTTPError)
                    and exc.code == 404
                    and source.get("allowMissingRobots") is True
                    and source.get("robotsUnavailableCheckedAt")
                )
                if not missing_allowed:
                    errors.append(f"manufacturer-index:{index['id']}:robots-{type(exc).__name__}")
                    continue
        while queue and index_found < max_candidates and len(found) < candidate_limit:
            if metrics["manufacturerPagesRequested"] >= page_budget:
                metrics["manufacturerBudgetExhausted"] = True
                index_failed = True
                break
            page_url = queue.pop(0)
            if page_url in visited:
                continue
            visited.add(page_url)
            sleeper(delay)
            metrics["manufacturerPagesRequested"] += 1
            try:
                raw = requester(page_url, policy["userAgent"], attempts)
                document = raw.decode("utf-8", errors="replace")
                metrics["manufacturerRequestsSucceeded"] += 1
            except Exception as exc:
                errors.append(f"manufacturer-index:{index['id']}:{type(exc).__name__}")
                index_failed = True
                continue
            try:
                links = (
                    extract_sitemap_links(document, path_segment)
                    if index_format == "sitemap"
                    else extract_index_links(document, page_url, path_segment)
                )
            except ET.ParseError:
                errors.append(f"manufacturer-index:{index['id']}:invalid-sitemap")
                index_failed = True
                continue
            for link in links:
                parsed = urllib.parse.urlparse(link["url"])
                if not trusted_domain(link["url"], allowed_domains):
                    continue
                path = parsed.path
                is_product = any(pattern.search(path) for pattern in product_patterns)
                if is_product and (not label_patterns or any(pattern.search(link["label"]) for pattern in label_patterns)):
                    external_id = link["url"]
                    candidate_id = candidate_key(index["sourceId"], external_id, index["category"])
                    if candidate_id not in found:
                        label = link["label"]
                        if not normalize(label).startswith(normalize(index["brand"])):
                            label = f"{index['brand']} {label}"
                        found[candidate_id] = {
                            "id": candidate_id,
                            "sourceId": index["sourceId"],
                            "externalId": external_id,
                            "kind": "product-candidate",
                            "label": label,
                            "description": f"Référence repérée dans l’index officiel {index['brand']}; caractéristiques à contrôler sur la fiche constructeur.",
                            "url": external_id,
                            "brand": index["brand"],
                            "category": index["category"],
                            "query": index["id"],
                            "confidence": "Moyenne",
                            "score": 0.9,
                            "duplicate": normalize(label) in known,
                            "status": "À vérifier",
                            "firstSeenAt": run_date,
                        }
                        index_found += 1
                        if index_found >= max_candidates or len(found) >= candidate_limit:
                            break
                elif (
                    len(queued) - 1 < max_follow_pages
                    and any(pattern.search(path) for pattern in follow_patterns)
                    and link["url"] not in queued
                ):
                    queued.add(link["url"])
                    queue.append(link["url"])
        if not index_failed:
            metrics["manufacturerIndexesCompleted"] += 1
    return list(found.values()), errors, metrics


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


def build_coverage_report(
    registry: dict[str, Any],
    product_candidates: list[dict[str, Any]],
    hardware_identifiers: list[dict[str, Any]],
    rejected_candidates: list[dict[str, Any]],
    run_date: str,
    network_run: bool,
    metrics: dict[str, Any],
    errors: list[str],
    previous_report: dict[str, Any] | None = None,
) -> dict[str, Any]:
    all_candidates = [*product_candidates, *hardware_identifiers, *rejected_candidates]
    official_source_ids = {
        source["id"] for source in registry["sources"]
        if source.get("enabled") and source.get("type") == "manufacturer-index"
    }
    coverage: list[dict[str, Any]] = []
    for category in sorted(VALID_CATEGORIES):
        queries = [query for query in registry["queries"] if query["category"] == category]
        category_products = [item for item in product_candidates if item["category"] == category]
        category_identifiers = [item for item in hardware_identifiers if item["category"] == category]
        category_rejected = [item for item in rejected_candidates if item["category"] == category]
        observed_brands = sorted({item["brand"] for item in all_candidates if item["category"] == category})
        coverage.append({
            "category": category,
            "registeredBrands": sorted({query["brand"] for query in queries}),
            "observedBrands": observed_brands,
            "candidates": len(category_products),
            "officialCandidates": sum(item.get("sourceId") in official_source_ids for item in category_products),
            "promotable": sum(bool(item.get("promotable")) for item in category_products),
            "hardwareIdentifiers": len(category_identifiers),
            "rejected": len(category_rejected),
        })
    if network_run:
        successful = int(metrics.get("requestsSucceeded", 0))
        collection = {
            "date": run_date,
            "status": "success" if not errors else "partial" if successful else "failed",
            **metrics,
            "errors": errors,
        }
    else:
        collection = (previous_report or {}).get("collection", {
            "date": None,
            "status": "not-run",
            "queriesAttempted": 0,
            "queriesCompleted": 0,
            "pagesRequested": 0,
            "requestsSucceeded": 0,
            "budgetExhausted": False,
            "errors": [],
        })
    policy = registry["policy"]
    return {
        "version": 1,
        "generatedAt": run_date,
        "collection": collection,
        "policy": {
            "publishAutomatically": policy["publishAutomatically"],
            "minimumDelayMs": policy["minimumDelayMs"],
            "pageSize": policy.get("wikidataPageSize", 10),
            "maxPagesPerQuery": policy.get("wikidataMaxPagesPerQuery", 1),
            "requestBudget": policy.get("requestBudget", len(registry["queries"])),
            "manufacturerIndexPageBudget": policy.get("manufacturerIndexPageBudget", 20),
            "manufacturerIndexCandidateLimit": policy.get("manufacturerIndexCandidateLimit", 500),
            "manufacturerEvidencePageBudget": policy.get("manufacturerEvidencePageBudget", 20),
            "manufacturerEvidencePropertyLimit": policy.get("manufacturerEvidencePropertyLimit", 50),
        },
        "totals": {
            "registeredQueries": len(registry["queries"]),
            "registeredBrands": len({query["brand"] for query in registry["queries"]}),
            "registeredCategories": len({query["category"] for query in registry["queries"]}),
            "categoriesWithCandidates": sum(
                any(item["category"] == category for item in all_candidates) for category in VALID_CATEGORIES
            ),
            "candidates": len(product_candidates),
            "officialCandidates": sum(item.get("sourceId") in official_source_ids for item in product_candidates),
            "hardwareIdentifiers": len(hardware_identifiers),
            "rejected": len(rejected_candidates),
        },
        "coverage": coverage,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", type=Path, default=ROOT / "src/catalog/source-registry.json")
    parser.add_argument("--output", type=Path, default=ROOT / "src/catalog/discovery.generated.json")
    parser.add_argument("--documentary", type=Path, default=ROOT / "src/catalog/documentary.generated.json")
    parser.add_argument("--promoted", type=Path, default=ROOT / "src/catalog/promoted.generated.json")
    parser.add_argument("--data", type=Path, default=ROOT / "src/data.ts")
    parser.add_argument("--hardware-output", type=Path, default=ROOT / "src/catalog/hardware-identifiers.generated.json")
    parser.add_argument("--rejected-output", type=Path, default=ROOT / "src/catalog/rejected.generated.json")
    parser.add_argument("--report-output", type=Path, default=ROOT / "src/catalog/discovery-report.generated.json")
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
    metrics: dict[str, Any] = {}
    if not args.offline:
        wiki, wiki_errors, metrics = wikidata_candidates(registry, known, run_date)
        official, official_errors, official_metrics = manufacturer_index_candidates(registry, known, run_date)
        pci, pci_errors = pci_candidates(registry, known, run_date)
        metrics.update(official_metrics)
        discovered.extend(wiki + official + pci)
        errors.extend(wiki_errors + official_errors + pci_errors)
    enabled_source_ids = {source["id"] for source in registry["sources"] if source.get("enabled")}
    previous = [
        candidate
        for candidate in previous_feed.get("candidates", []) + previous_hardware.get("identifiers", []) + previous_rejected.get("candidates", [])
        if candidate.get("sourceId") in enabled_source_ids
    ]
    candidates = [triage(candidate) for candidate in merge_candidates(previous, discovered, int(registry["policy"]["candidateLimit"]))]
    product_candidates = [candidate for candidate in candidates if candidate["triage"] not in {"hardware-identifier", "false-positive"} and candidate["id"] not in promoted_candidate_ids]
    hardware_identifiers = [candidate for candidate in candidates if candidate["triage"] == "hardware-identifier"]
    rejected_candidates = [candidate for candidate in candidates if candidate["triage"] == "false-positive"]
    payload = {"version": 2, "candidates": product_candidates}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.hardware_output.write_text(json.dumps({"version": 1, "identifiers": hardware_identifiers}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.rejected_output.write_text(json.dumps({"version": 1, "candidates": rejected_candidates}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    previous_report = load_json(args.report_output) if args.report_output.exists() else None
    report = build_coverage_report(
        registry, product_candidates, hardware_identifiers, rejected_candidates, run_date,
        not args.offline, metrics, errors, previous_report,
    )
    args.report_output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts: dict[str, int] = {}
    for candidate in candidates:
        counts[candidate["triage"]] = counts.get(candidate["triage"], 0) + 1
    print(json.dumps({"existingProducts": len(known), "newObservations": len(discovered), "activeCandidates": len(product_candidates), "hardwareIdentifiers": len(hardware_identifiers), "rejected": len(rejected_candidates), "coverage": report["totals"], "collection": report["collection"], "triage": counts, "errors": errors}, ensure_ascii=False))
    return 0 if not errors or discovered else 2


if __name__ == "__main__":
    raise SystemExit(main())
