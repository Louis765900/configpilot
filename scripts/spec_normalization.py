#!/usr/bin/env python3
"""Turn raw manufacturer specification rows into normalized ConfigPilot values.

The layer is deterministic, offline and never invents data. A field is emitted only
when the manufacturer text actually contains it, and an absence of mention is never
converted into a negative answer: it is reported separately as a missing field.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Callable


SUPPORTED_CATEGORIES = ("motherboard", "ram", "psu", "case", "cooling")
METHODS = ("json-ld", "spec-table", "definition-list", "spec-list", "meta")
CONFIDENCES = ("high", "medium", "low")
METHOD_PRIORITY = {method: index for index, method in enumerate(METHODS)}
CONFIDENCE_PRIORITY = {confidence: index for index, confidence in enumerate(CONFIDENCES)}
NEGATIVE_VALUES = {
    "no", "none", "n/a", "na", "-", "--", "non", "aucun", "aucune", "not supported",
    "non supporte", "sans", "absent", "nein", "false", "0",
}
# Prose (page metadata) is only allowed to feed fields whose wording is unambiguous.
# Everything it produces stays at the lowest confidence level and waits for a human.
PROSE_FIELDS = {
    "motherboard": ("formFactor", "memoryType", "pcie", "ethernet"),
    "ram": ("memoryType",),
    "psu": ("efficiency",),
    "case": ("caseFormFactor",),
    "cooling": ("coolerType",),
}

Parsed = tuple[Any, str] | None


def plain(value: Any) -> str:
    decomposed = unicodedata.normalize("NFD", str(value))
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn").lower()


def squeeze(value: Any) -> str:
    return " ".join(str(value).split())


def field_key(name: Any) -> str:
    return " ".join(re.findall(r"[a-z0-9+./-]+", plain(name)))


def matches_alias(key: str, aliases: tuple[str, ...]) -> bool:
    """Match a raw field name. An alias prefixed with "=" requires the whole name to match."""
    for alias in aliases:
        if alias.startswith("="):
            if key == alias[1:]:
                return True
        elif re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", key):
            return True
    return False


def is_negative(raw: str) -> bool:
    return plain(squeeze(raw)).strip(" .;:") in NEGATIVE_VALUES


def result(value: Any, matched: str, raw: str) -> Parsed:
    exact = plain(squeeze(matched)) == plain(squeeze(raw))
    return value, ("exact" if exact else "partial")


def number(text: str) -> float:
    return float(str(text).replace(",", "."))


def tidy(value: float) -> int | float:
    return int(value) if float(value).is_integer() else round(float(value), 1)


AMD_SOCKETS = {
    "am5": "AM5", "am4": "AM4", "am3+": "AM3+", "am3": "AM3", "fm2+": "FM2+", "fm2": "FM2",
    "strx4": "sTRX4", "str5": "sTR5", "swrx8": "sWRX8", "swrx9": "sWRX9",
    "sp6": "SP6", "sp5": "SP5", "sp3": "SP3", "tr4": "TR4",
}
AMD_SOCKET_PATTERN = re.compile(
    r"(?<![a-z0-9])(am5|am4|am3\+|am3|fm2\+|fm2|strx4|str5|swrx8|swrx9|sp6|sp5|sp3|tr4)(?![a-z0-9])"
)
INTEL_SOCKET_PATTERN = re.compile(r"lga\s*-?\s*(\d{3,4})((?:\s*/\s*\d{3,4})*)")


def socket_tokens(raw: str) -> list[tuple[str, str]]:
    text = plain(raw)
    found: list[tuple[int, str, str]] = []
    for match in INTEL_SOCKET_PATTERN.finditer(text):
        found.append((match.start(), f"LGA{match.group(1)}", match.group(0)))
        for extra in re.findall(r"\d{3,4}", match.group(2) or ""):
            found.append((match.start(), f"LGA{extra}", match.group(0)))
    for match in AMD_SOCKET_PATTERN.finditer(text):
        found.append((match.start(), AMD_SOCKETS[match.group(1)], match.group(0)))
    found.sort(key=lambda item: item[0])
    return [(canonical, matched) for _position, canonical, matched in found]


def parse_socket(raw: str) -> Parsed:
    tokens = socket_tokens(raw)
    return result(tokens[0][0], tokens[0][1], raw) if tokens else None


def parse_socket_list(raw: str) -> Parsed:
    tokens = socket_tokens(raw)
    if not tokens:
        return None
    values = list(dict.fromkeys(canonical for canonical, _matched in tokens))[:20]
    return result(values, " ".join(dict.fromkeys(matched for _canonical, matched in tokens)), raw)


CHIPSET_PATTERN = re.compile(r"(?<![a-z0-9])((?:[zbhxawq]\d{2,3}[a-z]?)|trx\d{2}|wrx\d{2})(?![a-z0-9])")


def parse_chipset(raw: str) -> Parsed:
    match = CHIPSET_PATTERN.search(plain(raw))
    return result(match.group(1).upper(), match.group(0), raw) if match else None


def choose(raw: str, table: tuple[tuple[str, str], ...]) -> Parsed:
    text = plain(raw)
    for pattern, canonical in table:
        match = re.search(pattern, text)
        if match:
            return result(canonical, match.group(0), raw)
    return None


def collect(raw: str, table: tuple[tuple[str, str], ...], limit: int = 12) -> Parsed:
    text = plain(raw)
    found: list[tuple[int, str, str]] = []
    for pattern, canonical in table:
        for match in re.finditer(pattern, text):
            found.append((match.start(), canonical, match.group(0)))
    if not found:
        return None
    found.sort(key=lambda item: item[0])
    values = list(dict.fromkeys(canonical for _position, canonical, _matched in found))[:limit]
    return result(values, " ".join(matched for _position, _canonical, matched in found), raw)


BOARD_FORM_FACTORS = (
    (r"extended\s*atx|e\s*-\s*atx|eatx", "E-ATX"),
    (r"ssi\s*-?\s*eeb|(?<![a-z])eeb(?![a-z])", "SSI EEB"),
    (r"ssi\s*-?\s*ceb|(?<![a-z])ceb(?![a-z])", "SSI CEB"),
    (r"micro\s*-?\s*atx|(?<![a-z])m-atx(?![a-z])|(?<![a-z])uatx(?![a-z])|(?<![a-z])matx(?![a-z])", "Micro-ATX"),
    (r"mini\s*-?\s*dtx", "Mini-DTX"),
    (r"mini\s*-?\s*itx|(?<![a-z])m-?itx(?![a-z])|(?<![a-z-])itx(?![a-z])", "Mini-ITX"),
    (r"(?<![a-z-])atx(?![a-z0-9])", "ATX"),
)
CASE_FORM_FACTORS = (
    (r"super\s*-?\s*tower", "Super Tower"),
    (r"full\s*-?\s*tower|grand\s*tour", "Full Tower"),
    (r"mid[i]?\s*-?\s*tower|moyenne\s*tour", "Mid Tower"),
    (r"mini\s*-?\s*tower|petite\s*tour", "Mini Tower"),
    (r"small\s*form\s*factor|(?<![a-z])sff(?![a-z])", "Small Form Factor"),
    (r"open\s*frame|test\s*bench", "Open Frame"),
    (r"(?<![a-z])cube(?![a-z])", "Cube"),
    (r"(?<![a-z])htpc(?![a-z])|desktop\s*case", "Desktop"),
)


def parse_board_form_factor(raw: str) -> Parsed:
    return choose(raw, BOARD_FORM_FACTORS)


def parse_board_form_factor_list(raw: str) -> Parsed:
    return collect(raw, BOARD_FORM_FACTORS)


def parse_case_form_factor(raw: str) -> Parsed:
    return choose(raw, CASE_FORM_FACTORS)


def parse_memory_type(raw: str) -> Parsed:
    found = list(dict.fromkeys(re.findall(r"(?<![a-z0-9])ddr([345])(?![a-z0-9])", plain(raw))))
    if not found:
        return None
    return result(" / ".join(f"DDR{item}" for item in found), " ".join(f"ddr{item}" for item in found), raw)


def first_group(raw: str, patterns: tuple[str, ...], cast: Callable[[str], Any] = int) -> Parsed:
    text = plain(raw)
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return result(cast(match.group(1)), match.group(0), raw)
    return None


def parse_memory_slots(raw: str) -> Parsed:
    return first_group(raw, (
        r"(\d{1,2})\s*[x×]\s*(?:dimm|ddr[345]|so-?dimm)",
        r"(?:dimm|memory|memoire)\s*(?:slots?|emplacements?)\D{0,10}(\d{1,2})",
        r"^(\d{1,2})$",
    ))


PCIE_PATTERN = re.compile(
    r"(?:(\d{1,2})\s*[x×]\s*)?pci\s*-?\s*e(?:xpress)?\s*(?:gen\s*)?([3456](?:\.0)?)?\s*(?:[x×]\s*(\d{1,2}))?"
)


def parse_pcie(raw: str) -> Parsed:
    text = plain(raw)
    labels: list[str] = []
    matched: list[str] = []
    for match in PCIE_PATTERN.finditer(text):
        count, generation, lanes = match.group(1), match.group(2), match.group(3)
        if not generation and not lanes:
            continue
        label = "PCIe"
        if generation:
            label += f" {generation if '.' in generation else generation + '.0'}"
        if lanes:
            label += f" x{lanes}"
        if count:
            label = f"{count}× {label}"
        labels.append(label)
        matched.append(match.group(0))
    if not labels:
        return None
    return result(list(dict.fromkeys(labels))[:8], " ".join(matched), raw)


WIFI_GENERATIONS = {"be": "Wi-Fi 7", "ax": "Wi-Fi 6", "ac": "Wi-Fi 5", "n": "Wi-Fi 4"}


def parse_wifi(raw: str) -> Parsed:
    if is_negative(raw):
        return False, "exact"
    text = plain(raw)
    match = re.search(r"wi\s*-?\s*fi\s*(\d)\s*(e)?", text)
    if match:
        return result(f"Wi-Fi {match.group(1)}{'E' if match.group(2) else ''}", match.group(0), raw)
    match = re.search(r"802\.11\s*(be|ax|ac|n)(?![a-z])", text)
    if match:
        return result(WIFI_GENERATIONS[match.group(1)], match.group(0), raw)
    match = re.search(r"wi\s*-?\s*fi|wireless|wlan|sans\s*fil", text)
    return result(True, match.group(0), raw) if match else None


def parse_ethernet(raw: str) -> Parsed:
    if is_negative(raw):
        return False, "exact"
    text = plain(raw)
    match = re.search(r"(\d+(?:\.\d+)?)\s*(?:g|gb|gbps|gbe|gigabit)(?![a-z0-9])", text)
    if match:
        return result(f"{tidy(number(match.group(1)))}GbE", match.group(0), raw)
    match = re.search(r"gigabit|10/100/1000", text)
    if match:
        return result("1GbE", match.group(0), raw)
    match = re.search(r"(\d{2,4})\s*mbps", text)
    return result(f"{match.group(1)}Mb/s", match.group(0), raw) if match else None


def parse_capacity(raw: str) -> Parsed:
    text = plain(raw)
    kit = re.search(r"(\d{1,2})\s*[x×]\s*(\d{1,4})\s*gb", text)
    total = re.search(r"(\d{1,4})\s*gb", text)
    if total and (not kit or total.start() < kit.start()):
        return result(int(total.group(1)), total.group(0), raw)
    if kit:
        return int(kit.group(1)) * int(kit.group(2)), "partial"
    return None


def parse_module_count(raw: str) -> Parsed:
    return first_group(raw, (
        r"(\d{1,2})\s*[x×]\s*\d{1,4}\s*gb",
        r"kit\s*(?:of|de)\s*(\d{1,2})",
        r"(\d{1,2})\s*(?:modules?|sticks?|barrettes?|pcs|pieces)",
    ))


def parse_memory_speed(raw: str) -> Parsed:
    return first_group(raw, (
        r"ddr[345][\s-](\d{4,5})(?![0-9])",
        r"(\d{4,5})\s*(?:mt/s|mhz)",
        r"^(\d{4,5})$",
    ))


def parse_latency(raw: str) -> Parsed:
    return first_group(raw, (
        r"(?<![a-z0-9])cl\s*-?\s*(\d{1,2})(?![0-9])",
        r"(?<![0-9])(\d{2})\s*-\s*\d{2}\s*-\s*\d{2}\s*-\s*\d{2,3}",
        r"(?:latency|latence)\D{0,6}(\d{2})(?![0-9])",
    ))


def parse_profile(raw: str, name: str, label: str) -> Parsed:
    if is_negative(raw):
        return False, "exact"
    text = plain(raw)
    match = re.search(rf"{name}\s*(\d(?:\.\d)?)", text)
    if match:
        return result(f"{label} {match.group(1)}", match.group(0), raw)
    match = re.search(rf"(?<![a-z]){name}(?![a-z])", text)
    return result(True, match.group(0), raw) if match else None


def parse_xmp(raw: str) -> Parsed:
    return parse_profile(raw, "xmp", "XMP")


def parse_expo(raw: str) -> Parsed:
    return parse_profile(raw, "expo", "EXPO")


def parse_ecc(raw: str) -> Parsed:
    text = plain(raw)
    match = re.search(r"non\s*-?\s*ecc", text)
    if match:
        return result(False, match.group(0), raw)
    match = re.search(r"on\s*-?\s*die\s*ecc", text)
    if match:
        return result("On-die ECC", match.group(0), raw)
    if is_negative(raw):
        return False, "exact"
    match = re.search(r"(?<![a-z])ecc(?![a-z])", text)
    return result(True, match.group(0), raw) if match else None


def parse_wattage(raw: str) -> Parsed:
    text = plain(raw)
    for pattern in (r"(\d{2,4})\s*w(?:att)?s?(?![a-z0-9])", r"^(\d{2,4})$"):
        match = re.search(pattern, text)
        if match and 50 <= int(match.group(1)) <= 3000:
            return result(int(match.group(1)), match.group(0), raw)
    return None


EFFICIENCY_GRADES = "titanium|platinum|gold|silver|bronze|white|standard"


def parse_efficiency(raw: str) -> Parsed:
    text = plain(raw)
    match = re.search(rf"80\s*\+?\s*plus\s*({EFFICIENCY_GRADES})", text)
    if match:
        return result(f"80 PLUS {match.group(1).capitalize()}", match.group(0), raw)
    match = re.fullmatch(rf"\s*({EFFICIENCY_GRADES})\s*", text)
    if match:
        return result(f"80 PLUS {match.group(1).capitalize()}", match.group(0), raw)
    match = re.search(r"80\s*\+?\s*plus", text)
    return result("80 PLUS", match.group(0), raw) if match else None


def parse_atx_standard(raw: str) -> Parsed:
    text = plain(raw)
    match = re.search(r"atx\s*12\s*v\s*(\d(?:\.\d)?)", text)
    if match:
        return result(f"ATX12V {match.group(1)}", match.group(0), raw)
    match = re.search(r"atx\s*(\d\.\d)", text)
    if match:
        return result(f"ATX {match.group(1)}", match.group(0), raw)
    match = re.search(r"(?<![a-z-])(sfx-l|sfx|tfx|flex\s*atx|atx)(?![a-z0-9])", text)
    return result(match.group(1).upper().replace("FLEX ATX", "Flex ATX"), match.group(0), raw) if match else None


MODULARITY = (
    (r"full[y]?\s*-?\s*modular|entierement\s*modulaire|complet\s*modulaire", "Entièrement modulaire"),
    (r"semi\s*-?\s*modular|semi\s*-?\s*modulaire", "Semi-modulaire"),
    (r"non\s*-?\s*modular|not\s*modular|fixed\s*cable|direct\s*cable|non\s*modulaire|cablage\s*fixe", "Non modulaire"),
    (r"(?<![a-z-])modular(?![a-z])|(?<![a-z-])modulaire(?![a-z])", "Modulaire"),
)


def parse_modularity(raw: str) -> Parsed:
    return choose(raw, MODULARITY)


PCIE_CONNECTOR = r"(?:pci\s*-?\s*e(?:xpress)?)[^,;\n]{0,24}?(?:6\s*\+\s*2|8)\s*-?\s*pin"


def parse_pcie_connectors(raw: str) -> Parsed:
    text = plain(raw)
    counted = [match for match in re.finditer(rf"(\d{{1,2}})\s*[x×]\s*{PCIE_CONNECTOR}", text)]
    if counted:
        total = sum(int(match.group(1)) for match in counted)
        return result(total, " ".join(match.group(0) for match in counted), raw)
    plain_matches = [match for match in re.finditer(PCIE_CONNECTOR, text)]
    if plain_matches:
        return result(len(plain_matches), " ".join(match.group(0) for match in plain_matches), raw)
    return None


def parse_high_power_connector(raw: str) -> Parsed:
    if is_negative(raw):
        return False, "exact"
    return choose(raw, (
        (r"12v\s*-?\s*2\s*[x×]\s*6", "12V-2x6"),
        (r"12vhpwr", "12VHPWR"),
        (r"(?<![a-z0-9])12\s*\+\s*4\s*-?\s*pin(?![a-z0-9])|(?<![a-z0-9])16\s*-?\s*pin(?![a-z0-9])", "16-pin"),
    ))


def parse_warranty_years(raw: str) -> Parsed:
    parsed = first_group(raw, (r"(\d{1,2})\s*-?\s*(?:years?|yrs?|ans?|annees?)(?![a-z])",))
    if parsed and 1 <= int(parsed[0]) <= 20:
        return parsed
    return None


LENGTH_PATTERNS = (r"(\d{2,4}(?:[.,]\d+)?)\s*mm", r"(\d{1,3}(?:[.,]\d+)?)\s*cm")


def parse_length_mm(raw: str) -> Parsed:
    text = plain(raw)
    for pattern, factor in zip(LENGTH_PATTERNS, (1, 10)):
        match = re.search(pattern, text)
        if match:
            return result(tidy(number(match.group(1)) * factor), match.group(0), raw)
    return None


RADIATOR_SIZES = ("120", "140", "240", "280", "360", "420", "480")


def parse_radiator_sizes(raw: str) -> Parsed:
    text = plain(raw)
    # A length × width × thickness row states the radiator body, never its fan format.
    if DIMENSION_PATTERN.search(text):
        return None
    found = [match.group(1) for match in re.finditer(rf"(?<![0-9])({'|'.join(RADIATOR_SIZES)})(?![0-9])", text)]
    if not found:
        return None
    values = [f"{size} mm" for size in dict.fromkeys(found)][:8]
    return result(values, " ".join(found), raw)


def parse_radiator_size(raw: str) -> Parsed:
    if DIMENSION_PATTERN.search(plain(raw)):
        return None
    match = re.search(rf"(?<![0-9])({'|'.join(RADIATOR_SIZES)})(?![0-9])(?:\s*mm)?", plain(raw))
    return result(int(match.group(1)), match.group(0), raw) if match else None


DIMENSION_PATTERN = re.compile(
    r"(\d{1,4}(?:[.,]\d+)?)\s*(mm|cm)?\s*[x×*]\s*(\d{1,4}(?:[.,]\d+)?)\s*(mm|cm)?\s*[x×*]\s*(\d{1,4}(?:[.,]\d+)?)\s*(mm|cm)"
)


def parse_dimensions(raw: str) -> Parsed:
    match = DIMENSION_PATTERN.search(plain(raw))
    if not match:
        return None
    unit = match.group(6) or match.group(4) or match.group(2) or "mm"
    factor = 10 if unit == "cm" else 1
    sides = [tidy(number(match.group(index)) * factor) for index in (1, 3, 5)]
    return result(" × ".join(f"{side}" for side in sides) + " mm", match.group(0), raw)


AXIS_LABEL = re.compile(r"l\s*[x×*]\s*w\s*[x×*]\s*h")


def parse_cooler_height(raw: str) -> Parsed:
    """Read the height axis only when the manufacturer labels the dimension order itself."""
    text = plain(raw)
    match = DIMENSION_PATTERN.search(text)
    if match and AXIS_LABEL.search(text):
        unit = match.group(6) or match.group(4) or match.group(2) or "mm"
        return tidy(number(match.group(5)) * (10 if unit == "cm" else 1)), "partial"
    if match:
        return None
    return parse_length_mm(raw)


COOLER_TYPES = (
    (r"all\s*-?\s*in\s*-?\s*one|(?<![a-z])aio(?![a-z])|liquid|watercool|water\s*cool|refroidissement\s*liquide", "AIO"),
    (r"air\s*cool|(?<![a-z])air(?![a-z])|heat\s*sink|heatsink|tower\s*cooler|ventirad", "Air"),
)


def parse_cooler_type(raw: str) -> Parsed:
    return choose(raw, COOLER_TYPES)


def parse_fan_count(raw: str) -> Parsed:
    return first_group(raw, (
        r"(\d{1,2})\s*[x×]\s*(?:\d{2,3}\s*mm\s*)?(?:fans?|ventilateurs?)",
        r"(?:fans?|ventilateurs?)\D{0,8}(\d{1,2})(?![0-9])",
        r"(\d{1,2})\s*(?:fans?|ventilateurs?)",
    ))


FAN_SIZES = ("80", "92", "120", "135", "140", "200")


def parse_fan_size(raw: str) -> Parsed:
    text = plain(raw)
    match = re.search(rf"(?<![0-9])({'|'.join(FAN_SIZES)})\s*mm", text)
    if match:
        return result(int(match.group(1)), match.group(0), raw)
    match = re.search(rf"(?<![0-9])({'|'.join(FAN_SIZES)})(?![0-9])", text)
    return result(int(match.group(1)), match.group(0), raw) if match else None


def field(name: str, label: str, unit: str | None, aliases: tuple[str, ...], parser: Callable[[str], Parsed]) -> dict[str, Any]:
    return {"field": name, "label": label, "unit": unit, "aliases": aliases, "parser": parser}


CATEGORY_FIELDS: dict[str, tuple[dict[str, Any], ...]] = {
    "motherboard": (
        field("socket", "Socket", None, ("socket", "cpu socket", "processor socket", "support processeur", "processeur"), parse_socket),
        field("chipset", "Chipset", None, ("chipset", "jeu de composants"), parse_chipset),
        field("formFactor", "Format", None, ("form factor", "format", "facteur de forme"), parse_board_form_factor),
        field("memoryType", "Type de mémoire", None, ("memory", "memory type", "ram", "dram", "memoire", "type de memoire"), parse_memory_type),
        field("memorySlots", "Emplacements mémoire", None, ("memory", "memory slots", "dimm", "dimm slots", "memoire", "slots memoire"), parse_memory_slots),
        field("pcie", "PCIe", None, ("expansion slots", "expansion slot", "pcie", "pci express", "pci-e", "slots", "connecteurs d extension"), parse_pcie),
        field("wifi", "Wi-Fi", None, ("wireless", "wi-fi", "wifi", "wlan", "networking", "network", "lan", "reseau", "sans fil"), parse_wifi),
        field("ethernet", "Ethernet", None, ("lan", "ethernet", "network", "networking", "reseau"), parse_ethernet),
    ),
    "ram": (
        field("memoryType", "Type de mémoire", None, ("memory type", "=type", "ddr", "memory", "memoire", "technologie"), parse_memory_type),
        field("capacity", "Capacité", "Go", ("capacity", "kit capacity", "total capacity", "memory size", "=size", "capacite", "densite"), parse_capacity),
        field("moduleCount", "Nombre de modules", None, ("kit", "modules", "module", "quantity", "kit configuration", "nombre de modules", "configuration"), parse_module_count),
        field("speed", "Fréquence", "MT/s", ("speed", "frequency", "data rate", "tested speed", "frequence", "vitesse", "memory speed"), parse_memory_speed),
        field("latency", "Latence", "CL", ("latency", "cas latency", "timing", "timings", "tested latency", "latence"), parse_latency),
        field("xmp", "XMP", None, ("xmp", "intel xmp", "profile", "profiles", "profil", "overclocking", "support"), parse_xmp),
        field("expo", "EXPO", None, ("expo", "amd expo", "profile", "profiles", "profil", "support"), parse_expo),
        field("ecc", "ECC", None, ("ecc", "error correction", "correction d erreur"), parse_ecc),
    ),
    "psu": (
        field("wattage", "Puissance", "W", ("wattage", "power", "output", "max power", "total power", "puissance", "continuous power", "rated power"), parse_wattage),
        field("efficiency", "Certification", None, ("efficiency", "80 plus", "80plus", "certification", "rendement", "efficiency rating"), parse_efficiency),
        field("atxStandard", "Norme ATX", None, ("atx", "standard", "form factor", "atx version", "specification", "norme", "format"), parse_atx_standard),
        field("modularity", "Modularité", None, ("modular", "modularity", "cable", "cabling", "modularite", "cables"), parse_modularity),
        field("pcieConnectors", "Connecteurs PCIe", None, ("pcie", "pci-e", "pci express", "connectors", "connector", "vga", "gpu", "connecteurs"), parse_pcie_connectors),
        field("highPowerConnector", "Connecteur 12V-2x6", None, ("pcie", "pci-e", "12v", "12vhpwr", "12v-2x6", "connectors", "connector", "connecteurs", "gpu"), parse_high_power_connector),
        field("warrantyYears", "Garantie", "ans", ("warranty", "garantie"), parse_warranty_years),
    ),
    "case": (
        field("caseFormFactor", "Format", None, ("=type", "form factor", "case type", "chassis type", "format", "categorie", "tower"), parse_case_form_factor),
        field("motherboardSupport", "Cartes mères acceptées", None, ("motherboard", "mainboard", "motherboard compatibility", "form factor", "supported motherboards", "cartes meres", "carte mere"), parse_board_form_factor_list),
        field("maxGpuLength", "Longueur GPU maximale", "mm", ("gpu", "graphics card", "video card", "vga", "gpu clearance", "carte graphique", "longueur gpu"), parse_length_mm),
        field("maxCoolerHeight", "Hauteur ventirad maximale", "mm", ("cpu cooler", "cooler", "cpu cooler clearance", "cpu cooler height", "heatsink", "ventirad", "hauteur ventirad"), parse_length_mm),
        field("radiators", "Radiateurs", None, ("radiator", "radiators", "water cooling", "liquid cooling", "radiateur", "radiateurs"), parse_radiator_sizes),
        field("dimensions", "Dimensions", None, ("=dimensions", "=dimension", "=size", "measurements", "product dimensions", "case dimensions"), parse_dimensions),
    ),
    "cooling": (
        field("coolerType", "Type", None, ("=type", "cooler type", "product type", "category", "categorie", "series", "serie"), parse_cooler_type),
        field("sockets", "Sockets", None, ("socket", "sockets", "compatibility", "cpu support", "supported sockets", "compatibilite", "cpu socket", "intel", "amd"), parse_socket_list),
        field("radiatorSize", "Taille du radiateur", "mm", ("radiator", "radiator size", "radiateur", "radiator dimensions"), parse_radiator_size),
        field("coolerHeight", "Hauteur", "mm", ("height", "hauteur", "cooler height", "heatsink height", "overall height", "product dimensions", "heatsink dimensions", "cooler dimensions"), parse_cooler_height),
        field("fanCount", "Nombre de ventilateurs", None, ("fan", "fans", "fan quantity", "fan count", "ventilateur", "ventilateurs"), parse_fan_count),
        field("fanSize", "Taille des ventilateurs", "mm", ("fan", "fans", "fan size", "fan dimensions", "ventilateur", "ventilateurs"), parse_fan_size),
        field("dimensions", "Dimensions", None, ("=dimensions", "=dimension", "=size", "product dimensions", "net dimensions"), parse_dimensions),
    ),
}
FIELD_LABELS = {
    category: {definition["field"]: definition["label"] for definition in definitions}
    for category, definitions in CATEGORY_FIELDS.items()
}


def confidence_for(method: str, exactness: str) -> str:
    if method == "meta":
        return "low"
    return "high" if exactness == "exact" else "medium"


def rank(entry: dict[str, Any]) -> tuple[int, int]:
    return CONFIDENCE_PRIORITY[entry["confidence"]], METHOD_PRIORITY[entry["method"]]


def normalize_specs(category: str, raw_fields: list[dict[str, str]], source_url: str, collected_at: str) -> list[dict[str, Any]]:
    """Return one normalized entry per field actually published on the manufacturer page."""
    definitions = CATEGORY_FIELDS.get(category, ())
    prose_allowed = PROSE_FIELDS.get(category, ())
    best: dict[str, dict[str, Any]] = {}
    for raw in raw_fields:
        method = raw.get("method", "spec-table")
        if method not in METHOD_PRIORITY:
            continue
        key = field_key(raw.get("field", ""))
        for definition in definitions:
            if method == "meta":
                if definition["field"] not in prose_allowed:
                    continue
            elif not matches_alias(key, definition["aliases"]):
                continue
            parsed = definition["parser"](str(raw.get("value", "")))
            if parsed is None:
                continue
            value, exactness = parsed
            if value is None or value == "" or value == []:
                continue
            entry = {
                "field": definition["field"],
                "label": definition["label"],
                "rawField": squeeze(raw.get("field", ""))[:120],
                "rawValue": squeeze(raw.get("value", ""))[:240],
                "value": value,
                "unit": definition["unit"],
                "method": method,
                "confidence": confidence_for(method, exactness),
                "sourceUrl": source_url,
                "collectedAt": collected_at,
            }
            current = best.get(definition["field"])
            if current is None or rank(entry) < rank(current):
                best[definition["field"]] = entry
    order = {definition["field"]: index for index, definition in enumerate(definitions)}
    return sorted(best.values(), key=lambda entry: order[entry["field"]])


def missing_fields(category: str, specs: list[dict[str, Any]]) -> list[str]:
    """List declared fields the manufacturer page never mentioned. Absence is not a negative value."""
    resolved = {entry["field"] for entry in specs}
    return [definition["field"] for definition in CATEGORY_FIELDS.get(category, ()) if definition["field"] not in resolved]
