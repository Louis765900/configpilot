"""Build ConfigPilot's documentary catalogue from a DOCX and a PDF inventory.

The generated records are intentionally conservative: unknown specifications,
prices and release dates stay null. Source documents are data inputs only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from pypdf import PdfReader


NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
CATEGORY_SECTIONS = {
    "2.": "cpu", "3.": "gpu", "4.": "motherboard", "5.": "ram",
    "6.": "storage", "7.": "psu", "8.": "cooling", "9.": "case", "10.": "expansion",
}


def slug(value: str) -> str:
    plain = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    core = re.sub(r"[^a-z0-9]+", "-", plain).strip("-")[:58]
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:8]
    return f"doc-{core}-{digest}"


def clean(value: str) -> str:
    value = value.replace("\ufb01", "fi").replace("\ufb02", "fl").replace("\u00a0", " ")
    value = re.sub(r"\s+", " ", value).strip(" ,.;")
    for pollution in ("Tom's Hardware Forum", "TweakTown", "Wccftech", "Newegg", "Pangoly", "VideoCardz"):
        value = value.replace(pollution, "")
    return re.sub(r"\s+", " ", value).strip(" ,.;")


def year_from(value: str) -> int | None:
    match = re.search(r"(?:19|20)\d{2}", value)
    return int(match.group()) if match else None


def product(category: str, brand: str, name: str, reference: str, series: str,
            year: int | None, specs: dict, source_file: str, confidence: str = "Faible") -> dict:
    brand, name, reference, series = map(clean, (brand, name, reference, series))
    return {
        "id": slug(f"{category}|{brand}|{name}|{reference}"),
        "category": category,
        "brand": brand or "À vérifier",
        "name": name,
        "reference": reference or name,
        "series": series or "À vérifier",
        "year": year,
        "newPrice": None,
        "usedPrice": None,
        "confidence": confidence,
        "status": "Documentaire",
        "notes": f"Import documentaire depuis « {source_file} ». Référence à confirmer sur une fiche constructeur officielle.",
        "performance": None,
        "specs": specs,
        "strengths": ["Référence indexée et recherchable"],
        "weaknesses": ["Caractéristiques détaillées et prix à vérifier"],
        "usage": "Identification, veille et recherche documentaire",
    }


def docx_blocks(path: Path):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    body = root.find("w:body", NS)
    if body is None:
        return
    for node in body:
        kind = node.tag.rsplit("}", 1)[-1]
        if kind == "p":
            value = clean("".join(t.text or "" for t in node.findall(".//w:t", NS)))
            if value:
                yield "paragraph", value
        elif kind == "tbl":
            for row in node.findall("./w:tr", NS):
                cells = []
                for cell in row.findall("./w:tc", NS):
                    cells.append(clean("".join(t.text or "" for t in cell.findall(".//w:t", NS))))
                if any(cells):
                    yield "row", cells


def infer_brand(category: str, reference: str, context: str) -> str:
    value = f"{reference} {context}".lower()
    if category == "cpu":
        return "AMD" if any(x in value for x in ("ryzen", "athlon", "phenom", "threadripper", "epyc", "fx-", "apu")) else "Intel"
    if category == "gpu":
        if any(x in value for x in ("radeon", "firepro", "instinct")):
            return "AMD"
        if any(x in value for x in ("arc ", "intel hd", "intel uhd", "iris")):
            return "Intel"
        return "NVIDIA"
    return "À vérifier"


def compact_name(brand: str, reference: str) -> str:
    first = re.split(r"\s[/,]\s|\s→\s", reference, maxsplit=1)[0]
    suffix = " et variantes" if first != reference else ""
    if brand.lower() not in first.lower() and brand != "À vérifier":
        first = f"{brand} {first}"
    return clean(first + suffix)


def parse_docx(path: Path) -> list[dict]:
    records: list[dict] = []
    category = ""
    context = ""
    for kind, value in docx_blocks(path):
        if kind == "paragraph":
            if value.startswith("11."):
                category = ""
                context = value
                continue
            for prefix, candidate in CATEGORY_SECTIONS.items():
                if value.startswith(prefix) and (len(value) == len(prefix) or value[len(prefix)].isspace()):
                    category = candidate
                    context = value
                    break
            if any(token in value for token in ("Socket ", "Sockets ", "GeForce ", "Radeon ", "Intel Arc")):
                context = value
            continue
        cells = value
        if not category or not cells or cells[0].lower() in {
            "références", "catégorie", "socket", "type", "format", "connecteur", "marque", "thème"
        }:
            continue
        reference = clean(cells[0])
        if len(reference) < 3:
            continue
        detail = " · ".join(clean(c) for c in cells[1:] if clean(c))
        if category in {"cpu", "gpu"}:
            brand = infer_brand(category, reference, context)
            series = clean(context.split("—", 1)[0])[:120]
            specs = {"Famille / socket": series or "À vérifier", "Données documentaires": detail or "À vérifier", "Références associées": reference}
            records.append(product(category, brand, compact_name(brand, reference), reference, series,
                                   year_from(detail + " " + context), specs, path.name, "Moyenne"))
        elif category in {"ram", "storage", "psu", "cooling", "case", "expansion"}:
            brand = reference if category in {"ram", "storage"} and len(reference.split()) <= 4 else "À vérifier"
            name = compact_name(brand, detail or reference)
            specs = {"Type / famille": reference, "Références ou caractéristiques": detail or "À vérifier"}
            records.append(product(category, brand, name, detail or reference, reference,
                                   year_from(detail), specs, path.name))
    return records


BRAND_HEADINGS = {
    "ASUS": "ASUS", "MSI": "MSI", "GIGABYTE": "Gigabyte", "ASRock": "ASRock",
    "BIOSTAR": "Biostar", "Colorful": "Colorful", "NZXT": "NZXT", "EVGA": "EVGA",
    "Supermicro": "Supermicro", "Zotac": "Zotac", "Sapphire": "Sapphire",
}
INLINE_BRANDS = ("Huananzhi", "Machinist", "Jingsha", "Qiyida", "Dell", "HP", "Lenovo", "Fujitsu", "Foxconn", "ECS")
OEM_HEADINGS = {
    "Dell OptiPlex": "Dell", "HP EliteDesk": "HP", "Lenovo ThinkCentre": "Lenovo",
    "Fujitsu Esprimo": "Fujitsu", "Acer / Foxconn / ECS": "OEM",
}


def socket_from(key: str, context: str) -> str:
    value = f"{key} {context}".upper()
    mappings = [
        (("X870", "B850", "B840", "X670", "B650"), "AM5"),
        (("X570", "B550", "B450", "X470", "B350", "A520", "A320"), "AM4"),
        (("Z890", "B860", "H810"), "LGA1851"),
        (("Z790", "B760", "Z690", "B660", "H610", "H770", "H670"), "LGA1700"),
        (("Z590", "B560", "Z490", "B460", "H510", "H570"), "LGA1200"),
        (("Z390", "Z370", "B360", "H370", "B365", "H310"), "LGA1151 v2"),
        (("Z270", "B250", "H270", "Z170"), "LGA1151 v1"),
        (("X299",), "LGA2066"), (("X99",), "LGA2011-v3"), (("X79",), "LGA2011"),
        (("TRX40",), "sTRX4"), (("X399",), "TR4"), (("AM3", "990FX", "970"), "AM3+"),
        (("FM2", "A88X"), "FM2+"), (("LGA 1150", "Z97", "Z87"), "LGA1150"),
        (("LGA 1155", "Z77", "Z68", "P67", "B75"), "LGA1155"),
        (("LGA 1366", "X58"), "LGA1366"), (("LGA 775", "P45", "G41"), "LGA775"),
    ]
    for tokens, socket in mappings:
        if any(token in value for token in tokens):
            return socket
    match = re.search(r"LGA\s*\d+(?:\s*V[12])?|AM[345]\+?|STRX4|STR5|TR4", value)
    return clean(match.group()) if match else "À vérifier"


def split_models(value: str) -> list[str]:
    value = clean(value)
    parts, current, depth = [], [], 0
    for char in value:
        depth += 1 if char == "(" else -1 if char == ")" and depth else 0
        if char == "," and depth == 0:
            part = clean("".join(current))
            if part:
                parts.append(part)
            current = []
        else:
            current.append(char)
    last = clean("".join(current))
    if last:
        parts.append(last)
    return [p for p in parts if len(p) >= 3 and p.lower() not in {"intel", "amd", "legacy"}]


def parse_pdf(path: Path) -> list[dict]:
    records: list[dict] = []
    brand = "À vérifier"
    context = ""
    pending_key = ""
    pending_value = ""

    def flush():
        nonlocal pending_key, pending_value
        key, value = clean(pending_key), clean(pending_value)
        pending_key = pending_value = ""
        if not key or not value or brand == "À vérifier":
            return
        socket = socket_from(key, context)
        chipset = clean(key.split("(", 1)[0])
        for model in split_models(value):
            model = clean(re.sub(r"^(ASUS|BIOSTAR|NZXT)\s+", "", model, flags=re.I))
            if not model or len(model) > 150 or model.lower().startswith(("modèles en circulation", "cartes oem")):
                continue
            full_name = model if brand.lower() in model.lower() else f"{brand} {model}"
            fmt = "Mini-ITX" if "ITX" in model.upper() else "Micro-ATX" if "MATX" in model.upper() else "À vérifier"
            specs = {"Socket": socket, "Chipset / groupe": chipset, "Format": fmt,
                     "RAM": "DDR5" if "DDR5" in context.upper() else "DDR4" if "DDR4" in context.upper() else "À vérifier"}
            records.append(product("motherboard", brand, full_name, model, chipset, None,
                                   specs, path.name, "Faible"))

    reader = PdfReader(path)
    for page in reader.pages:
        raw_lines = (page.extract_text() or "").splitlines()
        for raw in raw_lines:
            line = clean(raw)
            if not line:
                continue
            heading = next((value for marker, value in BRAND_HEADINGS.items() if line == marker or line.startswith(marker + " (")), None)
            if heading:
                flush(); brand = heading; context = line; continue
            oem_heading = next((value for marker, value in OEM_HEADINGS.items() if line.startswith(marker)), None)
            if oem_heading:
                flush(); brand = oem_heading; context = line; continue
            if line.startswith("OEM propriétaires"):
                flush(); brand = "À vérifier"; context = line; continue
            if any(line.startswith(prefix) for prefix in ("AMD AM", "Intel LGA", "Legacy Intel", "Legacy AMD", "GIGABYTE HEDT", "MSI HEDT", "ASRock LGA", "AMD HEDT")):
                flush(); context = line; continue
            inline = next((candidate for candidate in INLINE_BRANDS if line.startswith(candidate + " :")), None)
            if inline:
                flush(); brand = inline; pending_key = context or "Références"; pending_value = line.split(":", 1)[1]; flush(); continue
            match = re.match(r"^([^:]{1,65})\s*:\s*(.+)$", line)
            if match and any(ch.isdigit() for ch in match.group(1)):
                flush(); pending_key, pending_value = match.group(1), match.group(2); continue
            if pending_key:
                pending_value += " " + line
    flush()
    return records


def deduplicate(records: list[dict]) -> list[dict]:
    seen, output = set(), []
    for record in records:
        key = (record["category"], re.sub(r"[^a-z0-9]", "", record["name"].lower()))
        if key not in seen:
            seen.add(key); output.append(record)
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--docx", type=Path, required=True)
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    records = deduplicate(parse_docx(args.docx) + parse_pdf(args.pdf))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = {category: sum(r["category"] == category for r in records) for category in sorted({r["category"] for r in records})}
    print(json.dumps({"total": len(records), "counts": counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
