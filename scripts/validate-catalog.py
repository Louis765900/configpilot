#!/usr/bin/env python3
"""Fail fast when generated catalog files contain unsafe or invalid records."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import spec_normalization as normalization  # noqa: E402

CATEGORIES = {"cpu", "gpu", "motherboard", "ram", "psu", "case", "storage", "cooling", "expansion"}
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def main() -> int:
    documentary = json.loads((ROOT / "src/catalog/documentary.generated.json").read_text(encoding="utf-8"))
    promoted = json.loads((ROOT / "src/catalog/promoted.generated.json").read_text(encoding="utf-8"))
    discovery = json.loads((ROOT / "src/catalog/discovery.generated.json").read_text(encoding="utf-8"))
    hardware = json.loads((ROOT / "src/catalog/hardware-identifiers.generated.json").read_text(encoding="utf-8"))
    rejected = json.loads((ROOT / "src/catalog/rejected.generated.json").read_text(encoding="utf-8"))
    verification = json.loads((ROOT / "src/catalog/candidate-verification.generated.json").read_text(encoding="utf-8"))
    evidence = json.loads((ROOT / "src/catalog/manufacturer-evidence.generated.json").read_text(encoding="utf-8"))
    specifications = json.loads((ROOT / "src/catalog/manufacturer-specs.generated.json").read_text(encoding="utf-8"))
    report = json.loads((ROOT / "src/catalog/discovery-report.generated.json").read_text(encoding="utf-8"))
    manufacturers = json.loads((ROOT / "src/catalog/manufacturer-registry.json").read_text(encoding="utf-8"))
    registry = json.loads((ROOT / "src/catalog/source-registry.json").read_text(encoding="utf-8"))
    errors: list[str] = []
    policy = registry.get("policy", {})
    if policy.get("publishAutomatically") is not False:
        errors.append("automatic publication must remain disabled")
    page_size = int(policy.get("wikidataPageSize", 0))
    max_pages = int(policy.get("wikidataMaxPagesPerQuery", 0))
    request_budget = int(policy.get("requestBudget", 0))
    manufacturer_page_budget = int(policy.get("manufacturerIndexPageBudget", 0))
    manufacturer_candidate_limit = int(policy.get("manufacturerIndexCandidateLimit", 0))
    manufacturer_evidence_budget = int(policy.get("manufacturerEvidencePageBudget", 0))
    manufacturer_evidence_property_limit = int(policy.get("manufacturerEvidencePropertyLimit", 0))
    manufacturer_spec_budget = int(policy.get("manufacturerSpecPageBudget", 0))
    manufacturer_spec_field_limit = int(policy.get("manufacturerSpecFieldLimit", 0))
    if not 1 <= page_size <= 50 or not 1 <= max_pages <= 2:
        errors.append("unsafe Wikidata pagination policy")
    if request_budget < len(registry.get("queries", [])) * max_pages:
        errors.append("request budget does not cover every registered query")
    if not 1 <= manufacturer_page_budget <= 50 or not 1 <= manufacturer_candidate_limit <= 1000:
        errors.append("unsafe manufacturer index policy")
    if not 1 <= manufacturer_evidence_budget <= 50 or not 1 <= manufacturer_evidence_property_limit <= 100:
        errors.append("unsafe manufacturer evidence policy")
    if not 1 <= manufacturer_spec_budget <= 50 or not 1 <= manufacturer_spec_field_limit <= 200:
        errors.append("unsafe manufacturer specification policy")
    query_pairs: set[tuple[str, str]] = set()
    for query in registry.get("queries", []):
        pair = (query.get("category", ""), query.get("brand", ""))
        if pair in query_pairs:
            errors.append(f"duplicate category/brand query: {pair[0]}:{pair[1]}")
        query_pairs.add(pair)
        if pair[0] not in CATEGORIES or not pair[1] or not query.get("query"):
            errors.append(f"invalid discovery query: {pair[0]}:{pair[1]}")
    verification_by_id = {item.get("candidateId", ""): item for item in verification.get("candidates", [])}
    manufacturer_domains = {
        brand: set(manufacturer["domains"])
        for manufacturer in manufacturers.get("manufacturers", [])
        for brand in manufacturer["brands"]
    }
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
        proof = verification_by_id.get(product.get("candidateId", ""))
        if not proof or proof.get("status") != "verified":
            errors.append(f"promoted without manufacturer proof: {product.get('id')}")
        elif product.get("source") != proof.get("officialUrl"):
            errors.append(f"promoted source does not match proof: {product.get('id')}")
    candidate_ids: set[str] = set()
    source_ids = {source["id"] for source in registry["sources"] if source.get("enabled")}
    sources_by_id = {source["id"]: source for source in registry["sources"] if source.get("enabled")}
    official_source_ids = {
        source_id for source_id, source in sources_by_id.items() if source.get("type") == "manufacturer-index"
    }
    seen_indexes: set[str] = set()
    for index in registry.get("manufacturerIndexes", []):
        index_id = index.get("id", "")
        if not index_id or index_id in seen_indexes:
            errors.append(f"duplicate or empty manufacturer index: {index_id}")
        seen_indexes.add(index_id)
        source = sources_by_id.get(index.get("sourceId", ""), {})
        allowed_domains = set(index.get("allowedDomains", []))
        hostname = (urlparse(str(source.get("url", ""))).hostname or "").lower()
        if source.get("type") != "manufacturer-index" or not any(
            hostname == domain or hostname.endswith(f".{domain}") for domain in allowed_domains
        ):
            errors.append(f"invalid manufacturer index source: {index_id}")
        if not source.get("robotsUrl") and not source.get("robotsUnavailableCheckedAt"):
            errors.append(f"missing robots policy for manufacturer index: {index_id}")
        if source.get("allowMissingRobots") is True and not source.get("robotsUnavailableCheckedAt"):
            errors.append(f"missing robots absence check date: {index_id}")
        if index.get("format", "html") not in {"html", "sitemap"}:
            errors.append(f"invalid manufacturer index format: {index_id}")
        if index.get("category") not in CATEGORIES or not index.get("brand"):
            errors.append(f"invalid manufacturer index target: {index_id}")
        if not allowed_domains.issubset(manufacturer_domains.get(index.get("brand"), set())):
            errors.append(f"unregistered manufacturer index domain: {index_id}")
        try:
            for pattern in [*index.get("productUrlPatterns", []), *index.get("followUrlPatterns", []), *index.get("labelPatterns", [])]:
                re.compile(pattern)
        except re.error:
            errors.append(f"invalid manufacturer index pattern: {index_id}")

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
        if candidate.get("sourceId") in official_source_ids:
            hostname = (urlparse(str(candidate.get("url", ""))).hostname or "").lower()
            allowed = manufacturer_domains.get(candidate.get("brand"), set())
            if not any(hostname == domain or hostname.endswith(f".{domain}") for domain in allowed):
                errors.append(f"official candidate outside manufacturer domain: {candidate_id}")

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
    report_rows = report.get("coverage", [])
    report_by_category = {row.get("category", ""): row for row in report_rows}
    if set(report_by_category) != CATEGORIES or len(report_rows) != len(CATEGORIES):
        errors.append("coverage report must contain every category exactly once")
    for category in CATEGORIES:
        expected_brands = sorted({
            query["brand"] for query in registry.get("queries", []) if query.get("category") == category
        })
        row = report_by_category.get(category, {})
        if row.get("registeredBrands") != expected_brands:
            errors.append(f"stale registered brand coverage: {category}")
        if row.get("candidates") != sum(item.get("category") == category for item in active):
            errors.append(f"stale candidate coverage: {category}")
        expected_official = sum(
            item.get("category") == category and item.get("sourceId") in official_source_ids for item in active
        )
        if row.get("officialCandidates") != expected_official:
            errors.append(f"stale official candidate coverage: {category}")
        if row.get("hardwareIdentifiers") != sum(item.get("category") == category for item in identifiers):
            errors.append(f"stale identifier coverage: {category}")
    report_totals = report.get("totals", {})
    report_policy = report.get("policy", {})
    if report_policy.get("manufacturerEvidencePageBudget") != manufacturer_evidence_budget:
        errors.append("stale manufacturer evidence page budget")
    if report_policy.get("manufacturerEvidencePropertyLimit") != manufacturer_evidence_property_limit:
        errors.append("stale manufacturer evidence property limit")
    expected_totals = {
        "registeredQueries": len(registry.get("queries", [])),
        "registeredBrands": len({query["brand"] for query in registry.get("queries", [])}),
        "registeredCategories": len({query["category"] for query in registry.get("queries", [])}),
        "candidates": len(active),
        "officialCandidates": sum(item.get("sourceId") in official_source_ids for item in active),
        "hardwareIdentifiers": len(identifiers),
        "rejected": len(discarded),
    }
    for field, expected in expected_totals.items():
        if report_totals.get(field) != expected:
            errors.append(f"stale coverage total: {field}")
    collection = report.get("collection", {})
    if collection.get("status") not in {"not-run", "success", "partial", "failed"}:
        errors.append("invalid discovery collection status")
    if int(collection.get("pagesRequested", 0)) > request_budget:
        errors.append("discovery report exceeds request budget")
    if int(collection.get("manufacturerPagesRequested", 0)) > manufacturer_page_budget:
        errors.append("manufacturer discovery report exceeds page budget")
    subjects_by_candidate_id = {
        candidate.get("id", ""): candidate
        for candidate in [*active, *identifiers, *discarded]
    } | {
        product.get("candidateId", ""): product
        for product in promoted
        if product.get("candidateId")
    }
    all_candidate_ids = candidate_ids | {product.get("candidateId", "") for product in promoted}
    seen_verifications: set[str] = set()
    for proof in verification.get("candidates", []):
        candidate_id = proof.get("candidateId", "")
        if candidate_id in seen_verifications:
            errors.append(f"duplicate verification: {candidate_id}")
        seen_verifications.add(candidate_id)
        if candidate_id not in all_candidate_ids:
            errors.append(f"orphan verification: {candidate_id}")
        subject = subjects_by_candidate_id.get(candidate_id, {})
        if subject.get("brand") != proof.get("manufacturer"):
            errors.append(f"manufacturer mismatch: {candidate_id}")
        if proof.get("status") not in {"verified", "variant-required", "rejected"}:
            errors.append(f"invalid verification status: {candidate_id}")
        url = str(proof.get("officialUrl", ""))
        hostname = (urlparse(url).hostname or "").lower()
        allowed = manufacturer_domains.get(proof.get("manufacturer"), set())
        if not url.startswith("https://") or not any(hostname == domain or hostname.endswith(f".{domain}") for domain in allowed):
            errors.append(f"untrusted manufacturer URL: {candidate_id}")
        if proof.get("status") == "verified" and not proof.get("product"):
            errors.append(f"verified candidate without product data: {candidate_id}")
        if proof.get("status") != "verified" and proof.get("product"):
            errors.append(f"blocked candidate contains promotable data: {candidate_id}")
    official_candidates_by_id = {
        candidate.get("id", ""): candidate
        for candidate in active
        if candidate.get("sourceId") in official_source_ids
    }
    evidence_by_id: dict[str, dict] = {}
    evidence_statuses = {"structured-product", "page-metadata", "insufficient-metadata"}
    for item in evidence.get("evidence", []):
        candidate_id = item.get("candidateId", "")
        candidate = official_candidates_by_id.get(candidate_id)
        if not candidate or candidate_id in evidence_by_id:
            errors.append(f"orphan or duplicate manufacturer evidence: {candidate_id}")
            continue
        evidence_by_id[candidate_id] = item
        if item.get("sourceId") != candidate.get("sourceId") or item.get("officialUrl") != candidate.get("url"):
            errors.append(f"manufacturer evidence subject mismatch: {candidate_id}")
        if item.get("brand") != candidate.get("brand") or item.get("category") != candidate.get("category"):
            errors.append(f"manufacturer evidence classification mismatch: {candidate_id}")
        if item.get("status") not in evidence_statuses:
            errors.append(f"invalid manufacturer evidence status: {candidate_id}")
        if item.get("review", {}).get("status") != "pending" or not item.get("review", {}).get("reason"):
            errors.append(f"manufacturer evidence bypasses human review: {candidate_id}")
        if not isinstance(item.get("identity"), dict) or not all(
            isinstance(key, str) and isinstance(value, str) for key, value in item.get("identity", {}).items()
        ):
            errors.append(f"invalid manufacturer evidence identity: {candidate_id}")
        properties = item.get("properties", [])
        if not isinstance(properties, list) or len(properties) > manufacturer_evidence_property_limit or not all(
            isinstance(prop, dict) and isinstance(prop.get("name"), str) and isinstance(prop.get("value"), str)
            for prop in properties
        ):
            errors.append(f"invalid manufacturer evidence properties: {candidate_id}")
        score = item.get("match", {}).get("score")
        signals = item.get("match", {}).get("signals")
        if not isinstance(score, (int, float)) or not 0 <= score <= 1 or not isinstance(signals, list):
            errors.append(f"invalid manufacturer evidence match: {candidate_id}")
        canonical = str(item.get("page", {}).get("canonicalUrl", ""))
        hostname = (urlparse(canonical).hostname or "").lower()
        allowed = manufacturer_domains.get(candidate.get("brand"), set())
        if not canonical.startswith("https://") or not any(hostname == domain or hostname.endswith(f".{domain}") for domain in allowed):
            errors.append(f"untrusted manufacturer evidence canonical: {candidate_id}")
    failure_ids: set[str] = set()
    for failure in evidence.get("failures", []):
        candidate_id = failure.get("candidateId", "")
        candidate = official_candidates_by_id.get(candidate_id)
        if not candidate or candidate_id in failure_ids or candidate_id in evidence_by_id:
            errors.append(f"orphan, duplicate or resolved evidence failure: {candidate_id}")
            continue
        failure_ids.add(candidate_id)
        if failure.get("sourceId") != candidate.get("sourceId") or failure.get("officialUrl") != candidate.get("url"):
            errors.append(f"manufacturer evidence failure subject mismatch: {candidate_id}")
        if not isinstance(failure.get("attempts"), int) or failure.get("attempts", 0) < 1 or not failure.get("error"):
            errors.append(f"invalid manufacturer evidence failure: {candidate_id}")
    evidence_summary = evidence.get("summary", {})
    expected_statuses = {
        status: sum(item.get("status") == status for item in evidence_by_id.values())
        for status in sorted(evidence_statuses)
    }
    expected_evidence_summary = {
        "officialCandidates": len(official_candidates_by_id),
        "collected": len(evidence_by_id),
        "remaining": len(official_candidates_by_id) - len(evidence_by_id),
        "failures": len(failure_ids),
        "byStatus": expected_statuses,
    }
    if evidence_summary != expected_evidence_summary:
        errors.append("stale manufacturer evidence summary")
    if int(evidence.get("lastRun", {}).get("limit", 0)) > manufacturer_evidence_budget:
        errors.append("manufacturer evidence run exceeds page budget")
    spec_policy = specifications.get("policy", {})
    if spec_policy.get("publishAutomatically") is not False:
        errors.append("manufacturer specifications must never publish automatically")
    if spec_policy.get("pageBudget") != manufacturer_spec_budget or spec_policy.get("fieldLimit") != manufacturer_spec_field_limit:
        errors.append("stale manufacturer specification policy")
    if spec_policy.get("categories") != list(normalization.SUPPORTED_CATEGORIES):
        errors.append("stale manufacturer specification categories")
    specs_by_id: dict[str, dict] = {}
    for record in specifications.get("records", []):
        candidate_id = record.get("candidateId", "")
        candidate = official_candidates_by_id.get(candidate_id)
        category = record.get("category", "")
        if not candidate or candidate_id in specs_by_id or candidate_id not in evidence_by_id:
            errors.append(f"orphan or duplicate manufacturer specification: {candidate_id}")
            continue
        specs_by_id[candidate_id] = record
        if record.get("sourceId") != candidate.get("sourceId") or record.get("officialUrl") != candidate.get("url"):
            errors.append(f"manufacturer specification subject mismatch: {candidate_id}")
        if record.get("brand") != candidate.get("brand") or category != candidate.get("category"):
            errors.append(f"manufacturer specification classification mismatch: {candidate_id}")
        if category not in normalization.SUPPORTED_CATEGORIES:
            errors.append(f"unsupported manufacturer specification category: {candidate_id}")
            continue
        if not ISO_DATE.match(str(record.get("collectedAt", ""))):
            errors.append(f"invalid manufacturer specification date: {candidate_id}")
        if record.get("review", {}).get("status") != "pending" or not record.get("review", {}).get("reason"):
            errors.append(f"manufacturer specification bypasses human review: {candidate_id}")
        if "verified" in json.dumps(record, ensure_ascii=False):
            errors.append(f"manufacturer specification claims a verification: {candidate_id}")
        raw_fields = record.get("rawFields", [])
        if not isinstance(raw_fields, list) or len(raw_fields) > manufacturer_spec_field_limit or not all(
            isinstance(row, dict) and isinstance(row.get("field"), str) and isinstance(row.get("value"), str)
            and row.get("method") in normalization.METHODS
            for row in raw_fields
        ):
            errors.append(f"invalid manufacturer specification raw fields: {candidate_id}")
        declared = [definition["field"] for definition in normalization.CATEGORY_FIELDS[category]]
        labels = normalization.FIELD_LABELS[category]
        prose_allowed = normalization.PROSE_FIELDS.get(category, ())
        seen_fields: list[str] = []
        for spec in record.get("specs", []):
            name = spec.get("field", "")
            if name not in declared or name in seen_fields:
                errors.append(f"unknown or duplicate normalized field {name}: {candidate_id}")
                continue
            seen_fields.append(name)
            if spec.get("label") != labels[name]:
                errors.append(f"stale normalized label {name}: {candidate_id}")
            if spec.get("value") is None or spec.get("value") == "" or spec.get("value") == []:
                errors.append(f"empty normalized value {name}: {candidate_id}")
            if not spec.get("rawField") or not spec.get("rawValue"):
                errors.append(f"normalized value without raw evidence {name}: {candidate_id}")
            if spec.get("method") not in normalization.METHODS or spec.get("confidence") not in normalization.CONFIDENCES:
                errors.append(f"invalid extraction method or confidence {name}: {candidate_id}")
            if spec.get("method") == "meta" and (name not in prose_allowed or spec.get("confidence") != "low"):
                errors.append(f"page prose used outside the allowlist {name}: {candidate_id}")
            if spec.get("unit") is not None and not isinstance(spec.get("unit"), str):
                errors.append(f"invalid unit {name}: {candidate_id}")
            if not ISO_DATE.match(str(spec.get("collectedAt", ""))):
                errors.append(f"invalid normalized value date {name}: {candidate_id}")
            url = str(spec.get("sourceUrl", ""))
            hostname = (urlparse(url).hostname or "").lower()
            allowed = manufacturer_domains.get(candidate.get("brand"), set())
            if url != candidate.get("url") or not url.startswith("https://") or not any(
                hostname == domain or hostname.endswith(f".{domain}") for domain in allowed
            ):
                errors.append(f"untrusted normalized source {name}: {candidate_id}")
        if record.get("missingFields") != [name for name in declared if name not in seen_fields]:
            errors.append(f"stale missing field list: {candidate_id}")
        coverage = record.get("coverage", {})
        if coverage.get("rawFields") != len(raw_fields) or coverage.get("normalized") != len(seen_fields):
            errors.append(f"stale manufacturer specification coverage: {candidate_id}")
    spec_failure_ids: set[str] = set()
    for failure in specifications.get("failures", []):
        candidate_id = failure.get("candidateId", "")
        if candidate_id not in official_candidates_by_id or candidate_id in spec_failure_ids or candidate_id in specs_by_id:
            errors.append(f"orphan, duplicate or resolved specification failure: {candidate_id}")
            continue
        spec_failure_ids.add(candidate_id)
        if not isinstance(failure.get("attempts"), int) or failure.get("attempts", 0) < 1 or not failure.get("error"):
            errors.append(f"invalid manufacturer specification failure: {candidate_id}")
    eligible_specs = {
        candidate_id for candidate_id, item in evidence_by_id.items()
        if item.get("status") in {"structured-product", "page-metadata"}
        and official_candidates_by_id[candidate_id].get("category") in normalization.SUPPORTED_CATEGORIES
    }
    expected_spec_summary = {
        "eligibleCandidates": len(eligible_specs),
        "collected": len(specs_by_id),
        "remaining": len(eligible_specs) - len(specs_by_id),
        "failures": len(spec_failure_ids),
        "rawValues": sum(len(record["rawFields"]) for record in specs_by_id.values()),
        "normalizedValues": sum(len(record["specs"]) for record in specs_by_id.values()),
        "byCategory": {
            category: {
                "records": sum(record["category"] == category for record in specs_by_id.values()),
                "normalizedValues": sum(len(record["specs"]) for record in specs_by_id.values() if record["category"] == category),
            }
            for category in normalization.SUPPORTED_CATEGORIES
        },
        "byConfidence": {
            level: sum(spec["confidence"] == level for record in specs_by_id.values() for spec in record["specs"])
            for level in normalization.CONFIDENCES
        },
    }
    if specifications.get("summary") != expected_spec_summary:
        errors.append("stale manufacturer specification summary")
    if int(specifications.get("lastRun", {}).get("limit", 0)) > manufacturer_spec_budget:
        errors.append("manufacturer specification run exceeds page budget")
    if errors:
        print("\n".join(errors))
        return 1
    print(json.dumps({
        "documentary": len(documentary),
        "promoted": len(promoted),
        "candidates": len(active),
        "hardwareIdentifiers": len(identifiers),
        "rejected": len(discarded),
        "verified": sum(item.get("status") == "verified" for item in verification.get("candidates", [])),
        "manufacturerEvidence": len(evidence_by_id),
        "manufacturerEvidenceFailures": len(failure_ids),
        "manufacturerSpecifications": len(specs_by_id),
        "normalizedValues": expected_spec_summary["normalizedValues"],
        "sources": len(source_ids),
        "registeredQueries": len(registry.get("queries", [])),
        "registeredBrands": len({query["brand"] for query in registry.get("queries", [])}),
        "officialIndexes": len(seen_indexes),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
