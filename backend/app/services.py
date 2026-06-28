from __future__ import annotations

import csv
import json
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .ai import grade_with_provider
from .config import EVAL_SET_FILE, ROOT_DIR, settings
from .domain import infer_inspection_facts, map_inspection_facts_to_business_fields, validate_agent_contract
from .storage import append_trace, read_state, write_json_artifact, write_state
from .repository import upsert_eval_run


def create_run_id() -> str:
    return f"run_{int(datetime.now(timezone.utc).timestamp() * 1000)}_{uuid.uuid4().hex[:6]}"


def build_run_trace(*, run_id: str, input_data: dict[str, Any], run_source: str, raw_model_output: Any, final_output: dict[str, Any], error: Exception | None) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "input": input_data,
        "run_source": run_source,
        "raw_model_output": raw_model_output,
        "final_output": final_output,
        "error": str(error) if error else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def fallback_grade(input_data: dict[str, Any], source: str = "api_fallback_mock", meta: dict[str, Any] | None = None) -> dict[str, Any]:
    meta = meta or {}
    label = input_data.get("mock_label") or "rot_defect"
    rule = map_inspection_facts_to_business_fields({"visible_defect_types": [label]}, {"defect_type": label})
    return {
        "run_id": input_data.get("run_id") or create_run_id(),
        "run_source": source,
        "provider": "fallback",
        "model": settings.dashscope_model,
        "prompt_version": settings.prompt_version,
        "rule_version": settings.rule_version,
        "contract_version": settings.contract_version,
        "mock_label": label,
        "confidence": 0.55,
        **rule,
        "inspection_facts": infer_inspection_facts({"defect_type": label, "confidence": 0.55}, input_data),
        "fallback_reason": meta.get("fallback_reason", "unknown"),
        "error": meta.get("model_error"),
        **{
            "contract_ok": validate_agent_contract({**rule, "confidence": 0.55})["ok"],
            "contract_error": validate_agent_contract({**rule, "confidence": 0.55})["error"],
        },
    }


async def grade_image(input_data: dict[str, Any]) -> dict[str, Any]:
    run_id = input_data.get("run_id") or create_run_id()
    payload = {**input_data, "run_id": run_id}
    try:
        if not settings.dashscope_api_key and settings.provider == "qwen":
            output = fallback_grade(payload, "api_fallback_mock", {"fallback_reason": "missing_api_key"})
            append_trace(build_run_trace(run_id=run_id, input_data=payload, run_source=output["run_source"], raw_model_output=None, final_output=output, error=None))
            return output
        output, source = await grade_with_provider(payload)
        output = {
            "run_id": run_id,
            "run_source": source,
            "provider": settings.provider,
            "model": settings.dashscope_model,
            "prompt_version": settings.prompt_version,
            "rule_version": settings.rule_version,
            "contract_version": settings.contract_version,
            **output,
        }
        append_trace(build_run_trace(run_id=run_id, input_data=payload, run_source=output["run_source"], raw_model_output=None, final_output=output, error=None))
        return output
    except Exception as error:
        output = fallback_grade({**payload, "mock_label": payload.get("mock_label") or "rot_defect"}, "api_error_fallback", {"fallback_reason": "api_or_parse_error", "model_error": str(error)})
        output["error"] = str(error)
        append_trace(build_run_trace(run_id=run_id, input_data=payload, run_source=output["run_source"], raw_model_output=None, final_output=output, error=error))
        return output


def compare_eval_facts(expected: dict[str, Any], actual: dict[str, Any]) -> dict[str, Any]:
    score = 0.0
    total = 0.0
    if expected.get("image_quality"):
        total += 1
        score += 1 if expected.get("image_quality") == actual.get("image_quality") else 0
    if isinstance(expected.get("visible_defect_types"), list):
        total += 1
        score += 1 if sorted(expected.get("visible_defect_types") or []) == sorted(actual.get("visible_defect_types") or []) else 0
    if expected.get("defect_area_level"):
        total += 1
        score += 1 if expected.get("defect_area_level") == actual.get("defect_area_level") else 0
    if expected.get("broken_skin") is not None:
        total += 1
        score += 1 if bool(expected.get("broken_skin")) == bool(actual.get("broken_skin")) else 0
    if expected.get("softening") is not None:
        total += 1
        score += 1 if bool(expected.get("softening")) == bool(actual.get("softening")) else 0
    if expected.get("suspected_mold") is not None:
        total += 1
        score += 1 if bool(expected.get("suspected_mold")) == bool(actual.get("suspected_mold")) else 0
    if expected.get("bruise_severity"):
        total += 1
        score += 1 if expected.get("bruise_severity") == actual.get("bruise_severity") else 0
    return {"score": score / total if total else 0.0, "matched": score, "total": total}


def compare_eval_decision(expected: dict[str, Any], actual: dict[str, Any]) -> dict[str, Any]:
    fields = ["defect_type", "grade", "edible_safety", "review_required", "next_action"]
    matched = sum(1 for field in fields if expected.get(field) == actual.get(field))
    return {"score": matched / len(fields), "matched": matched, "total": len(fields)}


def evaluate_case_from_output(test_case: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
    expected_facts = test_case.get("expected_facts") or {}
    expected_decision = test_case.get("expected_decision") or {}
    actual_facts = output.get("inspection_facts") or {}
    facts_result = compare_eval_facts(expected_facts, actual_facts)
    decision_result = compare_eval_decision(expected_decision, output)
    passed = decision_result["score"] >= 1.0 and facts_result["score"] >= 0.8
    failure_nodes = []
    if decision_result["score"] < 1.0:
        failure_nodes.append("decision")
    if facts_result["score"] < 0.8:
        failure_nodes.append("facts")
    if output.get("contract_ok") is False:
        failure_nodes.append("contract")
    return {
        "id": test_case.get("id"),
        "label": test_case.get("expected_defect_type"),
        "expected_defect_type": expected_decision.get("defect_type") or test_case.get("expected_defect_type"),
        "actual_defect_type": output.get("defect_type"),
        "expected_grade": expected_decision.get("grade") or test_case.get("expected_grade"),
        "actual_grade": output.get("grade"),
        "passed": passed,
        "scores": {
            "facts": facts_result["score"],
            "decision": decision_result["score"],
        },
        "failure_nodes": failure_nodes,
        "output": output,
    }


def eval_metrics(results: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(results)
    passed = sum(1 for item in results if item.get("passed"))
    node_counter = Counter(node for item in results for node in item.get("failure_nodes", []))
    return {
        "total": total,
        "passed": passed,
        "pass_rate": round(passed / total, 4) if total else 0.0,
        "failure_nodes": dict(node_counter),
    }


def write_eval_artifacts(eval_run: dict[str, Any]) -> None:
    artifacts_dir = ROOT_DIR / "backend" / "data" / "eval_runs" / eval_run["run_id"]
    write_json_artifact(artifacts_dir / "eval_run.json", eval_run)
    rows = eval_run.get("results") or []

    csv_path = artifacts_dir / "eval_results.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["id", "label", "expected_defect_type", "actual_defect_type", "expected_grade", "actual_grade", "passed", "facts_score", "decision_score", "failure_nodes"])
        for row in rows:
            writer.writerow([
                row.get("id"),
                row.get("label"),
                row.get("expected_defect_type"),
                row.get("actual_defect_type"),
                row.get("expected_grade"),
                row.get("actual_grade"),
                row.get("passed"),
                row.get("scores", {}).get("facts"),
                row.get("scores", {}).get("decision"),
                ";".join(row.get("failure_nodes", [])),
            ])

    markdown_lines = [
        f"# Eval Run {eval_run['run_id']}",
        "",
        f"- mode: {eval_run.get('mode')}",
        f"- pass_rate: {eval_run.get('metrics', {}).get('pass_rate')}",
        f"- total: {eval_run.get('metrics', {}).get('total')}",
        "",
        "| id | label | expected | actual | passed | facts | decision | failures |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        markdown_lines.append(
            "| {id} | {label} | {expected_defect_type} | {actual_defect_type} | {passed} | {facts} | {decision} | {failures} |".format(
                id=row.get("id"),
                label=row.get("label"),
                expected_defect_type=row.get("expected_defect_type"),
                actual_defect_type=row.get("actual_defect_type"),
                passed=row.get("passed"),
                facts=row.get("scores", {}).get("facts"),
                decision=row.get("scores", {}).get("decision"),
                failures=";".join(row.get("failure_nodes", [])),
            )
        )
    (artifacts_dir / "eval_report.md").write_text("\n".join(markdown_lines), encoding="utf-8")


async def run_backend_eval(options: dict[str, Any] | None = None) -> dict[str, Any]:
    options = options or {}
    dataset_path = Path(options.get("dataset_path") or EVAL_SET_FILE)
    mode = options.get("mode") or "mock"
    payload = json.loads(dataset_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        payload = []
    if options.get("limit"):
        payload = payload[: int(options["limit"])]

    results = []
    for test_case in payload:
        grade_input = {
            "mock_label": test_case.get("expected_defect_type") or test_case.get("label"),
            "image": test_case.get("image"),
            "origin": test_case.get("origin"),
            "weight": test_case.get("weight"),
            "mode": mode,
        }
        output = await grade_image(grade_input)
        results.append(evaluate_case_from_output(test_case, output))

    eval_run = {
        "run_id": create_run_id(),
        "mode": mode,
        "dataset_path": str(dataset_path),
        "dataset_size": len(payload),
        "results": results,
        "metrics": eval_metrics(results),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    write_eval_artifacts(eval_run)
    upsert_eval_run(eval_run)
    return eval_run
