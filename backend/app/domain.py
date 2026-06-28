from __future__ import annotations

from typing import Any


OUTPUT_FIELDS = [
    "fruit_type",
    "defect_type",
    "defect_label",
    "business_defect",
    "grade",
    "confidence",
    "edible_safety",
    "safety_label",
    "price_suggestion",
    "farmer_explanation",
    "consumer_copy",
    "review_required",
    "risk_flags",
    "next_action",
]

INSPECTION_FACT_FIELDS = [
    "image_quality",
    "visible_defect_types",
    "defect_area_level",
    "broken_skin",
    "softening",
    "suspected_mold",
    "bruise_severity",
    "inspection_confidence",
    "manual_review_reason",
]

GUARDRAILS = [
    "defect_type 为 rot_defect 时，grade 必须为 blocked，review_required 必须为 true",
    "edible_safety 为 risk 时，next_action 不能是 confirm_listing",
    "confidence < 0.7 时，必须进入人工复核",
    "消费者文案不能包含绝对安全承诺",
    "禁售或高风险商品不能生成可购买式消费者文案",
]

RULES: dict[str, dict[str, Any]] = {
    "fresh": {
        "defect_label": "无明显瑕疵",
        "business_defect": "外观完整",
        "grade": "A",
        "edible_safety": "safe",
        "safety_label": "不影响食用",
        "price_suggestion": "市场价90%-100%",
        "review_required": False,
        "risk_flags": [],
        "consumer_copy": "这批苹果外观完整度较高，未发现明显瑕疵，适合家庭鲜食或日常水果补充。",
    },
    "scab_defect": {
        "defect_label": "果锈/疤痕斑",
        "business_defect": "表皮瑕疵",
        "grade": "B",
        "edible_safety": "safe",
        "safety_label": "通常不影响果肉食用",
        "price_suggestion": "市场价65%-80%",
        "review_required": False,
        "risk_flags": [],
        "consumer_copy": "这批苹果表皮有果锈或疤痕斑，外观不如优果完整，但通常不影响果肉和日常食用。",
    },
    "bruise_defect": {
        "defect_label": "轻微碰伤",
        "business_defect": "果面局部碰伤",
        "grade": "C",
        "edible_safety": "caution",
        "safety_label": "建议尽快食用",
        "price_suggestion": "市场价50%-65%",
        "review_required": True,
        "risk_flags": ["bruise_area_needs_human_check"],
        "consumer_copy": "这批苹果存在局部轻微碰伤，建议收到后优先食用或用于榨汁、果切。",
    },
    "rot_defect": {
        "defect_label": "疑似腐烂",
        "business_defect": "食品安全风险",
        "grade": "blocked",
        "edible_safety": "risk",
        "safety_label": "存在食用安全风险",
        "price_suggestion": "不建议销售",
        "review_required": True,
        "risk_flags": ["possible_food_safety_risk", "forced_review"],
        "consumer_copy": "",
    },
}


def compact_flags(*pairs: tuple[bool, str]) -> list[str]:
    return [label for condition, label in pairs if condition]


def same_string_array(left: list[str] | None = None, right: list[str] | None = None) -> bool:
    return sorted(left or []) == sorted(right or [])


def classify_run_source(source: str = "") -> str:
    if "api_error" in source or "fallback" in source:
        return "api_fallback"
    if "mock" in source or "dataset" in source:
        return "mock"
    return "api_live"


def infer_inspection_facts(result: dict[str, Any] | None = None, input_data: dict[str, Any] | None = None) -> dict[str, Any]:
    result = result or {}
    input_data = input_data or {}
    model_facts = result.get("inspection_facts") if isinstance(result.get("inspection_facts"), dict) else {}
    defect_type = result.get("defect_type") if result.get("defect_type") in RULES else input_data.get("mock_label", "fresh")
    if defect_type not in RULES:
        defect_type = "fresh"
    confidence = max(0.0, min(1.0, float(result.get("confidence", 0.5) or 0.5)))
    visible_defects = [] if defect_type == "fresh" else [defect_type]
    high_risk = defect_type == "rot_defect" or result.get("edible_safety") == "risk"
    needs_review = bool(result.get("review_required") or high_risk or confidence < 0.7 or defect_type == "bruise_defect")

    manual_review_reason = model_facts.get("manual_review_reason") if isinstance(model_facts.get("manual_review_reason"), list) else compact_flags(
        (confidence < 0.7, "low_confidence"),
        (high_risk, "possible_food_safety_risk"),
        (defect_type == "bruise_defect", "bruise_area_needs_human_check"),
    )

    return {
        "schema_version": "inspection-facts-v0.1",
        "image_quality": model_facts.get("image_quality") or result.get("image_quality") or "unknown",
        "visible_defect_types": model_facts.get("visible_defect_types") if isinstance(model_facts.get("visible_defect_types"), list) else (
            result.get("visible_defect_types") if isinstance(result.get("visible_defect_types"), list) else visible_defects
        ),
        "defect_area_level": model_facts.get("defect_area_level") or result.get("defect_area_level") or ("none" if defect_type == "fresh" else "unknown"),
        "broken_skin": bool(model_facts.get("broken_skin", result.get("broken_skin", defect_type in {"bruise_defect", "rot_defect"}))),
        "softening": bool(model_facts.get("softening", result.get("softening", defect_type in {"bruise_defect", "rot_defect"}))),
        "suspected_mold": bool(model_facts.get("suspected_mold", result.get("suspected_mold", defect_type == "rot_defect"))),
        "bruise_severity": model_facts.get("bruise_severity") or result.get("bruise_severity") or ("unknown" if defect_type == "bruise_defect" else "none"),
        "inspection_confidence": max(0.0, min(1.0, float(model_facts.get("inspection_confidence", confidence) or confidence))),
        "manual_review_reason": manual_review_reason if needs_review else [],
    }


def defect_type_from_facts(facts: dict[str, Any] | None = None, fallback: str = "unknown") -> str:
    facts = facts or {}
    defects = facts.get("visible_defect_types") if isinstance(facts.get("visible_defect_types"), list) else []
    if facts.get("suspected_mold") or "rot_defect" in defects:
        return "rot_defect"
    if facts.get("softening") or facts.get("broken_skin") or "bruise_defect" in defects:
        return "bruise_defect"
    if "scab_defect" in defects:
        return "scab_defect"
    if "fresh" in defects or not defects:
        return "fresh"
    return fallback if fallback in RULES else "fresh"


def map_inspection_facts_to_business_fields(facts: dict[str, Any] | None = None, result: dict[str, Any] | None = None) -> dict[str, Any]:
    facts = facts or {}
    result = result or {}
    fallback_type = result.get("defect_type") if result.get("defect_type") in RULES else "rot_defect"
    defect_type = defect_type_from_facts(facts, fallback_type)
    rule = RULES.get(defect_type, RULES["rot_defect"])
    confidence = max(0.0, min(1.0, float(facts.get("inspection_confidence", result.get("confidence", 0.5)) or 0.5)))
    high_risk = defect_type == "rot_defect" or facts.get("suspected_mold")
    needs_review = bool(high_risk or rule["review_required"] or confidence < 0.7 or facts.get("image_quality") == "insufficient")
    risk_flags = list(dict.fromkeys([
        *(result.get("risk_flags") if isinstance(result.get("risk_flags"), list) else []),
        *(rule.get("risk_flags") or []),
        *compact_flags((confidence < 0.7, "low_confidence")),
        *compact_flags((facts.get("image_quality") == "insufficient", "insufficient_image_quality")),
        *(facts.get("manual_review_reason") if isinstance(facts.get("manual_review_reason"), list) else []),
    ]))

    return {
        "defect_type": defect_type,
        "defect_label": result.get("defect_label") or rule["defect_label"],
        "business_defect": result.get("business_defect") or rule["business_defect"],
        "grade": "blocked" if high_risk else rule["grade"],
        "confidence": confidence,
        "edible_safety": "risk" if high_risk else rule["edible_safety"],
        "safety_label": result.get("safety_label") or rule["safety_label"],
        "price_suggestion": result.get("price_suggestion") or rule["price_suggestion"],
        "review_required": needs_review,
        "risk_flags": risk_flags,
        "next_action": "manual_review" if needs_review else "confirm_listing",
        "consumer_copy": result.get("consumer_copy") or rule["consumer_copy"],
    }


def fallback_farmer_explanation(rule: dict[str, Any], input_data: dict[str, Any] | None = None) -> str:
    input_data = input_data or {}
    origin = input_data.get("origin", "未知产地")
    weight = input_data.get("weight", "未知")
    return f"{origin}，{weight}kg，按当前规则判定为{rule['defect_label']}，建议按对应分级处理。"


def build_business_decision(result: dict[str, Any] | None = None, facts: dict[str, Any] | None = None) -> dict[str, Any]:
    result = result or {}
    facts = facts or {}
    mapped = map_inspection_facts_to_business_fields(facts, result)
    return {
        "schema_version": "business-decision-v0.1",
        **mapped,
        "farmer_explanation": result.get("farmer_explanation") or fallback_farmer_explanation(RULES.get(mapped["defect_type"], RULES["rot_defect"]), result),
    }


def build_agent_prompt(input_data: dict[str, Any] | None = None) -> str:
    input_data = input_data or {}
    return "\n".join(
        [
            "You are an apple grading agent.",
            "Return strict JSON only.",
            f"origin={input_data.get('origin', '')}",
            f"weight={input_data.get('weight', '')}",
            f"harvest_date={input_data.get('harvest_date', '')}",
            f"expected_price={input_data.get('expected_price', '')}",
            f"farmer_note={input_data.get('farmer_note', '')}",
        ]
    )


def has_absolute_safety_claim(text: str = "") -> bool:
    return any(keyword in text for keyword in ["绝对安全", "100%安全", "完全无风险", "零风险"])


def validate_agent_contract(result: dict[str, Any] | None = None) -> dict[str, Any]:
    result = result or {}
    consumer_copy = str(result.get("consumer_copy") or "")
    grade = str(result.get("grade") or "")
    defect_type = str(result.get("defect_type") or "")
    review_required = bool(result.get("review_required"))
    error = None
    if defect_type == "rot_defect" and (grade != "blocked" or not review_required):
        error = "rot_defect must be blocked and require review"
    elif result.get("edible_safety") == "risk" and result.get("next_action") == "confirm_listing":
        error = "risk items cannot confirm listing"
    elif float(result.get("confidence", 0.0) or 0.0) < 0.7 and not review_required:
        error = "low confidence must require review"
    elif has_absolute_safety_claim(consumer_copy):
        error = "consumer copy contains absolute safety claim"
    elif defect_type in {"rot_defect", "blocked"} and consumer_copy:
        error = "high risk product cannot expose consumer copy"
    return {"ok": error is None, "error": error, "result": result}


def normalize_badcase(bad_case: dict[str, Any] | None = None) -> dict[str, Any]:
    bad_case = bad_case or {}
    return {
        "id": bad_case.get("id") or bad_case.get("run_id") or f"badcase_{bad_case.get('sample_id', 'unknown')}",
        "sample_id": bad_case.get("sample_id"),
        "run_id": bad_case.get("run_id"),
        "issue_type": bad_case.get("issue_type", "unknown"),
        "phenomenon": bad_case.get("phenomenon", ""),
        "root_cause": bad_case.get("root_cause", ""),
        "fix_action": bad_case.get("fix_action", ""),
        "retest_metric": bad_case.get("retest_metric", ""),
        "status": bad_case.get("status", "open"),
        "created_at": bad_case.get("created_at"),
        "updated_at": bad_case.get("updated_at"),
    }

