from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class GradeRequest(BaseModel):
    image: str | None = None
    image_url: str | None = None
    image_base64: str | None = None
    mock_label: str | None = None
    origin: str | None = None
    weight: float | None = None
    harvest_date: str | None = None
    expected_price: float | None = None
    farmer_note: str | None = None
    mode: str | None = None


class AgentValidateRequest(BaseModel):
    result: dict[str, Any] = Field(default_factory=dict)
    input: dict[str, Any] = Field(default_factory=dict)


class StatePayload(BaseModel):
    currentReport: dict[str, Any] | None = None
    products: list[dict[str, Any]] = Field(default_factory=list)
    reviews: list[dict[str, Any]] = Field(default_factory=list)
    feedbacks: list[dict[str, Any]] = Field(default_factory=list)
    reportCount: int = 0
    evalRuns: list[dict[str, Any]] = Field(default_factory=list)
    badCases: list[dict[str, Any]] = Field(default_factory=list)
    actionLogs: list[dict[str, Any]] = Field(default_factory=list)
    updatedAt: str | None = None


class ProductPayload(BaseModel):
    id: str
    status: str | None = None
    name: str | None = None
    category: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProductStatusPayload(BaseModel):
    status: str | None = None
    reviewStatus: str | None = None
    reason: str | None = None


class ReviewPayload(BaseModel):
    id: str | None = None
    productId: str | None = None
    status: str | None = None
    manualReason: str | None = None
    reviewer: str | None = None
    notes: str | None = None


class FeedbackPayload(BaseModel):
    id: str | None = None
    productId: str | None = None
    runId: str | None = None
    kind: str | None = None
    text: str | None = None


class BadCasePayload(BaseModel):
    id: str | None = None
    run_id: str | None = None
    sample_id: str | None = None
    issue_type: str | None = None
    phenomenon: str | None = None
    root_cause: str | None = None
    fix_action: str | None = None
    retest_metric: str | None = None
    status: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class EvalRunRequest(BaseModel):
    mode: str | None = "mock"
    limit: int | None = None
    dataset_path: str | None = None
    note: str | None = None


class EvalCaseResult(BaseModel):
    id: str
    label: str | None = None
    expected_defect_type: str | None = None
    actual_defect_type: str | None = None
    expected_grade: str | None = None
    actual_grade: str | None = None
    passed: bool
    scores: dict[str, float] = Field(default_factory=dict)
    failure_nodes: list[str] = Field(default_factory=list)
    output: dict[str, Any] = Field(default_factory=dict)


class EvalRunResponse(BaseModel):
    run_id: str
    mode: str
    dataset_size: int
    metrics: dict[str, Any]
    results: list[EvalCaseResult]

