from __future__ import annotations

from fastapi import APIRouter

from .ai import apply_agent_contract
from .config import settings
from .domain import GUARDRAILS, INSPECTION_FACT_FIELDS, OUTPUT_FIELDS, RULES, normalize_badcase
from .schemas import AgentValidateRequest, BadCasePayload, EvalRunRequest, FeedbackPayload, GradeRequest, ProductPayload, ProductStatusPayload, ReviewPayload, StatePayload
from .services import grade_image, run_backend_eval
from .repository import (
    list_bad_cases as repo_list_bad_cases,
    list_eval_runs as repo_list_eval_runs,
    list_feedbacks as repo_list_feedbacks,
    list_products as repo_list_products,
    list_reviews as repo_list_reviews,
    update_product_status,
    upsert_bad_case as repo_upsert_bad_case,
    upsert_feedback as repo_upsert_feedback,
    upsert_product as repo_upsert_product,
    upsert_review as repo_upsert_review,
    write_audit_log,
)
from .storage import append_trace, read_recent_traces, read_state, write_state


router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "provider": settings.provider,
        "api_key_configured": bool(settings.dashscope_api_key),
        "model": settings.dashscope_model,
        "base_url": settings.dashscope_base_url,
        "mode": "qwen_vl_api" if settings.dashscope_api_key else "fallback_mock",
        "contract_version": settings.contract_version,
        "prompt_version": settings.prompt_version,
        "rule_version": settings.rule_version,
        "output_fields": len(OUTPUT_FIELDS),
        "inspection_fact_fields": len(INSPECTION_FACT_FIELDS),
        "guardrails": len(GUARDRAILS),
    }


@router.get("/agent/config")
async def agent_config() -> dict:
    state = read_state()
    return {
        "contract_version": settings.contract_version,
        "prompt_version": settings.prompt_version,
        "rule_version": settings.rule_version,
        "provider": settings.provider,
        "model": settings.dashscope_model,
        "api_key_configured": bool(settings.dashscope_api_key),
        "output_fields": OUTPUT_FIELDS,
        "inspection_fact_fields": INSPECTION_FACT_FIELDS,
        "guardrails": GUARDRAILS,
        "defect_types": list(RULES.keys()),
        "diagnostics": {
            "products": len(repo_list_products()),
            "reviews": len(repo_list_reviews()),
            "feedbacks": len(repo_list_feedbacks()),
            "bad_cases": len(repo_list_bad_cases()),
            "eval_results": len(repo_list_eval_runs()),
            "action_logs": len(state.get("actionLogs", [])),
        },
    }


@router.post("/agent/validate")
async def agent_validate(payload: AgentValidateRequest) -> dict:
    return apply_agent_contract(payload.result, payload.input)


@router.get("/state")
async def get_state() -> dict:
    return read_state()


@router.post("/state")
async def set_state(payload: StatePayload) -> dict:
    state = write_state(payload.model_dump())
    return {"ok": True, "state": state}


@router.get("/products")
async def list_products() -> dict:
    return {"products": repo_list_products()}


@router.post("/products")
async def upsert_product(payload: ProductPayload) -> dict:
    product = payload.model_dump()
    repo_upsert_product(product)
    write_audit_log(action="product.upsert", payload=product, target_type="product", target_id=product.get("id"))
    return {"product": product, "state": read_state()}


@router.patch("/products/{product_id}/status")
async def patch_product_status(product_id: str, payload: ProductStatusPayload) -> dict:
    update_product_status(product_id, payload.status)
    state = read_state()
    reviews = []
    for review in state.get("reviews", []):
        if review.get("productId") == product_id:
            review = {**review, "status": payload.reviewStatus or review.get("status"), "manualReason": payload.reason or review.get("manualReason")}
            repo_upsert_review(review)
            write_audit_log(action="review.update", payload=review, target_type="review", target_id=review.get("id"))
        reviews.append(review)
    write_audit_log(action="product.status", payload={"product_id": product_id, "status": payload.status}, target_type="product", target_id=product_id)
    return {"state": read_state()}


@router.post("/reviews")
async def upsert_review(payload: ReviewPayload) -> dict:
    review = payload.model_dump()
    if not review.get("id"):
        review["id"] = f"review_{len(read_state().get('reviews', [])) + 1}"
    repo_upsert_review(review)
    write_audit_log(action="review.upsert", payload=review, target_type="review", target_id=review.get("id"))
    return {"review": review, "state": read_state()}


@router.post("/feedback")
async def upsert_feedback(payload: FeedbackPayload) -> dict:
    feedback = payload.model_dump()
    if not feedback.get("id"):
        feedback["id"] = f"feedback_{len(read_state().get('feedbacks', [])) + 1}"
    repo_upsert_feedback(feedback)
    write_audit_log(action="feedback.upsert", payload=feedback, target_type="feedback", target_id=feedback.get("id"))
    return {"feedback": feedback, "state": read_state()}


@router.post("/bad-cases")
async def upsert_bad_case(payload: BadCasePayload) -> dict:
    bad_case = normalize_badcase(payload.model_dump())
    repo_upsert_bad_case(bad_case)
    write_audit_log(action="badcase.upsert", payload=bad_case, target_type="bad_case", target_id=bad_case.get("id"))
    return {"badCase": bad_case, "state": read_state()}


@router.post("/evals/run")
async def evals_run(payload: EvalRunRequest) -> dict:
    eval_run = await run_backend_eval(payload.model_dump())
    write_audit_log(action="eval.run", payload={"run_id": eval_run.get("run_id"), "mode": eval_run.get("mode")}, target_type="eval_run", target_id=eval_run.get("run_id"))
    return {"evalRun": eval_run, "state": read_state()}


@router.get("/traces")
async def traces(limit: int = 50) -> dict:
    return {"traces": read_recent_traces(max(1, min(200, limit)))}


@router.post("/grade")
async def grade(payload: GradeRequest) -> dict:
    output = await grade_image(payload.model_dump())
    append_trace(
        {
            "kind": "api_response",
            "run_id": output.get("run_id"),
            "run_source": output.get("run_source"),
            "final_output": output,
        }
    )
    write_audit_log(action="grade.run", payload={"run_id": output.get("run_id"), "run_source": output.get("run_source")}, target_type="grading_run", target_id=output.get("run_id"))
    return output
