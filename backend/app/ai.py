from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

import httpx

from .config import settings
from .domain import RULES, build_agent_prompt, fallback_farmer_explanation, infer_inspection_facts, validate_agent_contract


def parse_model_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", raw, flags=re.S)
    if match:
        raw = match.group(1)
    raw = raw.replace("\u0000", "").strip()
    return json.loads(raw)


def apply_agent_contract(result: dict[str, Any] | None = None, input_data: dict[str, Any] | None = None) -> dict[str, Any]:
    result = result or {}
    input_data = input_data or {}
    defect_type = result.get("defect_type") if result.get("defect_type") in RULES else input_data.get("mock_label", "fresh")
    if defect_type not in RULES:
        defect_type = "fresh"
    rule = RULES[defect_type]
    confidence = max(0.0, min(1.0, float(result.get("confidence", 0.5) or 0.5)))
    normalized = {
        "fruit_type": result.get("fruit_type") or "apple",
        "defect_type": defect_type,
        "defect_label": result.get("defect_label") or rule["defect_label"],
        "business_defect": result.get("business_defect") or rule["business_defect"],
        "grade": result.get("grade") or rule["grade"],
        "confidence": confidence,
        "edible_safety": result.get("edible_safety") or rule["edible_safety"],
        "safety_label": result.get("safety_label") or rule["safety_label"],
        "price_suggestion": result.get("price_suggestion") or rule["price_suggestion"],
        "farmer_explanation": result.get("farmer_explanation") or fallback_farmer_explanation(rule, input_data),
        "consumer_copy": result.get("consumer_copy") or rule["consumer_copy"],
        "review_required": bool(result.get("review_required", rule["review_required"])),
        "risk_flags": result.get("risk_flags") if isinstance(result.get("risk_flags"), list) else list(rule["risk_flags"]),
        "next_action": result.get("next_action") or ("manual_review" if bool(result.get("review_required", rule["review_required"])) else "confirm_listing"),
        "inspection_facts": result.get("inspection_facts") if isinstance(result.get("inspection_facts"), dict) else infer_inspection_facts(result, input_data),
    }
    contract = validate_agent_contract(normalized)
    normalized["contract_ok"] = contract["ok"]
    normalized["contract_error"] = contract["error"]
    return normalized


@dataclass
class MockVisionProvider:
    name: str = "mock"

    async def grade(self, input_data: dict[str, Any]) -> dict[str, Any]:
        label = input_data.get("mock_label") or "fresh"
        rule = RULES.get(label, RULES["fresh"])
        return {
            "fruit_type": "apple",
            "defect_type": label if label in RULES else "fresh",
            "defect_label": rule["defect_label"],
            "business_defect": rule["business_defect"],
            "grade": rule["grade"],
            "confidence": 0.92 if label == "fresh" else 0.81 if label == "scab_defect" else 0.74 if label == "bruise_defect" else 0.62,
            "edible_safety": rule["edible_safety"],
            "safety_label": rule["safety_label"],
            "price_suggestion": rule["price_suggestion"],
            "farmer_explanation": fallback_farmer_explanation(rule, input_data),
            "consumer_copy": rule["consumer_copy"],
            "review_required": rule["review_required"],
            "risk_flags": list(rule["risk_flags"]),
            "next_action": "manual_review" if rule["review_required"] else "confirm_listing",
            "inspection_facts": infer_inspection_facts({"defect_type": label, "confidence": 0.9 if label == "fresh" else 0.75}, input_data),
        }


@dataclass
class QwenVisionProvider:
    api_key: str
    model: str
    base_url: str

    async def grade(self, input_data: dict[str, Any]) -> dict[str, Any]:
        prompt = build_agent_prompt(input_data)
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
            "temperature": 0.2,
        }
        if input_data.get("image_url"):
            payload["messages"][0]["content"].append({"type": "image_url", "image_url": {"url": input_data["image_url"]}})
        elif input_data.get("image_base64"):
            payload["messages"][0]["content"].append({"type": "image_url", "image_url": {"url": input_data["image_base64"]}})

        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(self.base_url.rstrip("/") + "/chat/completions", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        content = data["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        parsed = parse_model_json(content)
        parsed["_trace"] = data
        return parsed


def get_provider() -> MockVisionProvider | QwenVisionProvider:
    if settings.provider == "qwen" and settings.dashscope_api_key:
        return QwenVisionProvider(settings.dashscope_api_key, settings.dashscope_model, settings.dashscope_base_url)
    return MockVisionProvider()


async def grade_with_provider(input_data: dict[str, Any]) -> tuple[dict[str, Any], str]:
    provider = get_provider()
    raw = await provider.grade(input_data)
    normalized = apply_agent_contract(raw, input_data)
    source = "api_live" if isinstance(provider, QwenVisionProvider) else "mock"
    return normalized, source
