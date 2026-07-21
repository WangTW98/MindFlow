#!/usr/bin/env python3
"""Create, validate, fingerprint, and checkpoint resumable MindFlow tasks."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

TASK_STATUSES = {"pending", "analyzing", "designing", "generating", "validating", "completed", "blocked"}
LEGACY_PHASES = {"initializing", "inventory", "analyzing", "synthesizing", "designing", "generating", "validating", "delivering", "completed"}
V2_PHASES = {
    "initializing", "inventory", "framework_analyzing", "product_prd", "page_prds",
    "framework_designing", "framework_generating", "page_enriching", "validating",
    "delivering", "completed",
}
PHASES = LEGACY_PHASES | V2_PHASES
CANVAS_MODES = {"documents-to-canvas", "code-to-canvas", "canvas-to-canvas-update"}
REQUIRED_FILES = [
    "mindflow_task.md", "source_inventory.md", "requirement_ledger.md", "analysis_summary.md", "analysis_packet.json",
    "graph/graph_summary.md", "state/entity_index.md", "state/generation_state.md",
    "state/batch_plan.json", "state/checkpoints.md", "reports/semantic_validation.md", "reports/final_validation.md",
]
V2_REQUIRED_FILES = [
    "prd/product-prd.md", "prd/page-index.json", "graph/framework.md", "state/page_generation.json",
]
IGNORED_PARTS = {".git", ".mindflow", "node_modules", "out", "out-test", "dist", "build", "coverage", ".cache", "__pycache__"}


def now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def slugify(value: str) -> str:
    value = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", value.lower()).strip("-")
    return value[:48] or "mindflow-task"


def yaml_scalar(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def init_task(args: argparse.Namespace) -> int:
    workspace = Path(args.workspace).expanduser().resolve()
    stamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
    task_id = args.task_id or f"{stamp}-{slugify(args.title)}"
    task = workspace / ".mindflow" / "tasks" / task_id
    if task.exists():
        raise ValueError(f"Task already exists: {task}")
    workflow_version = 2 if args.mode in CANVAS_MODES else 1
    directories = ["analysis", "graph", "state", "reports"]
    if workflow_version == 2:
        directories.extend(["prd/pages", "graph/pages"])
    for directory in directories:
        (task / directory).mkdir(parents=True, exist_ok=True)
    created = now()
    roots = args.source_root or []
    roots_yaml = "[" + ", ".join(yaml_scalar(item) for item in roots) + "]"
    target = args.target_flow or ""
    workflow_rules = """- Complete global framework analysis, the comprehensive PRD, and every indexed page PRD before canvas generation.
- Draw the comprehensive-PRD framework before enriching nodes from page PRDs.
- Never create a stored root/projectOverview-to-appSurface edge; the canvas renders that system relationship.""" if workflow_version == 2 else "- Complete all analysis partitions and synthesis before generation or deliverable handoff."
    phase_checklist = """- [ ] inventory
- [ ] global framework analysis
- [ ] comprehensive product PRD
- [ ] all indexed page PRDs
- [ ] framework design and generation
- [ ] page-by-page enrichment
- [ ] final validation""" if workflow_version == 2 else """- [ ] inventory
- [ ] detailed analysis
- [ ] cross-partition synthesis
- [ ] requested deliverable
- [ ] final validation"""
    write(task / "mindflow_task.md", f"""---
task_id: {yaml_scalar(task_id)}
title: {yaml_scalar(args.title)}
workflow_version: {workflow_version}
source_type: {yaml_scalar(args.source_type)}
mode: {yaml_scalar(args.mode)}
output_target: {yaml_scalar(args.output_target)}
source_roots: {roots_yaml}
target_flow: {yaml_scalar(target)}
task_status: pending
current_phase: initializing
current_part: {yaml_scalar("none")}
next_action: {yaml_scalar("inventory all sources")}
created_at: {yaml_scalar(created)}
updated_at: {yaml_scalar(created)}
---

# MindFlow Task

## Analysis goal

- {args.title}

## Product scope

- Pending global inventory.

## User constraints and fixed rules

- Use root, application-type, and generic nodes only.
- Generic nodes require pageType; business states are independent nodes.
- Use only interaction, autoNavigate, dataFlow, statusChange, nestedRelation.
- Prefer feature-item, then feature-group orange outlets; card outlets are exceptional.
{workflow_rules}
- Apply canvas changes in small revision-pinned batches; reveal and checkpoint each batch.

## Phase checklist

{phase_checklist}

## Partition index

- No partitions planned yet.

## Current statistics

- Sources: {len(roots)}
- Analysis partitions: 0/0
- Nodes/features/edges: 0/0/0

## Canvas state

- flowUri: {target or "not_created"}
- revision: unknown
- save_status: not_created

## Last successful checkpoint

- Initial task creation.

## Unresolved

- None recorded.

## Next action

- Inventory all sources.
""")
    write(task / "source_inventory.md", """# Source Inventory

| Source | Type | Range | Fingerprint | Application/module | Partition | Status | Ignored reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
""")
    write(task / "requirement_ledger.md", """# Requirement Ledger

| Requirement ID | Statement | Source/evidence | Explicit or inferred | Confidence | Conflict | Status | Canvas/deliverable mapping |
| --- | --- | --- | --- | --- | --- | --- | --- |
""")
    write(task / "analysis_packet.json", json.dumps({
        "schemaVersion": 1, "mode": args.mode,
        "sources": [], "terminology": [], "applications": [], "domains": [], "roles": [],
        "requirements": [], "screens": [], "features": [], "states": [], "businessFlows": [],
        "dataFlows": [], "permissions": [], "constraints": [], "conflicts": [], "unresolved": []
    }, ensure_ascii=False, indent=2))
    write(task / "analysis_summary.md", """# Analysis Summary

synthesis_status: pending

## Product overview

Pending source-grounded project summary and goals.

## Applications, domains, and roles

Pending source-discovered applications and PRD-level application descriptions. Do not assume an application count or reuse canvas copy as evidence.

## Layout and navigation

Pending.

## Pages, popups, components, and states

Pending.

## Business flows, data flows, and state changes

Pending.

## Partition links and cross-partition relations

Pending.

## Unresolved

None recorded.
""")
    write(task / "graph/graph_summary.md", """# Graph Summary

design_status: pending

Status: pending analysis synthesis.

Record root, applications, generic hierarchy, status groups, entity counts, five edge-type counts, generation order, coordinates, unresolved items, and intentionally omitted relations here.
""")
    if workflow_version == 2:
        assets = Path(__file__).resolve().parent.parent / "assets"
        product_template = (assets / "product-prd.template.md").read_text(encoding="utf-8")
        product_template = product_template.replace("{{title}}", args.title)
        write(task / "prd/product-prd.md", product_template)
        shutil.copyfile(assets / "page-index.template.json", task / "prd/page-index.json")
        write(task / "graph/framework.md", """# Framework Graph

- design_status: pending
- source: prd/product-prd.md

```json
{
  "schemaVersion": 1,
  "entities": [],
  "unresolved": [],
  "staleCandidates": []
}
```
""")
        write(task / "state/page_generation.json", """{
  "schemaVersion": 1,
  "framework": { "status": "pending", "revision": null },
  "pages": []
}""")
    write(task / "state/entity_index.md", """# Entity Index

This semantic-key to MindFlow-id index is a cache. Confirm every mapping against the live canvas before resuming.

| Kind | Semantic key | MindFlow ID | Last confirmed revision | Status |
| --- | --- | --- | --- | --- |
""")
    write(task / "state/generation_state.md", """# Generation State

- phase: not_started
- current_batch: none
- last_dry_run: none
- last_applied_revision: none
- failed_batch: none
- staleCandidates: []
- canvas_save_status: not_created
""")
    write(task / "state/batch_plan.json", """{
  "schemaVersion": 1,
  "policy": "guided",
  "limits": { "operations": 30, "nodes": 8, "edges": 16 },
  "batches": []
}""")
    write(task / "state/checkpoints.md", f"""# Checkpoints

## {created} — task-created

- phase: initializing
- part_or_batch: none
- input_fingerprint: not_recorded
- completed: task scaffold
- flowUri: {target or "not_created"}
- revision_before: none
- revision_after: none
- entity_ids: none
- next_action: inventory all sources
- errors_and_retries: none
""")
    write(task / "reports/semantic_validation.md", "# Semantic Validation\n\nPending graph design.\n")
    write(task / "reports/final_validation.md", "# Final Validation\n\nPending canvas generation.\n")
    ensure_gitignore(workspace)
    print(task)
    return 0


def ensure_gitignore(workspace: Path) -> None:
    path = workspace / ".gitignore"
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    additions = [line for line in (".mindflow/tasks/", ".mindflow/tmp/") if line not in existing.splitlines()]
    if additions:
        prefix = "" if not existing or existing.endswith("\n") else "\n"
        path.write_text(existing + prefix + "\n".join(additions) + "\n", encoding="utf-8")


def parse_frontmatter(text: str) -> dict[str, str]:
    match = re.match(r"^---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        return {}
    result: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            result[key.strip()] = value.strip().strip('"')
    return result


def validate_task(args: argparse.Namespace) -> int:
    task = Path(args.task).expanduser().resolve()
    errors: list[str] = []
    main = task / "mindflow_task.md"
    data = parse_frontmatter(main.read_text(encoding="utf-8")) if main.is_file() else {}
    workflow_version = int(data.get("workflow_version", "1") or "1")
    required_files = REQUIRED_FILES + (V2_REQUIRED_FILES if workflow_version == 2 else [])
    for relative in required_files:
        if not (task / relative).is_file():
            errors.append(f"missing required file: {relative}")
    if main.is_file():
        text = main.read_text(encoding="utf-8")
        required = {"task_id", "title", "source_type", "mode", "output_target", "source_roots", "target_flow", "task_status", "current_phase", "current_part", "next_action", "created_at", "updated_at"}
        if workflow_version == 2:
            required.add("workflow_version")
        errors.extend(f"missing frontmatter field: {field}" for field in sorted(required - data.keys()))
        if data.get("task_status") not in TASK_STATUSES:
            errors.append(f"invalid task_status: {data.get('task_status')}")
        if data.get("current_phase") not in PHASES:
            errors.append(f"invalid current_phase: {data.get('current_phase')}")
        if workflow_version == 2 and data.get("current_phase") not in V2_PHASES:
            errors.append(f"invalid workflow-version 2 phase: {data.get('current_phase')}")
        if len(text.splitlines()) > 400:
            errors.append("mindflow_task.md exceeds 400 lines")
    for file in (task / "analysis").glob("*.md") if (task / "analysis").exists() else []:
        size = len(file.read_text(encoding="utf-8"))
        if size > 20_000:
            errors.append(f"analysis partition exceeds 20000 characters: {file.name} ({size})")
    json_files = ["analysis_packet.json", "state/batch_plan.json"]
    if workflow_version == 2:
        json_files.extend(["prd/page-index.json", "state/page_generation.json"])
    for relative in json_files:
        path = task / relative
        if path.is_file():
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except ValueError as error:
                errors.append(f"invalid JSON in {relative}: {error}")
    if errors:
        print("\n".join(f"ERROR: {item}" for item in errors), file=sys.stderr)
        return 1
    print(f"valid: {task}")
    return 0


def checkpoint(args: argparse.Namespace) -> int:
    task = Path(args.task).expanduser().resolve()
    checkpoint_path = task / "state/checkpoints.md"
    if not checkpoint_path.exists():
        raise ValueError(f"Not a MindFlow task: {task}")
    task_data = parse_frontmatter((task / "mindflow_task.md").read_text(encoding="utf-8"))
    workflow_version = int(task_data.get("workflow_version", "1") or "1")
    allowed = V2_PHASES if workflow_version == 2 else LEGACY_PHASES
    if args.phase not in allowed:
        raise ValueError(f"Phase {args.phase} is not valid for workflow version {workflow_version}.")
    ensure_phase_ready(task, args.phase)
    timestamp = now()
    block = f"""
## {timestamp} — {args.part}

- phase: {args.phase}
- part_or_batch: {args.part}
- input_fingerprint: {args.input_fingerprint or "not_recorded"}
- completed: {args.completed or "recorded checkpoint"}
- flowUri: {args.flow_uri or "not_created"}
- revision_before: {args.revision_before if args.revision_before is not None else "none"}
- revision_after: {args.revision_after if args.revision_after is not None else "none"}
- entity_ids: {args.entity_ids or "none"}
- next_action: {args.next_action}
- errors_and_retries: {args.errors or "none"}
"""
    with checkpoint_path.open("a", encoding="utf-8") as handle:
        handle.write(block)
    update_main(task / "mindflow_task.md", args, timestamp)
    print(checkpoint_path)
    return 0


def ensure_phase_ready(task: Path, phase: str) -> None:
    main_data = parse_frontmatter((task / "mindflow_task.md").read_text(encoding="utf-8"))
    workflow_version = int(main_data.get("workflow_version", "1") or "1")
    guarded = {"designing", "generating", "validating", "delivering", "completed"}
    if workflow_version == 2:
        guarded |= {"product_prd", "page_prds", "framework_designing", "framework_generating", "page_enriching"}
    if phase not in guarded:
        return
    partitions = sorted((task / "analysis").glob("*.md"))
    if not partitions:
        raise ValueError("Cannot enter graph design or generation before at least one analysis partition exists.")
    incomplete = [file.name for file in partitions if not re.search(r"(?m)^\s*-?\s*status:\s*completed\s*$", file.read_text(encoding="utf-8"))]
    if incomplete:
        raise ValueError(f"Cannot enter graph design or generation; incomplete analysis partitions: {', '.join(incomplete)}")
    summary = (task / "analysis_summary.md").read_text(encoding="utf-8")
    if not re.search(r"(?m)^synthesis_status:\s*completed\s*$", summary):
        raise ValueError("Cannot enter graph design or generation before cross-partition synthesis is completed.")
    canvas_mode = main_data.get("mode") in CANVAS_MODES
    if workflow_version == 2 and phase in {"framework_designing", "framework_generating", "page_enriching", "validating", "delivering", "completed"}:
        validator = Path(__file__).resolve().parent.parent.parent / "mindflow-product-analysis/scripts/validate_prd_bundle.py"
        result = subprocess.run(
            [sys.executable, str(validator), str(task), "--require-export"],
            text=True, capture_output=True, check=False,
        )
        if result.returncode != 0:
            raise ValueError(f"Cannot enter {phase}; hierarchical PRD bundle is incomplete:\n{result.stderr.strip()}")
    if workflow_version == 2 and phase in {"framework_generating", "page_enriching", "validating", "delivering", "completed"}:
        framework = (task / "graph/framework.md").read_text(encoding="utf-8")
        if not re.search(r"(?m)^-?\s*design_status:\s*completed\s*$", framework):
            raise ValueError("Cannot generate before framework graph design is completed.")
    if workflow_version == 2 and phase in {"page_enriching", "validating", "delivering", "completed"}:
        generation = json.loads((task / "state/page_generation.json").read_text(encoding="utf-8"))
        if generation.get("framework", {}).get("status") != "completed":
            raise ValueError("Cannot enrich pages before framework generation is completed.")
    if workflow_version == 2 and phase in {"validating", "delivering", "completed"}:
        generation = json.loads((task / "state/page_generation.json").read_text(encoding="utf-8"))
        page_index = json.loads((task / "prd/page-index.json").read_text(encoding="utf-8"))
        expected = {page.get("semanticKey") for page in page_index.get("pages", []) if isinstance(page, dict)}
        verified = {page.get("semanticKey") for page in generation.get("pages", []) if isinstance(page, dict) and page.get("status") == "verified"}
        missing = sorted(value for value in expected - verified if isinstance(value, str))
        if missing:
            raise ValueError(f"Cannot validate before every page is enriched and verified: {', '.join(missing)}")
    if canvas_mode and phase in {"generating", "validating", "completed"}:
        graph = (task / "graph/graph_summary.md").read_text(encoding="utf-8")
        if not re.search(r"(?m)^design_status:\s*completed\s*$", graph):
            raise ValueError("Cannot enter generation before graph design is completed.")


def update_main(path: Path, args: argparse.Namespace, timestamp: str) -> None:
    text = path.read_text(encoding="utf-8")
    status = {
        "analyzing": "analyzing", "synthesizing": "analyzing", "framework_analyzing": "analyzing",
        "product_prd": "analyzing", "page_prds": "analyzing", "designing": "designing",
        "framework_designing": "designing", "generating": "generating",
        "framework_generating": "generating", "page_enriching": "generating",
        "validating": "validating", "delivering": "validating", "completed": "completed",
    }.get(args.phase, "pending")
    replacements = {"task_status": status, "current_phase": args.phase, "current_part": args.part, "next_action": args.next_action, "updated_at": timestamp}
    for key, value in replacements.items():
        text = re.sub(rf"(?m)^{re.escape(key)}:.*$", f"{key}: {yaml_scalar(str(value))}", text, count=1)
    text = re.sub(r"(?s)(## Next action\n\n).*?(?=\n## |\Z)", rf"\1- {args.next_action}.\n", text, count=1)
    path.write_text(text, encoding="utf-8")


def fingerprint(args: argparse.Namespace) -> int:
    source = Path(args.path).expanduser().resolve()
    excluded = [Path(value).expanduser().resolve() for value in (args.exclude or [])]
    digest = hashlib.sha256()
    if source.is_file():
        if is_excluded(source, excluded):
            raise ValueError(f"Source is excluded: {source}")
        digest.update(source.read_bytes())
    elif source.is_dir():
        for path in sorted(source.rglob("*")):
            if not path.is_file() or any(part in IGNORED_PARTS for part in path.parts) or is_excluded(path, excluded):
                continue
            relative = path.relative_to(source).as_posix()
            digest.update(relative.encode())
            digest.update(path.read_bytes())
    else:
        raise ValueError(f"Source does not exist: {source}")
    print(f"sha256:{digest.hexdigest()}")
    return 0


def is_excluded(path: Path, excluded: list[Path]) -> bool:
    for root in excluded:
        try:
            path.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def prd_bundle_fingerprint(task: Path, index: dict) -> str:
    files: list[tuple[str, Path]] = []
    product = index.get("productPrd", {})
    if isinstance(product, dict) and isinstance(product.get("path"), str):
        files.append((product["path"], task / product["path"]))
    for page in index.get("pages", []):
        if isinstance(page, dict) and isinstance(page.get("prdPath"), str):
            files.append((page["prdPath"], task / page["prdPath"]))
    digest = hashlib.sha256()
    for relative, path in sorted(files):
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
    return f"sha256:{digest.hexdigest()}"


def export_prd(args: argparse.Namespace) -> int:
    task = Path(args.task).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()
    index_path = task / "prd/page-index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    value = prd_bundle_fingerprint(task, index)
    product = index.get("productPrd")
    if not isinstance(product, dict):
        raise ValueError("page-index productPrd must be an object")
    product["fingerprint"] = value
    product.setdefault("status", "completed")
    index["export"] = {"path": str(output), "status": "completed", "fingerprint": value}
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    validator = Path(__file__).resolve().parent.parent.parent / "mindflow-product-analysis/scripts/validate_prd_bundle.py"
    result = subprocess.run([sys.executable, str(validator), str(task)], text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise ValueError(f"Cannot export invalid PRD bundle:\n{result.stderr.strip()}")

    output.mkdir(parents=True, exist_ok=True)
    product_source = task / product["path"]
    shutil.copy2(product_source, output / "product-prd.md")
    pages_output = output / "pages"
    pages_output.mkdir(parents=True, exist_ok=True)
    for page in index.get("pages", []):
        if not isinstance(page, dict) or not isinstance(page.get("prdPath"), str):
            continue
        source = task / page["prdPath"]
        shutil.copy2(source, pages_output / source.name)
    shutil.copy2(index_path, output / "page-index.json")

    inventory = task / "source_inventory.md"
    note = f"\n- Generated PRD export `{output}` is excluded from same-task source inventory and fingerprints.\n"
    current = inventory.read_text(encoding="utf-8")
    if note.strip() not in current:
        with inventory.open("a", encoding="utf-8") as handle:
            handle.write(note)
    result = subprocess.run([sys.executable, str(validator), str(task), "--require-export"], text=True, capture_output=True, check=False)
    if result.returncode != 0:
        raise ValueError(f"Export verification failed:\n{result.stderr.strip()}")
    print(f"exported: {output} ({value})")
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)
    init = commands.add_parser("init")
    init.add_argument("--workspace", required=True)
    init.add_argument("--title", required=True)
    init.add_argument("--source-type", required=True, choices=["documents", "code", "canvas", "mixed"])
    init.add_argument("--mode", default="documents-to-canvas", choices=["documents-to-canvas", "code-to-canvas", "canvas-to-canvas-update", "canvas-audit", "canvas-to-deliverable"])
    init.add_argument("--output-target", default="canvas", choices=["canvas", "audit", "prd", "html", "figma", "pencil"])
    init.add_argument("--source-root", action="append")
    init.add_argument("--target-flow")
    init.add_argument("--task-id")
    init.set_defaults(handler=init_task)
    check = commands.add_parser("validate")
    check.add_argument("--task", required=True)
    check.set_defaults(handler=validate_task)
    point = commands.add_parser("checkpoint")
    point.add_argument("--task", required=True)
    point.add_argument("--phase", required=True, choices=sorted(PHASES))
    point.add_argument("--part", required=True)
    point.add_argument("--next-action", required=True)
    point.add_argument("--input-fingerprint")
    point.add_argument("--completed")
    point.add_argument("--flow-uri")
    point.add_argument("--revision-before", type=int)
    point.add_argument("--revision-after", type=int)
    point.add_argument("--entity-ids")
    point.add_argument("--errors")
    point.set_defaults(handler=checkpoint)
    finger = commands.add_parser("fingerprint")
    finger.add_argument("path")
    finger.add_argument("--exclude", action="append")
    finger.set_defaults(handler=fingerprint)
    export = commands.add_parser("export-prd")
    export.add_argument("--task", required=True)
    export.add_argument("--output", required=True)
    export.set_defaults(handler=export_prd)
    return root


if __name__ == "__main__":
    try:
        parsed = parser().parse_args()
        raise SystemExit(parsed.handler(parsed))
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(2)
