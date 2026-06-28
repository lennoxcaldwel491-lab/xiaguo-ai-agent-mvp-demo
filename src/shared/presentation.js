export function gradeClass(grade) {
  return grade === "blocked" ? "blocked" : String(grade).toLowerCase();
}

export function statusLabel(status) {
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

export function statusClass(status) {
  if (status === "listed" || status === "sold") return "a";
  if (status === "pending_review" || status === "needs_resubmission") return "c";
  if (status === "rejected" || status === "bad_case") return "risk";
  return "neutral";
}

export function feedbackTypeLabel(type) {
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

export function channelForGrade(grade) {
  const channels = {
    A: { label: "C 端鲜食", detail: "外观完整度较高，可进入消费者商品页，适合家庭鲜食。" },
    B: { label: "C 端性价比", detail: "表皮瑕疵为主，透明说明后可面向价格敏感消费者。" },
    C: { label: "复核后分流", detail: "先人工确认软烂和破皮风险，通过后可做果切、榨汁或加工意向。" },
    blocked: { label: "禁售/剔除", detail: "疑似腐烂或食品安全风险，不进入消费者页。" }
  };
  return channels[grade] || channels.blocked;
}
