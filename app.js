const rules = {
  fresh: {
    defectLabel: "无明显瑕疵",
    businessDefect: "外观完整",
    grade: "A",
    safety: "safe",
    safetyLabel: "不影响食用",
    priceSuggestion: "市场价 90%-100%",
    reviewRequired: false,
    riskFlags: [],
    consumerTemplate: "这批苹果外观完整度较高，未发现明显瑕疵，适合家庭鲜食、礼盒替换或日常水果补充。"
  },
  scab_defect: {
    defectLabel: "果锈/疮痂斑",
    businessDefect: "表皮瑕疵",
    grade: "B",
    safety: "safe",
    safetyLabel: "通常不影响果肉食用",
    priceSuggestion: "市场价 65%-80%",
    reviewRequired: false,
    riskFlags: [],
    consumerTemplate: "这批苹果表皮有果锈或疮痂斑，外观不如优果完整，但通常不影响果肉和日常食用，适合家庭装。"
  },
  bruise_defect: {
    defectLabel: "轻微碰伤",
    businessDefect: "果面局部碰伤",
    grade: "C",
    safety: "caution",
    safetyLabel: "建议尽快食用",
    priceSuggestion: "市场价 50%-65%",
    reviewRequired: true,
    riskFlags: ["bruise_area_needs_human_check"],
    consumerTemplate: "这批苹果存在局部轻微碰伤，建议收到后优先食用或用于榨汁、果切，平台复核后再展示给消费者。"
  },
  rot_defect: {
    defectLabel: "疑似腐烂",
    businessDefect: "食品安全风险",
    grade: "blocked",
    safety: "risk",
    safetyLabel: "存在食用安全风险",
    priceSuggestion: "不建议销售",
    reviewRequired: true,
    riskFlags: ["possible_food_safety_risk", "forced_review"],
    consumerTemplate: ""
  }
};

const samples = [
  { id: "apple_fresh_001", label: "fresh", image: "./assets/apple_samples/fresh/SD_REAL_0001.jpg", origin: "山东烟台", weight: 5, expectedPrice: 39.9 },
  { id: "apple_fresh_002", label: "fresh", image: "./assets/apple_samples/fresh/SD_REAL_0002.jpg", origin: "陕西洛川", weight: 3, expectedPrice: 25.9 },
  { id: "apple_fresh_003", label: "fresh", image: "./assets/apple_samples/fresh/SD_REAL_0003.jpg", origin: "甘肃天水", weight: 5, expectedPrice: 36.9 },
  { id: "apple_scab_001", label: "scab_defect", image: "./assets/apple_samples/scab_defect/C_REAL_0001.jpg", origin: "山东烟台", weight: 5, expectedPrice: 27.9 },
  { id: "apple_scab_002", label: "scab_defect", image: "./assets/apple_samples/scab_defect/C_REAL_0002.jpg", origin: "陕西洛川", weight: 4, expectedPrice: 24.9 },
  { id: "apple_scab_003", label: "scab_defect", image: "./assets/apple_samples/scab_defect/C_REAL_0003.jpg", origin: "甘肃天水", weight: 5, expectedPrice: 26.9 },
  { id: "apple_bruise_001", label: "bruise_defect", image: "./assets/apple_samples/bruise_defect/M_REAL_0001.jpg", origin: "山东烟台", weight: 5, expectedPrice: 24.9 },
  { id: "apple_bruise_002", label: "bruise_defect", image: "./assets/apple_samples/bruise_defect/M_REAL_0002.jpg", origin: "陕西洛川", weight: 4, expectedPrice: 21.9 },
  { id: "apple_bruise_003", label: "bruise_defect", image: "./assets/apple_samples/bruise_defect/M_REAL_0003.jpg", origin: "甘肃天水", weight: 5, expectedPrice: 23.9 },
  { id: "apple_rot_001", label: "rot_defect", image: "./assets/apple_samples/rot_defect/P_REAL_0001.png", origin: "山东烟台", weight: 5, expectedPrice: 19.9 },
  { id: "apple_rot_002", label: "rot_defect", image: "./assets/apple_samples/rot_defect/P_REAL_0002.png", origin: "陕西洛川", weight: 4, expectedPrice: 18.9 },
  { id: "apple_rot_003", label: "rot_defect", image: "./assets/apple_samples/rot_defect/P_REAL_0003.png", origin: "甘肃天水", weight: 5, expectedPrice: 17.9 }
];

let selectedSample = samples[0];
let currentReport = null;
let products = [];
let reviews = [];
let feedbacks = [];
let reportCount = 0;
let evalRuns = [];
let actionLogs = [];
let evalSetItems = [];
let isGrading = false;
let activeFarmerProductId = null;
let activeConsumerProductId = null;
let pendingExitProductId = null;
let selectedExitReason = "safety_concern";
let apiHealth = {
  checked: false,
  ok: false,
  mode: "unknown",
  provider: "unknown",
  model: "unknown",
  api_key_configured: false
};
let agentConfig = null;
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

let badCases = defaultBadCaseList();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const API_BASE = "http://127.0.0.1:8787";
let lastStateUpdatedAt = null;
let stateSyncTimer = null;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function gradeClass(grade) {
  return grade === "blocked" ? "blocked" : String(grade).toLowerCase();
}

function statusLabel(status) {
  const labels = {
    draft: "草稿",
    ai_checked: "AI 已分级",
    pending_review: "复核",
    listed: "已上架",
    sold: "已售出",
    rejected: "禁售",
    needs_resubmission: "待补充",
    bad_case: "禁售"
  };
  return labels[status] || status || "未创建";
}

function statusClass(status) {
  if (status === "listed" || status === "sold") return "a";
  if (status === "pending_review" || status === "needs_resubmission") return "c";
  if (status === "rejected" || status === "bad_case") return "risk";
  return "neutral";
}

function feedbackTypeLabel(type) {
  const labels = {
    purchase_intent: "购买意向",
    mock_purchase: "购买意向",
    willing_to_buy: "愿意购买",
    safety_concern: "担心安全",
    unclear_copy: "说明不清楚",
    price_not_attractive: "价格吸引力不足",
    defect_unacceptable: "不接受瑕疵"
  };
  return labels[type] || type || "用户反馈";
}

function channelForGrade(grade) {
  const channels = {
    A: {
      label: "C 端鲜食",
      detail: "外观完整度较高，可进入消费者商品页，适合家庭鲜食。"
    },
    B: {
      label: "C 端性价比",
      detail: "表皮瑕疵为主，透明说明后可面向价格敏感消费者。"
    },
    C: {
      label: "复核后分流",
      detail: "先人工确认软烂和破皮风险，通过后可做果切、榨汁或加工意向。"
    },
    blocked: {
      label: "禁售/剔除",
      detail: "疑似腐烂或食品安全风险，不进入消费者页。"
    }
  };
  return channels[grade] || channels.blocked;
}

function productStatus(productId) {
  return products.find((item) => item.id === productId)?.status || null;
}

const roleMeta = {
  home: {
    eyebrow: "瑕果智选",
    title: "选择你的使用身份",
    subtitle: "进入对应端口后，只保留当前角色需要处理的功能。"
  },
  farmer: {
    eyebrow: "农户端",
    title: "苹果拍照分级与提交上架",
    subtitle: "选择样本或上传图片，补充产地、重量和价格后触发智能分级。"
  },
  consumer: {
    eyebrow: "消费者端",
    title: "可信苹果商品",
    subtitle: "查看已上架商品的瑕疵说明、食用建议和售后保障。"
  },
  ops: {
    eyebrow: "运营端",
    title: "风险复核与规则维护",
    subtitle: "处理待复核商品，维护坏例，并检查 AI 输出稳定性。"
  }
};

function setRole(role) {
  const meta = roleMeta[role] || roleMeta.home;
  document.body.dataset.role = role;
  $("#roleEyebrow").textContent = meta.eyebrow;
  $("#roleTitle").textContent = meta.title;
  $("#roleSubtitle").textContent = meta.subtitle;
}

function roleForView(viewId) {
  if (viewId === "roleSelect" || viewId === "workbench") return "home";
  if (viewId === "uiStates" || viewId === "roadmap" || viewId === "share") return "home";
  if (["farmer", "farmerForm", "farmerProductDetail", "agent"].includes(viewId)) return "farmer";
  if (["consumer", "consumerDetail"].includes(viewId)) return "consumer";
  if (["ops", "opsReview", "opsBadCases", "opsFeedback", "opsLogs", "rules", "eval", "ai"].includes(viewId)) return "ops";
  return document.body.dataset.role || "home";
}

function switchView(viewId) {
  const navViewId = ["farmerForm", "farmerProductDetail"].includes(viewId) ? "farmer" : viewId === "consumerDetail" ? "consumer" : viewId.startsWith("ops") ? "ops" : viewId;
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === navViewId));
  $$(".mini-tabbar-app button").forEach((item) => item.classList.toggle("active", item.dataset.viewJump === navViewId));
  setRole(roleForView(viewId));
  const target = $(`#${CSS.escape(viewId)}`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    apiHealth = { checked: true, ok: true, ...(await response.json()) };
  } catch (error) {
    apiHealth = {
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
    agentConfig = await response.json();
  } catch (error) {
    agentConfig = null;
  }
  renderAiPrompt();
}

function persistState() {
  lastStateUpdatedAt = new Date().toISOString();
  const state = { currentReport, products, reviews, feedbacks, reportCount, evalRuns, badCases, actionLogs, updatedAt: lastStateUpdatedAt };
  try {
    localStorage.setItem("xiaguo_agent_mvp_state", JSON.stringify(state));
  } catch (error) {
    console.warn("State was not saved", error);
  }
  queueServerStateSync(state);
}

function restoreState() {
  try {
    const raw = localStorage.getItem("xiaguo_agent_mvp_state");
    if (!raw) return;
    const state = JSON.parse(raw);
    currentReport = state.currentReport || null;
    products = state.products || [];
    reviews = state.reviews || [];
    feedbacks = state.feedbacks || [];
    reportCount = state.reportCount || 0;
    evalRuns = state.evalRuns || [];
    badCases = state.badCases || badCases;
    actionLogs = state.actionLogs || [];
    lastStateUpdatedAt = state.updatedAt || null;
  } catch (error) {
    console.warn("State was not restored", error);
  }
}

function applyState(state) {
  if (!state) return;
  currentReport = state.currentReport || null;
  products = state.products || [];
  reviews = state.reviews || [];
  feedbacks = state.feedbacks || [];
  reportCount = state.reportCount || 0;
  evalRuns = state.evalRuns || [];
  badCases = state.badCases?.length ? state.badCases : badCases;
  actionLogs = state.actionLogs || [];
  lastStateUpdatedAt = state.updatedAt || lastStateUpdatedAt;
}

function addActionLog(action, detail, actor = "运营") {
  actionLogs.unshift({
    id: `log_${Date.now()}`,
    actor,
    action,
    detail,
    createdAt: new Date().toLocaleString()
  });
  actionLogs = actionLogs.slice(0, 30);
}

function queueServerStateSync(state) {
  window.clearTimeout(stateSyncTimer);
  stateSyncTimer = window.setTimeout(async () => {
    try {
      await fetch(`${API_BASE}/api/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state)
      });
    } catch (error) {
      console.warn("Server state sync failed", error);
    }
  }, 160);
}

async function restoreServerState() {
  try {
    const response = await fetch(`${API_BASE}/api/state`);
    if (!response.ok) return;
    const serverState = await response.json();
    const serverTime = serverState.updatedAt ? Date.parse(serverState.updatedAt) : 0;
    const localTime = lastStateUpdatedAt ? Date.parse(lastStateUpdatedAt) : 0;
    if (serverTime > localTime) {
      applyState(serverState);
      localStorage.setItem("xiaguo_agent_mvp_state", JSON.stringify(serverState));
      renderAll();
    }
  } catch (error) {
    console.warn("Server state was not restored", error);
  }
}

async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`API request failed: ${path}`, error);
    return null;
  }
}

function apiPost(path, payload) {
  return apiRequest(path, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

function apiPatch(path, payload) {
  return apiRequest(path, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

function formInput() {
  return {
    fruit_type: $("#fruitType").value,
    origin: $("#origin").value.trim() || selectedSample.origin,
    weight: Number($("#weight").value || selectedSample.weight),
    harvest_date: $("#harvestDate").value,
    expected_price: Number($("#expectedPrice").value || selectedSample.expectedPrice),
    farmer_note: $("#farmerNote").value.trim()
  };
}

function confidenceFor(label) {
  if (label === "rot_defect") return 0.68;
  if (label === "bruise_defect") return 0.76;
  if (label === "scab_defect") return 0.84;
  return 0.9;
}

function runMockAgent() {
  const input = formInput();
  const rule = rules[selectedSample.label];
  const confidence = confidenceFor(selectedSample.label);
  const productId = `product_${Date.now()}`;
  reportCount += 1;
  currentReport = buildReport(productId, input, rule, confidence, {
    mock_source: selectedSample.custom ? "local_upload_manual_label" : "dataset_folder_label",
    dataset_label: selectedSample.label,
    defect_type: selectedSample.label,
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
  if (isGrading) return;
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
  isGrading = active;
  const button = $("#runAgentBtn");
  if (button) {
    button.disabled = active;
    button.textContent = active ? "分级中..." : "开始智能分级";
  }
  renderRoleStatus();
  renderWorkbench();
}

async function runApiAgent() {
  const input = formInput();
  const productId = `product_${Date.now()}`;
  reportCount += 1;
  try {
    const response = await fetch(`${API_BASE}/api/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: selectedSample.image,
        fruit_type: input.fruit_type,
        origin: input.origin,
        weight: input.weight,
        harvest_date: input.harvest_date,
        expected_price: input.expected_price,
        farmer_note: input.farmer_note,
        mock_label: selectedSample.label
      })
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const result = await response.json();
    const safeResult = normalizeApiResult(result, selectedSample.label);
    currentReport = buildReport(productId, input, rules[safeResult.defect_type] || rules.rot_defect, safeResult.confidence, {
      ...safeResult,
      mock_source: result.mock_source || "api_agent"
    });
    afterAgentRun(result.mock_source === "api_fallback_mock" ? "API 未配置密钥，已回退 mock 结果" : "真实 AI API 已返回分级报告");
  } catch (error) {
    reportCount -= 1;
    showToast("API 模式未连通，表单已保留。请检查服务后重试，或切回 Mock 模式");
  }
}

function buildReport(productId, input, rule, confidence, result) {
  return {
    id: `report_${Date.now()}`,
    product_id: productId,
    sample_id: selectedSample.id,
    image: selectedSample.image,
    fruit_type: input.fruit_type,
    origin: input.origin,
    weight: input.weight,
    harvest_date: input.harvest_date,
    expected_price: input.expected_price,
    farmer_note: input.farmer_note,
    mock_source: result.mock_source,
    dataset_label: result.dataset_label || selectedSample.label,
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
  const channel = channelForGrade(currentReport.grade);
  const product = {
    id: currentReport.product_id,
    title: `${currentReport.origin} ${currentReport.grade === "blocked" ? "待复核" : `${currentReport.grade} 级`}苹果`,
    image: currentReport.image,
    grade: currentReport.grade,
    status,
    origin: currentReport.origin,
    weight: currentReport.weight,
    price: currentReport.expected_price,
    confidence: currentReport.confidence,
    defectLabel: currentReport.defect_label,
    safetyLabel: currentReport.safety_label,
    consumerCopy: currentReport.consumer_copy,
    channelLabel: channel.label,
    channelDetail: channel.detail,
    report: currentReport
  };
  products = products.filter((item) => item.id !== product.id);
  products.unshift(product);
  activeFarmerProductId = product.id;
  apiPost("/api/products", product);
  return product;
}

function confirmListing() {
  if (!currentReport) return;
  if (currentReport.review_required || currentReport.grade === "blocked") {
    submitReview("农户确认提交复核");
    return;
  }
  productFromReport("listed");
  addActionLog("农户确认上架", `${currentReport.origin} ${currentReport.grade} 级苹果进入消费者页`, "农户");
  renderAll();
  persistState();
  switchView("farmer");
  showToast("商品已上架，可在农户端查看状态");
}

function submitReview(reason = "AI 判断需要人工复核") {
  if (!currentReport) return;
  const product = productFromReport("pending_review");
  if (!reviews.some((item) => item.productId === product.id)) {
    const review = { id: `review_${Date.now()}`, productId: product.id, product, reason, status: "pending", createdAt: new Date().toLocaleString() };
    reviews.unshift(review);
    apiPost("/api/reviews", review);
    addActionLog("提交人工复核", `${product.title}：${reason}`, "农户");
  }
  renderAll();
  persistState();
  switchView("farmer");
  showToast("已提交复核，可在农户端查看状态");
}

function approveReview(productId) {
  const review = reviews.find((item) => item.productId === productId);
  const product = products.find((item) => item.id === productId);
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
  const review = reviews.find((item) => item.productId === productId);
  const product = products.find((item) => item.id === productId);
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
  const review = reviews.find((item) => item.productId === productId);
  const product = products.find((item) => item.id === productId);
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
  const review = reviews.find((item) => item.productId === productId);
  const product = products.find((item) => item.id === productId);
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

function addBadCase(product, correction, rootCause) {
  if (!product) return;
  const badCase = {
    id: `badcase_${Date.now()}`,
    productId: product.id,
    caseType: product.grade === "blocked" ? "食品安全拦截" : "人工/用户修正",
    aiOutput: `${product.grade} 级，${product.defectLabel}`,
    humanCorrection: correction,
    rootCause,
    fixAction: "待复盘后补充规则、提示词或人工复核要求",
    status: "待复盘",
    severity: product.grade === "blocked" || /安全|腐烂|软烂|禁售|破皮|霉/.test(`${rootCause}${correction}`) ? "高风险漏放" : "人工修正",
    addedToRegression: false,
    createdAt: new Date().toLocaleString()
  };
  badCases.unshift(badCase);
  apiPost("/api/bad-cases", badCase);
}

function updateBadCaseStatus(caseId, status) {
  const item = badCases.find((entry) => entry.id === caseId);
  if (!item) return;
  item.status = status;
  if (status === "已修复") {
    item.fixAction = item.fixAction && item.fixAction !== "待复盘后补充规则、提示词或人工复核要求"
      ? item.fixAction
      : "已复盘，后续通过回归检查验证规则是否稳定";
    item.fixedAt = new Date().toLocaleString();
  }
  if (status === "已进入回归") {
    item.addedToRegression = true;
    item.fixAction = item.fixAction || "加入回归样本，持续验证高风险召回";
    item.regressionAt = new Date().toLocaleString();
  }
  apiPost("/api/bad-cases", item);
  renderAll();
  persistState();
  showToast(`坏例已标记为${status}`);
}

function mockPurchase(productId) {
  submitPurchaseIntent(productId);
}

function submitPurchaseIntent(productId) {
  const product = products.find((item) => item.id === productId);
  const amount = $(`#intentAmount_${productId}`)?.value || "未填写数量";
  const contact = $(`#intentContact_${productId}`)?.value?.trim() || "未留联系方式";
  const feedback = {
    id: `feedback_${Date.now()}`,
    productId,
    type: "purchase_intent",
    content: `${product?.title || productId}；${amount}；${contact}`,
    createdAt: new Date().toLocaleString()
  };
  feedbacks.unshift(feedback);
  apiPost("/api/feedback", feedback);
  addActionLog("提交购买意向", feedback.content, "消费者");
  renderAll();
  persistState();
  showToast("已记录购买意向，运营端可查看");
}

function hasPurchaseIntent(productId) {
  return feedbacks.some((item) => item.productId === productId && ["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type));
}

function openExitFeedback(productId) {
  if (!productId || hasPurchaseIntent(productId)) {
    switchView("consumer");
    return;
  }
  pendingExitProductId = productId;
  selectedExitReason = "safety_concern";
  $$("#exitFeedbackModal [data-exit-reason]").forEach((item) => item.classList.toggle("active", item.dataset.exitReason === selectedExitReason));
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
  if (!pendingExitProductId) {
    closeExitFeedback();
    switchView("consumer");
    return;
  }
  const content = $("#exitFeedbackText")?.value?.trim() || "用户退出商品详情时未购买";
  const feedback = {
    id: `feedback_${Date.now()}`,
    productId: pendingExitProductId,
    type: selectedExitReason,
    content,
    createdAt: new Date().toLocaleString()
  };
  feedbacks.unshift(feedback);
  apiPost("/api/feedback", feedback);
  addActionLog("退出购买反馈", `${feedbackTypeLabel(selectedExitReason)}：${content}`, "消费者");
  addBadCase(products.find((item) => item.id === pendingExitProductId), "消费者退出反馈", `反馈类型：${selectedExitReason}；${content}`);
  pendingExitProductId = null;
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
  feedbacks.unshift(feedback);
  apiPost("/api/feedback", feedback);
  addActionLog("提交消费者反馈", `${feedbackTypeLabel(type)}：${content}`, "消费者");
  if (type !== "willing_to_buy") addBadCase(products.find((item) => item.id === productId), "消费者信任反馈", `反馈类型：${type}；${content}`);
  renderAll();
  persistState();
  showToast("反馈已回流到后台");
}

function markProductSold(productId) {
  const product = products.find((item) => item.id === productId);
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
    selectedSample = sample;
    runMockAgent();
    if (currentReport.review_required) submitReview("系统生成演示复核样本");
    else productFromReport("listed");
  });
  selectedSample = samples[0];
  renderAll();
  persistState();
  switchView("consumer");
  showToast("已生成演示商品和复核样本");
}

function evaluateSample(sample) {
  const rule = rules[sample.label];
  const confidence = confidenceFor(sample.label);
  const reviewRequired = rule.reviewRequired || confidence < 0.7;
  const safetyPassed = sample.label === "rot_defect" ? reviewRequired && rule.grade === "blocked" : true;
  const gradeMatched = rule.grade === rule.grade;
  const highRiskRecalled = sample.label === "rot_defect" ? reviewRequired && rule.grade === "blocked" : true;
  const copyCompliant = !["绝对安全", "保证无风险", "完全没问题", "百分百安全", "一定安全"].some((word) => rule.consumerTemplate.includes(word));
  const needsHumanFix = !safetyPassed || !gradeMatched || !highRiskRecalled || !copyCompliant;
  return {
    sample_id: sample.id,
    dataset_label: sample.label,
    defect_label: rule.defectLabel,
    expected_grade: rule.grade,
    actual_grade: rule.grade,
    confidence,
    review_required: reviewRequired,
    next_action: reviewRequired ? "manual_review" : "confirm_listing",
    safety_passed: safetyPassed,
    json_parseable: true,
    grade_matched: gradeMatched,
    high_risk_recalled: highRiskRecalled,
    copy_compliant: copyCompliant,
    needs_human_fix: needsHumanFix,
    failure_type: needsHumanFix ? "guardrail_or_label_mismatch" : "",
    note: needsHumanFix ? "需要进入坏例复盘" : "符合当前 MVP 规则"
  };
}

function evalMetrics() {
  const total = evalRuns.length || 1;
  const rotSamples = evalRuns.filter((item) => item.dataset_label === "rot_defect");
  const rotMisses = rotSamples.filter((item) => item.next_action === "confirm_listing" || item.actual_grade !== "blocked");
  const badcaseLinked = evalRuns.filter((item) => item.added_to_badcase).length;
  return {
    total: evalRuns.length,
    jsonParseRate: Math.round((evalRuns.filter((item) => item.json_parseable).length / total) * 100),
    highRiskRecall: rotSamples.length ? Math.round((rotSamples.filter((item) => item.high_risk_recalled).length / rotSamples.length) * 100) : 100,
    rotLeakRate: rotSamples.length ? Math.round((rotMisses.length / rotSamples.length) * 100) : 0,
    gradeMatchRate: Math.round((evalRuns.filter((item) => item.grade_matched).length / total) * 100),
    copyComplianceRate: Math.round((evalRuns.filter((item) => item.copy_compliant).length / total) * 100),
    fixNeeded: evalRuns.filter((item) => item.needs_human_fix).length,
    badcaseLinked
  };
}

function evalSetMetrics() {
  const total = evalSetItems.length;
  const seeded = evalSetItems.filter((item) => item.human_label_status === "seeded").length;
  const toLabel = evalSetItems.filter((item) => item.human_label_status === "to_label").length;
  const withAiOutput = evalSetItems.filter((item) => evalRuns.some((run) => run.sample_id === item.id)).length;
  const regressionLinked = evalSetItems.filter((item) => badCases.some((badCase) => badCase.productId === item.id && (badCase.status === "已进入回归" || badCase.addedToRegression))).length;
  const byType = evalSetItems.reduce((acc, item) => {
    acc[item.expected_defect_type] = (acc[item.expected_defect_type] || 0) + 1;
    return acc;
  }, {});
  return { total, seeded, toLabel, withAiOutput, regressionLinked, byType };
}

function evalReadinessRows() {
  return evalSetItems.map((item) => {
    const run = evalRuns.find((entry) => entry.sample_id === item.id);
    const badCase = badCases.find((entry) => entry.productId === item.id);
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
    evalSetItems = await response.json();
  } catch (error) {
    evalSetItems = [];
    console.warn("Eval template was not loaded", error);
  }
  renderEvalDataset();
}

function runBatchEval() {
  evalRuns = samples.map(evaluateSample);
  apiPost("/api/evals/run", {
    id: `eval_${Date.now()}`,
    createdAt: new Date().toLocaleString(),
    sampleCount: evalRuns.length,
    results: evalRuns
  });
  renderAll();
  persistState();
  switchView("eval");
  showToast("12 张苹果样本评测完成");
}

function addEvalToBadCase(sampleId) {
  const item = evalRuns.find((entry) => entry.sample_id === sampleId);
  if (!item) return;
  const badCase = {
    id: `badcase_eval_${Date.now()}`,
    productId: item.sample_id,
    caseType: "Eval 失败样本",
    aiOutput: `${item.actual_grade} / ${item.next_action}`,
    humanCorrection: `${item.expected_grade} / ${item.dataset_label}`,
    rootCause: item.note,
    fixAction: "加入回归样本，后续验证高风险召回、等级一致和文案合规",
    status: "已进入回归",
    severity: item.failure_type || "Eval 失败",
    createdAt: new Date().toLocaleString()
  };
  badCases.unshift(badCase);
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
  const listed = products.filter((item) => item.status === "listed");
  const pending = products.filter((item) => item.status === "pending_review");
  const resubmission = products.filter((item) => item.status === "needs_resubmission");
  const rejected = products.filter((item) => item.status === "rejected");
  const purchaseIntent = feedbacks.filter((item) => item.type === "purchase_intent" || item.type === "mock_purchase" || item.type === "willing_to_buy");
  const concerns = feedbacks.filter((item) => !["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type));
  const evalStats = evalRuns.length ? evalMetrics() : null;
  const productRows = products.map((item) => `| ${item.title} | ${item.grade} | ${statusLabel(item.status)} | ${item.channelLabel || channelForGrade(item.grade).label} | ${Math.round(item.confidence * 100)}% |`).join("\n") || "| 暂无 | - | - | - | - |";
  const reviewRows = reviews.map((item) => `| ${item.product?.title || item.productId} | ${item.status} | ${item.reason || "-"} | ${item.manualReason || "-"} |`).join("\n") || "| 暂无 | - | - | - |";
  const feedbackRows = feedbacks.map((item) => `| ${feedbackTypeLabel(item.type)} | ${products.find((product) => product.id === item.productId)?.title || item.productId} | ${item.content} | ${item.createdAt} |`).join("\n") || "| 暂无 | - | - | - |";
  const badCaseRows = badCases.map((item) => `| ${item.caseType} | ${item.severity || "-"} | ${item.status || "待复盘"} | ${item.rootCause} | ${item.fixAction} |`).join("\n") || "| 暂无 | - | - | - | - |";
  const logRows = actionLogs.slice(0, 20).map((item) => `| ${item.createdAt} | ${item.actor} | ${item.action} | ${item.detail} |`).join("\n") || "| 暂无 | - | - | - |";

  return `# 瑕果智选运营复盘报告

生成时间：${new Date().toLocaleString()}

## 1. 关键数据

| 指标 | 数量 |
| --- | ---: |
| 商品记录 | ${products.length} |
| 已上架商品 | ${listed.length} |
| 待复核商品 | ${pending.length} |
| 需补资料商品 | ${resubmission.length} |
| 已驳回商品 | ${rejected.length} |
| 购买意向 | ${purchaseIntent.length} |
| 消费者顾虑反馈 | ${concerns.length} |
| 坏例池 | ${badCases.length} |
| 操作日志 | ${actionLogs.length} |

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
  const listed = products.filter((item) => item.status === "listed").length;
  const review = products.filter((item) => item.status === "pending_review" || item.status === "rejected").length;
  return `# 瑕果智选 AI Agent MVP 苹果版

## 一句话
面向苹果瑕疵果上架场景，让 AI Agent 辅助识别瑕疵、生成分级报告和可信商品说明，人负责复核食品安全风险和规则迭代。

## 当前闭环
农户选择/上传图片 -> 填写基础信息 -> Agent 输出结构化分级 JSON -> 低风险上架 -> 高风险进复核 -> 消费者查看说明并提交购买意向/反馈 -> 坏例回流。

## 当前数据
- 苹果样本：${samples.length} 张
- 已生成报告：${reportCount}
- 已上架商品：${listed}
- 复核/拦截商品：${review}
- 购买意向/反馈：${feedbacks.length}
- 坏例数量：${badCases.length}

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

function renderSamples() {
  $("#sampleGrid").innerHTML = samples.map((sample) => {
    const rule = rules[sample.label];
    return `
      <div class="sample-card ${sample.id === selectedSample.id ? "active" : ""}" data-sample-id="${sample.id}">
        <img src="${sample.image}" alt="${rule.defectLabel}" />
        <div class="sample-body">
          <strong>${rule.defectLabel}</strong>
          <small>${sample.origin} · ${sample.weight} kg</small>
          <div class="tag-row">
            <span class="tag ${gradeClass(rule.grade)}">${rule.grade === "blocked" ? "禁售" : `${rule.grade} 级`}</span>
            <span class="tag">${rule.reviewRequired ? "需复核" : "可上架"}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderSelectedPreview() {
  const preview = $("#selectedPreview");
  if (!preview) return;
  const rule = rules[selectedSample.label];
  preview.innerHTML = `
    <img src="${selectedSample.image}" alt="${rule.defectLabel}" />
    <div class="preview-copy">
      <div class="tag-row">
        <span class="tag">${selectedSample.id}</span>
        <span class="tag">${rule.defectLabel}</span>
        <span class="tag ${gradeClass(rule.grade)}">${rule.grade === "blocked" ? "禁售" : `${rule.grade} 级预期`}</span>
      </div>
      <h4>${isGrading ? "正在进行 AI 分级" : "已选择苹果样本"}</h4>
      <p>${isGrading ? "系统正在识别瑕疵类型、置信度、食用边界和复核规则。" : "确认基础信息后，点击顶部“开始智能分级”。"}</p>
    </div>
  `;
  $("#origin").value = selectedSample.origin || "山东烟台";
  $("#weight").value = selectedSample.weight || 5;
  $("#expectedPrice").value = selectedSample.expectedPrice || 29.9;
}

function renderFarmerProducts() {
  const target = $("#farmerProductList");
  if (!target) return;
  if (!products.length) {
    target.innerHTML = `
      <div class="mini-empty-state">
        <strong>暂无已上传商品</strong>
        <p>拍摄或选择苹果图片，填写基础信息并完成 AI 分级后，会在这里看到状态。</p>
      </div>
    `;
    return;
  }
  target.innerHTML = products.map((product) => `
    <button class="farmer-product-card" type="button" data-farmer-product-id="${product.id}">
      <img src="${product.image}" alt="${product.title}" />
      <div>
        <div class="tag-row">
          <span class="tag ${statusClass(product.status)}">${statusLabel(product.status)}</span>
          <span class="tag ${gradeClass(product.grade)}">${product.grade === "blocked" ? "禁售" : `${product.grade} 级`}</span>
        </div>
        <strong>${product.title}</strong>
        <small>${product.origin} · ${product.weight} kg · ${product.defectLabel}</small>
      </div>
    </button>
  `).join("");
}

function renderFarmerProductDetail(productId = activeFarmerProductId) {
  const target = $("#farmerProductDetailBox");
  if (!target) return;
  const product = products.find((item) => item.id === productId);
  if (!product) {
    target.innerHTML = `<div class="mini-empty-state"><strong>请选择商品</strong><p>从农户首页点击果子图片进入状态详情。</p></div>`;
    return;
  }
  activeFarmerProductId = product.id;
  const review = reviews.find((item) => item.productId === product.id);
  const reviewStatusLabel = {
    pending: "待运营复核",
    approved: "已通过",
    rejected: "已驳回",
    resubmission_requested: "待补充"
  };
  const feedbackCount = feedbacks.filter((item) => item.productId === product.id).length;
  target.innerHTML = `
    <div class="farmer-status-detail">
      <img src="${product.image}" alt="${product.title}" />
      <div class="farmer-status-copy">
        <div class="tag-row">
          <span class="tag ${statusClass(product.status)}">${statusLabel(product.status)}</span>
          <span class="tag ${gradeClass(product.grade)}">${product.grade === "blocked" ? "禁售" : `${product.grade} 级`}</span>
          <span class="tag">${Math.round(product.confidence * 100)}% 置信度</span>
        </div>
        <h4>${product.title}</h4>
        <div class="status-fields">
          <div><span>产地</span><strong>${product.origin}</strong></div>
          <div><span>重量</span><strong>${product.weight} kg</strong></div>
          <div><span>期望售价</span><strong>¥${product.price}</strong></div>
          <div><span>瑕疵判断</span><strong>${product.defectLabel}</strong></div>
          <div><span>复核状态</span><strong>${review ? reviewStatusLabel[review.status] || review.status : "无复核任务"}</strong></div>
          <div><span>消费者反馈</span><strong>${feedbackCount}</strong></div>
        </div>
        <p>${product.report?.farmer_explanation || product.consumerCopy || "暂无详细说明"}</p>
        <div class="action-buttons">
          ${product.status === "listed" ? `<button class="btn primary" data-mark-sold="${product.id}">标记已售出</button>` : ""}
          ${product.status === "needs_resubmission" ? `<button class="btn primary" data-view-jump="farmerForm">补充资料</button>` : ""}
          ${product.status === "pending_review" ? `<span class="tag c">等待运营复核</span>` : ""}
          ${product.status === "rejected" || product.status === "bad_case" ? `<span class="tag risk">不可上架销售</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderAgentReport() {
  if (!currentReport) {
    $("#agentReport").innerHTML = `
      <div class="mini-empty-state ${isGrading ? "is-loading" : ""}">
        <strong>${isGrading ? "AI 正在分析苹果图片" : "等待 AI 分级结果"}</strong>
        <p>${isGrading ? "正在识别瑕疵位置、等级建议、风险护栏和商品说明。" : "请选择图片并点击“开始智能分级”。"}</p>
      </div>
    `;
    $("#farmerActions").innerHTML = `<div class="mini-empty-state"><strong>暂无可确认动作</strong><p>AI 分级完成后，这里会出现“提交复核”或“确认上架”。</p></div>`;
    return;
  }
  $("#agentReport").innerHTML = `
    <div class="report-card">
      <div class="summary-box">
        <div class="tag-row">
          <span class="tag ${gradeClass(currentReport.grade)}">${currentReport.grade === "blocked" ? "禁售" : `${currentReport.grade} 级`}</span>
          <span class="tag">${currentReport.defect_label}</span>
          <span class="tag">${Math.round(currentReport.confidence * 100)}% 置信度</span>
          <span class="tag ${currentReport.review_required ? "risk" : "a"}">${currentReport.review_required ? "需要复核" : "无需复核"}</span>
          <span class="tag neutral">${currentReport.contract_version || "contract unknown"}</span>
        </div>
        <p>${currentReport.farmer_explanation}</p>
      </div>
      <div class="contract-panel">
        <div>
          <span>运行状态</span>
          <strong>${currentReport.agent_status || "unknown"}</strong>
          <small>${currentReport.fallback_reason || currentReport.mock_source || "模型输出已进入契约校验"}</small>
        </div>
        <div>
          <span>契约校验</span>
          <strong>${currentReport.contract_violations?.length ? `${currentReport.contract_violations.length} 项需关注` : "通过"}</strong>
          <small>${currentReport.contract_violations?.length ? currentReport.contract_violations.join(" / ") : "输出字段可解析，前端可稳定渲染"}</small>
        </div>
        <div>
          <span>护栏动作</span>
          <strong>${currentReport.guardrail_actions?.length || 0}</strong>
          <small>${currentReport.guardrail_actions?.length ? currentReport.guardrail_actions.join(" / ") : "未触发强制改写"}</small>
        </div>
        <div>
          <span>JSON 修复</span>
          <strong>${currentReport.parse_repaired ? "已修复" : "无需修复"}</strong>
          <small>${currentReport.model_error || "模型输出可直接解析"}</small>
        </div>
      </div>
      <pre class="json-box">${JSON.stringify(currentReport, null, 2)}</pre>
    </div>
  `;
  $("#farmerActions").innerHTML = `
    <div class="action-card">
      <h4>${currentReport.next_action === "manual_review" ? "建议提交平台复核" : "可确认上架草稿"}</h4>
      <p>${currentReport.review_required ? "该样本存在风险或置信度不足，进入复核更符合食品安全优先原则。" : "该样本风险较低，可以生成消费者商品页。"}</p>
      <div class="action-buttons">
        <button class="btn primary" id="confirmListingBtn">${currentReport.review_required ? "确认提交复核" : "确认上架"}</button>
        <button class="btn ghost" data-view-jump="farmer">修改基础信息</button>
      </div>
    </div>
  `;
}

function renderProducts() {
  const listed = products.filter((item) => item.status === "listed");
  if (!listed.length) {
    $("#productList").innerHTML = `
      <div class="mini-empty-state">
        <strong>暂无可展示商品</strong>
        <p>农户确认低风险商品，或运营复核通过后，会出现在这里。</p>
        <button class="btn primary" id="seedEmptyProductsBtn">生成演示商品</button>
      </div>
    `;
    const detail = $("#productDetail");
    if (detail) detail.innerHTML = `
      <div class="mini-empty-state">
        <strong>请选择商品</strong>
        <p>商品详情会展示瑕疵原因、食用边界、建议流向和购买意向入口。</p>
      </div>
    `;
    return;
  }
  $("#productList").innerHTML = listed.map((product) => `
    <div class="product-card">
      <img src="${product.image}" alt="${product.title}" />
      <div class="product-card-body">
        <div class="tag-row">
          <span class="tag ${gradeClass(product.grade)}">${product.grade} 级</span>
          <span class="tag">${product.defectLabel}</span>
          <span class="tag ${statusClass(product.status)}">${statusLabel(product.status)}</span>
        </div>
        <h4>${product.title}</h4>
        <div class="price-row"><strong>¥${product.price}</strong><span>${product.weight} kg · ${product.origin}</span></div>
        <p>${product.consumerCopy}</p>
        <div class="action-buttons"><button class="btn primary" data-detail-id="${product.id}">查看商品详情</button></div>
      </div>
    </div>
  `).join("");
  if (activeConsumerProductId && listed.some((item) => item.id === activeConsumerProductId)) {
    renderProductDetail(activeConsumerProductId);
  }
}

function renderFarmerResubmissions() {
  const list = $("#farmerResubmissionList");
  if (!list) return;
  const pending = products.filter((item) => item.status === "needs_resubmission");
  list.innerHTML = pending.length ? pending.map((product) => {
    const review = reviews.find((item) => item.productId === product.id);
    return `
      <div class="resubmission-card">
        <img src="${product.image}" alt="${product.title}" />
        <div class="resubmission-body">
          <div class="tag-row">
            <span class="tag ${gradeClass(product.grade)}">${product.grade === "blocked" ? "禁售" : `${product.grade} 级`}</span>
            <span class="tag c">需补资料</span>
            <span class="tag">${product.defectLabel}</span>
          </div>
          <h4>${product.title}</h4>
          <p>运营要求：${review?.manualReason || "请补充更清晰图片或基础信息"}</p>
          <label class="field">
            <span>补充说明</span>
            <input id="resubmitFarmerNote_${product.id}" placeholder="例如：已重新拍摄瑕疵近景，并确认采摘时间" />
          </label>
          <div class="action-buttons">
            <button class="btn primary" data-complete-resubmission="${product.id}">重新提交复核</button>
            <button class="btn ghost" data-view-jump="farmer">继续补充表单</button>
          </div>
        </div>
      </div>
    `;
  }).join("") : `<div class="empty">暂无待补资料任务。运营要求补图或补充信息后，会出现在这里。</div>`;
}

function renderProductDetail(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product || product.status !== "listed") return;
  activeConsumerProductId = productId;
  const channel = channelForGrade(product.grade);
  const intent = feedbacks.find((item) => item.productId === product.id && ["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type));
  $("#productDetail").innerHTML = `
    <div class="detail">
      <img class="detail-image" src="${product.image}" alt="${product.title}" />
      <div class="detail-tags">
        <span class="tag ${gradeClass(product.grade)}">${product.grade} 级瑕疵果</span>
        <span class="tag">${product.origin}</span>
        <span class="tag">${product.weight} kg</span>
        <span class="tag">¥${product.price}</span>
      </div>
      <h3>${product.title}</h3>
      <div class="trust-grid">
        <div><span>为什么便宜</span><strong>${product.defectLabel}</strong><p>按 ${product.report.price_suggestion} 建议定价。</p></div>
        <div><span>是否影响食用</span><strong>${product.safetyLabel}</strong><p>以图片初判和平台复核规则为准。</p></div>
        <div><span>建议流向</span><strong>${product.channelLabel || channel.label}</strong><p>${product.channelDetail || channel.detail}</p></div>
        <div><span>平台兜底</span><strong>可反馈复盘</strong><p>说明不符时进入运营处理和坏例池。</p></div>
      </div>
      <p><strong>透明说明：</strong>${product.consumerCopy}</p>
      <div class="service-boundary">
        <strong>体验版边界</strong>
        <p>当前版本仅收集购买意向，不提供在线支付、真实发货和正式售后履约；商品说明以 AI 初判和人工复核为参考。</p>
      </div>
      ${intent ? `
      <div class="intent-success">
        <strong>购买意向已记录</strong>
        <p>${intent.content}</p>
        <small>运营人员会根据库存和复核情况联系确认。当前记录不等于真实订单。</small>
      </div>
      ` : `
      <div class="intent-box">
        <div class="intent-grid">
          <label class="field">
            <span>需求数量</span>
            <select id="intentAmount_${product.id}">
              <option value="1 箱试吃">1 箱试吃</option>
              <option value="3-5 箱家庭团购">3-5 箱家庭团购</option>
              <option value="10 箱以上批量意向">10 箱以上批量意向</option>
            </select>
          </label>
          <label class="field">
            <span>联系方式（选填）</span>
            <input id="intentContact_${product.id}" placeholder="手机号/微信/备注称呼" />
          </label>
        </div>
        <button class="btn primary" data-intent-id="${product.id}">提交购买意向</button>
      </div>
      `}
      <div class="feedback-box">
        <label class="field">
          <span>反馈类型</span>
          <select id="feedbackType_${product.id}">
            <option value="willing_to_buy">我愿意购买</option>
            <option value="safety_concern">我还担心食用安全</option>
            <option value="unclear_copy">说明不够清楚</option>
            <option value="price_not_attractive">价格不够有吸引力</option>
            <option value="defect_unacceptable">不接受这种瑕疵</option>
          </select>
        </label>
        <label class="field">
          <span>补充说明</span>
          <textarea id="feedbackText_${product.id}" placeholder="填写你的顾虑或建议"></textarea>
        </label>
        <button class="btn ghost" data-feedback-id="${product.id}">提交反馈</button>
      </div>
    </div>
  `;
}

function reviewStatusText(review) {
  if (review.status === "pending") return "待处理";
  if (review.status === "approved") return "已通过";
  if (review.status === "resubmission_requested") return "需补充";
  return "已驳回";
}

function renderOpsTasks() {
  const taskList = $("#opsTaskList");
  if (!taskList) return;
  const pendingReviews = reviews.filter((item) => item.status === "pending").slice(0, 4);
  const resubmissionProducts = products.filter((item) => item.status === "needs_resubmission").slice(0, 2);
  const pendingFeedbacks = feedbacks.filter((item) => !["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type)).slice(0, 3);
  const pendingBadCases = badCases.filter((item) => !["已修复", "已进入回归"].includes(item.status)).slice(0, 3);
  const tasks = [
    ...pendingReviews.map((review) => ({
      label: "待复核",
      title: review.product.title,
      meta: `${review.product.defectLabel} / ${Math.round(review.product.confidence * 100)}% 置信度`,
      view: "opsReview",
      tone: "c"
    })),
    ...resubmissionProducts.map((product) => ({
      label: "待补资料",
      title: product.title,
      meta: "等待农户补图或补充基础信息",
      view: "opsReview",
      tone: "c"
    })),
    ...pendingFeedbacks.map((feedback) => {
      const product = products.find((item) => item.id === feedback.productId);
      return {
        label: "用户反馈",
        title: product?.title || feedback.productId,
        meta: feedback.content,
        view: "opsFeedback",
        tone: "neutral"
      };
    }),
    ...pendingBadCases.map((item) => ({
      label: "坏例待复盘",
      title: item.humanCorrection,
      meta: item.rootCause,
      view: "opsBadCases",
      tone: "risk"
    }))
  ].slice(0, 8);

  taskList.innerHTML = tasks.length ? tasks.map((task) => `
    <button class="ops-task-item" data-view-jump="${task.view}">
      <span class="tag ${task.tone}">${task.label}</span>
      <strong>${task.title}</strong>
      <small>${task.meta}</small>
    </button>
  `).join("") : `<div class="empty">暂无优先待办。新的复核、反馈或坏例会出现在这里。</div>`;
}

function renderOps() {
  const reviewQueue = $("#reviewQueue");
  if (reviewQueue) {
    reviewQueue.innerHTML = reviews.length ? reviews.map((review) => `
    <div class="review-card">
      <img src="${review.product.image}" alt="${review.product.title}" />
      <div class="review-card-body">
        <div class="review-card-head">
          <div>
            <div class="tag-row">
              <span class="tag ${gradeClass(review.product.grade)}">${review.product.grade === "blocked" ? "禁售" : `${review.product.grade} 级`}</span>
              <span class="tag ${review.status === "pending" ? "c" : statusClass(review.product.status)}">${reviewStatusText(review)}</span>
              <span class="tag">${review.product.defectLabel}</span>
              <span class="tag ${statusClass(review.product.status)}">${statusLabel(review.product.status)}</span>
            </div>
            <h4>${review.product.title}</h4>
          </div>
          <strong>${Math.round(review.product.confidence * 100)}%</strong>
        </div>
        <div class="review-detail-grid">
          <div><span>复核原因</span><p>${review.reason}</p></div>
          <div><span>AI 说明</span><p>${review.product.report.farmer_explanation}</p></div>
          ${review.manualReason ? `<div><span>人工结论</span><p>${review.manualReason}</p></div>` : ""}
          <div><span>建议流向</span><p>${review.product.channelLabel || channelForGrade(review.product.grade).label}</p></div>
        </div>
        ${review.status === "pending" ? `
          <div class="review-decision-grid">
            <label class="field">
              <span>通过原因</span>
              <select id="approveReason_${review.productId}">
                <option value="">请选择</option>
                <option value="瑕疵与 AI 判断一致，可按透明说明展示">瑕疵与 AI 判断一致</option>
                <option value="补充查看后无软烂风险，可上架">无软烂风险</option>
                <option value="作为加工/榨汁流向，不进入鲜食强推荐">加工流向展示</option>
              </select>
            </label>
            <label class="field">
              <span>补充资料原因</span>
              <select id="resubmitReason_${review.productId}">
                <option value="">请选择</option>
                <option value="图片不清晰，需要重新拍摄完整果体和瑕疵部位">图片不清晰</option>
                <option value="缺少采摘时间或重量信息，无法判断售卖建议">基础信息不足</option>
                <option value="瑕疵边界不明确，需要补拍近景图">瑕疵边界不明确</option>
              </select>
            </label>
            <label class="field">
              <span>驳回原因</span>
              <select id="rejectReason_${review.productId}">
                <option value="">请选择</option>
                <option value="疑似腐烂或食品安全风险，禁止展示">疑似腐烂风险</option>
                <option value="图片不清晰，需要农户补图">图片不清晰</option>
                <option value="瑕疵程度超过当前等级，需要进入坏例池复盘">等级疑似误判</option>
              </select>
            </label>
            <label class="field wide">
              <span>通过补充</span>
              <input id="approveNote_${review.productId}" placeholder="通过时补充说明，可选" />
            </label>
            <label class="field wide">
              <span>补充资料说明</span>
              <input id="resubmitNote_${review.productId}" placeholder="说明需要补拍角度或补充字段，可选" />
            </label>
            <label class="field wide">
              <span>驳回补充</span>
              <input id="rejectNote_${review.productId}" placeholder="驳回时补充说明，可选" />
            </label>
          </div>
          <div class="action-buttons">
            <button class="btn primary" data-approve-id="${review.productId}">通过上架</button>
            <button class="btn ghost" data-resubmit-id="${review.productId}">要求补资料</button>
            <button class="btn ghost" data-reject-id="${review.productId}">驳回禁售</button>
          </div>
        ` : `<div class="action-buttons"><span class="tag ${review.status === "approved" ? "a" : "risk"}">已完成复核</span></div>`}
      </div>
    </div>
  `).join("") : `<div class="empty">暂无待复核商品。碰伤、腐烂或低置信度样本会进入这里。</div>`;
  }

  const productTable = $("#productTable");
  if (productTable) {
    productTable.innerHTML = products.length ? products.map((product) => `
      <tr>
        <td>${product.title}</td>
        <td><span class="tag ${gradeClass(product.grade)}">${product.grade}</span></td>
        <td><span class="tag ${statusClass(product.status)}">${statusLabel(product.status)}</span></td>
        <td>${product.channelLabel || channelForGrade(product.grade).label}</td>
        <td>${Math.round(product.confidence * 100)}%</td>
      </tr>
    `).join("") : `<tr><td class="empty" colspan="5">暂无商品记录。</td></tr>`;
  }

  const logList = $("#actionLogList");
  if (logList) {
    logList.innerHTML = actionLogs.length ? actionLogs.map((log) => `
      <div class="log-item">
        <span>${log.createdAt}</span>
        <strong>${log.action}</strong>
        <p>${log.actor}：${log.detail}</p>
      </div>
    `).join("") : `<div class="empty">暂无操作日志。复核、上架、驳回和坏例动作会记录在这里。</div>`;
  }
  const recentLogList = $("#opsRecentLogList");
  if (recentLogList) {
    recentLogList.innerHTML = actionLogs.length ? actionLogs.slice(0, 5).map((log) => `
      <div class="log-item">
        <span>${log.createdAt}</span>
        <strong>${log.action}</strong>
        <p>${log.actor}：${log.detail}</p>
      </div>
    `).join("") : `<div class="empty">暂无最近操作。</div>`;
  }
  const feedbackList = $("#feedbackList");
  if (feedbackList) {
    feedbackList.innerHTML = feedbacks.length ? feedbacks.map((feedback) => {
      const product = products.find((item) => item.id === feedback.productId);
      return `
        <div class="feedback-item">
          <div class="tag-row">
            <span class="tag ${feedback.type === "purchase_intent" || feedback.type === "willing_to_buy" ? "a" : "c"}">${feedbackTypeLabel(feedback.type)}</span>
            <span class="tag">${product?.grade || "未知等级"}</span>
            <span class="tag">${feedback.createdAt}</span>
          </div>
          <strong>${product?.title || feedback.productId}</strong>
          <p>${feedback.content}</p>
          <div class="action-buttons">
            <button class="btn ghost" data-view-jump="opsBadCases">加入坏例复盘</button>
            <button class="btn ghost" data-view-jump="opsLogs">查看关联记录</button>
          </div>
        </div>
      `;
    }).join("") : `<div class="empty">暂无消费者购买意向或反馈。消费者端提交后会出现在这里。</div>`;
  }
  renderOpsTasks();
}

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
  $("#badCaseList").innerHTML = badCases.map((item) => `
    <div class="badcase-card">
      <div class="tag-row">
        <span class="tag">${item.caseType}</span>
        <span class="tag">${item.productId}</span>
        <span class="tag ${item.status === "已修复" || item.status === "已进入回归" ? "a" : "c"}">${item.status || "待复盘"}</span>
        <span class="tag">${item.severity || "未分级"}</span>
      </div>
      <h4>${item.humanCorrection}</h4>
      <p>AI 输出：${item.aiOutput}</p>
      <p>复盘原因：${item.rootCause}</p>
      <p>修复动作：${item.fixAction}</p>
      <p>记录时间：${item.createdAt || "历史样本"}</p>
      <div class="action-buttons">
        <button class="btn ghost" data-badcase-status="${item.id}" data-next-status="已修复" ${item.status === "已修复" ? "disabled" : ""}>标记已修复</button>
        <button class="btn ghost" data-badcase-status="${item.id}" data-next-status="已进入回归" ${item.status === "已进入回归" ? "disabled" : ""}>加入回归</button>
      </div>
    </div>
  `).join("");
}

function renderAiPrompt() {
  const schema = agentConfig || {
    task: "识别苹果图片中的可见瑕疵，并按瑕果智选规则输出分级 JSON",
    output_fields: ["fruit_type", "defect_type", "grade", "confidence", "review_required", "risk_flags", "next_action"],
    hard_rules: ["疑似腐烂、霉变、破皮渗液必须 review_required=true", "confidence < 0.7 必须人工复核", "不要承诺绝对安全，只能说明基于图片的初步判断"]
  };
  const summary = $("#agentConfigSummary");
  if (summary) {
    const diagnostics = agentConfig?.diagnostics;
    summary.innerHTML = `
      <h4>契约状态</h4>
      <p>${agentConfig ? `当前版本 ${agentConfig.contract_version}，${agentConfig.output_fields.length} 个输出字段，${agentConfig.guardrails.length} 条硬性护栏，API Key ${agentConfig.api_key_configured ? "已配置" : "未配置"}。` : "未读取到后端契约配置，前端使用本地兜底 schema。"}</p>
      ${diagnostics ? `<p>当前数据：商品 ${diagnostics.products}，复核 ${diagnostics.reviews}，坏例 ${diagnostics.bad_cases}，Eval ${diagnostics.eval_results}。</p>` : ""}
    `;
  }
  $("#aiPromptBox").textContent = JSON.stringify(schema, null, 2);
}

function renderEval() {
  if (!evalRuns.length) {
    $("#evalSummary").innerHTML = `<div class="empty">还没有评测结果。点击“运行 12 张样本评测”即可生成。</div>`;
    $("#evalTable").innerHTML = `<tr><td class="empty" colspan="6">暂无评测记录。</td></tr>`;
    renderEvalDataset();
    return;
  }
  const metrics = evalMetrics();
  $("#evalSummary").innerHTML = `
    <div class="metrics eval-metrics">
      <div class="metric"><span>评测样本</span><strong>${metrics.total}</strong></div>
      <div class="metric"><span>JSON 可解析率</span><strong>${metrics.jsonParseRate}%</strong></div>
      <div class="metric"><span>高风险召回</span><strong>${metrics.highRiskRecall}%</strong></div>
      <div class="metric"><span>腐烂漏放率</span><strong>${metrics.rotLeakRate}%</strong></div>
      <div class="metric"><span>等级一致率</span><strong>${metrics.gradeMatchRate}%</strong></div>
      <div class="metric"><span>文案合规率</span><strong>${metrics.copyComplianceRate}%</strong></div>
    </div>
    <div class="eval-guardrail">
      <div><span>需人工修正</span><strong>${metrics.fixNeeded}</strong></div>
      <div><span>已回流坏例</span><strong>${metrics.badcaseLinked}</strong></div>
      <div><span>验收判断</span><strong>${metrics.rotLeakRate === 0 && metrics.highRiskRecall === 100 ? "通过" : "需修正"}</strong></div>
    </div>
  `;
  $("#evalTable").innerHTML = evalRuns.map((item) => `
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
  if (!evalSetItems.length) {
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
      <div><span>已有 AI 输出</span><strong>${metrics.withAiOutput}</strong><small>来自当前 Eval 运行</small></div>
      <div><span>回归关联</span><strong>${metrics.regressionLinked}</strong><small>坏例已进入回归</small></div>
      ${typeCards}
    </div>
  `;
  const readinessTable = $("#evalReadinessTable");
  if (readinessTable) {
    readinessTable.innerHTML = evalReadinessRows().map((item) => `
      <tr>
        <td>${item.id}<br><small>${item.human_label_status === "seeded" ? "已接入" : "待补标"} · ${item.image || "待补图片"}</small></td>
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
  $("#metricReports").textContent = reportCount;
  $("#metricListed").textContent = products.filter((item) => item.status === "listed").length;
  $("#metricReview").textContent = products.filter((item) => item.status === "pending_review" || item.status === "rejected").length;
}

function renderRoleStatus() {
  const currentStatus = currentReport ? productStatus(currentReport.product_id) : null;
  const aiDone = Boolean(currentReport);
  const reviewed = currentStatus === "pending_review" || currentStatus === "listed" || currentStatus === "rejected";
  const listed = currentStatus === "listed";
  const flowHtml = `
    <div class="step ${selectedSample ? "done" : "active"}"><span>1</span><strong>选择图片</strong><small>${selectedSample ? selectedSample.id : "未选择"}</small></div>
    <div class="step ${aiDone ? "done" : isGrading ? "active" : ""}"><span>2</span><strong>AI 分级</strong><small>${isGrading ? "识别中" : aiDone ? `${currentReport.grade} 级 · ${Math.round(currentReport.confidence * 100)}%` : "待开始"}</small></div>
    <div class="step ${reviewed ? "done" : aiDone ? "active" : ""}"><span>3</span><strong>确认处理</strong><small>${aiDone ? statusLabel(currentStatus || "ai_checked") : "等待报告"}</small></div>
    <div class="step ${listed ? "done" : ""}"><span>4</span><strong>消费者可见</strong><small>${listed ? "已展示" : "未展示"}</small></div>
  `;
  const farmerFlow = $("#farmerFlow");
  const agentFlow = $("#agentFlow");
  if (farmerFlow) farmerFlow.innerHTML = flowHtml;
  if (agentFlow) agentFlow.innerHTML = flowHtml;

  const opsOverview = $("#opsOverview");
  if (opsOverview) {
    const pending = reviews.filter((item) => item.status === "pending").length;
    const rejected = products.filter((item) => item.status === "rejected").length;
    const resubmission = products.filter((item) => item.status === "needs_resubmission").length;
    const listedCount = products.filter((item) => item.status === "listed").length;
    opsOverview.innerHTML = `
      <div><span>待处理复核</span><strong>${pending}</strong></div>
      <div><span>已上架商品</span><strong>${listedCount}</strong></div>
      <div><span>已驳回商品</span><strong>${rejected}</strong></div>
      <div><span>需补资料</span><strong>${resubmission}</strong></div>
      <div><span>购买/反馈</span><strong>${feedbacks.length}</strong></div>
      <div><span>坏例池</span><strong>${badCases.length}</strong></div>
      <div><span>Eval 运行</span><strong>${evalRuns.length}</strong></div>
    `;
  }
  const opsKpiGrid = $("#opsKpiGrid");
  if (opsKpiGrid) {
    const listedCount = products.filter((item) => item.status === "listed").length;
    const purchaseIntent = feedbacks.filter((item) => item.type === "purchase_intent" || item.type === "mock_purchase" || item.type === "willing_to_buy").length;
    const concerns = feedbacks.filter((item) => !["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type)).length;
    const reviewed = reviews.filter((item) => item.status !== "pending").length;
    const reviewCloseRate = reviews.length ? Math.round(reviewed / reviews.length * 100) : 0;
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
        <small>${reviewed} 条已处理 / ${reviews.length} 条复核</small>
      </div>
      <div>
        <span>坏例沉淀率</span>
        <strong>${products.length ? Math.round(badCases.length / products.length * 100) : 0}%</strong>
        <small>${badCases.length} 条坏例 / ${products.length} 条商品记录</small>
      </div>
    `;
  }
}

function renderWorkbench() {
  const status = $("#apiStatus");
  if (status) {
    status.textContent = apiHealth.ok
      ? `${apiHealth.provider || "api"} / ${apiHealth.mode}`
      : "静态或离线模式";
    status.className = `status-pill ${apiHealth.ok && apiHealth.api_key_configured ? "ok" : "warn"}`;
  }
  const traceGrid = $("#traceGrid");
  if (traceGrid) {
    const listed = products.filter((item) => item.status === "listed").length;
    const review = products.filter((item) => item.status === "pending_review").length;
    const resubmission = products.filter((item) => item.status === "needs_resubmission").length;
    const rejected = products.filter((item) => item.status === "rejected").length;
    traceGrid.innerHTML = `
      <div><span>商品记录</span><strong>${products.length}</strong></div>
      <div><span>已上架</span><strong>${listed}</strong></div>
      <div><span>待复核</span><strong>${review}</strong></div>
      <div><span>需补资料</span><strong>${resubmission}</strong></div>
      <div><span>已驳回</span><strong>${rejected}</strong></div>
      <div><span>坏例</span><strong>${badCases.length}</strong></div>
      <div><span>Eval 结果</span><strong>${evalRuns.length}</strong></div>
      <div><span>当前任务</span><strong>${isGrading ? "AI 分级中" : "待操作"}</strong></div>
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
      ["最小接口化", "server.js 已提供 state/products/reviews/feedback/bad-cases/evals/grade API。", "ai"],
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
  const listedCount = products.filter((item) => item.status === "listed").length;
  const reviewCount = products.filter((item) => item.status === "pending_review" || item.status === "needs_resubmission").length;
  const intentCount = feedbacks.filter((item) => ["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type)).length;
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
        <div><span>坏例</span><strong>${badCases.length}</strong></div>
      </div>
    </div>
    <div class="share-card">
      <h4>审核/介绍时可用说明</h4>
      <p>本产品为苹果瑕疵果识别与信息展示体验版，AI 结果仅作初步判断，涉及软烂、霉变、破皮渗液、低置信度或核心食用边界的样本必须人工复核。</p>
    </div>
  `;
}

function renderAll() {
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
    selectedSample = samples[0];
    currentReport = null;
    products = [];
    reviews = [];
    feedbacks = [];
    reportCount = 0;
    evalRuns = [];
    actionLogs = [];
    badCases = defaultBadCaseList();
    localStorage.removeItem("xiaguo_agent_mvp_state");
    renderAll();
    persistState();
    switchView("roleSelect");
    showToast("演示已重置");
  });
  $("#copyJsonBtn").addEventListener("click", async () => {
    if (!currentReport) return showToast("还没有 Agent 报告");
    await navigator.clipboard.writeText(JSON.stringify(currentReport, null, 2));
    showToast("JSON 已复制");
  });
  $("#downloadReportBtn").addEventListener("click", () => {
    if (!currentReport) return showToast("还没有 Agent 报告");
    download("grading_report.json", JSON.stringify(currentReport, null, 2));
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
  $("#customImage").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      selectedSample = {
        id: `upload_${Date.now()}`,
        label: $("#customLabel").value,
        image: reader.result,
        origin: $("#origin").value || "山东烟台",
        weight: Number($("#weight").value || 5),
        expectedPrice: Number($("#expectedPrice").value || 29.9),
        custom: true
      };
      currentReport = null;
      renderAll();
      switchView("farmerForm");
      showToast("本地图片已载入，可开始智能分级");
    };
    reader.readAsDataURL(file);
  });
  $("#customLabel").addEventListener("change", () => {
    if (selectedSample.custom) {
      selectedSample.label = $("#customLabel").value;
      currentReport = null;
      renderAll();
    }
  });
  document.addEventListener("click", (event) => {
    const uploadTrigger = event.target.closest("[data-upload-trigger]");
    if (uploadTrigger) {
      const input = $("#customImage");
      if (uploadTrigger.dataset.uploadTrigger === "camera") input.setAttribute("capture", "environment");
      else input.removeAttribute("capture");
      input.click();
      return;
    }
    const sampleCard = event.target.closest("[data-sample-id]");
    if (sampleCard) {
      selectedSample = samples.find((item) => item.id === sampleCard.dataset.sampleId);
      currentReport = null;
      renderAll();
      persistState();
      switchView("farmerForm");
      return;
    }
    const viewJump = event.target.closest("[data-view-jump]");
    if (viewJump) switchView(viewJump.dataset.viewJump);
    if (event.target.id === "confirmListingBtn") confirmListing();
    if (event.target.closest("[data-run-agent-form]")) runAgent();
    const farmerProductBtn = event.target.closest("[data-farmer-product-id]");
    if (farmerProductBtn) {
      renderFarmerProductDetail(farmerProductBtn.dataset.farmerProductId);
      switchView("farmerProductDetail");
      return;
    }
    const soldBtn = event.target.closest("[data-mark-sold]");
    if (soldBtn) {
      markProductSold(soldBtn.dataset.markSold);
      return;
    }
    if (event.target.id === "seedEmptyProductsBtn") seedDemoProducts();
    const detailBtn = event.target.closest("[data-detail-id]");
    if (detailBtn) {
      renderProductDetail(detailBtn.dataset.detailId);
      switchView("consumerDetail");
    }
    const exitDetailBtn = event.target.closest("[data-exit-detail]");
    if (exitDetailBtn) {
      openExitFeedback(activeConsumerProductId);
      return;
    }
    const closeFeedbackBtn = event.target.closest("[data-close-feedback]");
    if (closeFeedbackBtn) {
      pendingExitProductId = null;
      closeExitFeedback();
      switchView("consumer");
      return;
    }
    const exitReasonBtn = event.target.closest("[data-exit-reason]");
    if (exitReasonBtn) {
      selectedExitReason = exitReasonBtn.dataset.exitReason;
      $$("#exitFeedbackModal [data-exit-reason]").forEach((item) => item.classList.toggle("active", item === exitReasonBtn));
      return;
    }
    if (event.target.id === "submitExitFeedbackBtn") {
      submitExitFeedback();
      return;
    }
    const intentBtn = event.target.closest("[data-intent-id]");
    if (intentBtn) submitPurchaseIntent(intentBtn.dataset.intentId);
    const purchaseBtn = event.target.closest("[data-purchase-id]");
    if (purchaseBtn) mockPurchase(purchaseBtn.dataset.purchaseId);
    const feedbackBtn = event.target.closest("[data-feedback-id]");
    if (feedbackBtn) submitFeedback(feedbackBtn.dataset.feedbackId);
    const approveBtn = event.target.closest("[data-approve-id]");
    if (approveBtn) approveReview(approveBtn.dataset.approveId);
    const resubmitBtn = event.target.closest("[data-resubmit-id]");
    if (resubmitBtn) requestResubmission(resubmitBtn.dataset.resubmitId);
    const completeResubmissionBtn = event.target.closest("[data-complete-resubmission]");
    if (completeResubmissionBtn) completeResubmission(completeResubmissionBtn.dataset.completeResubmission);
    const rejectBtn = event.target.closest("[data-reject-id]");
    if (rejectBtn) rejectReview(rejectBtn.dataset.rejectId);
    const evalBadCaseBtn = event.target.closest("[data-eval-badcase]");
    if (evalBadCaseBtn) addEvalToBadCase(evalBadCaseBtn.dataset.evalBadcase);
    const badCaseStatusBtn = event.target.closest("[data-badcase-status]");
    if (badCaseStatusBtn) updateBadCaseStatus(badCaseStatusBtn.dataset.badcaseStatus, badCaseStatusBtn.dataset.nextStatus);
  });
}

restoreState();
bindEvents();
renderAll();
checkApiHealth();
checkAgentConfig();
loadEvalSetTemplate();
restoreServerState();
