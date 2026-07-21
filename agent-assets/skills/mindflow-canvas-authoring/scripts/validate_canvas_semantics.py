#!/usr/bin/env python3
"""Validate a saved MindFlow canvas against workflow-version 3 UI composition."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("canvas")
    parser.add_argument("--analysis-packet")
    parser.add_argument("--minimum-screens", type=int, default=1)
    parser.add_argument("--require-multiregion", action="store_true")
    args = parser.parse_args()
    canvas_path = Path(args.canvas)
    try:
        canvas = load(canvas_path)
        packet = load(Path(args.analysis_packet)) if args.analysis_packet else None
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    errors: list[str] = []
    nodes = [node for node in canvas.get("nodes", []) if isinstance(node, dict) and node.get("status", "active") == "active"]
    edges = [edge for edge in canvas.get("edges", []) if isinstance(edge, dict) and edge.get("status", "active") == "active"]
    if len(nodes) < args.minimum_screens:
        errors.append(f"canvas has {len(nodes)} generic nodes; expected at least {args.minimum_screens}")
    node_by_title = {node.get("title"): node for node in nodes if isinstance(node.get("title"), str)}
    node_by_id = {node.get("nodeId"): node for node in nodes if isinstance(node.get("nodeId"), str)}
    app_by_id = {app.get("appId"): app for app in canvas.get("appSurfaces", []) if isinstance(app, dict)}
    duplicate_titles = sorted(title for title in node_by_title if sum(node.get("title") == title for node in nodes) > 1)
    if duplicate_titles:
        errors.append(f"duplicate active node titles: {', '.join(duplicate_titles)}")

    multi_region = 0
    feature_total = 0
    tagged = 0
    for node in nodes:
        groups = node.get("featureGroups") if isinstance(node.get("featureGroups"), list) else []
        if len(groups) >= 2:
            multi_region += 1
        if args.require_multiregion and node.get("pageType") in {"page", "popup"} and len(groups) < 2:
            errors.append(f"node {node.get('title')!r} requires at least two visual regions")
        if not groups or any(not isinstance(group.get("items"), list) or not group["items"] for group in groups if isinstance(group, dict)):
            errors.append(f"node {node.get('title')!r} has an empty composition region")
        feature_total += sum(len(group.get("items", [])) for group in groups if isinstance(group, dict))
        if all(isinstance(node.get(field), list) and node[field] for field in ("appSurfaceIds", "domainIds", "roleIds")):
            tagged += 1

    invalid_edge_sources = [
        edge.get("edgeId", "unknown") for edge in edges
        if edge.get("from", {}).get("kind") == "node"
    ]
    if invalid_edge_sources:
        errors.append(f"edges originate from generic node cards: {', '.join(invalid_edge_sources)}")
    for edge in edges:
        source = edge.get("from", {})
        target = edge.get("to", {})
        source_entity = app_by_id.get(source.get("appId")) if source.get("kind") == "appSurface" else node_by_id.get(source.get("nodeId"))
        target_entity = node_by_id.get(target.get("nodeId"))
        if not source_entity or not target_entity:
            continue
        for edge_field, entity_field in (("appSurfaceIds", "appSurfaceIds"), ("domainIds", "domainIds"), ("roleIds", "roleIds")):
            source_values = source_entity.get(entity_field, [])
            target_values = target_entity.get(entity_field, [])
            expected = list(dict.fromkeys([*source_values, *target_values]))
            if edge.get(edge_field) != expected:
                errors.append(f"edge {edge.get('edgeId')} {edge_field} must be derived from both endpoints")

    expected_screens = composition_matches = evidence_features = interactive_expected = interactive_matched = 0
    if packet is not None:
        if packet.get("schemaVersion") != 2:
            errors.append("analysis packet must use schemaVersion 2")
        regions = {item.get("semanticKey"): item for item in packet.get("regions", []) if isinstance(item, dict)}
        features = {item.get("semanticKey"): item for item in packet.get("features", []) if isinstance(item, dict)}
        screen_by_key = {item.get("semanticKey"): item for item in packet.get("screens", []) if isinstance(item, dict)}
        title_for_key = {key: item.get("name") for key, item in screen_by_key.items()}
        for screen_key, screen in screen_by_key.items():
            expected_screens += 1
            node = node_by_title.get(screen.get("name"))
            if not node:
                errors.append(f"canvas is missing screen {screen_key} ({screen.get('name')})")
                continue
            groups = node.get("featureGroups", [])
            expected_region_keys = screen.get("regionKeys", [])
            if [group.get("name") for group in groups] != [regions[key].get("name") for key in expected_region_keys if key in regions]:
                errors.append(f"canvas group order differs from analysis for {screen_key}")
                continue
            screen_ok = True
            for group, region_key in zip(groups, expected_region_keys):
                region = regions.get(region_key, {})
                expected_feature_keys = region.get("featureKeys", [])
                items = group.get("items", [])
                if [item.get("name") for item in items] != [features[key].get("name") for key in expected_feature_keys if key in features]:
                    errors.append(f"canvas item order differs from analysis for {region_key}")
                    screen_ok = False
                    continue
                for item, feature_key in zip(items, expected_feature_keys):
                    feature = features.get(feature_key, {})
                    evidence_features += 1
                    description = item.get("description", "")
                    for visible in feature.get("contentSpec", []):
                        if visible not in description:
                            errors.append(f"canvas feature {feature_key} omits {visible!r}")
                            screen_ok = False
                    interaction = feature.get("interaction")
                    if isinstance(interaction, dict) and interaction.get("targetSemanticKey"):
                        interactive_expected += 1
                        target_title = title_for_key.get(interaction["targetSemanticKey"])
                        target = node_by_title.get(target_title)
                        matches = [
                            edge for edge in edges
                            if edge.get("from", {}).get("nodeId") == node.get("nodeId")
                            and edge.get("from", {}).get("itemId") == item.get("itemId")
                            and target is not None
                            and edge.get("to", {}).get("nodeId") == target.get("nodeId")
                            and edge.get("type") == interaction.get("edgeType")
                        ]
                        if len(matches) == 1:
                            interactive_matched += 1
                        else:
                            errors.append(f"canvas feature {feature_key} has no exact interaction edge")
            if screen_ok:
                composition_matches += 1

    metrics = {
        "genericNodes": len(nodes),
        "edges": len(edges),
        "featureGroups": sum(len(node.get("featureGroups", [])) for node in nodes),
        "featureItems": feature_total,
        "multiRegionNodes": multi_region,
        "taxonomyTaggedNodes": tagged,
        "expectedScreens": expected_screens,
        "compositionMatchedScreens": composition_matches,
        "evidenceMappedFeatures": evidence_features,
        "interactiveExpected": interactive_expected,
        "interactiveMatched": interactive_matched,
    }
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        print(json.dumps(metrics, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps({"valid": True, **metrics}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
