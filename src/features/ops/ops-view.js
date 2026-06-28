export function createOpsView({ $, gradeClass, statusClass, statusLabel, feedbackTypeLabel, channelForGrade, getState }) {
  function reviewStatusText(review) {
    if (review.status === "pending") return "待处理";
    if (review.status === "approved") return "已通过";
    if (review.status === "resubmission_requested") return "需补充";
    return "已驳回";
  }

  function renderTasks() {
    const { reviews, products, feedbacks, badCases } = getState();
    const target = $("#opsTaskList");
    if (!target) return;
    const pendingReviews = reviews.filter((item) => item.status === "pending").slice(0, 4);
    const resubmissions = products.filter((item) => item.status === "needs_resubmission").slice(0, 2);
    const pendingFeedbacks = feedbacks.filter((item) => !["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type)).slice(0, 3);
    const pendingBadCases = badCases.filter((item) => !["已修复", "已进入回归"].includes(item.status)).slice(0, 3);
    const tasks = [
      ...pendingReviews.map((review) => ({ label: review.product.grade === "blocked" ? "高风险复核" : "待复核", title: review.product.title, meta: `${review.product.defectLabel} / ${Math.round(review.product.confidence * 100)}% 置信度`, view: "opsReview", tone: review.product.grade === "blocked" ? "risk" : "c", priority: review.product.grade === "blocked" ? 100 : 70 })),
      ...resubmissions.map((product) => ({ label: "待补资料", title: product.title, meta: "等待农户补图或补充基础信息", view: "opsReview", tone: "c", priority: 60 })),
      ...pendingFeedbacks.map((feedback) => ({ label: "用户反馈", title: products.find((item) => item.id === feedback.productId)?.title || feedback.productId, meta: feedback.content, view: "opsFeedback", tone: "neutral", priority: 50 })),
      ...pendingBadCases.map((item) => ({ label: "坏例待复盘", title: item.humanCorrection, meta: item.rootCause, view: "opsBadCases", tone: "risk", priority: item.severity === "高风险漏放" ? 90 : 40 }))
    ].sort((a, b) => b.priority - a.priority).slice(0, 8);
    target.innerHTML = tasks.length ? tasks.map((task) => `
      <button class="ops-task-item task-${task.tone}" data-view-jump="${task.view}"><span class="task-priority" aria-hidden="true"></span>
        <span class="tag ${task.tone}">${task.label}</span>
        <strong>${task.title}</strong>
        <small>${task.meta}</small>
      </button>
    `).join("") : `<div class="empty">暂无优先待办。新的复核、反馈或坏例会出现在这里。</div>`;
  }

  function renderReviewQueue(reviews) {
    const target = $("#reviewQueue");
    if (!target) return;
    target.innerHTML = reviews.length ? reviews.map((review) => `
      <div class="review-card grade-${review.product.grade}">
        <div class="grade-band grade-${review.product.grade}"><span class="grade-code">${review.product.grade === "blocked" ? "!" : review.product.grade}</span><span><strong>${review.product.grade === "blocked" ? "禁售风险" : `${review.product.grade} 级`}</strong><small>${review.product.defectLabel}</small></span></div>
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
              <label class="field"><span>通过原因</span><select id="approveReason_${review.productId}"><option value="">请选择</option><option value="瑕疵与 AI 判断一致，可按透明说明展示">瑕疵与 AI 判断一致</option><option value="补充查看后无软烂风险，可上架">无软烂风险</option><option value="作为加工/榨汁流向，不进入鲜食强推荐">加工流向展示</option></select></label>
              <label class="field"><span>补充资料原因</span><select id="resubmitReason_${review.productId}"><option value="">请选择</option><option value="图片不清晰，需要重新拍摄完整果体和瑕疵部位">图片不清晰</option><option value="缺少采摘时间或重量信息，无法判断售卖建议">基础信息不足</option><option value="瑕疵边界不明确，需要补拍近景图">瑕疵边界不明确</option></select></label>
              <label class="field"><span>驳回原因</span><select id="rejectReason_${review.productId}"><option value="">请选择</option><option value="疑似腐烂或食品安全风险，禁止展示">疑似腐烂风险</option><option value="图片不清晰，需要农户补图">图片不清晰</option><option value="瑕疵程度超过当前等级，需要进入坏例池复盘">等级疑似误判</option></select></label>
              <label class="field wide"><span>通过补充</span><input id="approveNote_${review.productId}" placeholder="通过时补充说明，可选" /></label>
              <label class="field wide"><span>补充资料说明</span><input id="resubmitNote_${review.productId}" placeholder="说明需要补拍角度或补充字段，可选" /></label>
              <label class="field wide"><span>驳回补充</span><input id="rejectNote_${review.productId}" placeholder="驳回时补充说明，可选" /></label>
            </div>
            <div class="action-buttons">
              <button class="btn primary" data-approve-id="${review.productId}">通过上架</button>
              <button class="btn warning" data-resubmit-id="${review.productId}">要求补资料</button>
              <button class="btn danger" data-reject-id="${review.productId}">驳回禁售</button>
            </div>
          ` : `<div class="action-buttons"><span class="tag ${review.status === "approved" ? "a" : "risk"}">已完成复核</span></div>`}
        </div>
      </div>
    `).join("") : `<div class="empty">暂无待复核商品。碰伤、腐烂或低置信度样本会进入这里。</div>`;
  }

  function renderProducts(products) {
    const target = $("#productTable");
    if (!target) return;
    target.innerHTML = products.length ? products.map((product) => `
      <tr><td>${product.title}</td><td><span class="tag ${gradeClass(product.grade)}">${product.grade}</span></td><td><span class="tag ${statusClass(product.status)}">${statusLabel(product.status)}</span></td><td>${product.channelLabel || channelForGrade(product.grade).label}</td><td>${Math.round(product.confidence * 100)}%</td></tr>
    `).join("") : `<tr><td class="empty" colspan="5">暂无商品记录。</td></tr>`;
  }

  function logMarkup(logs, emptyText) {
    return logs.length ? logs.map((log) => `<div class="log-item"><span>${log.createdAt}</span><strong>${log.action}</strong><p>${log.actor}：${log.detail}</p></div>`).join("") : `<div class="empty">${emptyText}</div>`;
  }

  function renderFeedback(feedbacks, products) {
    const target = $("#feedbackList");
    if (!target) return;
    target.innerHTML = feedbacks.length ? feedbacks.map((feedback) => {
      const product = products.find((item) => item.id === feedback.productId);
      return `
        <div class="feedback-item">
          <div class="tag-row"><span class="tag ${feedback.type === "purchase_intent" || feedback.type === "willing_to_buy" ? "a" : "c"}">${feedbackTypeLabel(feedback.type)}</span><span class="tag">${product?.grade || "未知等级"}</span><span class="tag">${feedback.createdAt}</span></div>
          <strong>${product?.title || feedback.productId}</strong><p>${feedback.content}</p>
          <div class="action-buttons"><button class="btn ghost" data-view-jump="opsBadCases">加入坏例复盘</button><button class="btn ghost" data-view-jump="opsLogs">查看关联记录</button></div>
        </div>
      `;
    }).join("") : `<div class="empty">暂无消费者购买意向或反馈。消费者端提交后会出现在这里。</div>`;
  }

  function render() {
    const { reviews, products, feedbacks, actionLogs } = getState();
    renderReviewQueue(reviews);
    renderProducts(products);
    const logsTarget = $("#actionLogList");
    if (logsTarget) logsTarget.innerHTML = logMarkup(actionLogs, "暂无操作日志。复核、上架、驳回和坏例动作会记录在这里。");
    const recentTarget = $("#opsRecentLogList");
    if (recentTarget) recentTarget.innerHTML = logMarkup(actionLogs.slice(0, 5), "暂无最近操作。");
    renderFeedback(feedbacks, products);
    renderTasks();
  }

  return { render, renderTasks };
}
