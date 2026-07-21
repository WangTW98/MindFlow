#!/usr/bin/env python3
"""Validate fenced JSON MindFlow graph drafts by framework, page, or final stage."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

EDGE_TYPES = {"interaction", "autoNavigate", "dataFlow", "statusChange", "nestedRelation"}
PAGE_TYPES = {"skeleton", "navigation", "page", "popup", "component"}
PLACEHOLDER_COPY = {
    "暂无", "待补充", "待分析", "pending", "todo", "示例项目", "项目综述", "项目目标",
    "独立入口", "应用端独立入口",
}
FRAMEWORK_GROUP = "框架定义"
FRAMEWORK_ITEM = "页面职责"


def substantive_copy(value: object, minimum: int) -> bool:
    if not isinstance(value, str):
        return False
    compact = re.sub(r"\s+", "", value).lower()
    if len(compact) < minimum:
        return False
    return not any(compact == placeholder or compact.startswith(f"{placeholder}：") for placeholder in PLACEHOLDER_COPY)


def fenced_json(text: str):
    for match in re.finditer(r"```json\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE):
        yield json.loads(match.group(1))


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def load_records(paths: list[Path]) -> tuple[list[tuple[Path, dict]], list[str]]:
    errors: list[str] = []
    records: list[tuple[Path, dict]] = []
    for path in paths:
        try:
            documents = list(fenced_json(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError) as error:
            errors.append(f"{path}: invalid fenced JSON: {error}")
            continue
        if not documents:
            errors.append(f"{path}: no fenced JSON records")
            continue
        for document in documents:
            records.extend((path, record) for record in walk(document) if isinstance(record, dict))
    return records, errors


def is_framework_stub(record: dict) -> bool:
    groups = record.get("featureGroups")
    if not isinstance(groups, list) or len(groups) != 1 or not isinstance(groups[0], dict):
        return False
    group = groups[0]
    items = group.get("items")
    return (
        group.get("name") == FRAMEWORK_GROUP and isinstance(items, list) and len(items) == 1 and
        isinstance(items[0], dict) and items[0].get("name") == FRAMEWORK_ITEM and
        substantive_copy(items[0].get("description"), 12)
    )


def endpoint_ref(endpoint: object) -> str | None:
    if not isinstance(endpoint, dict):
        return None
    return endpoint.get("nodeRef") or endpoint.get("nodeId")


def validate(
    paths: list[Path],
    stage: str,
    page_index: Path | None,
    analysis_packet: Path | None,
) -> list[str]:
    records, errors = load_records(paths)
    node_records: dict[str, tuple[Path, dict]] = {}
    node_groups: dict[str, object] = {}
    node_types: dict[str, object] = {}
    semantic_nodes: dict[str, str] = {}
    edges: list[tuple[Path, dict]] = []

    for path, record in records:
        page_type = record.get("pageType")
        if page_type is not None and page_type not in PAGE_TYPES:
            errors.append(f"{path}: unsupported pageType {page_type!r}")
        edge_type = record.get("edgeType", record.get("type") if record.get("entity") == "edge" else None)
        if edge_type is not None and edge_type not in EDGE_TYPES:
            errors.append(f"{path}: unsupported edge type {edge_type!r}")
        if record.get("entity") == "edge":
            edges.append((path, record))
            if not record.get("typeReason"):
                errors.append(f"{path}: edge missing typeReason")
            if record.get("unresolved"):
                errors.append(f"{path}: unresolved relation must not be emitted as an edge")
            source = record.get("from", {})
            target = record.get("to", {})
            if isinstance(source, dict) and source.get("kind") == "node":
                errors.append(f"{path}: MCP edges must use a featureItem or featureGroup outlet, not a generic node card")
            if (
                isinstance(source, dict) and source.get("kind") in {"root", "projectOverview"} and
                isinstance(target, dict) and target.get("kind") == "appSurface"
            ):
                errors.append(f"{path}: root-to-appSurface membership is a rendered system line and must not be stored as an edge")
            if stage == "framework" and record.get("type") != "nestedRelation":
                errors.append(f"{path}: framework stage may emit only true nestedRelation edges")
        if record.get("entity") == "node":
            feature_groups = record.get("featureGroups")
            if not isinstance(feature_groups, list) or not any(
                isinstance(group, dict) and isinstance(group.get("items"), list) and group["items"]
                for group in feature_groups
            ):
                errors.append(f"{path}: node requires an explicit feature group with at least one feature item")
            if len(feature_groups or []) == 1:
                group = feature_groups[0] if isinstance(feature_groups[0], dict) else {}
                item_names = {item.get("name") for item in group.get("items", []) if isinstance(item, dict)}
                if group.get("name") == "基础功能" and {"主要内容", "确认按钮"}.issubset(item_names):
                    errors.append(f"{path}: node still uses the default feature placeholder")
            if stage == "page" and is_framework_stub(record):
                errors.append(f"{path}: enriched/final node still uses the framework placeholder")
            key = record.get("localRef") or record.get("nodeId") or record.get("id")
            if isinstance(key, str):
                node_records[key] = (path, record)
                node_groups[key] = record.get("statusGroupId")
                node_types[key] = record.get("pageType")
                semantic_key = record.get("semanticKey")
                if isinstance(semantic_key, str):
                    if semantic_key in semantic_nodes and semantic_nodes[semantic_key] != key:
                        errors.append(f"{path}: duplicate node semanticKey {semantic_key}")
                    semantic_nodes[semantic_key] = key
        if record.get("entity") == "root":
            if not substantive_copy(record.get("summary"), 80):
                errors.append(f"{path}: root summary requires substantive source-grounded PRD-level copy")
            if not substantive_copy(record.get("goal"), 40):
                errors.append(f"{path}: root goal requires substantive source-grounded PRD-level copy")
        if record.get("entity") == "appSurface" and not substantive_copy(record.get("description"), 60):
            errors.append(f"{path}: appSurface description requires substantive source-grounded PRD-level copy")
        for obsolete in ("stableKey", "version", "replacementNodeIds", "states", "exceptions"):
            if obsolete in record:
                errors.append(f"{path}: obsolete field {obsolete}")

    incoming: dict[str, list[dict]] = {key: [] for key in node_records}
    limited_outlets: dict[tuple, tuple[Path, dict]] = {}
    for path, record in edges:
        source = record.get("from", {})
        target_ref = endpoint_ref(record.get("to", {}))
        if target_ref in incoming:
            incoming[target_ref].append(record)
        edge_type = record.get("type")
        if edge_type in {"interaction", "autoNavigate", "statusChange"} and isinstance(source, dict) and source.get("kind") in {"featureGroup", "featureItem"}:
            outlet = (
                source.get("kind"), endpoint_ref(source), source.get("groupRef") or source.get("groupId"),
                source.get("itemRef") or source.get("itemId"),
            )
            if outlet in limited_outlets:
                errors.append(f"{path}: feature outlet {outlet} has multiple interaction/autoNavigate/statusChange targets")
            else:
                limited_outlets[outlet] = (path, record)

    if stage == "final":
        for key, (path, record) in node_records.items():
            if is_framework_stub(record):
                errors.append(f"{path}: final node {key} still uses the framework placeholder")
        for key, node_incoming in incoming.items():
            path, _ = node_records[key]
            if not node_incoming:
                errors.append(f"{path}: node {key} has no incoming edge")
    for key, node_incoming in incoming.items():
        if node_types.get(key) != "navigation" or stage == "framework" and not node_incoming:
            continue
        path, _ = node_records[key]
        if stage == "final" and len(node_incoming) != 1:
            errors.append(f"{path}: navigation node {key} requires exactly one hierarchy parent")
            continue
        for parent_edge in node_incoming:
            source_ref = endpoint_ref(parent_edge.get("from", {}))
            parent_type = node_types.get(source_ref)
            valid = (parent_type == "skeleton" and parent_edge.get("type") == "nestedRelation") or (parent_type == "navigation" and parent_edge.get("type") == "interaction")
            if not valid:
                errors.append(f"{path}: navigation node {key} must come from skeleton nestedRelation or navigation interaction")
    for path, record in edges:
        if record.get("type") != "statusChange":
            continue
        source_ref = endpoint_ref(record.get("from", {}))
        target_ref = endpoint_ref(record.get("to", {}))
        if source_ref in node_groups and target_ref in node_groups:
            if not node_groups[source_ref] or node_groups[source_ref] != node_groups[target_ref]:
                errors.append(f"{path}: statusChange endpoints must share one non-empty statusGroupId")

    if page_index:
        try:
            index = json.loads(page_index.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            errors.append(f"{page_index}: invalid page index: {error}")
        else:
            expected = {page.get("semanticKey") for page in index.get("pages", []) if isinstance(page, dict)}
            missing = sorted(value for value in expected - semantic_nodes.keys() if isinstance(value, str))
            extra = sorted(value for value in semantic_nodes.keys() - expected if isinstance(value, str) and value.startswith(("page:", "popup:", "state:")))
            if missing:
                errors.append(f"{page_index}: indexed pages missing from graph: {', '.join(missing)}")
            if extra:
                errors.append(f"{page_index}: graph pages missing from page index: {', '.join(extra)}")
    if analysis_packet:
        validate_v3_composition(analysis_packet, node_records, semantic_nodes, edges, errors)
    return errors


def validate_v3_composition(
    packet_path: Path,
    node_records: dict[str, tuple[Path, dict]],
    semantic_nodes: dict[str, str],
    edges: list[tuple[Path, dict]],
    errors: list[str],
) -> None:
    try:
        packet = json.loads(packet_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        errors.append(f"{packet_path}: invalid analysis packet: {error}")
        return
    if packet.get("schemaVersion") != 2:
        errors.append(f"{packet_path}: v3 draft validation requires analysis packet schemaVersion 2")
        return
    screens = {item.get("semanticKey"): item for item in packet.get("screens", []) if isinstance(item, dict)}
    regions = {item.get("semanticKey"): item for item in packet.get("regions", []) if isinstance(item, dict)}
    features = {item.get("semanticKey"): item for item in packet.get("features", []) if isinstance(item, dict)}
    for screen_key, screen in screens.items():
        node_ref = semantic_nodes.get(screen_key)
        if not node_ref or node_ref not in node_records:
            errors.append(f"{packet_path}: screen has no graph node: {screen_key}")
            continue
        path, node = node_records[node_ref]
        for tag_field in ("appRefs", "domainRefs", "roleRefs"):
            if not isinstance(node.get(tag_field), list) or not node[tag_field]:
                errors.append(f"{path}: v3 screen {screen_key} requires non-empty {tag_field}")
        groups = node.get("featureGroups") if isinstance(node.get("featureGroups"), list) else []
        group_refs = [group.get("localRef") for group in groups if isinstance(group, dict)]
        if group_refs != screen.get("regionKeys"):
            errors.append(f"{path}: featureGroups must match analysis region order for {screen_key}")
            continue
        for group in groups:
            region_key = group.get("localRef")
            region = regions.get(region_key)
            if not region:
                errors.append(f"{path}: unknown analysis region {region_key}")
                continue
            if group.get("name") != region.get("name") or group.get("type") != region.get("kind"):
                errors.append(f"{path}: group does not preserve region name/kind for {region_key}")
            items = group.get("items") if isinstance(group.get("items"), list) else []
            item_refs = [item.get("localRef") for item in items if isinstance(item, dict)]
            if item_refs != region.get("featureKeys"):
                errors.append(f"{path}: items must match analysis feature order for {region_key}")
                continue
            for item in items:
                feature_key = item.get("localRef")
                feature = features.get(feature_key)
                if not feature:
                    errors.append(f"{path}: unknown analysis feature {feature_key}")
                    continue
                if item.get("name") != feature.get("name") or item.get("type") != feature.get("uiType"):
                    errors.append(f"{path}: item does not preserve feature name/uiType for {feature_key}")
                description = item.get("description", "")
                for visible in feature.get("contentSpec", []):
                    if visible not in description:
                        errors.append(f"{path}: item {feature_key} omits visible content {visible!r}")
                if feature.get("dataBinding") is not None and item.get("dataBinding") != feature.get("dataBinding"):
                    errors.append(f"{path}: item {feature_key} does not preserve dataBinding")
                if feature.get("required") is not None and item.get("required") != feature.get("required"):
                    errors.append(f"{path}: item {feature_key} does not preserve required")

    edge_by_outlet: dict[tuple[str | None, str | None, str | None], list[dict]] = {}
    for _, edge in edges:
        source = edge.get("from", {})
        if not isinstance(source, dict) or source.get("kind") != "featureItem":
            continue
        outlet = (endpoint_ref(source), source.get("groupRef") or source.get("groupId"), source.get("itemRef") or source.get("itemId"))
        edge_by_outlet.setdefault(outlet, []).append(edge)
    for feature_key, feature in features.items():
        interaction = feature.get("interaction")
        if not isinstance(interaction, dict) or not interaction.get("targetSemanticKey"):
            continue
        source_node = semantic_nodes.get(feature.get("screenKey"))
        outlet = (source_node, feature.get("regionKey"), feature_key)
        candidates = edge_by_outlet.get(outlet, [])
        target_ref = semantic_nodes.get(interaction["targetSemanticKey"])
        matches = [
            edge for edge in candidates
            if endpoint_ref(edge.get("to", {})) == target_ref and edge.get("type") == interaction.get("edgeType")
        ]
        if len(matches) != 1:
            errors.append(
                f"{packet_path}: interactive feature {feature_key} requires exactly one matching edge "
                f"to {interaction['targetSemanticKey']}"
            )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=["framework", "page", "final"], default="final")
    parser.add_argument("--page-index")
    parser.add_argument("--analysis-packet")
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()
    errors = validate(
        [Path(value) for value in args.files],
        args.stage,
        Path(args.page_index) if args.page_index else None,
        Path(args.analysis_packet) if args.analysis_packet else None,
    )
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"valid: {len(args.files)} draft file(s), stage={args.stage}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
