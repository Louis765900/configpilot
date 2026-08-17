#!/usr/bin/env python3
"""Collect and normalize bounded manufacturer specifications for human review.

The collector reads the pages already qualified by the manufacturer evidence pass,
stores the raw published rows exactly as found, then adds a normalized value for the
fields ConfigPilot understands. It never verifies, never promotes and never writes to
candidate-verification.generated.json. Only the Python standard library is used.
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import spec_normalization as normalization  # noqa: E402

REVIEW_REASON = (
    "Caractéristiques extraites automatiquement des pages officielles : valeurs brutes conservées, "
    "valeurs normalisées à relire. Une caractéristique absente reste inconnue et ne vaut pas une réponse négative."
)
RAW_VALUE_LIMIT = 400
RAW_NAME_LIMIT = 80


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def clean_cell(text: str) -> str:
    value = " ".join(text.split())
    return re.sub(r"(?:\s*,\s*)+", ", ", value).strip(" ,;:·")


def trusted_domain(url: str, allowed_domains: list[str]) -> bool:
    hostname = (urllib.parse.urlparse(url).hostname or "").lower()
    return any(hostname == domain.lower() or hostname.endswith(f".{domain.lower()}") for domain in allowed_domains)


class SpecificationHTMLParser(HTMLParser):
    """Read specification tables, definition lists, labelled spec lists and JSON-LD.

    The reader stays layout agnostic: it only pairs a published label with the value
    printed next to it. Tables that describe several references at once are skipped
    instead of picking one of their rows.
    """

    SKIPPED = {"style", "noscript", "template", "svg"}
    CELL_TAGS = {"td", "th", "dt", "dd"}
    LABEL_CLASS = re.compile(r"(?:^|[\s_-])label(?:[\s_-]|$)")
    VALUE_CLASS = re.compile(r"(?:^|[\s_-])value(?:[\s_-]|$)")

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.rows: list[dict[str, str]] = []
        self.meta: dict[str, str] = {}
        self.json_ld: list[str] = []
        self.skippedTables = 0
        self._json: list[str] | None = None
        self._skip = 0
        self._buffer: list[str] | None = None
        self._kind: str | None = None
        self._tag: str | None = None
        self._depth = 0
        self._tables: list[list[dict[str, Any]]] = []
        self._lists: list[list[tuple[str, str]]] = []
        self._thead = 0
        self._term = ""
        self._label = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value for key, value in attrs}
        if tag == "script":
            if "ld+json" in str(values.get("type", "")).lower():
                self._json = []
            else:
                self._skip += 1
            return
        if tag in self.SKIPPED:
            self._skip += 1
            return
        if self._skip:
            return
        if tag == "meta":
            key = values.get("property") or values.get("name")
            content = values.get("content")
            if key and content:
                self.meta[str(key).lower()] = clean_cell(str(content))
            return
        if self._tag == tag and self._buffer is not None:
            self._depth += 1
            return
        if tag == "table":
            self._tables.append([])
            return
        if tag == "thead":
            self._thead += 1
            return
        if tag == "dl":
            self._lists.append([])
            return
        if tag == "tr" and self._tables:
            self._tables[-1].append({"cells": [], "headings": 0, "head": self._thead > 0})
            return
        if self._buffer is None:
            kind = tag if tag in self.CELL_TAGS else self._class_kind(values.get("class", ""))
            if kind:
                self._kind, self._tag, self._buffer, self._depth = kind, tag, [], 1
                return
        if tag in {"br", "li"} and self._buffer is not None:
            self._buffer.append(", ")

    def _class_kind(self, classes: str | None) -> str | None:
        names = str(classes or "").lower()
        if self.LABEL_CLASS.search(names):
            return "label"
        return "value" if self.VALUE_CLASS.search(names) else None

    def handle_data(self, data: str) -> None:
        if self._json is not None:
            self._json.append(data)
        elif not self._skip and self._buffer is not None:
            self._buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            if self._json is not None:
                self.json_ld.append("".join(self._json))
                self._json = None
            else:
                self._skip = max(0, self._skip - 1)
            return
        if tag in self.SKIPPED:
            self._skip = max(0, self._skip - 1)
            return
        if self._skip:
            return
        if tag == self._tag and self._buffer is not None:
            self._depth -= 1
            if self._depth > 0:
                return
            kind, text = self._kind, clean_cell("".join(self._buffer))
            self._buffer, self._kind, self._tag = None, None, None
            self._close_value(kind or "", text)
            return
        if tag == "table" and self._tables:
            self._flush_table(self._tables.pop())
        elif tag == "thead":
            self._thead = max(0, self._thead - 1)
        elif tag == "dl" and self._lists:
            self._flush_list(self._lists.pop())

    def _close_value(self, kind: str, text: str) -> None:
        if kind in {"td", "th"} and self._tables and self._tables[-1]:
            row = self._tables[-1][-1]
            row["cells"].append(text)
            row["headings"] += kind == "th"
        elif kind == "dt":
            self._term = text
        elif kind == "dd":
            if self._lists and self._term:
                self._lists[-1].append((self._term, text))
            self._term = ""
        elif kind == "label":
            self._label = text
        elif kind == "value":
            if self._label:
                self._append_row(self._label, text, "spec-list")
            self._label = ""

    def _flush_table(self, rows: list[dict[str, Any]]) -> None:
        filled = [row for row in rows if any(cell for cell in row["cells"])]
        headings = [
            row for row in filled
            if row["head"] or (row["headings"] == len(row["cells"]) and len(row["cells"]) >= 2)
        ]
        data = [row for row in filled if row not in headings]
        columns = max((len(row["cells"]) for row in headings), default=0)
        if columns < 3:
            for row in data:
                if len(row["cells"]) == 2:
                    self._append_row(row["cells"][0], row["cells"][1], "spec-table")
            return
        # A table that lists several references at once must never be reduced to one of them.
        if len(data) == 1 and len(data[0]["cells"]) == columns:
            for name, value in zip(headings[0]["cells"], data[0]["cells"]):
                self._append_row(name, value, "spec-table")
        else:
            self.skippedTables += 1

    def _flush_list(self, pairs: list[tuple[str, str]]) -> None:
        # Navigation lists reuse <dl>; a specification block always publishes at least one figure.
        if not any(re.search(r"\d", value) for _term, value in pairs):
            return
        for term, value in pairs:
            self._append_row(term, value, "definition-list")

    def _append_row(self, name: str, value: str, method: str) -> None:
        name, value = clean_cell(name), clean_cell(value)
        if not name or not value or name == value:
            return
        if len(name) > RAW_NAME_LIMIT or len(value) > RAW_VALUE_LIMIT or not re.search(r"[a-zA-Z]", name):
            return
        self.rows.append({"field": name, "value": value, "method": method})


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


def structured_rows(documents: list[str]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for document in documents:
        try:
            nodes = json_objects(json.loads(document))
        except (json.JSONDecodeError, TypeError):
            continue
        for node in nodes:
            properties = node.get("additionalProperty")
            if isinstance(properties, dict):
                properties = [properties]
            if not isinstance(properties, list):
                continue
            for entry in properties:
                if not isinstance(entry, dict):
                    continue
                name = clean_cell(str(entry.get("name") or entry.get("propertyID") or ""))
                value = entry.get("value")
                if isinstance(value, dict):
                    value = value.get("name") or value.get("value") or ""
                if isinstance(value, list):
                    value = ", ".join(str(item) for item in value if item)
                value = clean_cell(str(value if value is not None else ""))
                if name and value and len(name) <= RAW_NAME_LIMIT and len(value) <= RAW_VALUE_LIMIT:
                    rows.append({"field": name, "value": value, "method": "json-ld"})
    return rows


def extract_raw_fields(raw: bytes, field_limit: int) -> list[dict[str, str]]:
    parser = SpecificationHTMLParser()
    parser.feed(raw.decode("utf-8", errors="replace"))
    rows = [*structured_rows(parser.json_ld), *parser.rows]
    description = parser.meta.get("og:description") or parser.meta.get("description")
    if description:
        rows.append({"field": "og:description", "value": description[:RAW_VALUE_LIMIT], "method": "meta"})
    unique: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for row in rows:
        key = (row["method"], row["field"].lower(), row["value"].lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
        if len(unique) >= field_limit:
            break
    return unique


def build_record(candidate: dict[str, Any], raw_fields: list[dict[str, str]], collected_at: str) -> dict[str, Any]:
    category = candidate["category"]
    specs = normalization.normalize_specs(category, raw_fields, candidate["url"], collected_at)
    return {
        "candidateId": candidate["id"],
        "sourceId": candidate["sourceId"],
        "category": category,
        "brand": candidate["brand"],
        "officialUrl": candidate["url"],
        "collectedAt": collected_at,
        "coverage": {"rawFields": len(raw_fields), "normalized": len(specs)},
        "rawFields": raw_fields,
        "specs": specs,
        "missingFields": normalization.missing_fields(category, specs),
        "review": {"status": "pending", "reason": REVIEW_REASON},
    }


def request_bytes(url: str, user_agent: str, attempts: int = 2) -> bytes:
    request = urllib.request.Request(url, headers={
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Encoding": "gzip",
    })
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


def summarize(records: list[dict[str, Any]], eligible: int, failures: int) -> dict[str, Any]:
    by_category = {
        category: {
            "records": sum(record["category"] == category for record in records),
            "normalizedValues": sum(len(record["specs"]) for record in records if record["category"] == category),
        }
        for category in normalization.SUPPORTED_CATEGORIES
    }
    by_confidence = {
        level: sum(spec["confidence"] == level for record in records for spec in record["specs"])
        for level in normalization.CONFIDENCES
    }
    return {
        "eligibleCandidates": eligible,
        "collected": len(records),
        "remaining": eligible - len(records),
        "failures": failures,
        "rawValues": sum(record["coverage"]["rawFields"] for record in records),
        "normalizedValues": sum(record["coverage"]["normalized"] for record in records),
        "byCategory": by_category,
        "byConfidence": by_confidence,
    }


def eligible_candidates(
    registry: dict[str, Any],
    candidates: list[dict[str, Any]],
    evidence: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    sources = {
        source["id"] for source in registry["sources"]
        if source.get("enabled") and source.get("type") == "manufacturer-index"
    }
    manufacturer_domains = {
        brand: list(manufacturer.get("domains", []))
        for manufacturer in registry.get("manufacturerDomains", [])
        for brand in manufacturer.get("brands", [])
    }
    reachable = {
        item["candidateId"] for item in evidence.get("evidence", [])
        if item.get("status") in {"structured-product", "page-metadata"}
    }
    return {
        candidate["id"]: candidate for candidate in candidates
        if candidate.get("id") in reachable
        and candidate.get("sourceId") in sources
        and candidate.get("category") in normalization.SUPPORTED_CATEGORIES
        and trusted_domain(candidate.get("url", ""), manufacturer_domains.get(candidate.get("brand"), []))
    }


def collect_specs(
    registry: dict[str, Any],
    candidates: list[dict[str, Any]],
    evidence: dict[str, Any],
    previous: dict[str, Any],
    run_date: str,
    limit: int,
    refresh: bool = False,
    offline: bool = False,
    requester: Callable[[str, str, int], bytes] = request_bytes,
    sleeper: Callable[[float], None] = time.sleep,
) -> tuple[dict[str, Any], list[str]]:
    policy = registry["policy"]
    sources = {source["id"]: source for source in registry["sources"] if source.get("enabled")}
    active = eligible_candidates(registry, candidates, evidence)
    field_limit = max(1, int(policy.get("manufacturerSpecFieldLimit", 80)))
    records = {
        item["candidateId"]: build_record(active[item["candidateId"]], item.get("rawFields", []), item.get("collectedAt", run_date))
        for item in previous.get("records", []) if item.get("candidateId") in active
    }
    failures = {item["candidateId"]: item for item in previous.get("failures", []) if item.get("candidateId") in active}
    errors: list[str] = []
    attempted = collected = 0
    if not offline:
        queue = [candidate for candidate_id, candidate in active.items() if refresh or candidate_id not in records]
        attempts_by_id = {candidate_id: int(item.get("attempts", 0)) for candidate_id, item in failures.items()}
        selected_by_source: dict[str, list[dict[str, Any]]] = {}
        for candidate in round_robin_candidates(queue, attempts_by_id, limit):
            selected_by_source.setdefault(candidate["sourceId"], []).append(candidate)
        delay = float(policy.get("minimumDelayMs", 1100)) / 1000
        request_attempts = max(1, int(policy.get("retryAttempts", 2)))
        for source_id in sorted(selected_by_source):
            source = sources[source_id]
            robots_url = source.get("robotsUrl")
            if robots_url:
                sleeper(delay)
                try:
                    text = requester(robots_url, policy["userAgent"], request_attempts).decode("utf-8", errors="replace")
                    robots = urllib.robotparser.RobotFileParser()
                    robots.set_url(robots_url)
                    robots.parse(text.splitlines())
                    allowed = all(
                        robots.can_fetch(policy["userAgent"], candidate["url"])
                        for candidate in selected_by_source[source_id]
                    )
                except Exception as exc:
                    allowed = bool(
                        isinstance(exc, urllib.error.HTTPError)
                        and exc.code == 404
                        and source.get("allowMissingRobots") is True
                        and source.get("robotsUnavailableCheckedAt")
                    )
                if not allowed:
                    errors.append(f"{source_id}:robots-blocked-or-unavailable")
                    continue
            for candidate in selected_by_source[source_id]:
                attempted += 1
                sleeper(delay)
                try:
                    raw = requester(candidate["url"], policy["userAgent"], request_attempts)
                    records[candidate["id"]] = build_record(candidate, extract_raw_fields(raw, field_limit), run_date)
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
    ordered_records = sorted(records.values(), key=lambda item: item["candidateId"])
    ordered_failures = sorted(failures.values(), key=lambda item: item["candidateId"])
    fresh = [record for record in ordered_records if record["collectedAt"] == run_date] if not offline else []
    output = {
        "version": 1,
        "generatedAt": run_date,
        "policy": {
            "pageBudget": int(policy.get("manufacturerSpecPageBudget", 20)),
            "fieldLimit": field_limit,
            "categories": list(normalization.SUPPORTED_CATEGORIES),
            "publishAutomatically": False,
        },
        "summary": summarize(ordered_records, len(active), len(ordered_failures)),
        "lastRun": {
            "attempted": attempted,
            "collected": collected,
            "limit": 0 if offline else limit,
            "mode": "offline" if offline else "network",
            "rawValues": sum(record["coverage"]["rawFields"] for record in fresh),
            "normalizedValues": sum(record["coverage"]["normalized"] for record in fresh),
            "errors": errors,
        },
        "records": ordered_records,
        "failures": ordered_failures,
    }
    return output, errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Normaliser les caractéristiques publiées par les constructeurs")
    parser.add_argument("--registry", type=Path, default=ROOT / "src/catalog/source-registry.json")
    parser.add_argument("--input", type=Path, default=ROOT / "src/catalog/discovery.generated.json")
    parser.add_argument("--evidence", type=Path, default=ROOT / "src/catalog/manufacturer-evidence.generated.json")
    parser.add_argument("--output", type=Path, default=ROOT / "src/catalog/manufacturer-specs.generated.json")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--offline", action="store_true", help="renormaliser les valeurs brutes déjà stockées, sans réseau")
    args = parser.parse_args()
    registry = load_json(args.registry)
    registry["manufacturerDomains"] = load_json(ROOT / "src/catalog/manufacturer-registry.json").get("manufacturers", [])
    feed = load_json(args.input)
    evidence = load_json(args.evidence)
    previous = load_json(args.output) if args.output.exists() else {"records": [], "failures": []}
    budget = max(1, int(registry["policy"].get("manufacturerSpecPageBudget", 20)))
    limit = min(budget, max(1, args.limit if args.limit is not None else budget))
    output, errors = collect_specs(
        registry, feed.get("candidates", []), evidence, previous,
        date.today().isoformat(), limit, args.refresh, args.offline,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"summary": output["summary"], "lastRun": output["lastRun"]}, ensure_ascii=False))
    return 2 if errors and not output["lastRun"]["collected"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
