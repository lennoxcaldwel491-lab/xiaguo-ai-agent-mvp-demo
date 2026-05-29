const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const STATE_FILE = path.join(DATA_DIR, "app_state.json");

loadEnvFile(path.join(ROOT, ".env.local"));

const PORT = Number(process.env.PORT || 8787);
const VISION_PROVIDER = process.env.VISION_PROVIDER || "qwen";
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || "";
const DASHSCOPE_MODEL = process.env.DASHSCOPE_MODEL || "qwen-vl-max";
const DASHSCOPE_BASE_URL = process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
const AGENT_CONTRACT_VERSION = "apple-grading-v1";
const OUTPUT_FIELDS = [
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
  "next_action"
];
const GUARDRAILS = [
  "defect_type 为 rot_defect 时，grade 必须为 blocked，review_required 必须为 true",
  "edible_safety 为 risk 时，next_action 不能是 confirm_listing",
  "confidence < 0.7 时，必须进入人工复核",
  "消费者文案不能包含绝对安全承诺",
  "禁售或高风险商品不能生成可购买式消费者文案"
];

const rules = {
  fresh: {
    defect_label: "无明显瑕疵",
    business_defect: "外观完整",
    grade: "A",
    edible_safety: "safe",
    safety_label: "不影响食用",
    price_suggestion: "市场价 90%-100%",
    review_required: false,
    risk_flags: [],
    consumer_copy: "这批苹果外观完整度较高，未发现明显瑕疵，适合家庭鲜食或日常水果补充。"
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

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function send(res, status, payload, type = "application/json;charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
  });
  res.end(Buffer.isBuffer(payload) || typeof payload === "string" ? payload : JSON.stringify(payload));
}

function defaultState() {
  return {
    currentReport: null,
    products: [],
    reviews: [],
    feedbacks: [],
    reportCount: 0,
    evalRuns: [],
    badCases: [],
    actionLogs: [],
    updatedAt: null
  };
}

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(defaultState(), null, 2), "utf8");
  }
}

function readState() {
  ensureDataStore();
  try {
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
  } catch (error) {
    return defaultState();
  }
}

function writeState(nextState) {
  ensureDataStore();
  const cleanState = {
    ...defaultState(),
    ...nextState,
    updatedAt: nextState.updatedAt || new Date().toISOString()
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(cleanState, null, 2), "utf8");
  return cleanState;
}

function upsertById(list, item) {
  if (!item || !item.id) return list;
  return [item, ...list.filter((entry) => entry.id !== item.id)];
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function fallbackGrade(input, source = "api_fallback_mock", meta = {}) {
  const label = rules[input.mock_label] ? input.mock_label : "rot_defect";
  const rule = rules[label];
  const confidence = label === "rot_defect" ? 0.68 : label === "bruise_defect" ? 0.76 : label === "scab_defect" ? 0.84 : 0.9;
  const reviewRequired = rule.review_required || confidence < 0.7;
  return applyAgentContract({
    mock_source: source,
    fruit_type: "apple",
    defect_type: label,
    defect_label: rule.defect_label,
    business_defect: rule.business_defect,
    grade: rule.grade,
    confidence,
    edible_safety: rule.edible_safety,
    safety_label: rule.safety_label,
    price_suggestion: rule.price_suggestion,
    farmer_explanation: rule.grade === "blocked"
      ? "系统识别到疑似腐烂，存在食品安全风险，不建议直接上架，需平台人工复核。"
      : `系统识别到${rule.defect_label}，建议按 ${rule.grade} 级瑕疵果处理。`,
    consumer_copy: rule.consumer_copy,
    review_required: reviewRequired,
    risk_flags: reviewRequired ? Array.from(new Set([...rule.risk_flags, "manual_review_required"])) : [],
    next_action: reviewRequired ? "manual_review" : "confirm_listing",
    agent_status: source.includes("fallback") || source.includes("error") ? "fallback" : "ok",
    fallback_reason: meta.fallback_reason || "",
    parse_repaired: Boolean(meta.parse_repaired),
    model_error: meta.model_error || ""
  }, input);
}

function buildAgentPrompt(input) {
  return [
    "你是“瑕果智选”的苹果瑕疵果分级 Agent，只做初步判断，不做最终食品安全承诺。",
    "任务：根据图片和农户字段识别可见瑕疵，并映射到平台业务等级。",
    "分级规则：fresh=A；scab_defect=B；bruise_defect=C 且需复核；rot_defect=blocked 且强制复核。",
    "可选 defect_type: fresh, scab_defect, bruise_defect, rot_defect, unknown。",
    "可选 grade: A, B, C, blocked。",
    "硬性护栏：疑似腐烂、霉变、破皮渗液、低置信度必须 review_required=true。",
    "消费者文案禁止出现“绝对安全”“保证无风险”“完全没问题”等绝对承诺。",
    `农户字段: 产地=${input.origin}; 重量=${input.weight}kg; 采摘时间=${input.harvest_date}; 期望售价=${input.expected_price}; 备注=${input.farmer_note || "无"}`,
    `输出必须是 JSON object，字段必须包含: ${OUTPUT_FIELDS.join(", ")}。`,
    "不要输出 Markdown，不要解释，不要包裹代码块。"
  ].join("\n");
}

function hasAbsoluteSafetyClaim(text = "") {
  return ["绝对安全", "保证无风险", "完全没问题", "百分百安全", "一定安全"].some((word) => String(text).includes(word));
}

function validateAgentContract(result) {
  const violations = [];
  for (const field of OUTPUT_FIELDS) {
    if (!(field in result)) violations.push(`missing_${field}`);
  }
  if (result.fruit_type !== "apple") violations.push("fruit_type_must_be_apple");
  if (!rules[result.defect_type]) violations.push("unknown_defect_type");
  if (!["A", "B", "C", "blocked"].includes(result.grade)) violations.push("invalid_grade");
  if (!["safe", "caution", "risk"].includes(result.edible_safety)) violations.push("invalid_edible_safety");
  if (typeof result.review_required !== "boolean") violations.push("review_required_must_be_boolean");
  if (!Array.isArray(result.risk_flags)) violations.push("risk_flags_must_be_array");
  if (!["confirm_listing", "manual_review"].includes(result.next_action)) violations.push("invalid_next_action");
  if (hasAbsoluteSafetyClaim(result.consumer_copy)) violations.push("absolute_safety_claim");
  return violations;
}

function parseModelJson(text) {
  const raw = String(text || "").trim();
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return { value: JSON.parse(cleaned), repaired: false };
  } catch (firstError) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = cleaned.slice(start, end + 1);
      try {
        return { value: JSON.parse(sliced), repaired: true };
      } catch (secondError) {
        throw new Error(`JSON parse failed: ${secondError.message}`);
      }
    }
    throw new Error(`JSON parse failed: ${firstError.message}`);
  }
}

function applyAgentContract(result, input = {}) {
  const defectType = rules[result.defect_type] ? result.defect_type : (rules[input.mock_label] ? input.mock_label : "rot_defect");
  const rule = rules[defectType] || rules.rot_defect;
  const confidence = Math.max(0, Math.min(1, Number(result.confidence ?? 0.5)));
  const safety = ["safe", "caution", "risk"].includes(result.edible_safety) ? result.edible_safety : rule.edible_safety;
  const rawGrade = ["A", "B", "C", "blocked"].includes(result.grade) ? result.grade : rule.grade;
  const guardrailActions = [];
  const forcedReview = rule.review_required || confidence < 0.7 || safety === "risk" || defectType === "rot_defect";
  let grade = rawGrade;
  let nextAction = result.next_action === "confirm_listing" ? "confirm_listing" : "manual_review";
  let consumerCopy = String(result.consumer_copy || rule.consumer_copy || "");

  if (defectType === "rot_defect" || safety === "risk") {
    grade = "blocked";
    nextAction = "manual_review";
    consumerCopy = "";
    guardrailActions.push("force_block_high_risk");
  }
  if (confidence < 0.7 || forcedReview) {
    nextAction = "manual_review";
    guardrailActions.push("force_manual_review");
  }
  if (hasAbsoluteSafetyClaim(consumerCopy)) {
    consumerCopy = consumerCopy
      .replace(/绝对安全|保证无风险|完全没问题|百分百安全|一定安全/g, "基于图片初步判断");
    guardrailActions.push("rewrite_absolute_safety_claim");
  }

  const normalized = {
    fruit_type: "apple",
    defect_type: defectType,
    defect_label: result.defect_label || rule.defect_label,
    business_defect: result.business_defect || rule.business_defect,
    grade,
    confidence,
    edible_safety: safety,
    safety_label: result.safety_label || rule.safety_label,
    price_suggestion: String(result.price_suggestion || rule.price_suggestion),
    farmer_explanation: result.farmer_explanation || fallbackFarmerExplanation(rule, input),
    consumer_copy: consumerCopy,
    review_required: Boolean(result.review_required || forcedReview || nextAction === "manual_review"),
    risk_flags: Array.from(new Set([...(Array.isArray(result.risk_flags) ? result.risk_flags : []), ...(forcedReview ? rule.risk_flags : [])])),
    next_action: nextAction,
    mock_source: result.mock_source || `${VISION_PROVIDER}_vision_api`,
    agent_status: result.agent_status || "ok",
    fallback_reason: result.fallback_reason || "",
    parse_repaired: Boolean(result.parse_repaired),
    model_error: result.model_error || ""
  };
  return {
    ...normalized,
    contract_version: AGENT_CONTRACT_VERSION,
    contract_violations: validateAgentContract(normalized),
    guardrail_actions: Array.from(new Set(guardrailActions))
  };
}

function fallbackFarmerExplanation(rule, input = {}) {
  if (rule.grade === "blocked") {
    return "系统识别到疑似高风险瑕疵，不建议直接上架，需平台人工复核。";
  }
  return `系统识别到${rule.defect_label}，建议按 ${rule.grade} 级瑕疵果处理。`;
}

function imageToModelUrl(image) {
  if (!image) throw new Error("Missing image");
  if (/^data:image\//.test(image) || /^https?:\/\//.test(image)) return image;
  const cleanPath = image.replace(/^\.?[\\/]/, "");
  const filePath = path.resolve(ROOT, cleanPath);
  if (!filePath.startsWith(ROOT)) throw new Error("Image path is outside project");
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const base64 = fs.readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${base64}`;
}

async function callQwenVl(input) {
  const imageUrl = imageToModelUrl(input.image);
  const prompt = buildAgentPrompt(input);

  const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DASHSCOPE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DASHSCOPE_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: prompt }
        ]
      }],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    throw new Error(`DashScope API ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";
  const parsed = parseModelJson(text);
  return {
    ...parsed.value,
    parse_repaired: parsed.repaired,
    agent_status: parsed.repaired ? "repaired" : "ok"
  };
}

function normalizeResult(result, input) {
  return applyAgentContract(result, input);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  const filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);
  if (!filePath.startsWith(ROOT)) return send(res, 403, "Forbidden", "text/plain;charset=utf-8");
  fs.readFile(filePath, (error, data) => {
    if (error) return send(res, 404, "Not found", "text/plain;charset=utf-8");
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html;charset=utf-8",
      ".js": "text/javascript;charset=utf-8",
      ".css": "text/css;charset=utf-8",
      ".json": "application/json;charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".md": "text/markdown;charset=utf-8"
    };
    send(res, 200, data, types[ext] || "application/octet-stream");
  });
}

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "");
  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = requestUrl.pathname;
  if (pathname === "/api/health") {
    return send(res, 200, {
      ok: true,
      provider: VISION_PROVIDER,
      api_key_configured: Boolean(DASHSCOPE_API_KEY),
      model: DASHSCOPE_MODEL,
      base_url: DASHSCOPE_BASE_URL,
      mode: DASHSCOPE_API_KEY ? "qwen_vl_api" : "fallback_mock",
      contract_version: AGENT_CONTRACT_VERSION,
      output_fields: OUTPUT_FIELDS.length,
      guardrails: GUARDRAILS.length
    });
  }
  if (pathname === "/api/agent/config" && req.method === "GET") {
    const state = readState();
    return send(res, 200, {
      contract_version: AGENT_CONTRACT_VERSION,
      provider: VISION_PROVIDER,
      model: DASHSCOPE_MODEL,
      api_key_configured: Boolean(DASHSCOPE_API_KEY),
      output_fields: OUTPUT_FIELDS,
      guardrails: GUARDRAILS,
      defect_types: Object.keys(rules),
      diagnostics: {
        products: state.products.length,
        reviews: state.reviews.length,
        bad_cases: state.badCases.length,
        eval_results: state.evalRuns.length,
        action_logs: state.actionLogs.length
      },
      prompt_preview: buildAgentPrompt({
        origin: "山东烟台",
        weight: 5,
        harvest_date: "2026-05-20",
        expected_price: 29.9,
        farmer_note: "家庭装"
      })
    });
  }
  if (pathname === "/api/agent/validate" && req.method === "POST") {
    try {
      const body = await readBody(req);
      return send(res, 200, applyAgentContract(body.result || body, body.input || {}));
    } catch (error) {
      return send(res, 400, { ok: false, error: String(error.message || error) });
    }
  }
  if (pathname === "/api/state" && req.method === "GET") {
    return send(res, 200, readState());
  }
  if (pathname === "/api/state" && req.method === "POST") {
    try {
      const state = await readBody(req);
      return send(res, 200, { ok: true, state: writeState(state) });
    } catch (error) {
      return send(res, 400, { ok: false, error: String(error.message || error) });
    }
  }
  if (pathname === "/api/products" && req.method === "GET") {
    return send(res, 200, { products: readState().products });
  }
  if (pathname === "/api/products" && req.method === "POST") {
    const state = readState();
    const product = await readBody(req);
    return send(res, 200, { product, state: writeState({ ...state, products: upsertById(state.products, product) }) });
  }
  if (pathname === "/api/reviews" && req.method === "POST") {
    const state = readState();
    const review = await readBody(req);
    return send(res, 200, { review, state: writeState({ ...state, reviews: upsertById(state.reviews, review) }) });
  }
  const productStatusMatch = pathname.match(/^\/api\/products\/([^/]+)\/status$/);
  if (productStatusMatch && req.method === "PATCH") {
    const state = readState();
    const body = await readBody(req);
    const productId = decodeURIComponent(productStatusMatch[1]);
    const products = state.products.map((product) => product.id === productId ? { ...product, status: body.status || product.status } : product);
    const reviews = state.reviews.map((review) => review.productId === productId ? { ...review, status: body.reviewStatus || review.status, manualReason: body.reason || review.manualReason } : review);
    return send(res, 200, { state: writeState({ ...state, products, reviews }) });
  }
  if (pathname === "/api/feedback" && req.method === "POST") {
    const state = readState();
    const feedback = await readBody(req);
    return send(res, 200, { feedback, state: writeState({ ...state, feedbacks: upsertById(state.feedbacks, feedback) }) });
  }
  if (pathname === "/api/bad-cases" && req.method === "POST") {
    const state = readState();
    const badCase = await readBody(req);
    return send(res, 200, { badCase, state: writeState({ ...state, badCases: upsertById(state.badCases, badCase) }) });
  }
  if (pathname === "/api/evals/run" && req.method === "POST") {
    const state = readState();
    const evalRun = await readBody(req);
    const evalRuns = Array.isArray(evalRun.results) ? evalRun.results : upsertById(state.evalRuns, evalRun);
    return send(res, 200, { evalRun, state: writeState({ ...state, evalRuns }) });
  }
  if (pathname === "/api/grade" && req.method === "POST") {
    try {
      const input = await readBody(req);
      if (!DASHSCOPE_API_KEY) {
        return send(res, 200, fallbackGrade(input, "api_fallback_mock", { fallback_reason: "missing_api_key" }));
      }
      const result = await callQwenVl(input);
      return send(res, 200, normalizeResult(result, input));
    } catch (error) {
      return send(res, 200, {
        ...fallbackGrade({ mock_label: "rot_defect" }, "api_error_fallback", {
          fallback_reason: "api_or_parse_error",
          model_error: String(error.message || error)
        }),
        error: String(error.message || error)
      });
    }
  }
  serveStatic(req, res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`瑕果智选 MVP server running at http://127.0.0.1:${PORT}`);
  console.log(DASHSCOPE_API_KEY ? `Qwen-VL API mode enabled with model ${DASHSCOPE_MODEL}.` : "DASHSCOPE_API_KEY not set; API mode will return fallback mock results.");
});
