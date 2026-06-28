import { appleRules as rules, appleSamples as samples } from "./src/domain/apple-grading.js";
import { createApiClient } from "./src/core/api-client.js";
import { createAppStore } from "./src/core/app-store.js";
import { createViewRouter } from "./src/core/view-router.js";
import { $, $$ } from "./src/shared/dom.js";
import { channelForGrade, feedbackTypeLabel, gradeClass, statusClass, statusLabel } from "./src/shared/presentation.js";
import { evalFailureNodes, evalMetrics, evalNodeLabel, evaluateSample } from "./src/features/eval/eval-engine.js";
import { createFarmerView } from "./src/features/farmer/farmer-view.js";
import { createFarmerController } from "./src/features/farmer/farmer-controller.js";
import { createProductFromReport, upsertProduct } from "./src/features/farmer/farmer-workflow.js";
import { createConsumerView } from "./src/features/consumer/consumer-view.js";
import { createConsumerController } from "./src/features/consumer/consumer-controller.js";
import { createOpsView } from "./src/features/ops/ops-view.js";
import { createOpsController } from "./src/features/ops/ops-controller.js";
import { renderOpsShells } from "./src/features/ops/ops-shell.js";

function defaultBadCaseList() {
  return [{
    id: "badcase_demo_001",
    productId: "demo",
    caseType: "规则边界样例",
    aiOutput: "B 级表皮瑕疵",
    humanCorrection: "C 级轻微碰伤",
    rootCause: "图片中碰伤面积较大，规则需要加入面积阈值",
    fixAction: "后续增加碰伤面积和软烂程度字段",
    status: "待复盘",
    severity: "等级误判",
    createdAt: "2026/5/28"
  }];
}

const appStore = createAppStore({
  selectedSample: samples[0],
  currentReport: null,
  products: [],
  reviews: [],
  feedbacks: [],
  reportCount: 0,
  evalRuns: [],
  latestEvalArtifacts: null,
  actionLogs: [],
  evalSetItems: [],
  isGrading: false,
  activeFarmerProductId: null,
  activeConsumerProductId: null,
  pendingExitProductId: null,
  selectedExitReason: "safety_concern",
  apiHealth: { checked: false, ok: false, mode: "unknown", provider: "unknown", model: "unknown", api_key_configured: false },
  agentConfig: null,
  runTraces: [],
  badCaseFilters: { failure_stage: "all", run_source: "all", status: "all", severity: "all" },
  badCases: defaultBadCaseList(),
  lastStateUpdatedAt: null,
  stateSyncTimer: null
});
const state = appStore.state;

const API_BASE = window.XIAGUO_API_BASE || "";
const apiClient = createApiClient(API_BASE);
const apiRequest = apiClient.request;
const apiPost = apiClient.post;
const apiPatch = apiClient.patch;
const { setRole, roleForView, switchView, bindHistory } = createViewRouter({ $, $$ });
const farmerView = createFarmerView({
  $,
  rules,
  gradeClass,
  statusClass,
  statusLabel,
  getState: () => ({
    selectedSample: state.selectedSample,
    samples,
    products: state.products,
    reviews: state.reviews,
    feedbacks: state.feedbacks,
    isGrading: state.isGrading,
    activeFarmerProductId: state.activeFarmerProductId
  }),
  setActiveProductId: (productId) => appStore.set("activeFarmerProductId", productId, "farmer:open-product")
});
const farmerController = createFarmerController({
  $,
  samples,
  getSelectedSample: () => state.selectedSample,
  setSelectedSample: (sample) => appStore.set("selectedSample", sample, "farmer:select-sample"),
  clearCurrentReport: () => appStore.set("currentReport", null, "farmer:clear-report"),
  renderAll,
  persistState,
  switchView,
  showToast,
  runAgent,
  confirmListing,
  markProductSold,
  completeResubmission
});
const consumerView = createConsumerView({
  $,
  gradeClass,
  statusClass,
  statusLabel,
  channelForGrade,
  getState: () => ({ products: state.products, feedbacks: state.feedbacks, activeConsumerProductId: state.activeConsumerProductId }),
  setActiveProductId: (productId) => appStore.set("activeConsumerProductId", productId, "consumer:open-product")
});
const consumerController = createConsumerController({
  $,
  $$,
  getState: () => ({ products: state.products, feedbacks: state.feedbacks, activeConsumerProductId: state.activeConsumerProductId }),
  getPendingExitProductId: () => state.pendingExitProductId,
  setPendingExitProductId: (productId) => appStore.set("pendingExitProductId", productId, "consumer:set-exit-product"),
  getSelectedExitReason: () => state.selectedExitReason,
  setSelectedExitReason: (reason) => appStore.set("selectedExitReason", reason, "consumer:set-exit-reason"),
  renderAll,
  persistState,
  switchView,
  showToast,
  addActionLog,
  addBadCase,
  addFeedback: (feedback) => appStore.update("feedbacks", (items) => [feedback, ...items], "consumer:add-feedback"),
  apiPost
});
const opsView = createOpsView({
  $,
  gradeClass,
  statusClass,
  statusLabel,
  feedbackTypeLabel,
  channelForGrade,
  getState: () => ({ reviews: state.reviews, products: state.products, feedbacks: state.feedbacks, badCases: state.badCases, actionLogs: state.actionLogs })
});
const opsController = createOpsController({ approveReview, requestResubmission, rejectReview, updateBadCaseStatus });

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function productStatus(productId) {
  return state.products.find((item) => item.id === productId)?.status || null;
}

async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.apiHealth = { checked: true, ok: true, ...(await response.json()) };
  } catch (error) {
    state.apiHealth = {
      checked: true,
      ok: false,
      mode: "static_file",
      provider: "none",
      model: "none",
      api_key_configured: false
    };
  }
  renderWorkbench();
}

async function checkAgentConfig() {
  try {
    const response = await fetch(`${API_BASE}/api/agent/config`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.agentConfig = await response.json();
  } catch (error) {
    state.agentConfig = null;
  }
  renderAiPrompt();
}

async function loadRunTraces() {
  try {
    const response = await fetch(`${API_BASE}/api/traces?limit=8`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.runTraces = Array.isArray(data.traces) ? data.traces : [];
  } catch (error) {
    state.runTraces = [];
  }
  renderRunTraces();
}

function persistState() {
  state.lastStateUpdatedAt = new Date().toISOString();
}

async function restoreState() {
  try {
    const response = await fetch(`${API_BASE}/api/state`);
    if (!response.ok) return;
    const serverState = await response.json();
    applyState(serverState);
  } catch (error) {
    console.warn("Server state was not restored", error);
  }
}

function applyState(snapshot) {
  if (!snapshot) return;
  appStore.patch({
    currentReport: snapshot.currentReport || null,
    products: snapshot.products || [],
    reviews: snapshot.reviews || [],
    feedbacks: snapshot.feedbacks || [],
    reportCount: snapshot.reportCount || 0,
    evalRuns: snapshot.evalRuns || [],
    latestEvalArtifacts: snapshot.latestEvalArtifacts || state.latestEvalArtifacts,
    badCases: snapshot.badCases?.length ? snapshot.badCases : state.badCases,
    actionLogs: snapshot.actionLogs || [],
    lastStateUpdatedAt: snapshot.updatedAt || state.lastStateUpdatedAt
  }, "state:restore");
}

function addActionLog(action, detail, actor = "运营") {
  state.actionLogs.unshift({
    id: `log_${Date.now()}`,
    actor,
    action,
    detail,
    createdAt: new Date().toLocaleString()
  });
  state.actionLogs = state.actionLogs.slice(0, 30);
}

function confidenceFor(label) {
  if (label === "rot_defect") return 0.68;
  if (label === "bruise_defect") return 0.76;
  if (label === "scab_defect") return 0.84;
  return 0.9;
}

function runMockAgent() {
  const input = farmerController.formInput();
  const rule = rules[state.selectedSample.label];
  const confidence = confidenceFor(state.selectedSample.label);
  const productId = `product_${Date.now()}`;
  state.reportCount += 1;
  state.currentReport = buildReport(productId, input, rule, confidence, {
    mock_source: state.selectedSample.custom ? "local_upload_manual_label" : "dataset_folder_label",
    dataset_label: state.selectedSample.label,
    defect_type: state.selectedSample.label,
    defect_label: rule.defectLabel,
    business_defect: rule.businessDefect,
    grade: rule.grade,
    edible_safety: rule.safety,
    safety_label: rule.safetyLabel,
    price_suggestion: rule.priceSuggestion,
    farmer_explanation: buildFarmerExplanation(rule, input),
    consumer_copy: rule.consumerTemplate,
    review_required: rule.reviewRequired || confidence < 0.7,
    risk_flags: confidence < 0.7 ? [...rule.riskFlags, "low_confidence"] : [...rule.riskFlags],
    next_action: rule.reviewRequired || confidence < 0.7 ? "manual_review" : "confirm_listing",
    contract_version: "local-mock-v1",
    contract_violations: [],
    guardrail_actions: rule.reviewRequired || confidence < 0.7 ? ["force_manual_review"] : [],
    agent_status: "mock",
    fallback_reason: "",
    parse_repaired: false,
    model_error: ""
  });
  afterAgentRun("AI Agent 已生成结构化分级报告");
}

async function runAgent() {
  if (!farmerController.validateInput()) return;
  if (state.isGrading) return;
  setGradingState(true);
  if ($("#agentMode").value === "mock") {
    runMockAgent();
    setGradingState(false);
    return;
  }
  try {
    await runApiAgent();
  } finally {
    setGradingState(false);
  }
}

function setGradingState(active) {
  state.isGrading = active;
  const button = $("#runAgentBtn");
  if (button) {
    button.disabled = active;
    button.textContent = active ? "分级中..." : "开始智能分级";
  }
  renderRoleStatus();
  renderWorkbench();
}

async function runApiAgent() {
  const input = farmerController.formInput();
  const productId = `product_${Date.now()}`;
  state.reportCount += 1;
  try {
    const response = await fetch(`${API_BASE}/api/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: state.selectedSample.image,
        fruit_type: input.fruit_type,
        origin: input.origin,
        weight: input.weight,
        harvest_date: input.harvest_date,
        expected_price: input.expected_price,
        farmer_note: input.farmer_note,
        mock_label: state.selectedSample.label
      })
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const result = await response.json();
    const safeResult = normalizeApiResult(result, state.selectedSample.label);
    state.currentReport = buildReport(productId, input, rules[safeResult.defect_type] || rules.rot_defect, safeResult.confidence, {
      ...safeResult,
      mock_source: result.mock_source || "api_agent"
    });
    afterAgentRun(result.mock_source === "api_fallback_mock" ? "API 未配置密钥，已回退 mock 结果" : "真实 AI API 已返回分级报告");
    loadRunTraces();
  } catch (error) {
    state.reportCount -= 1;
    showToast("API 模式未连通，表单已保留。请检查服务后重试，或切回 Mock 模式");
  }
}

function buildReport(productId, input, rule, confidence, result) {
  return {
    id: `report_${Date.now()}`,
    product_id: productId,
    sample_id: state.selectedSample.id,
    image: state.selectedSample.image,
    fruit_type: input.fruit_type,
    origin: input.origin,
    weight: input.weight,
    harvest_date: input.harvest_date,
    expected_price: input.expected_price,
    farmer_note: input.farmer_note,
    mock_source: result.mock_source,
    dataset_label: result.dataset_label || state.selectedSample.label,
    defect_type: result.defect_type,
    defect_label: result.defect_label,
    business_defect: result.business_defect || rule.businessDefect,
    grade: result.grade,
    confidence,
    edible_safety: result.edible_safety,
    safety_label: result.safety_label,
    price_suggestion: result.price_suggestion,
    farmer_explanation: result.farmer_explanation,
    consumer_copy: result.consumer_copy,
    review_required: Boolean(result.review_required),
    risk_flags: result.risk_flags || [],
    next_action: result.next_action,
    run_id: result.run_id || "",
    run_source: result.run_source || "",
    rule_version: result.rule_version || "",
    inspection_facts: result.inspection_facts || null,
    business_decision: result.business_decision || null,
    contract_version: result.contract_version || "unknown",
    contract_violations: result.contract_violations || [],
    guardrail_actions: result.guardrail_actions || [],
    agent_status: result.agent_status || "unknown",
    fallback_reason: result.fallback_reason || "",
    parse_repaired: Boolean(result.parse_repaired),
    model_error: result.model_error || result.error || ""
  };
}

function normalizeApiResult(result, fallbackLabel) {
  const safeType = rules[result.defect_type] ? result.defect_type : fallbackLabel;
  const rule = rules[safeType] || rules.rot_defect;
  const confidence = Number(result.confidence ?? confidenceFor(safeType));
  const forceReview = rule.grade === "blocked" || rule.reviewRequired || confidence < 0.7 || result.edible_safety === "risk";
  return {
    defect_type: safeType,
    defect_label: result.defect_label || rule.defectLabel,
    business_defect: result.business_defect || rule.businessDefect,
    grade: forceReview && result.edible_safety === "risk" ? "blocked" : (result.grade || rule.grade),
    confidence,
    edible_safety: result.edible_safety || rule.safety,
    safety_label: result.safety_label || rule.safetyLabel,
    price_suggestion: result.price_suggestion || rule.priceSuggestion,
    farmer_explanation: result.farmer_explanation || buildFarmerExplanation(rule, formInput()),
    consumer_copy: result.consumer_copy || rule.consumerTemplate,
    review_required: forceReview,
    risk_flags: forceReview ? Array.from(new Set([...(result.risk_flags || []), ...rule.riskFlags])) : (result.risk_flags || []),
    next_action: forceReview ? "manual_review" : "confirm_listing",
    contract_version: result.contract_version || "api-normalized-v1",
    contract_violations: result.contract_violations || [],
    guardrail_actions: result.guardrail_actions || (forceReview ? ["force_manual_review"] : []),
    agent_status: result.agent_status || "ok",
    fallback_reason: result.fallback_reason || "",
    parse_repaired: Boolean(result.parse_repaired),
    model_error: result.model_error || result.error || ""
  };
}

function afterAgentRun(message) {
  renderAll();
  persistState();
  switchView("agent");
  showToast(message);
}

function buildFarmerExplanation(rule, input) {
  if (rule.grade === "blocked") {
    return `系统识别到${rule.defectLabel}，存在食品安全风险，${input.origin}这批苹果不建议直接上架，需平台人工复核。`;
  }
  return `系统识别到${rule.defectLabel}，判断为${rule.safetyLabel}，建议按 ${rule.grade} 级瑕疵果处理，价格建议为${rule.priceSuggestion}。`;
}

function productFromReport(status) {
  const product = createProductFromReport(state.currentReport, status, channelForGrade);
  appStore.set("products", upsertProduct(state.products, product), "farmer:upsert-product");
  appStore.set("activeFarmerProductId", product.id, "farmer:open-product");
  apiPost("/api/products", product);
  return product;
}

function confirmListing() {
  if (!state.currentReport) return;
  if (state.currentReport.review_required || state.currentReport.grade === "blocked") {
    submitReview("农户确认提交复核");
    return;
  }
  productFromReport("listed");
  addActionLog("农户确认上架", `${state.currentReport.origin} ${state.currentReport.grade} 级苹果进入消费者页`, "农户");
  renderAll();
  persistState();
  switchView("farmer");
  showToast("商品已上架，可在农户端查看状态");
}

function submitReview(reason = "AI 判断需要人工复核") {
  if (!state.currentReport) return;
  const product = productFromReport("pending_review");
  if (!state.reviews.some((item) => item.productId === product.id)) {
    const review = { id: `review_${Date.now()}`, productId: product.id, product, reason, status: "pending", createdAt: new Date().toLocaleString() };
    state.reviews.unshift(review);
    apiPost("/api/reviews", review);
    addActionLog("提交人工复核", `${product.title}：${reason}`, "农户");
  }
  renderAll();
  persistState();
  switchView("farmer");
  showToast("已提交复核，可在农户端查看状态");
}

function approveReview(productId) {
  const review = state.reviews.find((item) => item.productId === productId);
  const product = state.products.find((item) => item.id === productId);
  if (!review || !product) return;
  const reason = reviewReason(productId, "approve");
  if (!reason) return showToast("请先选择或填写通过原因");
  review.status = "approved";
  review.manualReason = reason;
  product.status = product.grade === "blocked" ? "rejected" : "listed";
  apiPatch(`/api/products/${encodeURIComponent(productId)}/status`, {
    status: product.status,
    reviewStatus: review.status,
    reason
  });
  if (product.grade === "blocked") addBadCase(product, "运营复核驳回", `高风险样本不能上架：${reason}`);
  addActionLog(product.status === "listed" ? "复核通过" : "高风险驳回", `${product.title}：${reason}`);
  renderAll();
  persistState();
  showToast(product.status === "listed" ? "复核通过，商品已上架" : "已驳回高风险商品");
}

function rejectReview(productId) {
  const review = state.reviews.find((item) => item.productId === productId);
  const product = state.products.find((item) => item.id === productId);
  if (!review || !product) return;
  const reason = reviewReason(productId, "reject");
  if (!reason) return showToast("请先选择或填写驳回原因");
  review.status = "rejected";
  review.manualReason = reason;
  product.status = "rejected";
  apiPatch(`/api/products/${encodeURIComponent(productId)}/status`, {
    status: "rejected",
    reviewStatus: "rejected",
    reason
  });
  addBadCase(product, "人工驳回", reason);
  addActionLog("复核驳回", `${product.title}：${reason}`);
  renderAll();
  persistState();
  showToast("已驳回并记录坏例");
}

function requestResubmission(productId) {
  const review = state.reviews.find((item) => item.productId === productId);
  const product = state.products.find((item) => item.id === productId);
  if (!review || !product) return;
  const reason = reviewReason(productId, "resubmit");
  if (!reason) return showToast("请先选择或填写补充资料原因");
  review.status = "resubmission_requested";
  review.manualReason = reason;
  product.status = "needs_resubmission";
  apiPatch(`/api/products/${encodeURIComponent(productId)}/status`, {
    status: "needs_resubmission",
    reviewStatus: "resubmission_requested",
    reason
  });
  addActionLog("要求补图/补充信息", `${product.title}：${reason}`);
  renderAll();
  persistState();
  showToast("已要求农户补充图片或信息");
}

function completeResubmission(productId) {
  const review = state.reviews.find((item) => item.productId === productId);
  const product = state.products.find((item) => item.id === productId);
  if (!review || !product) return;
  const note = $(`#resubmitFarmerNote_${CSS.escape(productId)}`)?.value?.trim() || "农户已补充图片/信息，提交再次复核";
  review.status = "pending";
  review.reason = `农户补充后再次提交：${note}`;
  product.status = "pending_review";
  apiPatch(`/api/products/${encodeURIComponent(productId)}/status`, {
    status: "pending_review",
    reviewStatus: "pending",
    reason: review.reason
  });
  addActionLog("农户补充资料", `${product.title}：${note}`, "农户");
  renderAll();
  persistState();
  switchView("opsReview");
  showToast("已重新提交运营复核");
}

function reviewReason(productId, action) {
  const select = $(`#${action}Reason_${CSS.escape(productId)}`);
  const input = $(`#${action}Note_${CSS.escape(productId)}`);
  const selected = select?.value || "";
  const note = input?.value?.trim() || "";
  if (!selected && !note) return "";
  return [selected, note].filter(Boolean).join("；");
}

function inferFailureStage(product, correction = "", rootCause = "") {
  const text = `${correction} ${rootCause}`;
  if (/文案|说明|承诺|copy/i.test(text)) return "copy_generation";
  if (/复核|补图|补资料|人工/i.test(text)) return "review_routing";
  if (/等级|A|B|C|禁售|流向|价格/i.test(text)) return "business_mapping";
  if (/安全|腐烂|霉|软烂|破皮|渗液|高风险/i.test(text)) return "risk_guardrail";
  if (product?.report?.inspection_facts) return "inspection_fact_extraction";
  return "manual_review";
}

function buildBadCasePayload(product, correction, rootCause, overrides = {}) {
  const report = product?.report || {};
  const failureStage = overrides.failure_stage || inferFailureStage(product, correction, rootCause);
  const observedOutput = overrides.observed_output || {
    grade: product?.grade || report.grade || "",
    defect_label: product?.defectLabel || report.defect_label || "",
    next_action: report.next_action || "",
    review_required: Boolean(report.review_required),
    inspection_facts: report.inspection_facts || null,
    business_decision: report.business_decision || null
  };
  return {
    id: overrides.id || `badcase_${Date.now()}`,
    productId: product?.id || overrides.productId || "",
    run_id: overrides.run_id || report.run_id || "",
    run_source: overrides.run_source || report.run_source || "",
    failure_stage: failureStage,
    failure_type: overrides.failure_type || (product?.grade === "blocked" ? "safety_block" : "human_or_user_correction"),
    caseType: overrides.caseType || (product?.grade === "blocked" ? "食品安全拦截" : "人工/用户修正"),
    aiOutput: overrides.aiOutput || `${observedOutput.grade || "-"} 级，${observedOutput.defect_label || "-"}`,
    observed_output: observedOutput,
    humanCorrection: correction,
    expected_output: overrides.expected_output || { correction },
    rootCause,
    root_cause_hypothesis: rootCause,
    fixAction: overrides.fixAction || "待复盘后补充规则、提示词或人工复核要求",
    fix_action: overrides.fix_action || overrides.fixAction || "待复盘后补充规则、提示词或人工复核要求",
    status: overrides.status || "待复盘",
    retest_result: overrides.retest_result || "",
    severity: overrides.severity || (product?.grade === "blocked" || /安全|腐烂|软烂|禁售|破皮|霉/i.test(`${rootCause}${correction}`) ? "高风险漏放" : "人工修正"),
    addedToRegression: Boolean(overrides.addedToRegression),
    createdAt: overrides.createdAt || new Date().toLocaleString()
  };
}

function addBadCase(product, correction, rootCause) {
  if (!product) return;
  const badCase = buildBadCasePayload(product, correction, rootCause);
  state.badCases.unshift(badCase);
  apiPost("/api/bad-cases", badCase);
}

function updateBadCaseStatus(caseId, status) {
  const item = state.badCases.find((entry) => entry.id === caseId);
  if (!item) return;
  item.status = status;
  if (status === "已修复") {
    item.fixAction = item.fixAction && item.fixAction !== "待复盘后补充规则、提示词或人工复核要求"
      ? item.fixAction
      : "已复盘，后续通过回归检查验证规则是否稳定";
    item.fix_action = item.fixAction;
    item.retest_result = item.retest_result || "待回归验证";
    item.fixedAt = new Date().toLocaleString();
  }
  if (status === "已进入回归") {
    item.addedToRegression = true;
    item.fixAction = item.fixAction || "加入回归样本，持续验证高风险召回";
    item.fix_action = item.fix_action || item.fixAction;
    item.retest_result = item.retest_result || "已进入回归集，等待下一次 Eval";
    item.regressionAt = new Date().toLocaleString();
  }
  apiPost("/api/bad-cases", item);
  renderAll();
  persistState();
  showToast(`坏例已标记为${status}`);
}

function badCaseValue(item, key) {
  if (key === "failure_stage") return item.failure_stage || "legacy_case";
  if (key === "run_source") return item.run_source || "unknown";
  if (key === "status") return item.status || "待复盘";
  if (key === "severity") return item.severity || item.failure_type || "未分级";
  return item[key] || "";
}

function badCaseStageLabel(value) {
  const labels = {
    all: "全部节点",
    image_quality_check: "图片可判定性",
    inspection_fact_extraction: "视觉事实抽取",
    business_mapping: "业务规则映射",
    risk_guardrail: "风险护栏",
    copy_generation: "文案合规",
    review_routing: "复核路由",
    manual_review: "人工复盘",
    legacy_case: "历史坏例"
  };
  return labels[value] || value;
}

function badCaseSourceLabel(value) {
  const labels = {
    all: "全部来源",
    mock: "Mock 演示",
    eval_mock: "Eval Mock",
    api_live: "真实 API",
    api_fallback: "API 回退",
    unknown: "未记录来源"
  };
  return labels[value] || value;
}

function badCaseFilterOptions(key) {
  return Array.from(new Set(state.badCases.map((item) => badCaseValue(item, key)).filter(Boolean))).sort();
}

function filteredBadCases() {
  return state.badCases.filter((item) => Object.entries(state.badCaseFilters).every(([key, selected]) => selected === "all" || badCaseValue(item, key) === selected));
}

function setSelectOptions(select, options, selected, labelFor, allLabel) {
  if (!select) return;
  select.innerHTML = ["all", ...options].map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value === "all" ? allLabel : labelFor(value)}</option>`).join("");
}

function renderBadCaseFilters() {
  setSelectOptions($("#badCaseStageFilter"), badCaseFilterOptions("failure_stage"), state.badCaseFilters.failure_stage, badCaseStageLabel, "全部节点");
  setSelectOptions($("#badCaseSourceFilter"), badCaseFilterOptions("run_source"), state.badCaseFilters.run_source, badCaseSourceLabel, "全部来源");
  setSelectOptions($("#badCaseStatusFilter"), badCaseFilterOptions("status"), state.badCaseFilters.status, (value) => value, "全部状态");
  setSelectOptions($("#badCaseSeverityFilter"), badCaseFilterOptions("severity"), state.badCaseFilters.severity, (value) => value, "全部风险");

  const summary = $("#badCaseFilterSummary");
  if (!summary) return;
  const list = filteredBadCases();
  const activeCount = Object.values(state.badCaseFilters).filter((value) => value !== "all").length;
  const highRisk = list.filter((item) => /高风险|critical|risk|安全|腐烂|禁售/.test(`${badCaseValue(item, "severity")} ${item.root_cause_hypothesis || item.rootCause || ""}`)).length;
  summary.innerHTML = `
    <div><span>当前命中</span><strong>${list.length}</strong></div>
    <div><span>全部坏例</span><strong>${state.badCases.length}</strong></div>
    <div><span>高风险相关</span><strong>${highRisk}</strong></div>
    <div><span>筛选条件</span><strong>${activeCount}</strong></div>
  `;
}

function updateBadCaseFilter(key, value) {
  state.badCaseFilters[key] = value || "all";
  renderRulesAndBadCases();
}

function mockPurchase(productId) {
  submitPurchaseIntent(productId);
}

function submitPurchaseIntent(productId) {
  const product = state.products.find((item) => item.id === productId);
  const amount = $(`#intentAmount_${productId}`)?.value || "未填写数量";
  const contact = $(`#intentContact_${productId}`)?.value?.trim() || "未留联系方式";
  const feedback = {
    id: `feedback_${Date.now()}`,
    productId,
    type: "purchase_intent",
    content: `${product?.title || productId}；${amount}；${contact}`,
    createdAt: new Date().toLocaleString()
  };
  state.feedbacks.unshift(feedback);
  apiPost("/api/feedback", feedback);
  addActionLog("提交购买意向", feedback.content, "消费者");
  renderAll();
  persistState();
  showToast("已记录购买意向，运营端可查看");
}

function hasPurchaseIntent(productId) {
  return state.feedbacks.some((item) => item.productId === productId && ["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type));
}

function openExitFeedback(productId) {
  if (!productId || hasPurchaseIntent(productId)) {
    switchView("consumer");
    return;
  }
  state.pendingExitProductId = productId;
  state.selectedExitReason = "safety_concern";
  $$("#exitFeedbackModal [data-exit-reason]").forEach((item) => item.classList.toggle("active", item.dataset.exitReason === state.selectedExitReason));
  const textarea = $("#exitFeedbackText");
  if (textarea) textarea.value = "";
  $("#exitFeedbackModal").classList.add("show");
  $("#exitFeedbackModal").setAttribute("aria-hidden", "false");
}

function closeExitFeedback() {
  $("#exitFeedbackModal").classList.remove("show");
  $("#exitFeedbackModal").setAttribute("aria-hidden", "true");
}

function submitExitFeedback() {
  if (!state.pendingExitProductId) {
    closeExitFeedback();
    switchView("consumer");
    return;
  }
  const content = $("#exitFeedbackText")?.value?.trim() || "用户退出商品详情时未购买";
  const feedback = {
    id: `feedback_${Date.now()}`,
    productId: state.pendingExitProductId,
    type: state.selectedExitReason,
    content,
    createdAt: new Date().toLocaleString()
  };
  state.feedbacks.unshift(feedback);
  apiPost("/api/feedback", feedback);
  addActionLog("退出购买反馈", `${feedbackTypeLabel(state.selectedExitReason)}：${content}`, "消费者");
  addBadCase(state.products.find((item) => item.id === state.pendingExitProductId), "消费者退出反馈", `反馈类型：${state.selectedExitReason}；${content}`);
  state.pendingExitProductId = null;
  closeExitFeedback();
  renderAll();
  persistState();
  switchView("consumer");
  showToast("反馈已进入运营端复盘");
}

function submitFeedback(productId) {
  const type = $(`#feedbackType_${productId}`).value;
  const content = $(`#feedbackText_${productId}`).value.trim() || "未填写补充说明";
  const feedback = { id: `feedback_${Date.now()}`, productId, type, content, createdAt: new Date().toLocaleString() };
  state.feedbacks.unshift(feedback);
  apiPost("/api/feedback", feedback);
  addActionLog("提交消费者反馈", `${feedbackTypeLabel(type)}：${content}`, "消费者");
  if (type !== "willing_to_buy") addBadCase(state.products.find((item) => item.id === productId), "消费者信任反馈", `反馈类型：${type}；${content}`);
  renderAll();
  persistState();
  showToast("反馈已回流到后台");
}

function markProductSold(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  product.status = "sold";
  apiPatch(`/api/products/${encodeURIComponent(productId)}/status`, { status: "sold" });
  addActionLog("农户标记已售出", product.title, "农户");
  renderAll();
  persistState();
  switchView("farmerProductDetail");
  showToast("商品状态已更新为已售出");
}

function seedDemoProducts() {
  const seedList = [samples[0], samples[3], samples[6], samples[9]];
  seedList.forEach((sample) => {
    state.selectedSample = sample;
    runMockAgent();
    if (state.currentReport.review_required) submitReview("系统生成演示复核样本");
    else productFromReport("listed");
  });
  state.selectedSample = samples[0];
  renderAll();
  persistState();
  switchView("consumer");
  showToast("已生成演示商品和复核样本");
}

function evalSetMetrics() {
  const total = state.evalSetItems.length;
  const seeded = state.evalSetItems.filter((item) => item.human_label_status === "seeded").length;
  const toLabel = state.evalSetItems.filter((item) => item.human_label_status === "to_label").length;
  const withExpectedFacts = state.evalSetItems.filter((item) => item.expected_facts && item.expected_decision).length;
  const smokeCount = state.evalSetItems.filter((item) => item.eval_split === "smoke_eval_set").length;
  const fullCount = state.evalSetItems.filter((item) => item.eval_split === "full_eval_set").length;
  const withAiOutput = state.evalSetItems.filter((item) => state.evalRuns.some((run) => run.sample_id === item.id)).length;
  const regressionLinked = state.evalSetItems.filter((item) => state.badCases.some((badCase) => badCase.productId === item.id && (badCase.status === "已进入回归" || badCase.addedToRegression))).length;
  const byType = state.evalSetItems.reduce((acc, item) => {
    acc[item.expected_defect_type] = (acc[item.expected_defect_type] || 0) + 1;
    return acc;
  }, {});
  return { total, seeded, toLabel, withExpectedFacts, smokeCount, fullCount, withAiOutput, regressionLinked, byType };
}

function evalReadinessRows() {
  return state.evalSetItems.map((item) => {
    const run = state.evalRuns.find((entry) => entry.sample_id === item.id);
    const badCase = state.badCases.find((entry) => entry.productId === item.id);
    const expectedReview = item.must_review ? "需复核" : "可上架";
    const aiOutput = run ? `${run.actual_grade} / ${run.next_action}` : "待运行";
    const gradeMismatch = run ? run.actual_grade !== item.expected_grade : false;
    const reviewMismatch = run ? (item.must_review && run.next_action === "confirm_listing") : false;
    const highRiskMiss = run ? (item.high_risk && !run.high_risk_recalled) : false;
    const issue = !run
      ? "待 AI 输出"
      : highRiskMiss
        ? "高风险漏放"
        : gradeMismatch
          ? "等级不一致"
          : reviewMismatch
            ? "复核动作不一致"
            : "通过";
    return {
      ...item,
      expectedReview,
      aiOutput,
      issue,
      status: badCase
        ? badCase.status || (badCase.addedToRegression ? "已进入回归" : "待复盘")
        : run && issue !== "通过"
          ? "待回流坏例"
          : item.human_label_status === "seeded"
            ? "已接入"
            : "待补标"
    };
  });
}

async function loadEvalSetTemplate() {
  try {
    const response = await fetch("./eval/apple_eval_set.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.evalSetItems = await response.json();
  } catch (error) {
    state.evalSetItems = [];
    console.warn("Eval template was not loaded", error);
  }
  renderEvalDataset();
}

async function runBatchEval() {
  const smokeSet = state.evalSetItems.filter((item) => item.eval_split === "smoke_eval_set" || item.human_label_status === "seeded").slice(0, 12);
  const evalSource = smokeSet.length ? smokeSet : samples;
  const evalMode = $("#evalModeSelect")?.value || "mock_eval";
  const serverEval = await apiPost("/api/evals/run", {
    mode: evalMode,
    split: smokeSet.length ? "smoke_eval_set" : "legacy_smoke",
    limit: 12,
    write_report: true
  });
  if (serverEval?.evalRun?.results?.length) {
    state.evalRuns = serverEval.evalRun.results;
    state.latestEvalArtifacts = serverEval.evalRun.artifacts || null;
  } else {
    state.evalRuns = evalSource.map(evaluateSample);
    state.latestEvalArtifacts = null;
    apiPost("/api/evals/run", {
      id: `eval_${Date.now()}`,
      createdAt: new Date().toLocaleString(),
      sampleCount: state.evalRuns.length,
      evalSetVersion: smokeSet.length ? "apple-eval-case-v0.2" : "legacy-samples",
      evalSource: smokeSet.length ? "eval/apple_eval_set.json#smoke_eval_set" : "samples",
      results: state.evalRuns
    });
  }
  renderAll();
  persistState();
  switchView("eval");
  showToast(serverEval?.evalRun?.results?.length ? "后端 Eval 已完成" : "本地 Eval 已完成");
}

function addEvalToBadCase(sampleId) {
  const item = state.evalRuns.find((entry) => entry.sample_id === sampleId);
  if (!item) return;
  const badCase = {
    id: `badcase_eval_${Date.now()}`,
    productId: item.sample_id,
    run_id: item.run_id || "",
    run_source: item.run_source || "eval_mock",
    failure_stage: item.failure_type === "copy_compliance" ? "copy_generation" : item.failure_type === "guardrail_or_label_mismatch" ? "risk_guardrail" : "business_mapping",
    failure_type: item.failure_type || "eval_low_score",
    caseType: "Eval 失败样本",
    aiOutput: `${item.actual_grade} / ${item.next_action}`,
    observed_output: {
      actual_grade: item.actual_grade,
      next_action: item.next_action,
      review_required: item.review_required,
      confidence: item.confidence,
      actual_facts: item.actual_facts,
      actual_decision: item.actual_decision,
      node_scores: item.node_scores,
      failed_node: item.failed_node
    },
    humanCorrection: `${item.expected_grade} / ${item.dataset_label}`,
    expected_output: {
      expected_grade: item.expected_grade,
      expected_defect_type: item.dataset_label,
      expected_facts: item.expected_facts,
      expected_decision: item.expected_decision,
      must_review: item.expected_decision?.review_required ?? (item.dataset_label === "rot_defect" || item.review_required)
    },
    rootCause: item.note,
    root_cause_hypothesis: item.note,
    fixAction: "加入回归样本，后续验证高风险召回、等级一致和文案合规",
    fix_action: "加入回归样本，后续验证高风险召回、等级一致和文案合规",
    status: "已进入回归",
    retest_result: "待下次 Eval 回归验证",
    severity: item.failure_type || "Eval 失败",
    createdAt: new Date().toLocaleString()
  };
  state.badCases.unshift(badCase);
  item.added_to_badcase = true;
  apiPost("/api/bad-cases", badCase);
  renderAll();
  persistState();
  showToast("Eval 样本已加入坏例池");
}

function download(filename, content, type = "application/json;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function sampleProductsJson() {
  return samples.map((sample) => {
    const rule = rules[sample.label];
    return {
      id: sample.id,
      fruit_type: "apple",
      image: sample.image,
      dataset_label: sample.label,
      business_defect: rule.businessDefect,
      expected_grade: rule.grade,
      review_required: rule.reviewRequired,
      safety_label: rule.safetyLabel
    };
  });
}

function opsReportMarkdown() {
  const listed = state.products.filter((item) => item.status === "listed");
  const pending = state.products.filter((item) => item.status === "pending_review");
  const resubmission = state.products.filter((item) => item.status === "needs_resubmission");
  const rejected = state.products.filter((item) => item.status === "rejected");
  const purchaseIntent = state.feedbacks.filter((item) => item.type === "purchase_intent" || item.type === "mock_purchase" || item.type === "willing_to_buy");
  const concerns = state.feedbacks.filter((item) => !["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type));
  const evalStats = state.evalRuns.length ? evalMetrics(state.evalRuns) : null;
  const productRows = state.products.map((item) => `| ${item.title} | ${item.grade} | ${statusLabel(item.status)} | ${item.channelLabel || channelForGrade(item.grade).label} | ${Math.round(item.confidence * 100)}% |`).join("\n") || "| 暂无 | - | - | - | - |";
  const reviewRows = state.reviews.map((item) => `| ${item.product?.title || item.productId} | ${item.status} | ${item.reason || "-"} | ${item.manualReason || "-"} |`).join("\n") || "| 暂无 | - | - | - |";
  const feedbackRows = state.feedbacks.map((item) => `| ${feedbackTypeLabel(item.type)} | ${state.products.find((product) => product.id === item.productId)?.title || item.productId} | ${item.content} | ${item.createdAt} |`).join("\n") || "| 暂无 | - | - | - |";
  const badCaseRows = state.badCases.map((item) => `| ${item.caseType} | ${item.severity || "-"} | ${item.status || "待复盘"} | ${item.rootCause} | ${item.fixAction} |`).join("\n") || "| 暂无 | - | - | - | - |";
  const logRows = state.actionLogs.slice(0, 20).map((item) => `| ${item.createdAt} | ${item.actor} | ${item.action} | ${item.detail} |`).join("\n") || "| 暂无 | - | - | - |";

  return `# 瑕果智选运营复盘报告

生成时间：${new Date().toLocaleString()}

## 1. 关键数据

| 指标 | 数量 |
| --- | ---: |
| 商品记录 | ${state.products.length} |
| 已上架商品 | ${listed.length} |
| 待复核商品 | ${pending.length} |
| 需补资料商品 | ${resubmission.length} |
| 已驳回商品 | ${rejected.length} |
| 购买意向 | ${purchaseIntent.length} |
| 消费者顾虑反馈 | ${concerns.length} |
| 坏例池 | ${state.badCases.length} |
| 操作日志 | ${state.actionLogs.length} |

## 2. 商品流转

| 商品 | 等级 | 状态 | 建议流向 | 置信度 |
| --- | --- | --- | --- | ---: |
${productRows}

## 3. 复核记录

| 商品 | 复核状态 | 触发原因 | 人工结论 |
| --- | --- | --- | --- |
${reviewRows}

## 4. 购买意向与反馈

| 类型 | 商品 | 内容 | 时间 |
| --- | --- | --- | --- |
${feedbackRows}

## 5. 坏例池

| 类型 | 严重程度 | 状态 | 原因 | 修复动作 |
| --- | --- | --- | --- | --- |
${badCaseRows}

## 6. Eval 概览

${evalStats ? `- 样本数：${evalStats.total}
- JSON 可解析率：${evalStats.jsonParseRate}%
- 高风险召回：${evalStats.highRiskRecall}%
- 腐烂漏放率：${evalStats.rotLeakRate}%
- 等级一致率：${evalStats.gradeMatchRate}%
- 文案合规率：${evalStats.copyComplianceRate}%` : "暂未运行 Eval。"}

## 7. 最近操作

| 时间 | 角色 | 动作 | 详情 |
| --- | --- | --- | --- |
${logRows}

## 8. 复盘结论

- 当前版本定位为苹果瑕疵果 AI 分级展示与购买意向收集体验版。
- AI 只做初判，高风险、低置信度、图片不清晰和信息不足样本需要人工复核。
- 购买意向不等于真实订单，当前版本不提供在线支付、真实物流和正式售后履约。
- 后续应优先补充真实图片标注集，并用 Eval 和坏例池持续校准规则。
`;
}

function projectBriefMarkdown() {
  const listed = state.products.filter((item) => item.status === "listed").length;
  const review = state.products.filter((item) => item.status === "pending_review" || item.status === "rejected").length;
  return `# 瑕果智选 AI Agent MVP 苹果版

## 一句话
面向苹果瑕疵果上架场景，让 AI Agent 辅助识别瑕疵、生成分级报告和可信商品说明，人负责复核食品安全风险和规则迭代。

## 当前闭环
农户选择/上传图片 -> 填写基础信息 -> Agent 输出结构化分级 JSON -> 低风险上架 -> 高风险进复核 -> 消费者查看说明并提交购买意向/反馈 -> 坏例回流。

## 当前数据
- 苹果样本：${samples.length} 张
- 已生成报告：${state.reportCount}
- 已上架商品：${listed}
- 复核/拦截商品：${review}
- 购买意向/反馈：${state.feedbacks.length}
- 坏例数量：${state.badCases.length}

## AI 边界
- 当前为 mock Agent，使用数据集标签或人工临时标签模拟视觉识别。
- 真实多模态模型接入后，仍必须遵守：疑似腐烂、霉变、破皮渗液、低置信度强制人工复核。
- 当前体验版只收集购买意向，不提供在线支付、真实物流和正式售后履约。

## 下一步
1. 接入真实视觉模型，输出同样 JSON schema。
2. 补充真实农户图片和人工标注。
3. 用坏例池做回归测试，重点看腐烂风险漏判率。
`;
}

function renderSamples() { farmerView.renderSamples(); }

function renderSelectedPreview() { farmerView.renderSelectedPreview(); }

function renderFarmerProducts() { farmerView.renderProducts(); }

function renderFarmerProductDetail(productId) { farmerView.renderProductDetail(productId); }

function renderAgentReport() {
  if (!state.currentReport) {
    $("#agentReport").innerHTML = `
      <div class="mini-empty-state ${state.isGrading ? "is-loading" : ""}">
        <strong>${state.isGrading ? "AI 正在分析苹果图片" : "等待 AI 分级结果"}</strong>
        <p>${state.isGrading ? "正在识别瑕疵位置、等级建议、风险护栏和商品说明。" : "请选择图片并点击“开始智能分级”。"}</p>
      </div>
    `;
    $("#farmerActions").innerHTML = `<div class="mini-empty-state"><strong>暂无可确认动作</strong><p>AI 分级完成后，这里会出现“提交复核”或“确认上架”。</p></div>`;
    return;
  }
  $("#agentReport").innerHTML = `
    <div class="report-card">
      <div class="inspection-result grade-${state.currentReport.grade}">
        <div class="grade-band grade-${state.currentReport.grade}">
          <span class="grade-code">${state.currentReport.grade === "blocked" ? "!" : state.currentReport.grade}</span>
          <span><strong>${state.currentReport.grade === "blocked" ? "禁止上架" : `${state.currentReport.grade} 级苹果`}</strong><small>${state.currentReport.defect_label}</small></span>
        </div>
        <div class="inspection-facts"><div><span>食用判断</span><strong>${state.currentReport.safety_label}</strong></div><div><span>置信度</span><strong>${Math.round(state.currentReport.confidence * 100)}%</strong></div><div><span>下一步</span><strong>${state.currentReport.review_required ? "提交人工复核" : "确认上架"}</strong></div></div>
        <p>${state.currentReport.farmer_explanation}</p>
      </div>
      <details class="technical-details"><summary>查看 AI 技术详情</summary><div class="contract-panel">
        <div>
          <span>运行状态</span>
          <strong>${state.currentReport.agent_status || "unknown"}</strong>
          <small>${state.currentReport.fallback_reason || state.currentReport.mock_source || "模型输出已进入契约校验"}</small>
        </div>
        <div>
          <span>契约校验</span>
          <strong>${state.currentReport.contract_violations?.length ? `${state.currentReport.contract_violations.length} 项需关注` : "通过"}</strong>
          <small>${state.currentReport.contract_violations?.length ? state.currentReport.contract_violations.join(" / ") : "输出字段可解析，前端可稳定渲染"}</small>
        </div>
        <div>
          <span>护栏动作</span>
          <strong>${state.currentReport.guardrail_actions?.length || 0}</strong>
          <small>${state.currentReport.guardrail_actions?.length ? state.currentReport.guardrail_actions.join(" / ") : "未触发强制改写"}</small>
        </div>
        <div>
          <span>JSON 修复</span>
          <strong>${state.currentReport.parse_repaired ? "已修复" : "无需修复"}</strong>
          <small>${state.currentReport.model_error || "模型输出可直接解析"}</small>
        </div>
      </div>
      <pre class="json-box">${JSON.stringify(state.currentReport, null, 2)}</pre></details>
    </div>
  `;
  $("#farmerActions").innerHTML = `
    <div class="action-card">
      <h4>${state.currentReport.next_action === "manual_review" ? "建议提交平台复核" : "可确认上架草稿"}</h4>
      <p>${state.currentReport.review_required ? "该样本存在风险或置信度不足，进入复核更符合食品安全优先原则。" : "该样本风险较低，可以生成消费者商品页。"}</p>
      <div class="action-buttons">
        <button class="btn primary" id="confirmListingBtn">${state.currentReport.review_required ? "确认提交复核" : "确认上架"}</button>
        <button class="btn ghost" data-view-jump="farmer">修改基础信息</button>
      </div>
    </div>
  `;
}

function renderProducts() { consumerView.renderProducts(); }

function renderFarmerResubmissions() { farmerView.renderResubmissions(); }

function renderProductDetail(productId) { consumerView.renderProductDetail(productId); }

function renderOpsTasks() { opsView.renderTasks(); }

function renderOps() { opsView.render(); }

function renderRulesAndBadCases() {
  const channelFlow = $("#channelFlow");
  if (channelFlow) {
    channelFlow.innerHTML = ["A", "B", "C", "blocked"].map((grade) => {
      const channel = channelForGrade(grade);
      return `
        <div class="channel-card">
          <span class="tag ${gradeClass(grade)}">${grade === "blocked" ? "禁售" : `${grade} 级`}</span>
          <strong>${channel.label}</strong>
          <p>${channel.detail}</p>
        </div>
      `;
    }).join("");
  }
  $("#ruleList").innerHTML = Object.entries(rules).map(([key, rule]) => `
    <div class="rule-card">
      <div class="tag-row">
        <span class="tag">${key}</span>
        <span class="tag ${gradeClass(rule.grade)}">${rule.grade === "blocked" ? "禁售" : `${rule.grade} 级`}</span>
        <span class="tag">${rule.priceSuggestion}</span>
      </div>
      <h4>${rule.defectLabel}</h4>
      <p>安全判断：${rule.safetyLabel}；${rule.reviewRequired ? "需要人工复核。" : "可进入上架确认。"}</p>
      <p>建议流向：${channelForGrade(rule.grade).label}。</p>
    </div>
  `).join("");
  renderBadCaseFilters();
  const visibleBadCases = filteredBadCases();
  $("#badCaseList").innerHTML = visibleBadCases.length ? visibleBadCases.map((item) => `
    <div class="badcase-card">
      <div class="tag-row">
        <span class="tag">${item.caseType}</span>
        <span class="tag">${item.productId}</span>
        <span class="tag">${badCaseStageLabel(badCaseValue(item, "failure_stage"))}</span>
        <span class="tag">${badCaseSourceLabel(badCaseValue(item, "run_source"))}</span>
        <span class="tag ${item.status === "已修复" || item.status === "已进入回归" ? "a" : "c"}">${item.status || "待复盘"}</span>
        <span class="tag">${item.severity || "未分级"}</span>
      </div>
      <h4>${item.humanCorrection}</h4>
      <p>AI 输出：${item.aiOutput}</p>
      <p>关联运行：${item.run_id || "暂无 run_id"}${item.run_source ? ` / ${item.run_source}` : ""}</p>
      <p>失败节点：${item.failure_stage || "历史坏例"}${item.failure_type ? ` / ${item.failure_type}` : ""}</p>
      <p>复盘原因：${item.root_cause_hypothesis || item.rootCause}</p>
      <p>修复动作：${item.fix_action || item.fixAction}</p>
      <p>回归结果：${item.retest_result || "待验证"}</p>
      <p>记录时间：${item.createdAt || "历史样本"}</p>
      <div class="action-buttons">
        <button class="btn ghost" data-badcase-status="${item.id}" data-next-status="已修复" ${item.status === "已修复" ? "disabled" : ""}>标记已修复</button>
        <button class="btn ghost" data-badcase-status="${item.id}" data-next-status="已进入回归" ${item.status === "已进入回归" ? "disabled" : ""}>加入回归</button>
      </div>
    </div>
  `).join("") : `<div class="empty">当前筛选条件下暂无坏例。可以放宽失败节点、来源或状态筛选。</div>`;
}

function renderAiPrompt() {
  const schema = state.agentConfig || {
    task: "识别苹果图片中的可见瑕疵，并按瑕果智选规则输出分级 JSON",
    output_fields: ["fruit_type", "defect_type", "grade", "confidence", "review_required", "risk_flags", "next_action"],
    inspection_fact_fields: ["image_quality", "visible_defect_types", "defect_area_level", "broken_skin", "softening", "suspected_mold", "inspection_confidence"],
    hard_rules: ["疑似腐烂、霉变、破皮渗液必须 review_required=true", "confidence < 0.7 必须人工复核", "不要承诺绝对安全，只能说明基于图片的初步判断"]
  };
  const summary = $("#agentConfigSummary");
  if (summary) {
    const diagnostics = state.agentConfig?.diagnostics;
    summary.innerHTML = `
      <h4>契约状态</h4>
      <p>${state.agentConfig ? `当前版本 ${state.agentConfig.contract_version}，${state.agentConfig.output_fields.length} 个输出字段，${state.agentConfig.guardrails.length} 条硬性护栏，API Key ${state.agentConfig.api_key_configured ? "已配置" : "未配置"}。` : "未读取到后端契约配置，前端使用本地兜底 schema。"}</p>
      ${diagnostics ? `<p>当前数据：商品 ${diagnostics.products}，复核 ${diagnostics.reviews}，坏例 ${diagnostics.bad_cases}，Eval ${diagnostics.eval_results}。</p>` : ""}
    `;
  }
  $("#aiPromptBox").textContent = JSON.stringify(schema, null, 2);
  renderRunTraces();
}

function traceTimeLabel(value) {
  if (!value) return "未知时间";
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? value : time.toLocaleString();
}

function renderRunTraces() {
  const target = $("#runTraceList");
  if (!target) return;
  if (!state.runTraces.length) {
    target.innerHTML = `<div class="empty">暂无运行追踪。请先在农户端运行一次智能分级。</div>`;
    return;
  }
  target.innerHTML = state.runTraces.map((trace) => {
    const output = trace.final_output || {};
    const facts = trace.inspection_facts || output.inspection_facts || {};
    const decision = trace.business_decision || output.business_decision || {};
    const defects = Array.isArray(facts.visible_defect_types) && facts.visible_defect_types.length ? facts.visible_defect_types.join(" / ") : "none";
    const guardrails = Array.isArray(trace.guardrail_actions) && trace.guardrail_actions.length ? trace.guardrail_actions.join(" / ") : "未触发";
    const reviewRequired = decision.review_required ?? output.review_required;
    return `
      <article class="trace-run-card">
        <div class="trace-run-head">
          <div>
            <span class="label">${trace.run_source || output.run_source || "unknown"}</span>
            <h4>${trace.run_id || output.run_id || "unknown run"}</h4>
          </div>
          <span class="tag ${output.grade === "blocked" ? "risk" : gradeClass(output.grade)}">${output.grade || "-"}</span>
        </div>
        <div class="trace-node-grid">
          <div>
            <span>输入</span>
            <strong>${trace.input_meta?.mock_label || output.defect_type || "-"}</strong>
            <p>${trace.input_meta?.image_source || "未记录图片来源"}</p>
          </div>
          <div>
            <span>事实层</span>
            <strong>${defects}</strong>
            <p>质量 ${facts.image_quality || "unknown"} · 置信 ${Math.round((facts.inspection_confidence || output.confidence || 0) * 100)}%</p>
          </div>
          <div>
            <span>业务层</span>
            <strong>${decision.next_action || output.next_action || "-"}</strong>
            <p>${decision.edible_safety || output.edible_safety || "-"} · ${reviewRequired ? "需复核" : "可上架"}</p>
          </div>
          <div>
            <span>护栏</span>
            <strong>${Array.isArray(trace.guardrail_actions) ? trace.guardrail_actions.length : 0}</strong>
            <p>${guardrails}</p>
          </div>
        </div>
        <div class="trace-run-foot">
          <span>${traceTimeLabel(trace.created_at)}</span>
          <span>${trace.prompt_version || "-"} / ${trace.rule_version || "-"}</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderEval() {
  if (!state.evalRuns.length) {
    $("#evalSummary").innerHTML = `<div class="empty">还没有评测结果。点击“运行 12 张样本评测”即可生成。</div>`;
    const failureSummary = $("#evalFailureSummary");
    if (failureSummary) failureSummary.innerHTML = "";
    $("#evalTable").innerHTML = `<tr><td class="empty" colspan="6">暂无评测记录。</td></tr>`;
    renderEvalDataset();
    return;
  }
  const metrics = evalMetrics(state.evalRuns);
  const failureNodes = evalFailureNodes(state.evalRuns);
  const sourceSummary = Object.entries(state.evalRuns.reduce((acc, item) => {
    const source = item.run_source || "unknown";
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {})).map(([source, count]) => `${source}: ${count}`).join(" / ");
  $("#evalSummary").innerHTML = `
    <div class="eval-artifact-row">
      <span>Run source</span>
      <strong>${sourceSummary || "unknown"}</strong>
      <small>mock_eval is for rule regression; api_live_eval is for model regression.</small>
    </div>
    <div class="metrics eval-metrics">
      <div class="metric"><span>评测样本</span><strong>${metrics.total}</strong></div>
      <div class="metric"><span>JSON 可解析率</span><strong>${metrics.jsonParseRate}%</strong></div>
      <div class="metric"><span>高风险召回</span><strong>${metrics.highRiskRecall}%</strong></div>
      <div class="metric"><span>腐烂漏放率</span><strong>${metrics.rotLeakRate}%</strong></div>
      <div class="metric"><span>等级一致率</span><strong>${metrics.gradeMatchRate}%</strong></div>
      <div class="metric"><span>文案合规率</span><strong>${metrics.copyComplianceRate}%</strong></div>
      <div class="metric"><span>事实抽取率</span><strong>${metrics.factExtractionRate}%</strong></div>
      <div class="metric"><span>业务映射率</span><strong>${metrics.businessMappingRate}%</strong></div>
    </div>
    <div class="eval-guardrail">
      <div><span>需人工修正</span><strong>${metrics.fixNeeded}</strong></div>
      <div><span>已回流坏例</span><strong>${metrics.badcaseLinked}</strong></div>
      <div><span>复核路由</span><strong>${metrics.reviewRoutingRate}%</strong></div>
      <div><span>风险特征</span><strong>${metrics.riskFeatureRate}%</strong></div>
      <div><span>护栏通过</span><strong>${metrics.guardrailRate}%</strong></div>
      <div><span>验收判断</span><strong>${metrics.rotLeakRate === 0 && metrics.highRiskRecall === 100 ? "通过" : "需修正"}</strong></div>
    </div>
  `;
  const failureSummary = $("#evalFailureSummary");
  if (failureSummary) {
    failureSummary.innerHTML = failureNodes.length
      ? `
        <div class="eval-failure-head">
          <div>
            <span class="label">Failure Attribution</span>
            <h4>失败节点 TopN</h4>
          </div>
          <span class="tag c">${failureNodes.reduce((sum, item) => sum + item.count, 0)} 个节点问题</span>
        </div>
        <div class="eval-failure-grid">
          ${failureNodes.slice(0, 6).map((item) => `
            <div>
              <span>${evalNodeLabel(item.node)}</span>
              <strong>${item.count}</strong>
              <small>${item.samples.slice(0, 4).join(" / ")}${item.samples.length > 4 ? " ..." : ""}</small>
            </div>
          `).join("")}
        </div>
      `
      : `
        <div class="eval-failure-head">
          <div>
            <span class="label">Failure Attribution</span>
            <h4>失败节点 TopN</h4>
          </div>
          <span class="tag a">当前 smoke 集无失败节点</span>
        </div>
      `;
  }
  if (state.latestEvalArtifacts?.report_path && failureSummary) {
    failureSummary.insertAdjacentHTML("beforeend", `
      <div class="eval-artifact-row">
        <span>报告已生成</span>
        <strong>${state.latestEvalArtifacts.report_path}</strong>
        <small>${state.latestEvalArtifacts.csv_path || ""}</small>
      </div>
    `);
  }
  $("#evalTable").innerHTML = state.evalRuns.map((item) => `
    <tr class="${item.needs_human_fix ? "eval-failed" : ""}">
      <td>${item.sample_id}</td>
      <td>${item.defect_label}</td>
      <td><span class="tag ${gradeClass(item.actual_grade)}">${item.actual_grade === "blocked" ? "禁售" : `${item.actual_grade} 级`}</span></td>
      <td>${item.next_action}</td>
      <td>
        <div class="tag-row">
          <span class="tag ${item.json_parseable ? "a" : "risk"}">JSON ${item.json_parseable ? "通过" : "失败"}</span>
          <span class="tag ${item.high_risk_recalled ? "a" : "risk"}">高风险${item.high_risk_recalled ? "召回" : "漏放"}</span>
          <span class="tag ${item.copy_compliant ? "a" : "risk"}">文案${item.copy_compliant ? "合规" : "需改"}</span>
        </div>
        <div class="eval-node-grid">
          <span class="${item.node_scores?.inspection_fact_extraction ? "pass" : "fail"}">事实层</span>
          <span class="${item.node_scores?.business_mapping ? "pass" : "fail"}">业务层</span>
          <span class="${item.node_scores?.risk_guardrail ? "pass" : "fail"}">护栏</span>
          <span class="${item.node_scores?.review_routing ? "pass" : "fail"}">复核路由</span>
        </div>
        <p>事实：${(item.actual_facts?.visible_defect_types || []).join(" / ") || "fresh"}；风险：${item.actual_facts?.suspected_mold ? "疑似霉变" : "未触发霉变"}</p>
        <p>失败节点：${item.failed_node || "无"}</p>
        <p>${item.note}</p>
      </td>
      <td>${item.needs_human_fix ? `<button class="btn ghost" data-eval-badcase="${item.sample_id}" ${item.added_to_badcase ? "disabled" : ""}>${item.added_to_badcase ? "已回流" : "加入坏例"}</button>` : `<span class="tag a">无需处理</span>`}</td>
    </tr>
  `).join("");
  renderEvalDataset();
}

function renderEvalDataset() {
  const target = $("#evalDatasetSummary");
  if (!target) return;
  if (!state.evalSetItems.length) {
    target.innerHTML = `<div class="empty">40 张 Eval 标注模板尚未载入。请确认 <code>eval/apple_eval_set.json</code> 存在。</div>`;
    const table = $("#evalReadinessTable");
    if (table) table.innerHTML = `<tr><td class="empty" colspan="5">暂无标注准备数据。</td></tr>`;
    return;
  }
  const metrics = evalSetMetrics();
  const typeLabel = {
    fresh: "无明显瑕疵",
    scab_defect: "果锈/疮痂斑",
    bruise_defect: "轻微碰伤",
    rot_defect: "疑似腐烂"
  };
  const typeCards = Object.entries(metrics.byType).map(([type, count]) => `
    <div>
      <span>${typeLabel[type] || type}</span>
      <strong>${count}</strong>
      <small>${type}</small>
    </div>
  `).join("");
  target.innerHTML = `
    <div class="eval-template-head">
      <div>
        <span class="label">Label Set</span>
        <h4>40 张苹果人工标注模板</h4>
      </div>
      <a class="btn ghost" href="./eval/apple_eval_set.json" download>下载标注模板</a>
    </div>
    <div class="eval-template-grid">
      <div><span>模板总数</span><strong>${metrics.total}</strong><small>目标每类 10 张</small></div>
      <div><span>已接入样本</span><strong>${metrics.seeded}</strong><small>当前 Demo 可直接评测</small></div>
      <div><span>待人工补标</span><strong>${metrics.toLabel}</strong><small>后续替换真实图片路径</small></div>
      <div><span>节点标注</span><strong>${metrics.withExpectedFacts}</strong><small>含 expected_facts / decision</small></div>
      <div><span>Smoke 集</span><strong>${metrics.smokeCount}</strong><small>快速回归入口</small></div>
      <div><span>Full 集</span><strong>${metrics.fullCount}</strong><small>正式评估候选</small></div>
      <div><span>已有 AI 输出</span><strong>${metrics.withAiOutput}</strong><small>来自当前 Eval 运行</small></div>
      <div><span>回归关联</span><strong>${metrics.regressionLinked}</strong><small>坏例已进入回归</small></div>
      ${typeCards}
    </div>
  `;
  const readinessTable = $("#evalReadinessTable");
  if (readinessTable) {
    readinessTable.innerHTML = evalReadinessRows().map((item) => `
      <tr>
        <td>${item.id}<br><small>${item.human_label_status === "seeded" ? "已接入" : "待补标"} · ${item.eval_split || "legacy"} · ${item.eval_case_version || "-"}</small><br><small>${item.image || "待补图片"}</small></td>
        <td>${item.expected_defect_type}<br><span class="tag ${gradeClass(item.expected_grade)}">${item.expected_grade}</span> <span class="tag">${item.expectedReview}</span></td>
        <td>${item.aiOutput}</td>
        <td><span class="tag ${item.issue === "通过" ? "a" : item.issue === "待 AI 输出" ? "neutral" : "risk"}">${item.issue}</span></td>
        <td><span class="tag ${item.status === "已进入回归" || item.status === "已接入" ? "a" : item.status === "待补标" ? "neutral" : "c"}">${item.status}</span></td>
      </tr>
    `).join("");
  }
}

function renderMetrics() {
  $("#metricSamples").textContent = samples.length;
  $("#metricReports").textContent = state.reportCount;
  $("#metricListed").textContent = state.products.filter((item) => item.status === "listed").length;
  $("#metricReview").textContent = state.products.filter((item) => item.status === "pending_review" || item.status === "rejected").length;
}

function renderRoleStatus() {
  const currentStatus = state.currentReport ? productStatus(state.currentReport.product_id) : null;
  const aiDone = Boolean(state.currentReport);
  const reviewed = currentStatus === "pending_review" || currentStatus === "listed" || currentStatus === "rejected";
  const listed = currentStatus === "listed";
  const flowHtml = `
    <div class="step ${state.selectedSample ? "done" : "active"}"><span>1</span><strong>选择图片</strong><small>${state.selectedSample ? state.selectedSample.id : "未选择"}</small></div>
    <div class="step ${aiDone ? "done" : state.isGrading ? "active" : ""}"><span>2</span><strong>AI 分级</strong><small>${state.isGrading ? "识别中" : aiDone ? `${state.currentReport.grade} 级 · ${Math.round(state.currentReport.confidence * 100)}%` : "待开始"}</small></div>
    <div class="step ${reviewed ? "done" : aiDone ? "active" : ""}"><span>3</span><strong>确认处理</strong><small>${aiDone ? statusLabel(currentStatus || "ai_checked") : "等待报告"}</small></div>
    <div class="step ${listed ? "done" : ""}"><span>4</span><strong>消费者可见</strong><small>${listed ? "已展示" : "未展示"}</small></div>
  `;
  const farmerFlow = $("#farmerFlow");
  const farmerFormFlow = $("#farmerFormFlow");
  const agentFlow = $("#agentFlow");
  if (farmerFlow) farmerFlow.innerHTML = flowHtml;
  if (farmerFormFlow) farmerFormFlow.innerHTML = flowHtml;
  if (agentFlow) agentFlow.innerHTML = flowHtml;

  const opsOverview = $("#opsOverview");
  if (opsOverview) {
    const pending = state.reviews.filter((item) => item.status === "pending").length;
    const rejected = state.products.filter((item) => item.status === "rejected").length;
    const resubmission = state.products.filter((item) => item.status === "needs_resubmission").length;
    const listedCount = state.products.filter((item) => item.status === "listed").length;
    opsOverview.innerHTML = `
      <div><span>待处理复核</span><strong>${pending}</strong></div>
      <div><span>已上架商品</span><strong>${listedCount}</strong></div>
      <div><span>已驳回商品</span><strong>${rejected}</strong></div>
      <div><span>需补资料</span><strong>${resubmission}</strong></div>
      <div><span>购买/反馈</span><strong>${state.feedbacks.length}</strong></div>
      <div><span>坏例池</span><strong>${state.badCases.length}</strong></div>
      <div><span>Eval 运行</span><strong>${state.evalRuns.length}</strong></div>
    `;
  }
  const opsKpiGrid = $("#opsKpiGrid");
  if (opsKpiGrid) {
    const listedCount = state.products.filter((item) => item.status === "listed").length;
    const purchaseIntent = state.feedbacks.filter((item) => item.type === "purchase_intent" || item.type === "mock_purchase" || item.type === "willing_to_buy").length;
    const concerns = state.feedbacks.filter((item) => !["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type)).length;
    const reviewed = state.reviews.filter((item) => item.status !== "pending").length;
    const reviewCloseRate = state.reviews.length ? Math.round(reviewed / state.reviews.length * 100) : 0;
    const intentRate = listedCount ? Math.round(purchaseIntent / listedCount * 100) : 0;
    opsKpiGrid.innerHTML = `
      <div>
        <span>意向/上架比</span>
        <strong>${intentRate}%</strong>
        <small>${purchaseIntent} 条意向 / ${listedCount} 个上架商品</small>
      </div>
      <div>
        <span>顾虑反馈</span>
        <strong>${concerns}</strong>
        <small>用于判断安全、价格、描述问题</small>
      </div>
      <div>
        <span>复核闭环率</span>
        <strong>${reviewCloseRate}%</strong>
        <small>${reviewed} 条已处理 / ${state.reviews.length} 条复核</small>
      </div>
      <div>
        <span>坏例沉淀率</span>
        <strong>${state.products.length ? Math.round(state.badCases.length / state.products.length * 100) : 0}%</strong>
        <small>${state.badCases.length} 条坏例 / ${state.products.length} 条商品记录</small>
      </div>
    `;
  }
}

function renderWorkbench() {
  const status = $("#apiStatus");
  if (status) {
    status.textContent = state.apiHealth.ok
      ? `${state.apiHealth.provider || "api"} / ${state.apiHealth.mode}`
      : "静态或离线模式";
    status.className = `status-pill ${state.apiHealth.ok && state.apiHealth.api_key_configured ? "ok" : "warn"}`;
  }
  const traceGrid = $("#traceGrid");
  if (traceGrid) {
    const listed = state.products.filter((item) => item.status === "listed").length;
    const review = state.products.filter((item) => item.status === "pending_review").length;
    const resubmission = state.products.filter((item) => item.status === "needs_resubmission").length;
    const rejected = state.products.filter((item) => item.status === "rejected").length;
    traceGrid.innerHTML = `
      <div><span>商品记录</span><strong>${state.products.length}</strong></div>
      <div><span>已上架</span><strong>${listed}</strong></div>
      <div><span>待复核</span><strong>${review}</strong></div>
      <div><span>需补资料</span><strong>${resubmission}</strong></div>
      <div><span>已驳回</span><strong>${rejected}</strong></div>
      <div><span>坏例</span><strong>${state.badCases.length}</strong></div>
      <div><span>Eval 结果</span><strong>${state.evalRuns.length}</strong></div>
      <div><span>当前任务</span><strong>${state.isGrading ? "AI 分级中" : "待操作"}</strong></div>
    `;
  }
}

const uiStateScreens = [
  {
    group: "农户端",
    screens: [
      { title: "上传页", state: "空状态", kind: "green", image: null, metrics: [["品类", "苹果"], ["产地", "待填写"], ["重量", "待填写"]], blocks: [
        ["上传苹果照片", "请拍完整果体，并补拍瑕疵近景。"],
        ["基础信息", "水果品类、产地、重量、采摘时间、期望售价"],
        ["主操作", "选择图片 / 开始 AI 分级"]
      ] },
      { title: "上传页", state: "已选择图片", kind: "green", image: samples[3]?.image, metrics: [["品类", "苹果"], ["产地", "山东烟台"], ["重量", "5kg"]], blocks: [
        ["图片要求", "拍完整果体，瑕疵部位尽量清晰。"],
        ["农户备注", "轻微表皮斑点，整体新鲜。"],
        ["主操作", "开始 AI 分级"]
      ] },
      { title: "上传页", state: "AI 分析中", kind: "blue", image: samples[6]?.image, metrics: [["图片质量", "检测中"], ["品类", "苹果"], ["风险规则", "匹配中"]], blocks: [
        ["识别进度", "正在识别瑕疵位置、瑕疵类型和等级建议。"],
        ["等待说明", "结果会先进入人工复核规则判断。"],
        ["可选操作", "取消分析"]
      ] },
      { title: "AI 分级结果", state: "可提交复核", kind: "green", image: samples[4]?.image, metrics: [["等级", "B 级"], ["瑕疵", "表皮果锈"], ["置信度", "86%"]], blocks: [
        ["食用边界", "基于图片初判，通常不影响果肉。"],
        ["价格建议", "市场价 65%-75%。"],
        ["下一步", "提交运营复核，通过后展示给消费者。"]
      ] },
      { title: "AI 分级结果", state: "需人工复核", kind: "orange", image: samples[6]?.image, metrics: [["等级", "C 级"], ["瑕疵", "轻微碰伤"], ["置信度", "76%"]], blocks: [
        ["触发原因", "碰伤面积、软烂风险、瑕疵边界需要确认。"],
        ["建议流向", "复核后进入果切 / 榨汁意向。"],
        ["护栏", "AI 仅作初判，不能直接决定上架。"]
      ] },
      { title: "补充资料", state: "需补图", kind: "orange", image: samples[6]?.image, metrics: [["原因", "图片不清晰"], ["边界", "不明确"], ["动作", "补资料"]], blocks: [
        ["运营要求", "请补充完整果体、瑕疵近景，并确认采摘时间和重量。"],
        ["补充说明", "填写复核判断依据，便于后续复盘。"],
        ["主操作", "重新提交复核"]
      ] },
      { title: "提交成功", state: "重新提交", kind: "green", image: samples[6]?.image, metrics: [["状态", "待复核"], ["资料", "已补充"], ["流转", "运营端"]], blocks: [
        ["提交结果", "已重新提交复核。"],
        ["后续动作", "等待运营基于补充图片和说明重新判断。"],
        ["可选操作", "查看我的商品 / 继续上传"]
      ] },
      { title: "我的商品", state: "列表", kind: "green", image: samples[4]?.image, metrics: [["待复核", "2"], ["需补资料", "1"], ["已上架", "5"]], blocks: [
        ["商品状态", "待复核、需补资料、已上架、已驳回。"],
        ["筛选重点", "农户只看自己需要处理的商品。"],
        ["主操作", "上传新苹果"]
      ] },
      { title: "商品状态", state: "已上架", kind: "green", image: samples[4]?.image, metrics: [["等级", "B 级"], ["价格", "¥24.9"], ["意向", "3 条"]], blocks: [
        ["展示状态", "已通过运营复核，消费者端可见。"],
        ["商品说明", "展示瑕疵原因、食用边界和平台兜底。"],
        ["反馈", "可查看消费者顾虑反馈。"]
      ] },
      { title: "商品状态", state: "已驳回", kind: "red", image: samples[8]?.image, metrics: [["结果", "驳回"], ["风险", "软烂"], ["展示", "禁止"]], blocks: [
        ["驳回原因", "疑似软烂或食品安全风险。"],
        ["平台动作", "不进入消费者展示，样本进入坏例沉淀。"],
        ["农户动作", "上传其他批次。"]
      ] }
    ]
  },
  {
    group: "消费者端",
    screens: [
      { title: "商品列表", state: "可浏览", kind: "blue", image: samples[4]?.image, metrics: [["可选", "8"], ["已复核", "8"], ["均价", "6.2 折"]], blocks: [
        ["商品卡片", "展示等级、产地、重量、价格和瑕疵标签。"],
        ["边界", "只展示运营复核通过商品。"],
        ["入口", "点击查看商品详情。"]
      ] },
      { title: "商品详情", state: "未提交意向", kind: "green", image: samples[4]?.image, metrics: [["等级", "B 级"], ["规格", "5kg"], ["价格", "¥24.9"]], blocks: [
        ["为什么便宜", "表皮果锈 / 轻微瑕疵。"],
        ["是否影响食用", "基于图片初判，通常不影响果肉。"],
        ["主操作", "提交购买意向。"]
      ] },
      { title: "商品详情", state: "已提交意向", kind: "green", image: samples[4]?.image, metrics: [["数量", "3-5 箱"], ["联系", "已填写"], ["时间", "14:30"]], blocks: [
        ["记录状态", "购买意向已记录。"],
        ["后续动作", "运营人员会根据库存和复核情况联系确认。"],
        ["可选操作", "修改意向 / 提交顾虑反馈。"]
      ] },
      { title: "顾虑反馈", state: "填写中", kind: "orange", image: samples[4]?.image, metrics: [["类型", "食安顾虑"], ["商品", "B级苹果"], ["流转", "复盘"]], blocks: [
        ["反馈类型", "我担心食用安全 / 说明不够清楚 / 价格不够有吸引力。"],
        ["补充说明", "用户可描述具体顾虑。"],
        ["平台动作", "反馈进入运营复盘。"]
      ] },
      { title: "反馈成功", state: "已提交", kind: "green", image: samples[4]?.image, metrics: [["状态", "已提交"], ["复盘", "运营端"], ["关联", "商品说明"]], blocks: [
        ["反馈结果", "顾虑反馈已提交。"],
        ["处理边界", "当前版本不提供正式售后履约。"],
        ["可选操作", "返回商品详情 / 查看其他商品。"]
      ] },
      { title: "我的意向", state: "记录", kind: "blue", image: samples[4]?.image, metrics: [["已提交", "2"], ["已联系", "1"], ["已反馈", "1"]], blocks: [
        ["意向记录", "查看已提交购买意向。"],
        ["联系状态", "运营是否已联系确认。"],
        ["产品边界", "只记录意向，不做在线交易。"]
      ] }
    ]
  },
  {
    group: "运营端",
    screens: [
      { title: "复核列表", state: "队列", kind: "orange", image: samples[6]?.image, metrics: [["待处理", "3"], ["需补资料", "1"], ["坏例", "5"]], blocks: [
        ["队列分类", "待处理、需补资料、已驳回、坏例池。"],
        ["运营指标", "意向/上架比、顾虑反馈、复核闭环率。"],
        ["主操作", "进入复核详情。"]
      ] },
      { title: "复核详情", state: "待处理", kind: "orange", image: samples[6]?.image, metrics: [["等级", "C级"], ["瑕疵", "轻微碰伤"], ["置信度", "76%"]], blocks: [
        ["AI 说明", "识别到局部轻微碰伤，需要确认软烂或破皮风险。"],
        ["通过原因", "轻微外观瑕疵 / 不影响说明展示 / 可低等级上架。"],
        ["复核决策", "通过上架 / 要求补图 / 驳回。"]
      ] },
      { title: "复核详情", state: "通过上架", kind: "green", image: samples[4]?.image, metrics: [["结果", "已通过"], ["展示", "可见"], ["意向", "开启"]], blocks: [
        ["上架结果", "商品进入消费者端展示。"],
        ["展示配置", "展示等级、价格、透明说明。"],
        ["后续", "收集购买意向和顾虑反馈。"]
      ] },
      { title: "复核详情", state: "要求补资料", kind: "orange", image: samples[6]?.image, metrics: [["结果", "需补资料"], ["原因", "边界不清"], ["流转", "农户端"]], blocks: [
        ["补资料要求", "图片不清晰、瑕疵边界不明确、重量/时间待确认。"],
        ["运营说明", "请补充完整果体和瑕疵近景。"],
        ["状态变化", "等待农户重新提交。"]
      ] },
      { title: "复核详情", state: "驳回坏例", kind: "red", image: samples[8]?.image, metrics: [["结果", "驳回"], ["原因", "软烂"], ["沉淀", "坏例池"]], blocks: [
        ["驳回判断", "疑似软烂或破皮渗液。"],
        ["坏例标签", "安全风险、AI 置信不足、边界误判。"],
        ["用途", "用于后续规则优化和模型评估。"]
      ] },
      { title: "坏例池", state: "样本库", kind: "red", image: samples[8]?.image, metrics: [["总坏例", "5"], ["本周新增", "2"], ["待调规则", "3"]], blocks: [
        ["样本沉淀", "保存 AI 误判、高风险拦截和人工修正样本。"],
        ["规则用途", "优化护栏、复核规则和 Eval 集。"],
        ["后续", "形成模型评估闭环。"]
      ] },
      { title: "消费者反馈", state: "列表", kind: "blue", image: samples[4]?.image, metrics: [["待处理", "3"], ["食安顾虑", "1"], ["说明不清", "2"]], blocks: [
        ["反馈来源", "消费者商品详情页。"],
        ["复盘动作", "检查商品说明、AI 分级边界和复核结论。"],
        ["处理结果", "必要时调整说明或下架处理。"]
      ] },
      { title: "操作日志", state: "时间线", kind: "green", image: null, metrics: [["14:32", "要求补图"], ["14:18", "AI初判"], ["14:10", "农户提交"]], blocks: [
        ["日志内容", "记录 AI 初判、运营复核、农户补充、消费者反馈。"],
        ["价值", "让每个决策可追踪、可复盘。"],
        ["导出", "可生成运营复核摘要。"]
      ] }
    ]
  }
];

function renderUiStates() {
  const map = $("#uiStateMap");
  if (!map) return;
  const total = uiStateScreens.reduce((sum, group) => sum + group.screens.length, 0);
  map.innerHTML = `
    <div class="ui-state-overview">
      <div>
        <span class="label">Page State Matrix</span>
        <h4>当前已转为网页的状态：${total} 个</h4>
      </div>
      <div class="ui-overview-tags">
        ${uiStateScreens.map((group) => `<span>${group.group} ${group.screens.length}</span>`).join("")}
      </div>
    </div>
    <div class="ui-state-bridge">
      <div>
        <strong>状态稿已经和真实操作流对齐</strong>
        <p>每张小程序状态卡底部都提供“进入真实功能”按钮，可直接跳到当前 Web Demo 的农户、消费者、运营、Eval 或 AI 设置页面。</p>
      </div>
      <button class="btn primary" data-view-jump="roadmap">查看路线图进度</button>
    </div>
    ${uiStateScreens.map((group) => `
      <section class="ui-state-group">
        <div class="ui-group-head">
          <h4>${group.group}</h4>
          <span>${group.screens.length} 个状态</span>
        </div>
        <div class="ui-phone-grid">
          ${group.screens.map((screen) => renderUiPhone(screen, group.group)).join("")}
        </div>
      </section>
    `).join("")}
  `;
}

function uiScreenTarget(groupName, screen) {
  if (groupName === "农户端") {
    if (screen.title.includes("AI")) return "agent";
    return "farmer";
  }
  if (groupName === "消费者端") return "consumer";
  if (groupName === "运营端") {
    if (screen.title.includes("坏例")) return "rules";
    if (screen.title.includes("反馈") || screen.title.includes("日志")) return "ops";
    return "ops";
  }
  return "workbench";
}

function renderUiPhone(screen, groupName) {
  const image = screen.image || samples[4]?.image;
  const target = uiScreenTarget(groupName, screen);
  return `
    <article class="ui-phone ${screen.kind}">
      <div class="ui-phone-status"><span>9:41</span><span>●●●</span></div>
      <div class="ui-phone-title">
        <button type="button" aria-label="返回">‹</button>
        <strong>${screen.title}</strong>
        <span>${groupName}</span>
      </div>
      <div class="ui-hero-card">
        ${image ? `<img src="${image}" alt="${screen.title}" />` : `<div class="ui-empty-image">AI</div>`}
        <div>
          <span class="ui-badge">${screen.state}</span>
          <h4>${screen.title}</h4>
          <p>${screen.blocks[0]?.[1] || ""}</p>
        </div>
      </div>
      <div class="ui-metrics-row">
        ${screen.metrics.map((item) => `<div><span>${item[0]}</span><strong>${item[1]}</strong></div>`).join("")}
      </div>
      <div class="ui-content-stack">
        ${screen.blocks.map((block) => `
          <div class="ui-info-card">
            <strong>${block[0]}</strong>
            <p>${block[1]}</p>
          </div>
        `).join("")}
      </div>
      <button class="ui-primary-action" type="button">${screen.kind === "red" ? "查看处理结果" : screen.kind === "orange" ? "继续处理" : "确认下一步"}</button>
      <div class="ui-phone-actions">
        <button class="btn ghost" data-view-jump="${target}">进入真实功能</button>
        <button class="btn ghost" data-view-jump="roadmap">查看验收项</button>
      </div>
      <div class="ui-tabbar">
        <span class="active">首页</span>
        <span>商品</span>
        <span>复核</span>
        <span>我的</span>
      </div>
    </article>
  `;
}

const roadmapStages = [
  {
    stage: "P0 应用基本形态",
    status: "基本完成",
    items: [
      ["统一商品状态流", "已接入 draft / ai_checked / pending_review / needs_resubmission / listed / rejected / bad_case。", "workbench"],
      ["补齐页面状态", "已建立全状态 UI 库，并覆盖农户、消费者、运营 24 个关键状态。", "uiStates"],
      ["复核原因必填", "运营通过、补资料、驳回均必须选择或填写原因。", "ops"],
      ["AI 输出 Schema", "已固定前后端输出契约、护栏、API 健康检查和降级策略。", "ai"],
      ["苹果分级规则", "规则页展示 A/B/C/禁售、流向和人工复核条件。", "rules"],
      ["40 张 Eval 标注模板", "已接入 eval/apple_eval_set.json，可下载和查看统计。", "eval"],
      ["商品详情信任模块", "消费者详情页包含为什么便宜、是否影响食用、建议流向、平台兜底。", "consumer"]
    ]
  },
  {
    stage: "P1 小程序化前结构整理",
    status: "本轮推进中",
    items: [
      ["本地数据文件", "data/app_state.json 已保存商品、复核、反馈、坏例、Eval 和操作日志。", "workbench"],
      ["最小接口化", "server.js 已提供 state/state.products/state.reviews/feedback/bad-cases/evals/grade API。", "ai"],
      ["运营指标卡", "运营首页展示复核、上架、补资料、坏例和反馈指标。", "ops"],
      ["B/C 端分流展示", "规则与详情页展示 C 级复核后果切/榨汁、B 级性价比流向。", "rules"],
      ["售后边界说明", "商品详情明确当前仅收集购买意向，不提供真实支付和履约。", "consumer"],
      ["分享素材页", "已新增项目说明、助农减损表达、审核边界和演示路径。", "share"]
    ]
  },
  {
    stage: "P2 小程序迁移准备",
    status: "已建骨架",
    items: [
      ["技术路线", "已按原生微信小程序建立 miniprogram 骨架；后续替换真实 AppID。", "roadmap"],
      ["核心页面迁移", "已创建首页、上传、结果、列表、详情、反馈、运营复核、坏例 Eval 8 个页面骨架。", "uiStates"],
      ["API 对接", "已有本地 API，可后续替换为 HTTPS 云端域名。", "ai"],
      ["审核材料", "还需补截图、测试路径、隐私协议和非交易服务说明。", "roadmap"]
    ]
  }
];

function renderRoadmapDashboard() {
  const target = $("#roadmapDashboard");
  if (!target) return;
  const total = roadmapStages.reduce((sum, stage) => sum + stage.items.length, 0);
  const done = roadmapStages[0].items.length + roadmapStages[1].items.length + 2;
  target.innerHTML = `
    <div class="roadmap-summary">
      <div>
        <span class="label">Acceptance</span>
        <h4>路线图推进度：${done}/${total}</h4>
        <p>当前重点已经从“静态 UI”推进到“真实功能入口 + 状态验收 + 小程序颗粒度”。</p>
      </div>
      <div class="roadmap-score">${Math.round(done / total * 100)}%</div>
    </div>
    <div class="roadmap-stage-grid">
      ${roadmapStages.map((stage) => `
        <section class="roadmap-stage-card">
          <div class="roadmap-stage-head">
            <h4>${stage.stage}</h4>
            <span>${stage.status}</span>
          </div>
          <div class="roadmap-task-list">
            ${stage.items.map((item) => `
              <div class="roadmap-task">
                <div>
                  <strong>${item[0]}</strong>
                  <p>${item[1]}</p>
                </div>
                <button class="btn ghost" data-view-jump="${item[2]}">查看</button>
              </div>
            `).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function renderShareKit() {
  const target = $("#shareKit");
  if (!target) return;
  const listedCount = state.products.filter((item) => item.status === "listed").length;
  const reviewCount = state.products.filter((item) => item.status === "pending_review" || item.status === "needs_resubmission").length;
  const intentCount = state.feedbacks.filter((item) => ["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type)).length;
  target.innerHTML = `
    <div class="share-card hero-share">
      <span class="label">一句话定位</span>
      <h4>瑕果智选：苹果瑕疵果 AI 分级与可信展示助手</h4>
      <p>面向农户、消费者和运营人员，用 AI 初判 + 人工复核把苹果瑕疵果从图片样本整理成可解释、可复核、可收集购买意向的商品页。</p>
    </div>
    <div class="share-card">
      <h4>助农减损表达</h4>
      <p>把外观不完美但仍有利用价值的苹果做分级说明，减少“一刀切丢弃”，让消费者知道为什么便宜、适合什么用途、平台如何复核。</p>
    </div>
    <div class="share-card">
      <h4>体验版边界</h4>
      <p>当前版本只做 AI 辅助分级、人工复核、商品说明、购买意向和顾虑反馈，不提供在线支付、真实发货和正式售后履约。</p>
    </div>
    <div class="share-card">
      <h4>演示路径</h4>
      <ol>
        <li>农户端上传苹果图片并开始 AI 分级。</li>
        <li>低风险商品确认上架，高风险商品进入运营复核。</li>
        <li>消费者端查看商品说明并提交购买意向或顾虑反馈。</li>
        <li>运营端处理复核、补资料、驳回、坏例和反馈复盘。</li>
      </ol>
    </div>
    <div class="share-card">
      <h4>当前演示数据</h4>
      <div class="share-metrics">
        <div><span>已上架</span><strong>${listedCount}</strong></div>
        <div><span>待处理/补资料</span><strong>${reviewCount}</strong></div>
        <div><span>购买意向</span><strong>${intentCount}</strong></div>
        <div><span>坏例</span><strong>${state.badCases.length}</strong></div>
      </div>
    </div>
    <div class="share-card">
      <h4>审核/介绍时可用说明</h4>
      <p>本产品为苹果瑕疵果识别与信息展示体验版，AI 结果仅作初步判断，涉及软烂、霉变、破皮渗液、低置信度或核心食用边界的样本必须人工复核。</p>
    </div>
  `;
}

function renderAll() {
  renderOpsShells({ $$ });
  renderSamples();
  renderSelectedPreview();
  renderFarmerProducts();
  renderFarmerProductDetail();
  renderFarmerResubmissions();
  renderAgentReport();
  renderProducts();
  renderOps();
  renderRulesAndBadCases();
  renderAiPrompt();
  renderEval();
  renderMetrics();
  renderRoleStatus();
  renderWorkbench();
  renderUiStates();
  renderRoadmapDashboard();
  renderShareKit();
}

function bindEvents() {
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-role-home]").forEach((item) => item.addEventListener("click", () => switchView("roleSelect")));
  $$("[data-role-start]").forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.dataset.roleStart === "ops" ? "ops" : item.dataset.roleStart;
      switchView(target);
    });
  });
  $("#runAgentBtn").addEventListener("click", runAgent);
  $("#seedBtn").addEventListener("click", seedDemoProducts);
  $("#resetBtn").addEventListener("click", () => {
    state.selectedSample = samples[0];
    state.currentReport = null;
    state.products = [];
    state.reviews = [];
    state.feedbacks = [];
    state.reportCount = 0;
    state.evalRuns = [];
    state.actionLogs = [];
    state.badCases = defaultBadCaseList();
    state.badCaseFilters = { failure_stage: "all", run_source: "all", status: "all", severity: "all" };
    renderAll();
    persistState();
    switchView("roleSelect");
    showToast("演示已重置");
  });
  $("#copyJsonBtn").addEventListener("click", async () => {
    if (!state.currentReport) return showToast("还没有 Agent 报告");
    await navigator.clipboard.writeText(JSON.stringify(state.currentReport, null, 2));
    showToast("JSON 已复制");
  });
  $("#downloadReportBtn").addEventListener("click", () => {
    if (!state.currentReport) return showToast("还没有 Agent 报告");
    download("grading_report.json", JSON.stringify(state.currentReport, null, 2));
  });
  $("#downloadSamplesBtn").addEventListener("click", () => {
    download("sample_products.json", JSON.stringify(sampleProductsJson(), null, 2));
  });
  $("#runEvalBtn").addEventListener("click", runBatchEval);
  $("#downloadBriefBtn").addEventListener("click", () => {
    download("瑕果智选_AI_Agent_MVP项目说明.md", projectBriefMarkdown(), "text/markdown;charset=utf-8");
  });
  $("#downloadOpsReportBtn").addEventListener("click", () => {
    download("瑕果智选_运营复盘报告.md", opsReportMarkdown(), "text/markdown;charset=utf-8");
  });
  const badCaseFilterBindings = [
    ["#badCaseStageFilter", "failure_stage"],
    ["#badCaseSourceFilter", "run_source"],
    ["#badCaseStatusFilter", "status"],
    ["#badCaseSeverityFilter", "severity"]
  ];
  badCaseFilterBindings.forEach(([selector, key]) => {
    const select = $(selector);
    if (select) select.addEventListener("change", (event) => updateBadCaseFilter(key, event.target.value));
  });
  const refreshTraceBtn = $("#refreshTraceBtn");
  if (refreshTraceBtn) refreshTraceBtn.addEventListener("click", loadRunTraces);
  farmerController.bindInputs();
  document.addEventListener("click", (event) => {
    if (farmerController.handleDocumentClick(event)) return;
    if (consumerController.handleDocumentClick(event)) return;
    if (opsController.handleDocumentClick(event)) return;
    const viewJump = event.target.closest("[data-view-jump]");
    if (viewJump) switchView(viewJump.dataset.viewJump);
    const farmerProductBtn = event.target.closest("[data-farmer-product-id]");
    if (farmerProductBtn) {
      renderFarmerProductDetail(farmerProductBtn.dataset.farmerProductId);
      switchView("farmerProductDetail");
      return;
    }
    if (event.target.id === "seedEmptyProductsBtn") seedDemoProducts();
    const detailBtn = event.target.closest("[data-detail-id]");
    if (detailBtn) {
      renderProductDetail(detailBtn.dataset.detailId);
      switchView("consumerDetail");
    }
    const evalBadCaseBtn = event.target.closest("[data-eval-badcase]");
    if (evalBadCaseBtn) addEvalToBadCase(evalBadCaseBtn.dataset.evalBadcase);
  });
  document.addEventListener("keydown", (event) => consumerController.handleDocumentKeydown(event));
}

async function bootstrap() {
  await restoreState();
  bindHistory();
  bindEvents();
  renderAll();
  checkApiHealth();
  checkAgentConfig();
  loadRunTraces();
  loadEvalSetTemplate();
}

bootstrap();
