import json
import os
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TRAITS_JSON = os.path.join(ROOT, "traits.json")


@dataclass
class Finding:
    level: str  # "ERROR" | "WARN" | "INFO"
    message: str


def _read_png_size(path: str) -> Optional[Tuple[int, int]]:
    """Return (w,h) for a PNG by reading IHDR. None if not a PNG or unreadable."""
    try:
        with open(path, "rb") as f:
            sig = f.read(8)
            if sig != b"\x89PNG\r\n\x1a\n":
                return None
            # PNG chunks: length(4) type(4) data(length) crc(4)
            length = int.from_bytes(f.read(4), "big")
            ctype = f.read(4)
            if ctype != b"IHDR":
                return None
            data = f.read(length)
            if len(data) < 8:
                return None
            w = int.from_bytes(data[0:4], "big")
            h = int.from_bytes(data[4:8], "big")
            return (w, h)
    except OSError:
        return None


def _load_traits() -> Dict[str, Any]:
    with open(TRAITS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def _iter_traits(db: Dict[str, Any]) -> List[Tuple[str, Dict[str, Any]]]:
    out: List[Tuple[str, Dict[str, Any]]] = []
    for cat, items in db.items():
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict):
                out.append((cat, item))
    return out


def main() -> int:
    if not os.path.exists(TRAITS_JSON):
        print(f"ERROR: traits.json not found at {TRAITS_JSON}")
        return 2

    db = _load_traits()
    findings: List[Finding] = []

    seen_ids: Dict[str, set] = {}
    seen_files: Dict[str, set] = {}

    all_items = _iter_traits(db)
    if not all_items:
        findings.append(Finding("ERROR", "No trait lists found in traits.json"))

    for cat, t in all_items:
        tid = str(t.get("id", ""))
        name = str(t.get("name", ""))
        file_rel = t.get("file")

        if not tid:
            findings.append(Finding("ERROR", f"{cat}: missing id"))
            continue

        seen_ids.setdefault(cat, set())
        if tid in seen_ids[cat]:
            findings.append(Finding("ERROR", f"{cat}:{tid} duplicate id"))
        else:
            seen_ids[cat].add(tid)

        if file_rel is None:
            findings.append(Finding("ERROR", f"{cat}:{tid} missing file path"))
            continue
        if not isinstance(file_rel, str) or not file_rel.strip():
            findings.append(Finding("ERROR", f"{cat}:{tid} invalid file path"))
            continue

        # Normalize to filesystem path
        file_fs = os.path.normpath(os.path.join(ROOT, file_rel.replace("/", os.sep)))

        seen_files.setdefault(cat, set())
        if file_rel in seen_files[cat]:
            findings.append(Finding("WARN", f"{cat}:{tid} reuses file {file_rel}"))
        else:
            seen_files[cat].add(file_rel)

        if not os.path.exists(file_fs):
            findings.append(Finding("ERROR", f"{cat}:{tid} missing file: {file_rel}"))
            continue

        # Basic PNG sanity
        if file_rel.lower().endswith(".png"):
            size = _read_png_size(file_fs)
            if size is None:
                findings.append(Finding("WARN", f"{cat}:{tid} unreadable PNG header: {file_rel}"))
            else:
                w, h = size
                if (w, h) != (128, 128):
                    findings.append(Finding("WARN", f"{cat}:{tid} PNG is {w}x{h} (expected 128x128): {file_rel}"))
        else:
            findings.append(Finding("INFO", f"{cat}:{tid} non-PNG file: {file_rel}"))

        # Optional sanity
        if not name:
            findings.append(Finding("INFO", f"{cat}:{tid} missing display name"))

    # Summarize
    errors = [f for f in findings if f.level == "ERROR"]
    warns = [f for f in findings if f.level == "WARN"]
    infos = [f for f in findings if f.level == "INFO"]

    print("verify_assets.py")
    print(f"Workspace: {ROOT}")
    print(f"Traits: {os.path.relpath(TRAITS_JSON, ROOT)}")
    print(f"Items scanned: {len(all_items)}")
    print(f"Errors: {len(errors)} | Warnings: {len(warns)} | Info: {len(infos)}")

    for lvl_group in ("ERROR", "WARN", "INFO"):
        group = [f for f in findings if f.level == lvl_group]
        if not group:
            continue
        print(f"\n{lvl_group}:")
        for f in group:
            print(f"- {f.message}")

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
