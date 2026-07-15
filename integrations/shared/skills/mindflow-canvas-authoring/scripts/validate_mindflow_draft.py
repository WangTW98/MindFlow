#!/usr/bin/env python3
"""Validate fenced JSON MindFlow graph draft records."""

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


def substantive_copy(value, minimum: int) -> bool:
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


def validate_file(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        documents = list(fenced_json(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError) as error:
        return [f"{path}: invalid fenced JSON: {error}"]
    if not documents:
        return [f"{path}: no fenced JSON records"]
    for document in documents:
        records = list(walk(document))
        for record in records:
            page_type = record.get("pageType")
            if page_type is not None and page_type not in PAGE_TYPES:
                errors.append(f"{path}: unsupported pageType {page_type!r}")
            edge_type = record.get("edgeType", record.get("type") if record.get("entity") == "edge" else None)
            if edge_type is not None and edge_type not in EDGE_TYPES:
                errors.append(f"{path}: unsupported edge type {edge_type!r}")
            if record.get("entity") == "edge":
                if not record.get("typeReason"):
                    errors.append(f"{path}: edge missing typeReason")
                if record.get("unresolved"):
                    errors.append(f"{path}: unresolved relation must not be emitted as an edge")
                source = record.get("from", {})
                if source.get("kind") == "node":
                    errors.append(f"{path}: MCP edges must use a featureItem or featureGroup outlet, not a generic node card")
            if record.get("entity") == "node":
                feature_groups = record.get("featureGroups")
                if not isinstance(feature_groups, list) or not any(isinstance(group, dict) and isinstance(group.get("items"), list) and group["items"] for group in feature_groups):
                    errors.append(f"{path}: node requires an explicit feature group with at least one feature item")
                if len(feature_groups or []) == 1:
                    group = feature_groups[0] if isinstance(feature_groups[0], dict) else {}
                    item_names = {item.get("name") for item in group.get("items", []) if isinstance(item, dict)}
                    if group.get("name") == "基础功能" and {"主要内容", "确认按钮"}.issubset(item_names):
                        errors.append(f"{path}: node still uses the default feature placeholder")
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
        node_groups = {}
        node_types = {}
        node_records = {}
        for record in records:
            if record.get("entity") != "node":
                continue
            key = record.get("localRef") or record.get("nodeId") or record.get("id")
            if isinstance(key, str):
                node_groups[key] = record.get("statusGroupId")
                node_types[key] = record.get("pageType")
                node_records[key] = record
        incoming = {key: [] for key in node_records}
        limited_outlets = {}
        for record in records:
            if record.get("entity") != "edge":
                continue
            source = record.get("from", {})
            target = record.get("to", {})
            target_ref = target.get("nodeRef") or target.get("nodeId")
            if target_ref in incoming:
                incoming[target_ref].append(record)
            edge_type = record.get("type")
            if edge_type in {"interaction", "autoNavigate", "statusChange"} and source.get("kind") in {"featureGroup", "featureItem"}:
                outlet = (
                    source.get("kind"),
                    source.get("nodeRef") or source.get("nodeId"),
                    source.get("groupRef") or source.get("groupId"),
                    source.get("itemRef") or source.get("itemId"),
                )
                if outlet in limited_outlets:
                    errors.append(f"{path}: feature outlet {outlet} has multiple interaction/autoNavigate/statusChange targets")
                else:
                    limited_outlets[outlet] = record
        for key, node_incoming in incoming.items():
            if not node_incoming:
                errors.append(f"{path}: node {key} has no incoming edge")
            if node_types.get(key) == "navigation":
                if len(node_incoming) != 1:
                    errors.append(f"{path}: navigation node {key} requires exactly one hierarchy parent")
                    continue
                parent_edge = node_incoming[0]
                source = parent_edge.get("from", {})
                source_ref = source.get("nodeRef") or source.get("nodeId")
                parent_type = node_types.get(source_ref)
                valid = (parent_type == "skeleton" and parent_edge.get("type") == "nestedRelation") or (parent_type == "navigation" and parent_edge.get("type") == "interaction")
                if not valid:
                    errors.append(f"{path}: navigation node {key} must come from skeleton nestedRelation or navigation interaction")
        for record in records:
            if record.get("entity") != "edge" or record.get("type") != "statusChange":
                continue
            source = record.get("from", {})
            target = record.get("to", {})
            source_ref = source.get("nodeRef") or source.get("nodeId")
            target_ref = target.get("nodeRef") or target.get("nodeId")
            if source_ref in node_groups and target_ref in node_groups:
                if not node_groups[source_ref] or node_groups[source_ref] != node_groups[target_ref]:
                    errors.append(f"{path}: statusChange endpoints must share one non-empty statusGroupId")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()
    errors = [error for file in args.files for error in validate_file(Path(file))]
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"valid: {len(args.files)} draft file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
