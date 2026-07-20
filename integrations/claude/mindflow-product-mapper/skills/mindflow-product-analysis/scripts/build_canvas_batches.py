#!/usr/bin/env python3
"""Split a graph entity JSON document into small ordered MindFlow authoring batches."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

STAGES = {
    "root": 10, "domain": 20, "role": 20, "statusGroup": 20, "appSurface": 30,
    "node": 40, "edge": 50,
}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-operations", type=int, default=30)
    parser.add_argument("--max-nodes", type=int, default=8)
    parser.add_argument("--max-edges", type=int, default=16)
    args = parser.parse_args()
    if args.max_operations < 1 or args.max_nodes < 1 or args.max_edges < 1:
        parser.error("batch limits must be positive integers")
    data = json.loads(Path(args.input).read_text(encoding="utf-8"))
    entities = data.get("entities") if isinstance(data, dict) else None
    if not isinstance(entities, list):
        raise ValueError("input must contain an entities array")
    for index, entity in enumerate(entities):
        if not isinstance(entity, dict) or entity.get("entity") not in STAGES:
            raise ValueError(f"unsupported graph entity at index {index}: {entity}")
    ordered = sorted(enumerate(entities), key=lambda pair: (STAGES.get(pair[1].get("entity"), 99), pair[0]))
    batches: list[dict[str, object]] = []
    current: list[dict[str, object]] = []
    nodes = edges = 0
    for _, entity in ordered:
        operation = to_operation(entity)
        is_node = entity.get("entity") == "node"
        is_edge = entity.get("entity") == "edge"
        if current and (
            len(current) + 1 > args.max_operations or
            nodes + int(is_node) > args.max_nodes or
            edges + int(is_edge) > args.max_edges
        ):
            batches.append(make_batch(len(batches) + 1, current))
            current, nodes, edges = [], 0, 0
        current.append(operation)
        nodes += int(is_node)
        edges += int(is_edge)
    if current:
        batches.append(make_batch(len(batches) + 1, current))
    Path(args.output).write_text(json.dumps({"schemaVersion": 1, "batches": batches}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"batches: {len(batches)} -> {args.output}")
    return 0


def to_operation(entity: object) -> dict[str, object]:
    if not isinstance(entity, dict) or entity.get("entity") not in STAGES:
        raise ValueError(f"unsupported graph entity: {entity}")
    kind = entity["entity"]
    body = {key: value for key, value in entity.items() if key not in {"entity", "evidenceRefs", "origin", "confidence", "typeReason"}}
    if kind == "root":
        return {"op": "root.update", **body}
    if kind in {"domain", "role", "statusGroup", "appSurface"}:
        return {"op": "taxonomy.upsert", "kind": kind, **body}
    if kind == "node":
        return {"op": "node.upsert", **body}
    return {"op": "edge.upsert", **body}


def make_batch(number: int, operations: list[dict[str, object]]) -> dict[str, object]:
    return {
        "batchId": f"batch-{number:03d}",
        "batchLabel": f"Progressive canvas batch {number}",
        "operations": operations,
    }


if __name__ == "__main__":
    raise SystemExit(main())
