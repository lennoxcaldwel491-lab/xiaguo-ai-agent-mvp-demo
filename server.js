const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const BACKEND_URL = process.env.XIAGUO_BACKEND_URL || "http://127.0.0.1:8787";
const STATIC_INDEX = path.join(ROOT, "index.html");
const STARTED_AT = new Date().toISOString();

const demoState = {
  currentReport: null,
  products: [],
  reviews: [],
  feedbacks: [],
  badCases: [],
  evalRuns: [],
  actionLogs: [],
  updatedAt: STARTED_AT
};

const ruleMap = {
  fresh: {
    defect_label: "无明显瑕疵",
    business_defect: "外观完整",
    grade: "A",
    edible_safety: "safe",
    safety_label: "不影响食用",
    price_suggestion: "市场价 90%-100%",
    review_required: false,
    risk_flags: [],
    consumer_copy: "这批苹果外观完整度较高，适合家庭鲜食或日常水果补充。"
  },
  scab_defect: {
    defect_label: "果锈/疮痂斑",
    business_defect: "表皮瑕疵",
    grade: "B",
    edible_safety: "safe",
    safety_label: "通常不影响果肉食用",
    price_suggestion: "市场价 65%-80%",
    review_required: false,
    risk_flags: [],
    consumer_copy: "这批苹果表皮有果锈或疮痂斑，外观不如优果完整，但通常不影响果肉和日常食用。"
  },
  bruise_defect: {
    defect_label: "轻微碰伤",
    business_defect: "果面局部碰伤",
    grade: "C",
    edible_safety: "caution",
    safety_label: "建议尽快食用",
    price_suggestion: "市场价 50%-65%",
    review_required: true,
    risk_flags: ["bruise_area_needs_human_check"],
    consumer_copy: "这批苹果存在局部轻微碰伤，建议收到后优先食用或用于榨汁、果切。"
  },
  rot_defect: {
    defect_label: "疑似腐烂",
    business_defect: "食品安全风险",
    grade: "blocked",
    edible_safety: "risk",
    safety_label: "存在食用安全风险",
    price_suggestion: "不建议销售",
    review_required: true,
    risk_flags: ["possible_food_safety_risk", "forced_review"],
    consumer_copy: ""
  }
};

function send(res, status, payload, type = "application/json;charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS"
  });
  res.end(Buffer.isBuffer(payload) || typeof payload === "string" ? payload : JSON.stringify(payload));
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html;charset=utf-8",
    ".js": "text/javascript;charset=utf-8",
    ".css": "text/css;charset=utf-8",
    ".json": "application/json;charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".md": "text/markdown;charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
  }[ext] || "application/octet-stream";
}

function isStaticPath(pathname) {
  return !pathname.startsWith("/api/");
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const body = await readRequestBody(req);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString("utf8"));
  } catch (error) {
    return {};
  }
}

function touchState() {
  demoState.updatedAt = new Date().toISOString();
  return demoState;
}

function writeAuditLog(action, payload = {}, targetType = "demo", targetId = "") {
  demoState.actionLogs.unshift({
    id: `log_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    action,
    targetType,
    targetId,
    payload,
    createdAt: new Date().toISOString()
  });
  demoState.actionLogs = demoState.actionLogs.slice(0, 80);
}

function inferDefectType(input = {}) {
  const text = `${input.defect_type || ""} ${input.fileName || ""} ${input.image_url || ""}`.toLowerCase();
  if (text.includes("rot")) return "rot_defect";
  if (text.includes("bruise")) return "bruise_defect";
  if (text.includes("scab")) return "scab_defect";
  if (text.includes("fresh")) return "fresh";
  return input.defectType || input.defect_type || "scab_defect";
}

function buildGradeResult(input = {}) {
  const defectType = inferDefectType(input);
  const rule = ruleMap[defectType] || ruleMap.scab_defect;
  return {
    run_id: `run_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    run_source: "node_demo_fallback",
    fruit_type: "apple",
    defect_type: defectType,
    confidence: defectType === "fresh" ? 0.92 : 0.84,
    farmer_explanation: `${rule.defect_label}：${rule.safety_label}。建议按 ${rule.price_suggestion} 进行陈列或复核。`,
    next_action: rule.review_required ? "manual_review" : "confirm_listing",
    ...rule
  };
}

function upsertById(list, item) {
  const id = item.id || `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const next = { ...item, id };
  const index = list.findIndex((entry) => entry.id === id);
  if (index >= 0) list[index] = { ...list[index], ...next };
  else list.unshift(next);
  return next;
}

async function handleFallbackApi(req, res, requestUrl) {
  const pathname = requestUrl.pathname;
  if (req.method === "GET" && pathname === "/api/health") {
    return send(res, 200, {
      ok: true,
      provider: process.env.VISION_PROVIDER || "qwen",
      api_key_configured: Boolean(process.env.DASHSCOPE_API_KEY),
      mode: "node_demo_fallback",
      contract_version: "apple-grading-v1",
      prompt_version: "v0.1",
      rule_version: "apple-rule-v0.1",
      started_at: STARTED_AT
    });
  }
  if (req.method === "GET" && pathname === "/api/agent/config") {
    return send(res, 200, {
      contract_version: "apple-grading-v1",
      prompt_version: "v0.1",
      rule_version: "apple-rule-v0.1",
      provider: process.env.VISION_PROVIDER || "qwen",
      model: process.env.DASHSCOPE_MODEL || "qwen-vl-max",
      api_key_configured: Boolean(process.env.DASHSCOPE_API_KEY),
      defect_types: Object.keys(ruleMap),
      guardrails: [
        "腐烂风险强制拦截",
        "低置信度进入人工复核",
        "消费者文案不做绝对安全承诺"
      ],
      diagnostics: {
        products: demoState.products.length,
        reviews: demoState.reviews.length,
        feedbacks: demoState.feedbacks.length,
        bad_cases: demoState.badCases.length,
        eval_results: demoState.evalRuns.length,
        action_logs: demoState.actionLogs.length
      }
    });
  }
  if (req.method === "GET" && pathname === "/api/state") return send(res, 200, demoState);
  if (req.method === "POST" && pathname === "/api/state") {
    Object.assign(demoState, await readJson(req));
    return send(res, 200, { ok: true, state: touchState() });
  }
  if (req.method === "GET" && pathname === "/api/products") return send(res, 200, { products: demoState.products });
  if (req.method === "POST" && pathname === "/api/products") {
    const product = upsertById(demoState.products, await readJson(req));
    writeAuditLog("product.upsert", product, "product", product.id);
    return send(res, 200, { product, state: touchState() });
  }
  const statusMatch = pathname.match(/^\/api\/products\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const payload = await readJson(req);
    const productId = decodeURIComponent(statusMatch[1]);
    const product = demoState.products.find((item) => item.id === productId);
    if (product) product.status = payload.status;
    for (const review of demoState.reviews) {
      if (review.productId === productId && payload.reviewStatus) review.status = payload.reviewStatus;
      if (review.productId === productId && payload.reason) review.manualReason = payload.reason;
    }
    writeAuditLog("product.status", payload, "product", productId);
    return send(res, 200, { state: touchState() });
  }
  if (req.method === "POST" && pathname === "/api/reviews") {
    const review = upsertById(demoState.reviews, await readJson(req));
    writeAuditLog("review.upsert", review, "review", review.id);
    return send(res, 200, { review, state: touchState() });
  }
  if (req.method === "POST" && pathname === "/api/feedback") {
    const feedback = upsertById(demoState.feedbacks, await readJson(req));
    writeAuditLog("feedback.upsert", feedback, "feedback", feedback.id);
    return send(res, 200, { feedback, state: touchState() });
  }
  if (req.method === "POST" && pathname === "/api/bad-cases") {
    const badCase = upsertById(demoState.badCases, await readJson(req));
    writeAuditLog("badcase.upsert", badCase, "bad_case", badCase.id);
    return send(res, 200, { badCase, state: touchState() });
  }
  if (req.method === "GET" && pathname === "/api/traces") return send(res, 200, { traces: [] });
  if (req.method === "POST" && pathname === "/api/grade") {
    const result = buildGradeResult(await readJson(req));
    demoState.currentReport = result;
    writeAuditLog("grade.run", { run_id: result.run_id }, "grading_run", result.run_id);
    return send(res, 200, result);
  }
  if (req.method === "POST" && pathname === "/api/evals/run") {
    const evalRun = {
      run_id: `eval_${Date.now()}`,
      mode: "node_demo_fallback",
      passed: true,
      summary: "线上演示兜底评测已完成",
      createdAt: new Date().toISOString()
    };
    demoState.evalRuns.unshift(evalRun);
    return send(res, 200, { evalRun, state: touchState() });
  }
  return send(res, 404, { error: "api_not_found", path: pathname });
}

async function proxyToBackend(req, res, pathname) {
  const url = new URL(req.url, BACKEND_URL);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(","));
    } else {
      headers.set(key, value);
    }
  }
  headers.delete("host");

  const init = {
    method: req.method,
    headers
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(req.method || "GET")) {
    init.body = await readRequestBody(req);
  }

  const backendResponse = await fetch(url, init);
  const body = Buffer.from(await backendResponse.arrayBuffer());
  const responseHeaders = {};
  backendResponse.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  res.writeHead(backendResponse.status, responseHeaders);
  res.end(body);
}

function serveStatic(req, res, pathname) {
  const candidate = pathname === "/" ? STATIC_INDEX : path.join(ROOT, pathname);
  const resolved = path.resolve(candidate);
  if (!resolved.startsWith(ROOT)) {
    return send(res, 403, { error: "forbidden" });
  }
  fs.readFile(resolved, (error, data) => {
    if (error) {
      if (pathname !== "/") return send(res, 404, "Not found", "text/plain;charset=utf-8");
      fs.readFile(STATIC_INDEX, (indexError, indexData) => {
        if (indexError) return send(res, 404, "Not found", "text/plain;charset=utf-8");
        send(res, 200, indexData, contentTypeFor(STATIC_INDEX));
      });
      return;
    }
    send(res, 200, data, contentTypeFor(resolved));
  });
}

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    return send(res, 204, "");
  }
  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = requestUrl.pathname;
  try {
    if (pathname.startsWith("/api/")) {
      try {
        return await proxyToBackend(req, res, pathname);
      } catch (error) {
        console.warn(`Backend unavailable, using Node fallback for ${pathname}:`, error.message || error);
        return await handleFallbackApi(req, res, requestUrl);
      }
    }
    return serveStatic(req, res, pathname);
  } catch (error) {
    console.error("Request failed:", error);
    return send(res, 502, { error: String(error.message || error) });
  }
}).listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  console.log(`Xiaguo frontend server running at http://${displayHost}:${PORT}`);
  console.log(`Proxying API requests to ${BACKEND_URL}`);
});
