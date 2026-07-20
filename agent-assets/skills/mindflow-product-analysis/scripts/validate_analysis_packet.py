#!/usr/bin/env python3
"""Validate the portable MindFlow product-analysis packet."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ARRAY_FIELDS = (
    "sources", "terminology", "applications", "domains", "roles", "requirements",
    "screens", "features", "states", "businessFlows", "dataFlows", "permissions",
    "constraints", "conflicts", "unresolved",
)
EVIDENCE_FIELDS = ARRAY_FIELDS[1:]
MODES = {
    "documents-to-canvas", "code-to-canvas", "canvas-to-canvas-update",
    "canvas-audit", "canvas-to-deliverable",
}


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_analysis_packet.py <analysis_packet.json>", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    try:
        packet = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    errors: list[str] = []
    if not isinstance(packet, dict):
        errors.append("packet must be an object")
    else:
        if packet.get("schemaVersion") != 1:
            errors.append("schemaVersion must be 1")
        if packet.get("mode") not in MODES:
            errors.append(f"mode must be one of {', '.join(sorted(MODES))}")
        for field in ARRAY_FIELDS:
            if not isinstance(packet.get(field), list):
                errors.append(f"{field} must be an array")
        for field in EVIDENCE_FIELDS:
            for index, item in enumerate(packet.get(field, [])):
                validate_record(field, index, item, errors)
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1
    print(f"valid: {path}")
    return 0


def validate_record(field: str, index: int, item: object, errors: list[str]) -> None:
    prefix = f"{field}[{index}]"
    if not isinstance(item, dict):
        errors.append(f"{prefix} must be an object")
        return
    if not isinstance(item.get("semanticKey"), str) or not item["semanticKey"].strip():
        errors.append(f"{prefix}.semanticKey is required")
    origin = item.get("origin")
    if origin not in {"explicit", "inferred"}:
        errors.append(f"{prefix}.origin must be explicit or inferred")
    if item.get("confidence") not in {"high", "medium", "low"}:
        errors.append(f"{prefix}.confidence must be high, medium, or low")
    evidence = item.get("evidenceRefs")
    if not isinstance(evidence, list) or not all(isinstance(value, str) and value.strip() for value in evidence):
        errors.append(f"{prefix}.evidenceRefs must be a string array")
    elif origin == "explicit" and not evidence:
        errors.append(f"{prefix} explicit records require evidenceRefs")
    if origin == "inferred" and (not isinstance(item.get("reason"), str) or not item["reason"].strip()):
        errors.append(f"{prefix} inferred records require reason")


if __name__ == "__main__":
    raise SystemExit(main())
