"""Deterministic triage rules for open catalog candidates."""

from __future__ import annotations

import re
import unicodedata
from typing import Any


FALSE_POSITIVE_TERMS = {
    "cloud gaming", "game streaming", "streaming service", "service de streaming",
    "smartphone", "mobile phone",
}
FAMILY_TERMS = {
    "family", "famille", "series", "serie", "série", "line", "ligne", "gamme",
    "brand", "marque", "microarchitecture", "micro architecture", "generation",
}
STRONG_FAMILY_PHRASES = {
    "series of", "serie de", "family of", "famille de", "generation of",
    "generation de", "gamme de carte", "gamme de processeur", "processor series", "gpu series",
}
RETAIL_PATTERNS = {
    "cpu": [
        r"\bryzen\s+[3579]\s+\d{4}[a-z]{0,3}\b",
        r"\bthreadripper\s+\d{4}[a-z]{0,3}\b",
        r"\bcore\s+i[3579][ -]?\d{4,5}[a-z]{0,3}\b",
    ],
    "gpu": [
        r"\b(?:geforce\s+)?rtx\s+\d{4}(?:\s+super|\s+ti)?\b",
        r"\b(?:radeon\s+)?rx\s+\d{4}(?:\s+xt|\s+xtx)?\b",
        r"\barc\s+[ab]\d{3}\b",
        r"\bgtx\s+\d{3,4}(?:\s+ti)?\b",
    ],
    "case": [r"\bo11\s+dynamic\b", r"\bmasterbox\b", r"\bnzxt\s+h\d{3}\b"],
    "storage": [r"\b\d{3,4}\s*(?:pro|evo)\b", r"\bfirecuda\s+\d+\b"],
}


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    plain = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return " ".join(re.findall(r"[a-z0-9]+", plain.lower()))


def _contains_term(text: str, terms: set[str]) -> bool:
    return any(normalize(term) in text for term in terms)


def classify(candidate: dict[str, Any]) -> tuple[str, str]:
    if candidate.get("sourceId") == "pci-ids" or candidate.get("kind") == "hardware-identifier":
        return "hardware-identifier", "Identifiant technique d’une puce ou d’un sous-système PCI, pas une référence commerciale garantie."
    label = normalize(str(candidate.get("label", "")))
    description = normalize(str(candidate.get("description", "")))
    combined = f"{label} {description}"
    if _contains_term(combined, FALSE_POSITIVE_TERMS):
        return "false-positive", "Le résultat décrit un service, une organisation ou un appareil hors catalogue PC."
    if "integrated" in combined or "integre" in combined:
        return "component-model", "Composant intégré à une plateforme ; il ne correspond pas forcément à un produit vendu séparément."
    if _contains_term(label, FAMILY_TERMS) or _contains_term(description, STRONG_FAMILY_PHRASES):
        return "product-family", "Le résultat représente une gamme, une génération ou une famille plutôt qu’un modèle précis."
    for pattern in RETAIL_PATTERNS.get(str(candidate.get("category")), []):
        if re.search(pattern, label):
            return "retail-product", "Le nom contient une référence de modèle commercial explicite."
    if _contains_term(description, FAMILY_TERMS):
        return "product-family", "Le résultat représente une gamme, une génération ou une famille plutôt qu’un modèle précis."
    return "needs-review", "La nature commerciale du résultat ne peut pas être établie automatiquement."


def triage(candidate: dict[str, Any]) -> dict[str, Any]:
    result = dict(candidate)
    triage_type, reason = classify(result)
    duplicate = bool(result.get("duplicate"))
    promotable = triage_type == "retail-product" and not duplicate
    blocker = None
    if duplicate:
        blocker = "Une identité similaire existe déjà dans le catalogue."
    elif triage_type != "retail-product":
        blocker = reason
    result.update({
        "triage": triage_type,
        "triageReason": reason,
        "promotable": promotable,
        "promotionBlocker": blocker,
    })
    return result
