#!/usr/bin/env python3
"""Validate portable MindFlow product-analysis packets (schema versions 1 and 2)."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

BASE_ARRAY_FIELDS = (
    "sources", "terminology", "applications", "domains", "roles", "requirements",
    "screens", "features", "states", "businessFlows", "dataFlows", "permissions",
    "constraints", "conflicts", "unresolved",
)
MODES = {
    "documents-to-canvas", "code-to-canvas", "canvas-to-canvas-update",
    "canvas-audit", "canvas-to-deliverable",
}
PAGE_TYPES = {"skeleton", "navigation", "page", "popup", "component"}
REGION_KINDS = {
    "header", "navigation", "summary", "filter", "form", "content", "list",
    "table", "detail", "tabs", "actions", "feedback", "footer", "overlay",
}
REGION_LAYOUTS = {"stack", "row", "grid", "list", "table", "form", "tabs", "toolbar", "overlay"}
UI_TYPES = {
    "text", "image", "badge", "metric", "chart", "field", "selector", "upload",
    "button", "link", "tab", "card", "list-item", "table", "row-action",
    "pagination", "notice", "status", "media",
}
EDGE_TYPES = {"interaction", "autoNavigate", "dataFlow", "statusChange", "nestedRelation"}


def ui_composition_signature(packet: dict) -> tuple:
    """Return a source-agnostic signature for comparing document/code UI models."""
    screens = index_by_key(packet.get("screens", []))
    regions = index_by_key(packet.get("regions", []))
    features = index_by_key(packet.get("features", []))
    signature = []
    for screen_key in sorted(screens):
        screen = screens[screen_key]
        region_signature = []
        for region_key in screen.get("regionKeys", []):
            region = regions.get(region_key, {})
            feature_signature = []
            for feature_key in region.get("featureKeys", []):
                feature = features.get(feature_key, {})
                interaction = feature.get("interaction") or {}
                feature_signature.append((
                    feature.get("name"),
                    feature.get("uiType"),
                    tuple(feature.get("contentSpec", [])),
                    feature.get("dataBinding"),
                    feature.get("required"),
                    feature.get("visibleWhen"),
                    interaction.get("event"),
                    interaction.get("effect"),
                    interaction.get("edgeType"),
                    interaction.get("targetSemanticKey"),
                ))
            region_signature.append((
                region.get("name"),
                region.get("kind"),
                region.get("layout"),
                tuple(feature_signature),
            ))
        signature.append((
            screen_key,
            screen.get("pageType"),
            screen.get("application"),
            screen.get("parent"),
            tuple(region_signature),
        ))
    return tuple(signature)


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
        version = packet.get("schemaVersion")
        if version not in {1, 2}:
            errors.append("schemaVersion must be 1 or 2")
        if packet.get("mode") not in MODES:
            errors.append(f"mode must be one of {', '.join(sorted(MODES))}")
        array_fields = BASE_ARRAY_FIELDS + (("regions",) if version == 2 else ())
        for field in array_fields:
            if not isinstance(packet.get(field), list):
                errors.append(f"{field} must be an array")
        for field in array_fields:
            if field == "sources":
                continue
            for index, item in enumerate(packet.get(field, [])):
                validate_evidence_record(field, index, item, errors)
        if version == 2:
            validate_v2(packet, errors)
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1
    if packet.get("schemaVersion") == 2:
        print(
            f"valid: {path} (screens={len(packet['screens'])}, regions={len(packet['regions'])}, "
            f"features={len(packet['features'])})"
        )
    else:
        print(f"valid: {path} (legacy schemaVersion=1)")
    return 0


def validate_evidence_record(field: str, index: int, item: object, errors: list[str]) -> None:
    prefix = f"{field}[{index}]"
    if not isinstance(item, dict):
        errors.append(f"{prefix} must be an object")
        return
    if not nonempty(item.get("semanticKey")):
        errors.append(f"{prefix}.semanticKey is required")
    origin = item.get("origin")
    if origin not in {"explicit", "inferred"}:
        errors.append(f"{prefix}.origin must be explicit or inferred")
    if item.get("confidence") not in {"high", "medium", "low"}:
        errors.append(f"{prefix}.confidence must be high, medium, or low")
    evidence = item.get("evidenceRefs")
    if not string_list(evidence):
        errors.append(f"{prefix}.evidenceRefs must be a string array")
    elif origin == "explicit" and not evidence:
        errors.append(f"{prefix} explicit records require evidenceRefs")
    if origin == "inferred" and not nonempty(item.get("reason")):
        errors.append(f"{prefix} inferred records require reason")


def validate_v2(packet: dict, errors: list[str]) -> None:
    keys: dict[str, tuple[str, int]] = {}
    for field in BASE_ARRAY_FIELDS[1:] + ("regions",):
        for index, item in enumerate(packet.get(field, [])):
            if not isinstance(item, dict) or not nonempty(item.get("semanticKey")):
                continue
            key = item["semanticKey"]
            if key in keys:
                prior_field, prior_index = keys[key]
                errors.append(f"{field}[{index}].semanticKey duplicates {prior_field}[{prior_index}]: {key}")
            else:
                keys[key] = (field, index)

    screens = index_by_key(packet.get("screens", []))
    regions = index_by_key(packet.get("regions", []))
    features = index_by_key(packet.get("features", []))
    region_children: dict[str, list[tuple[int, str]]] = defaultdict(list)
    screen_children: dict[str, list[tuple[int, str]]] = defaultdict(list)

    for index, screen in enumerate(packet.get("screens", [])):
        if not isinstance(screen, dict):
            continue
        prefix = f"screens[{index}]"
        if not nonempty(screen.get("name")):
            errors.append(f"{prefix}.name is required")
        if screen.get("pageType") not in PAGE_TYPES:
            errors.append(f"{prefix}.pageType must be one of {', '.join(sorted(PAGE_TYPES))}")
        for field in ("application", "parent"):
            if not nonempty(screen.get(field)):
                errors.append(f"{prefix}.{field} is required")
        for field in ("domainKeys", "roleKeys", "regionKeys"):
            if not string_list(screen.get(field)):
                errors.append(f"{prefix}.{field} must be a string array")
        if screen.get("pageType") in {"page", "popup"} and len(screen.get("regionKeys", [])) < 2:
            errors.append(f"{prefix} page/popup requires at least two visual regions")

    for index, region in enumerate(packet.get("regions", [])):
        if not isinstance(region, dict):
            continue
        prefix = f"regions[{index}]"
        screen_key = region.get("screenKey")
        if screen_key not in screens:
            errors.append(f"{prefix}.screenKey does not reference screens: {screen_key!r}")
        if not nonempty(region.get("name")):
            errors.append(f"{prefix}.name is required")
        if region.get("kind") not in REGION_KINDS:
            errors.append(f"{prefix}.kind must be a controlled region kind")
        if region.get("layout") not in REGION_LAYOUTS:
            errors.append(f"{prefix}.layout must be a controlled region layout")
        if not positive_int(region.get("order")):
            errors.append(f"{prefix}.order must be a positive integer")
        if not string_list(region.get("featureKeys")) or not region.get("featureKeys"):
            errors.append(f"{prefix}.featureKeys must be a non-empty string array")
        if nonempty(screen_key) and positive_int(region.get("order")) and nonempty(region.get("semanticKey")):
            screen_children[screen_key].append((region["order"], region["semanticKey"]))

    interactive_features: set[str] = set()
    for index, feature in enumerate(packet.get("features", [])):
        if not isinstance(feature, dict):
            continue
        prefix = f"features[{index}]"
        screen_key = feature.get("screenKey")
        region_key = feature.get("regionKey")
        if screen_key not in screens:
            errors.append(f"{prefix}.screenKey does not reference screens: {screen_key!r}")
        if region_key not in regions:
            errors.append(f"{prefix}.regionKey does not reference regions: {region_key!r}")
        elif regions[region_key].get("screenKey") != screen_key:
            errors.append(f"{prefix}.regionKey belongs to another screen")
        if not nonempty(feature.get("name")):
            errors.append(f"{prefix}.name is required")
        if feature.get("uiType") not in UI_TYPES:
            errors.append(f"{prefix}.uiType must be a controlled UI type")
        if not positive_int(feature.get("order")):
            errors.append(f"{prefix}.order must be a positive integer")
        if not string_list(feature.get("contentSpec")) or not feature.get("contentSpec"):
            errors.append(f"{prefix}.contentSpec must be a non-empty string array")
        if "required" in feature and not isinstance(feature["required"], bool):
            errors.append(f"{prefix}.required must be boolean")
        for optional in ("dataBinding", "visibleWhen"):
            if optional in feature and not nonempty(feature[optional]):
                errors.append(f"{prefix}.{optional} must be a non-empty string when present")
        interaction = feature.get("interaction")
        if interaction is not None:
            if not isinstance(interaction, dict) or not nonempty(interaction.get("event")) or not nonempty(interaction.get("effect")):
                errors.append(f"{prefix}.interaction requires event and effect")
            else:
                interactive_features.add(feature.get("semanticKey", ""))
                edge_type = interaction.get("edgeType")
                target = interaction.get("targetSemanticKey")
                if edge_type is not None and edge_type not in EDGE_TYPES:
                    errors.append(f"{prefix}.interaction.edgeType is unsupported")
                if target is not None and target not in screens and target not in keys:
                    errors.append(f"{prefix}.interaction.targetSemanticKey is unresolved: {target}")
        if nonempty(region_key) and positive_int(feature.get("order")) and nonempty(feature.get("semanticKey")):
            region_children[region_key].append((feature["order"], feature["semanticKey"]))

    validate_owned_order("screen", screens, "regionKeys", screen_children, regions, errors)
    validate_owned_order("region", regions, "featureKeys", region_children, features, errors)
    if not interactive_features:
        errors.append("schemaVersion 2 packet requires at least one concrete interactive feature")


def validate_owned_order(
    label: str,
    owners: dict[str, dict],
    child_field: str,
    actual: dict[str, list[tuple[int, str]]],
    child_index: dict[str, dict],
    errors: list[str],
) -> None:
    for owner_key, owner in owners.items():
        declared = owner.get(child_field, [])
        ordered = sorted(actual.get(owner_key, []))
        orders = [order for order, _ in ordered]
        actual_keys = [key for _, key in ordered]
        if orders != list(range(1, len(orders) + 1)):
            errors.append(f"{label} {owner_key} child order must be contiguous from 1")
        if declared != actual_keys:
            errors.append(f"{label} {owner_key}.{child_field} must match child order")
        missing = [key for key in declared if key not in child_index]
        if missing:
            errors.append(f"{label} {owner_key}.{child_field} has unresolved keys: {', '.join(missing)}")


def index_by_key(records: object) -> dict[str, dict]:
    if not isinstance(records, list):
        return {}
    return {
        item["semanticKey"]: item for item in records
        if isinstance(item, dict) and nonempty(item.get("semanticKey"))
    }


def nonempty(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def string_list(value: object) -> bool:
    return isinstance(value, list) and all(nonempty(item) for item in value)


def positive_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


if __name__ == "__main__":
    raise SystemExit(main())
