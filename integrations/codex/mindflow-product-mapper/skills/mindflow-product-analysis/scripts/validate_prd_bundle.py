#!/usr/bin/env python3
"""Validate workflow-version 2 and 3 MindFlow hierarchical PRD bundles."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

PAGE_TYPES = {"page", "popup"}
V3_COMPOSITION_HEADINGS = ("## Visual composition", "## 视觉构成")
V3_FORBIDDEN_BOILERPLATE = (
    "输入来自综合 PRD 指定的用户资料、业务记录或后台配置；输出仅写入该页面职责范围内的业务对象，并通过页面事件传递到下游。",
    "空数据、权限不足、网络或第三方失败时展示明确提示；可重试操作保留当前输入，不将未决产品规则实现为确定行为。",
    "无新增未决项；继承综合 PRD 的全局未决清单。",
)


def metadata(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^-\s+([a-z_]+):\s*(.*?)\s*$", line)
        if match:
            values[match.group(1)] = match.group(2).strip().strip('"')
    return values


def safe_file(task: Path, relative: object, label: str, errors: list[str]) -> Path | None:
    if not isinstance(relative, str) or not relative.strip():
        errors.append(f"{label} path is required")
        return None
    candidate = (task / relative).resolve()
    try:
        candidate.relative_to(task)
    except ValueError:
        errors.append(f"{label} path escapes task directory: {relative}")
        return None
    if not candidate.is_file():
        errors.append(f"{label} file is missing: {relative}")
        return None
    return candidate


def bundle_files(task: Path, index: dict, errors: list[str], workflow_version: int) -> list[tuple[str, Path]]:
    files: list[tuple[str, Path]] = []
    product = index.get("productPrd")
    if not isinstance(product, dict):
        errors.append("productPrd must be an object")
    else:
        path = safe_file(task, product.get("path"), "productPrd", errors)
        if path:
            files.append((str(product["path"]), path))
            values = metadata(path)
            if product.get("status") != "completed" or values.get("status") != "completed":
                errors.append("productPrd and its document metadata must both be completed")
            if not values.get("evidence_refs") or values["evidence_refs"] == "[]":
                errors.append("product PRD requires evidence_refs")

    applications = index.get("applications")
    if not isinstance(applications, list) or not applications or not all(isinstance(value, str) and value.strip() for value in applications):
        errors.append("applications must be a non-empty string array")
        application_keys: set[str] = set()
    else:
        application_keys = set(applications)
        if len(application_keys) != len(applications):
            errors.append("applications contains duplicates")

    pages = index.get("pages")
    if not isinstance(pages, list) or not pages:
        errors.append("pages must be a non-empty array")
        return files
    keys = {page.get("semanticKey") for page in pages if isinstance(page, dict) and isinstance(page.get("semanticKey"), str)}
    seen_keys: set[str] = set()
    seen_orders: set[int] = set()
    seen_paths: set[str] = set()
    for offset, page in enumerate(pages):
        prefix = f"pages[{offset}]"
        if not isinstance(page, dict):
            errors.append(f"{prefix} must be an object")
            continue
        key = page.get("semanticKey")
        if not isinstance(key, str) or not key.strip():
            errors.append(f"{prefix}.semanticKey is required")
        elif key in seen_keys:
            errors.append(f"duplicate page semanticKey: {key}")
        else:
            seen_keys.add(key)
        order = page.get("order")
        if not isinstance(order, int) or order < 1:
            errors.append(f"{prefix}.order must be a positive integer")
        elif order in seen_orders:
            errors.append(f"duplicate page order: {order}")
        else:
            seen_orders.add(order)
        if not isinstance(page.get("title"), str) or not page["title"].strip():
            errors.append(f"{prefix}.title is required")
        if page.get("pageType") not in PAGE_TYPES:
            errors.append(f"{prefix}.pageType must be page or popup")
        application = page.get("application")
        if application not in application_keys:
            errors.append(f"{prefix}.application must reference applications")
        parent = page.get("parent")
        if not isinstance(parent, str) or not parent.strip() or (parent not in application_keys and parent not in keys):
            errors.append(f"{prefix}.parent must reference an application or indexed page")
        evidence = page.get("evidenceRefs")
        if not isinstance(evidence, list) or not evidence or not all(isinstance(value, str) and value.strip() for value in evidence):
            errors.append(f"{prefix}.evidenceRefs must be a non-empty string array")
        if page.get("status") != "completed":
            errors.append(f"{prefix}.status must be completed")
        relative = page.get("prdPath")
        if isinstance(relative, str):
            if relative in seen_paths:
                errors.append(f"duplicate page prdPath: {relative}")
            seen_paths.add(relative)
        path = safe_file(task, relative, prefix, errors)
        if path:
            files.append((str(relative), path))
            values = metadata(path)
            if values.get("semantic_key") != key:
                errors.append(f"{prefix} semantic_key does not match {relative}")
            if values.get("status") != "completed":
                errors.append(f"{prefix} document status must be completed")
            if values.get("page_type") != page.get("pageType"):
                errors.append(f"{prefix} page_type does not match {relative}")
            if not values.get("product_prd_refs") or values["product_prd_refs"] == "[]":
                errors.append(f"{prefix} document requires product_prd_refs")
            if not values.get("evidence_refs") or values["evidence_refs"] == "[]":
                errors.append(f"{prefix} document requires evidence_refs")
            if workflow_version == 3:
                validate_v3_page_prd(path, key, errors)
    if seen_orders and seen_orders != set(range(1, len(pages) + 1)):
        errors.append("page order must be contiguous from 1")
    return files


def validate_v3_page_prd(path: Path, semantic_key: object, errors: list[str]) -> None:
    text = path.read_text(encoding="utf-8")
    if not any(heading in text for heading in V3_COMPOSITION_HEADINGS):
        errors.append(f"{path}: workflow-version 3 page PRD requires a Visual composition section")
        return
    if any(phrase in text for phrase in V3_FORBIDDEN_BOILERPLATE):
        errors.append(f"{path}: contains generic inherited boilerplate instead of page-specific behavior")
    rows = composition_rows(text)
    if not rows:
        errors.append(f"{path}: visual composition table has no data rows")
        return
    region_keys = []
    feature_keys = []
    for columns in rows:
        if len(columns) < 9:
            errors.append(f"{path}: visual composition row requires 9 columns")
            continue
        region_keys.append(columns[1])
        feature_keys.append(columns[4])
        if not columns[5] or not columns[6]:
            errors.append(f"{path}: visual composition row requires UI type and visible content")
        if not columns[8]:
            errors.append(f"{path}: visual composition row requires evidence/origin/confidence")
    if len(set(region_keys)) < 2:
        errors.append(f"{path}: page/popup requires at least two visual regions")
    if len(feature_keys) != len(set(feature_keys)):
        errors.append(f"{path}: visual composition contains duplicate feature keys")
    if isinstance(semantic_key, str) and semantic_key not in text:
        errors.append(f"{path}: semantic key is not retained in page PRD")


def composition_rows(text: str) -> list[list[str]]:
    start = -1
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.strip() in V3_COMPOSITION_HEADINGS:
            start = index + 1
            break
    if start < 0:
        return []
    rows: list[list[str]] = []
    for line in lines[start:]:
        stripped = line.strip()
        if stripped.startswith("## "):
            break
        if not stripped.startswith("|"):
            continue
        columns = [value.strip() for value in stripped.strip("|").split("|")]
        if not columns or columns[0].lower().startswith("region order") or set(columns[0]) <= {"-", ":"}:
            continue
        rows.append(columns)
    return rows


def workflow_version(task: Path) -> int:
    main = task / "mindflow_task.md"
    if not main.is_file():
        return 1
    match = re.search(r"(?m)^workflow_version:\s*[\"']?(\d+)", main.read_text(encoding="utf-8"))
    return int(match.group(1)) if match else 1


def validate_v3_analysis_alignment(task: Path, index: dict, errors: list[str]) -> None:
    try:
        packet = json.loads((task / "analysis_packet.json").read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        errors.append(f"analysis_packet.json is invalid: {error}")
        return
    if packet.get("schemaVersion") != 2:
        errors.append("workflow-version 3 requires analysis_packet schemaVersion 2")
        return
    screens = {item.get("semanticKey"): item for item in packet.get("screens", []) if isinstance(item, dict)}
    regions = {item.get("semanticKey"): item for item in packet.get("regions", []) if isinstance(item, dict)}
    features = {item.get("semanticKey"): item for item in packet.get("features", []) if isinstance(item, dict)}
    indexed = {item.get("semanticKey"): item for item in index.get("pages", []) if isinstance(item, dict)}
    if set(indexed) != set(screens):
        missing = sorted(key for key in set(indexed) - set(screens) if isinstance(key, str))
        extra = sorted(key for key in set(screens) - set(indexed) if isinstance(key, str))
        if missing:
            errors.append(f"analysis packet screens missing indexed pages: {', '.join(missing)}")
        if extra:
            errors.append(f"analysis packet has screens missing from page index: {', '.join(extra)}")
    for key, page in indexed.items():
        if key not in screens or not isinstance(page.get("prdPath"), str):
            continue
        path = task / page["prdPath"]
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for region_key in screens[key].get("regionKeys", []):
            if region_key not in regions or region_key not in text:
                errors.append(f"{path}: missing analysis region {region_key}")
                continue
            for feature_key in regions[region_key].get("featureKeys", []):
                if feature_key not in features or feature_key not in text:
                    errors.append(f"{path}: missing analysis feature {feature_key}")


def fingerprint(files: list[tuple[str, Path]]) -> str:
    digest = hashlib.sha256()
    for relative, path in sorted(files):
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
    return f"sha256:{digest.hexdigest()}"


def validate_export(task: Path, index: dict, files: list[tuple[str, Path]], expected: str, errors: list[str]) -> None:
    export = index.get("export")
    if not isinstance(export, dict) or export.get("status") != "completed":
        errors.append("export status must be completed")
        return
    export_path = export.get("path")
    if not isinstance(export_path, str) or not export_path.strip():
        errors.append("export.path is required")
        return
    root = Path(export_path).expanduser().resolve()
    if export.get("fingerprint") != expected:
        errors.append("export fingerprint does not match the canonical PRD bundle")
    for relative, source in files:
        subpath = relative[len("prd/"):] if relative.startswith("prd/") else relative
        target = root / subpath
        if not target.is_file() or target.read_bytes() != source.read_bytes():
            errors.append(f"export differs from canonical file: {subpath}")
    exported_index = root / "page-index.json"
    if not exported_index.is_file():
        errors.append("export is missing page-index.json")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("task")
    parser.add_argument("--require-export", action="store_true")
    args = parser.parse_args()
    task = Path(args.task).expanduser().resolve()
    version = workflow_version(task)
    index_path = task / "prd/page-index.json"
    try:
        index = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    errors: list[str] = []
    expected_index_version = 2 if version == 3 else 1
    if not isinstance(index, dict) or index.get("schemaVersion") != expected_index_version:
        errors.append(f"page-index schemaVersion must be {expected_index_version} for workflow version {version}")
        index = index if isinstance(index, dict) else {}
    if index.get("status") != "completed":
        errors.append("page-index status must be completed")
    files = bundle_files(task, index, errors, version)
    if version == 3:
        validate_v3_analysis_alignment(task, index, errors)
    value = fingerprint(files)
    product = index.get("productPrd")
    if isinstance(product, dict) and product.get("fingerprint") != value:
        errors.append("productPrd.fingerprint must match the complete canonical bundle")
    if args.require_export:
        validate_export(task, index, files, value, errors)
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1
    print(f"valid: {task} ({len(files) - 1} page PRDs, {value})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
