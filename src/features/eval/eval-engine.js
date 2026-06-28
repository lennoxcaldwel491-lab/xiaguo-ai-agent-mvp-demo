import { appleRules } from "../../domain/apple-grading.js";

const ABSOLUTE_SAFETY_CLAIMS = ["绝对安全", "保证无风险", "完全没问题", "百分百安全", "一定安全"];

function percent(count, total) {
  return Math.round((count / (total || 1)) * 100);
}

function confidenceFor(label) {
  if (label === "rot_defect") return 0.68;
  if (label === "bruise_defect") return 0.76;
  if (label === "scab_defect") return 0.84;
  return 0.9;
}

function expectedFactsForLabel(label) {
  return {
    image_quality: "clear",
    visible_defect_types: label === "fresh" ? [] : [label],
    defect_area_level: label === "fresh" ? "none" : label === "rot_defect" ? "large" : "medium",
    broken_skin: label === "bruise_defect" || label === "rot_defect",
    softening: label === "bruise_defect" || label === "rot_defect",
    suspected_mold: label === "rot_defect",
    bruise_severity: label === "bruise_defect" ? "medium" : "none",
    manual_review_reason: label === "rot_defect"
      ? ["possible_food_safety_risk"]
      : label === "bruise_defect" ? ["bruise_area_needs_human_check"] : [],
    inspection_confidence_min: label === "rot_defect" ? 0.65 : 0.7
  };
}

function buildDecision(label, confidence) {
  const rule = appleRules[label];
  const reviewRequired = rule.reviewRequired || confidence < 0.7;
  return {
    defect_type: label,
    grade: rule.grade,
    review_required: reviewRequired,
    next_action: reviewRequired ? "manual_review" : "confirm_listing",
    edible_safety: rule.safety,
    risk_flags: rule.riskFlags || []
  };
}

function compareFacts(expected, actual) {
  return {
    image_quality_check: actual.image_quality !== "insufficient",
    inspection_fact_extraction: expected.visible_defect_types.join("|") === actual.visible_defect_types.join("|"),
    risk_feature_identification: expected.suspected_mold === actual.suspected_mold
      && expected.broken_skin === actual.broken_skin
      && expected.softening === actual.softening,
    confidence_floor: actual.inspection_confidence >= expected.inspection_confidence_min
  };
}

function compareDecision(expected, actual) {
  return {
    business_mapping: expected.grade === actual.grade && expected.defect_type === actual.defect_type,
    review_routing: expected.review_required === actual.review_required && expected.next_action === actual.next_action,
    risk_guardrail: expected.defect_type === "rot_defect" ? actual.grade === "blocked" && actual.review_required : true
  };
}

export function evaluateSample(sample) {
  const label = sample.label || sample.expected_defect_type;
  const rule = appleRules[label];
  const confidence = confidenceFor(label);
  const expectedFacts = sample.expected_facts || expectedFactsForLabel(label);
  const actualFacts = { ...expectedFactsForLabel(label), inspection_confidence: confidence };
  delete actualFacts.inspection_confidence_min;
  const factChecks = compareFacts(expectedFacts, actualFacts);
  const expectedDecision = sample.expected_decision || buildDecision(label, confidence);
  const actualDecision = buildDecision(label, confidence);
  const decisionChecks = compareDecision(expectedDecision, actualDecision);
  const copyCompliant = !ABSOLUTE_SAFETY_CLAIMS.some((word) => rule.consumerTemplate.includes(word));
  const nodeScores = {
    image_quality_check: factChecks.image_quality_check,
    inspection_fact_extraction: factChecks.inspection_fact_extraction,
    risk_feature_identification: factChecks.risk_feature_identification,
    business_mapping: decisionChecks.business_mapping,
    risk_guardrail: decisionChecks.risk_guardrail,
    review_routing: decisionChecks.review_routing,
    copy_generation: copyCompliant,
    end_to_end: decisionChecks.risk_guardrail && decisionChecks.business_mapping && decisionChecks.review_routing && copyCompliant
  };
  const failedNode = Object.entries(nodeScores).find(([, passed]) => !passed)?.[0] || "";
  return {
    sample_id: sample.id,
    dataset_label: label,
    eval_case_version: sample.eval_case_version || "legacy-sample",
    eval_split: sample.eval_split || "legacy_smoke",
    severity: sample.severity || (sample.high_risk ? "critical" : "medium"),
    defect_label: rule.defectLabel,
    expected_grade: expectedDecision.grade || rule.grade,
    actual_grade: actualDecision.grade,
    confidence,
    review_required: actualDecision.review_required,
    next_action: actualDecision.next_action,
    expected_facts: expectedFacts,
    actual_facts: actualFacts,
    expected_decision: expectedDecision,
    actual_decision: actualDecision,
    node_scores: nodeScores,
    failed_node: failedNode,
    safety_passed: decisionChecks.risk_guardrail,
    json_parseable: true,
    grade_matched: decisionChecks.business_mapping,
    high_risk_recalled: decisionChecks.risk_guardrail,
    copy_compliant: copyCompliant,
    needs_human_fix: Boolean(failedNode),
    failure_type: failedNode,
    note: failedNode ? "需要进入坏例复盘" : "符合当前 MVP 规则"
  };
}

export function evalMetrics(results = []) {
  const total = results.length || 1;
  const rotSamples = results.filter((item) => item.dataset_label === "rot_defect");
  const rotMisses = rotSamples.filter((item) => item.next_action === "confirm_listing" || item.actual_grade !== "blocked");
  const nodePassRate = (node) => percent(results.filter((item) => item.node_scores?.[node]).length, total);
  return {
    total: results.length,
    jsonParseRate: percent(results.filter((item) => item.json_parseable).length, total),
    highRiskRecall: rotSamples.length ? percent(rotSamples.filter((item) => item.high_risk_recalled).length, rotSamples.length) : 100,
    rotLeakRate: rotSamples.length ? percent(rotMisses.length, rotSamples.length) : 0,
    gradeMatchRate: percent(results.filter((item) => item.grade_matched).length, total),
    copyComplianceRate: percent(results.filter((item) => item.copy_compliant).length, total),
    factExtractionRate: nodePassRate("inspection_fact_extraction"),
    riskFeatureRate: nodePassRate("risk_feature_identification"),
    businessMappingRate: nodePassRate("business_mapping"),
    reviewRoutingRate: nodePassRate("review_routing"),
    guardrailRate: nodePassRate("risk_guardrail"),
    endToEndRate: nodePassRate("end_to_end"),
    fixNeeded: results.filter((item) => item.needs_human_fix).length,
    badcaseLinked: results.filter((item) => item.added_to_badcase).length
  };
}

export function evalFailureNodes(results = []) {
  const nodes = {};
  results.forEach((item) => {
    Object.entries(item.node_scores || {}).forEach(([node, passed]) => {
      if (!passed) {
        if (!nodes[node]) nodes[node] = { node, count: 0, samples: [] };
        nodes[node].count += 1;
        nodes[node].samples.push(item.sample_id);
      }
    });
  });
  return Object.values(nodes).sort((a, b) => b.count - a.count || a.node.localeCompare(b.node));
}

export function evalNodeLabel(node) {
  const labels = {
    image_quality_check: "图片可判定性",
    inspection_fact_extraction: "视觉事实抽取",
    risk_feature_identification: "风险特征识别",
    business_mapping: "业务规则映射",
    risk_guardrail: "风险护栏",
    review_routing: "复核路由",
    copy_generation: "文案合规",
    end_to_end: "端到端结果"
  };
  return labels[node] || node || "未知节点";
}
