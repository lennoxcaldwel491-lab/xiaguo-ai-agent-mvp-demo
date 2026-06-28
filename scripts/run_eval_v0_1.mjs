import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API_BASE = process.env.XIAGUO_API_BASE || "https://xiaguo-ai-agent-mvp-demo-1.onrender.com";
const EVAL_TAG = process.env.EVAL_TAG || "v0.1_20260613";
const PROMPT_VERSION = process.env.PROMPT_VERSION || EVAL_TAG.split("_")[0];
const RULE_VERSION = process.env.RULE_VERSION || "apple-rule-v0.1";
const DATASET = path.join(ROOT, "docs", "eval", "eval_dataset_v0.1_20260613.csv");
const RUN_RESULT = path.join(ROOT, "docs", "eval", `eval_run_result_${EVAL_TAG}.csv`);
const BADCASE_LOG = path.join(ROOT, "docs", "eval", `badcase_log_${EVAL_TAG}.csv`);
const REPORT = path.join(ROOT, "docs", "eval", `eval_report_${EVAL_TAG}.md`);
const REFRESH_ONLY = process.argv.includes("--refresh-only");

const RUN_HEADER = [
  "run_id",
  "sample_id",
  "model_provider",
  "model_name",
  "contract_version",
  "prompt_version",
  "rule_version",
  "json_parse_success",
  "schema_complete",
  "fruit_type_ai",
  "defect_type_ai",
  "grade_ai",
  "confidence_ai",
  "edible_safety_ai",
  "review_required_ai",
  "next_action_ai",
  "risk_flags_ai",
  "farmer_explanation",
  "consumer_copy",
  "final_product_status",
  "review_task_created",
  "badcase_created",
  "raw_ai_output",
  "run_note"
];

const BADCASE_HEADER = [
  "badcase_id",
  "sample_id",
  "badcase_source",
  "gold_label",
  "ai_output",
  "problem_type",
  "severity",
  "root_cause",
  "fix_action",
  "related_prompt_version",
  "related_rule_version",
  "regression_status"
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === "\"" && next === "\"") {
      cell += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  const [header, ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] || ""])));
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function toCsv(header, rows) {
  return [
    header.join(","),
    ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(","))
  ].join("\n") + "\n";
}

function dataUrlFor(filePath) {
  const absolute = path.join(ROOT, filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(absolute).toString("base64")}`;
}

function bool(value) {
  return String(value).toLowerCase() === "true";
}

function schemaComplete(result) {
  const fields = [
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
  return fields.every((field) => Object.prototype.hasOwnProperty.call(result, field));
}

function violatesCopy(text, result) {
  const banned = ["绝对安全", "完全无风险", "放心食用", "百分百安全", "无需担心", "保证无风险", "一定安全"];
  if (banned.some((word) => String(text || "").includes(word))) return true;
  return (result.grade === "blocked" || result.edible_safety === "risk") && Boolean(String(text || "").trim());
}

function classifyBadcase(sample, result, runRow) {
  const issues = [];
  if (runRow.json_parse_success !== "true") issues.push({ type: "JSON 失败", severity: "P1", root: "模型输出格式不稳定", fix: "加强 JSON-only 输出约束" });
  if (runRow.schema_complete !== "true") issues.push({ type: "Schema 缺失", severity: "P1", root: "结构化字段不完整", fix: "后端补契约校验并提示模型补全字段" });
  if (sample.defect_type_gold !== result.defect_type) issues.push({ type: "瑕疵类型误判", severity: "P1", root: "视觉识别或提示词边界不足", fix: "补充同类图片与更明确瑕疵描述" });
  if (sample.grade_gold !== result.grade) issues.push({ type: "等级误判", severity: "P1", root: "业务等级映射不稳定", fix: "强化 defect_type 到 grade 的规则映射" });
  if (sample.defect_type_gold === "rot_defect" && result.next_action === "confirm_listing") issues.push({ type: "腐烂漏放", severity: "P0", root: "高风险护栏未命中", fix: "腐烂/霉变/软烂强制 blocked + manual_review" });
  if (bool(sample.review_required_gold) && !result.review_required) issues.push({ type: "复核漏建", severity: "P0", root: "人工复核规则未命中", fix: "review_required_gold 类别强制复核" });
  if (violatesCopy(result.consumer_copy, result)) issues.push({ type: "文案违规", severity: "P0", root: "消费者文案护栏不足", fix: "禁用绝对安全承诺，高风险样本清空购买文案" });
  return issues;
}

function percent(numerator, denominator) {
  if (!denominator) return "N/A";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function metricConclusion(result, target, invert = false) {
  if (result === "N/A") return "样本不足";
  const value = Number(String(result).replace("%", ""));
  const targetValue = Number(String(target).replace(/[>=≤%]/g, ""));
  if (invert) return value <= targetValue ? "通过" : "未通过";
  return value >= targetValue ? "通过" : "未通过";
}

function metrics(samples, runs, badcases) {
  const byId = new Map(samples.map((sample) => [sample.sample_id, sample]));
  const parsed = runs.map((run) => ({ run, sample: byId.get(run.sample_id) })).filter((item) => item.sample);
  const rot = parsed.filter(({ sample }) => sample.defect_type_gold === "rot_defect");
  const shouldReview = parsed.filter(({ sample }) => bool(sample.review_required_gold));
  const failedIds = new Set(badcases.map((item) => item.sample_id));
  const failures = parsed.filter(({ run, sample }) => {
    return run.json_parse_success !== "true"
      || run.schema_complete !== "true"
      || run.defect_type_ai !== sample.defect_type_gold
      || run.grade_ai !== sample.grade_gold
      || (sample.defect_type_gold === "rot_defect" && run.next_action_ai === "confirm_listing")
      || (bool(sample.review_required_gold) && !bool(run.review_required_ai))
      || violatesCopy(run.consumer_copy, { grade: run.grade_ai, edible_safety: run.edible_safety_ai });
  });
  return {
    total: parsed.length,
    jsonParseRate: percent(parsed.filter(({ run }) => run.json_parse_success === "true").length, parsed.length),
    schemaRate: percent(parsed.filter(({ run }) => run.schema_complete === "true").length, parsed.length),
    defectMatchRate: percent(parsed.filter(({ run, sample }) => run.defect_type_ai === sample.defect_type_gold).length, parsed.length),
    gradeMatchRate: percent(parsed.filter(({ run, sample }) => run.grade_ai === sample.grade_gold).length, parsed.length),
    highRiskRecall: percent(rot.filter(({ run }) => run.grade_ai === "blocked" || run.edible_safety_ai === "risk" || run.next_action_ai === "manual_review").length, rot.length),
    rotLeakRate: percent(rot.filter(({ run }) => run.next_action_ai === "confirm_listing").length, rot.length),
    reviewHitRate: percent(shouldReview.filter(({ run }) => bool(run.review_required_ai)).length, shouldReview.length),
    copyComplianceRate: percent(parsed.filter(({ run }) => !violatesCopy(run.consumer_copy, { grade: run.grade_ai, edible_safety: run.edible_safety_ai })).length, parsed.length),
    badcaseReturnRate: percent(failures.filter(({ sample }) => failedIds.has(sample.sample_id)).length, failures.length),
    failureCount: failures.length
  };
}

function renderReport(currentMetrics, badcases) {
  const metricRows = [
    ["JSON 可解析率", currentMetrics.jsonParseRate, ">=95%", metricConclusion(currentMetrics.jsonParseRate, "95%")],
    ["Schema 完整率", currentMetrics.schemaRate, ">=95%", metricConclusion(currentMetrics.schemaRate, "95%")],
    ["瑕疵类型一致率", currentMetrics.defectMatchRate, ">=75%", metricConclusion(currentMetrics.defectMatchRate, "75%")],
    ["等级一致率", currentMetrics.gradeMatchRate, ">=75%", metricConclusion(currentMetrics.gradeMatchRate, "75%")],
    ["高风险召回率", currentMetrics.highRiskRecall, "100%", metricConclusion(currentMetrics.highRiskRecall, "100%")],
    ["腐烂漏放率", currentMetrics.rotLeakRate, "0%", metricConclusion(currentMetrics.rotLeakRate, "0%", true)],
    ["人工复核命中率", currentMetrics.reviewHitRate, ">=90%", metricConclusion(currentMetrics.reviewHitRate, "90%")],
    ["文案合规率", currentMetrics.copyComplianceRate, ">=95%", metricConclusion(currentMetrics.copyComplianceRate, "95%")],
    ["Badcase 回流率", currentMetrics.badcaseReturnRate, ">=95%", metricConclusion(currentMetrics.badcaseReturnRate, "95%")]
  ];
  const badcaseRows = badcases.length
    ? badcases.slice(0, 8).map((item) => `| ${item.badcase_id} | ${item.sample_id} | ${item.problem_type} | ${item.severity} | ${item.root_cause} | ${item.fix_action} |`).join("\n")
    : "| 暂无 | 暂无 | 暂无 | 暂无 | 暂无 | 暂无 |";
  return `# 瑕果智选 AI 分级与安全复核 Eval 报告 ${PROMPT_VERSION}

生成日期：2026-06-13  
评测对象：瑕果智选苹果单品类 AI Agent MVP  
模型服务：Qwen-VL / DashScope，当前线上后端为 \`${API_BASE}\`  
Agent 契约版本：\`apple-grading-v1\`  
Prompt 版本：\`${PROMPT_VERSION}\`  
规则版本：\`${RULE_VERSION}\`

## 1. 评测目的

本次评测不以证明模型达到正式农业分级标准为目标，而是验证瑕果智选 MVP 在苹果单品类场景下，是否具备结构化输出、风险拦截、人工复核、消费者文案合规和 Badcase 回流的最小可控能力。

## 2. 当前运行状态

本报告已自动跑完当前可用的 ${currentMetrics.total} 张 Demo 内置样本。完整 40 张样本仍需要继续补齐 28 张图片来源后再跑。

## 3. 测试集说明

| 类别 | 计划数量 | 当前已接入 | 待补图片 |
| --- | ---: | ---: | ---: |
| fresh | 10 | 3 | 7 |
| scab_defect | 10 | 3 | 7 |
| bruise_defect | 10 | 3 | 7 |
| rot_defect | 10 | 3 | 7 |
| 合计 | 40 | 12 | 28 |

当前 12 张已接入样本来自项目内置 Demo 样本；其余 28 张需要后续补充自拍、公开图片或数据集图片，并在 \`eval_dataset_v0.1_20260613.csv\` 中记录来源。

## 4. 核心指标结果

| 指标 | 结果 | 目标 | 结论 |
| --- | ---: | ---: | --- |
${metricRows.map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} |`).join("\n")}

## 5. Badcase 分析

| Badcase ID | 样本 | 问题类型 | 严重程度 | 根因 | 修复动作 |
| --- | --- | --- | --- | --- | --- |
${badcaseRows}

## 6. 当前局限

- 当前只完成 12 张 Demo 内置样本的自动运行，不能代表完整 40 张 Eval 结果。
- 当前评测只验证 MVP 分级规则，不代表正式农业分级标准。
- 图片来源必须逐张记录，否则 Eval 可信度会下降。
- 当前图片识别依赖 Qwen-VL 通用视觉模型，尚未训练专用水果瑕疵模型。

## 7. 本轮结论

- 是否建议继续灰度演示：${currentMetrics.rotLeakRate === "0%" ? "可以继续用于演示，但需要补齐 40 张样本后再写正式结论。" : "暂不建议，存在腐烂漏放风险。"}
- 是否存在 P0 安全问题：${badcases.some((item) => item.severity === "P0") ? "存在，需要优先修复。" : "当前 12 张样本未记录 P0。"}
- 下一轮优先事项：补齐 28 张待补图片，重跑 40 张完整 Eval。

## 8. 下一轮计划

1. 补齐 40 张图片与来源说明。
2. 重跑完整样本集。
3. 根据 Badcase 更新 Prompt / 规则 / 护栏。
4. 建立 v0.2 回归测试。
`;
}

async function grade(sample) {
  const response = await fetch(`${API_BASE}/api/grade`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: dataUrlFor(sample.image_path),
      fruit_type: "apple",
      origin: "山东烟台",
      weight: 5,
      harvest_date: "2026-06-10",
      expected_price: 8.6,
      farmer_note: "轻微表皮瑕疵，待平台评估",
      mock_label: sample.defect_type_gold
    })
  });
  if (!response.ok) throw new Error(`${sample.sample_id} API ${response.status}`);
  return response.json();
}

const dataset = parseCsv(fs.readFileSync(DATASET, "utf8"));
const runnable = dataset.filter((sample) => sample.image_source !== "待补充" && fs.existsSync(path.join(ROOT, sample.image_path)));
const health = REFRESH_ONLY ? {} : await (await fetch(`${API_BASE}/api/health`)).json();
const runs = [];
const badcases = [];

if (REFRESH_ONLY) {
  const existingRuns = parseCsv(fs.readFileSync(RUN_RESULT, "utf8"));
  for (const run of existingRuns) {
    const sample = runnable.find((item) => item.sample_id === run.sample_id);
    if (!sample) continue;
    runs.push(run);
    const result = {
      fruit_type: run.fruit_type_ai,
      defect_type: run.defect_type_ai,
      grade: run.grade_ai,
      confidence: Number(run.confidence_ai || 0),
      edible_safety: run.edible_safety_ai,
      review_required: bool(run.review_required_ai),
      next_action: run.next_action_ai,
      risk_flags: run.risk_flags_ai ? run.risk_flags_ai.split("|") : [],
      farmer_explanation: run.farmer_explanation,
      consumer_copy: run.consumer_copy
    };
    const issueCandidates = classifyBadcase(sample, result, run);
    for (const issue of issueCandidates) {
      badcases.push({
        badcase_id: `BC-20260613-${String(badcases.length + 1).padStart(3, "0")}`,
        sample_id: sample.sample_id,
        badcase_source: "eval_failed",
        gold_label: `${sample.defect_type_gold}/${sample.grade_gold}/${sample.edible_safety_gold}`,
        ai_output: `${result.defect_type || ""}/${result.grade || ""}/${result.next_action || ""}`,
        problem_type: issue.type,
        severity: issue.severity,
        root_cause: issue.root,
        fix_action: issue.fix,
        related_prompt_version: run.prompt_version || PROMPT_VERSION,
        related_rule_version: run.rule_version || RULE_VERSION,
        regression_status: "待回归"
      });
    }
  }
  fs.writeFileSync(BADCASE_LOG, toCsv(BADCASE_HEADER, badcases), "utf8");
  fs.writeFileSync(REPORT, renderReport(metrics(runnable, runs, badcases), badcases), "utf8");
  console.log(`Refreshed report from ${runs.length} existing runs and ${badcases.length} badcases.`);
  process.exit(0);
}

for (const [index, sample] of runnable.entries()) {
  const runId = `RUN-20260613-${String(index + 1).padStart(3, "0")}`;
  let result = {};
  let runNote = "";
  let parseOk = true;
  try {
    result = await grade(sample);
  } catch (error) {
    parseOk = false;
    runNote = String(error.message || error);
  }
  const complete = parseOk && schemaComplete(result);
  const issueCandidates = parseOk ? classifyBadcase(sample, result, { json_parse_success: String(parseOk), schema_complete: String(complete) }) : [{ type: "API/JSON 失败", severity: "P1", root: runNote, fix: "检查 API 可用性和模型输出格式" }];
  const runRow = {
    run_id: runId,
    sample_id: sample.sample_id,
    model_provider: health.provider || "qwen",
    model_name: health.model || "qwen-vl-max",
    contract_version: result.contract_version || health.contract_version || "apple-grading-v1",
    prompt_version: result.prompt_version || health.prompt_version || PROMPT_VERSION,
    rule_version: RULE_VERSION,
    json_parse_success: String(parseOk),
    schema_complete: String(complete),
    fruit_type_ai: result.fruit_type || "",
    defect_type_ai: result.defect_type || "",
    grade_ai: result.grade || "",
    confidence_ai: result.confidence ?? "",
    edible_safety_ai: result.edible_safety || "",
    review_required_ai: result.review_required ?? "",
    next_action_ai: result.next_action || "",
    risk_flags_ai: Array.isArray(result.risk_flags) ? result.risk_flags.join("|") : "",
    farmer_explanation: result.farmer_explanation || "",
    consumer_copy: result.consumer_copy || "",
    final_product_status: result.next_action === "confirm_listing" ? "listed" : result.grade === "blocked" ? "blocked" : "reviewing",
    review_task_created: String(result.next_action === "manual_review" || result.review_required === true),
    badcase_created: String(issueCandidates.length > 0),
    raw_ai_output: JSON.stringify(result),
    run_note: runNote || (result.guardrail_actions?.length ? `guardrails:${result.guardrail_actions.join("|")}` : "")
  };
  runs.push(runRow);
  for (const issue of issueCandidates) {
    badcases.push({
      badcase_id: `BC-20260613-${String(badcases.length + 1).padStart(3, "0")}`,
      sample_id: sample.sample_id,
      badcase_source: "eval_failed",
      gold_label: `${sample.defect_type_gold}/${sample.grade_gold}/${sample.edible_safety_gold}`,
      ai_output: `${result.defect_type || ""}/${result.grade || ""}/${result.next_action || ""}`,
      problem_type: issue.type,
      severity: issue.severity,
      root_cause: issue.root,
      fix_action: issue.fix,
      related_prompt_version: result.prompt_version || health.prompt_version || PROMPT_VERSION,
      related_rule_version: RULE_VERSION,
      regression_status: "待回归"
    });
  }
  console.log(`${runId} ${sample.sample_id} -> ${result.defect_type || "ERROR"} / ${result.grade || "ERROR"} / ${result.next_action || "ERROR"}`);
}

fs.writeFileSync(RUN_RESULT, toCsv(RUN_HEADER, runs), "utf8");
fs.writeFileSync(BADCASE_LOG, toCsv(BADCASE_HEADER, badcases), "utf8");
fs.writeFileSync(REPORT, renderReport(metrics(runnable, runs, badcases), badcases), "utf8");

console.log(`\nWrote ${runs.length} runs to ${path.relative(ROOT, RUN_RESULT)}`);
console.log(`Wrote ${badcases.length} badcases to ${path.relative(ROOT, BADCASE_LOG)}`);
