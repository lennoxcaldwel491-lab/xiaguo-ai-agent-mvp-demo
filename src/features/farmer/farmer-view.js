export function createFarmerView({ $, rules, gradeClass, statusClass, statusLabel, getState, setActiveProductId }) {
  function renderSamples() {
    const { samples, selectedSample } = getState();
    const target = $("#sampleGrid");
    if (!target) return;
    target.innerHTML = samples.map((sample) => {
      const rule = rules[sample.label];
      return `
        <button class="sample-card ${sample.id === selectedSample.id ? "active" : ""}" type="button" data-sample-id="${sample.id}" aria-pressed="${sample.id === selectedSample.id}">
          <img src="${sample.image}" alt="${rule.defectLabel}" />
          <div class="sample-body">
            <strong>${rule.defectLabel}</strong>
            <small>${sample.origin} · ${sample.weight} kg</small>
            <div class="grade-band compact grade-${rule.grade}"><span class="grade-code">${rule.grade === "blocked" ? "!" : rule.grade}</span><span><strong>${rule.grade === "blocked" ? "禁售" : `${rule.grade} 级`}</strong><small>${rule.reviewRequired ? "需复核" : "可上架"}</small></span></div>
          </div>
        </button>
      `;
    }).join("");
  }

  function renderSelectedPreview() {
    const { selectedSample, isGrading } = getState();
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

  function renderProducts() {
    const { products } = getState();
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
        <div class="farmer-product-copy">
          <div class="grade-band compact grade-${product.grade}"><span class="grade-code">${product.grade === "blocked" ? "!" : product.grade}</span><span><strong>${product.grade === "blocked" ? "禁售" : `${product.grade} 级`}</strong><small>${statusLabel(product.status)}</small></span></div>
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

  function renderProductDetail(productId) {
    const { products, reviews, feedbacks, activeFarmerProductId } = getState();
    const target = $("#farmerProductDetailBox");
    if (!target) return;
    const product = products.find((item) => item.id === (productId || activeFarmerProductId));
    if (!product) {
      target.innerHTML = `<div class="mini-empty-state"><strong>请选择商品</strong><p>从农户首页点击果子图片进入状态详情。</p></div>`;
      return;
    }
    setActiveProductId(product.id);
    const review = reviews.find((item) => item.productId === product.id);
    const reviewLabels = { pending: "待运营复核", approved: "已通过", rejected: "已驳回", resubmission_requested: "待补充" };
    const feedbackCount = feedbacks.filter((item) => item.productId === product.id).length;
    target.innerHTML = `
      <div class="farmer-status-detail">
        <img src="${product.image}" alt="${product.title}" />
        <div class="farmer-status-copy">
          <div class="grade-band grade-${product.grade}"><span class="grade-code">${product.grade === "blocked" ? "!" : product.grade}</span><span><strong>${product.grade === "blocked" ? "禁售 · 食安风险" : `${product.grade} 级苹果`}</strong><small>${product.defectLabel}</small></span></div>
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
            <div><span>复核状态</span><strong>${review ? reviewLabels[review.status] || review.status : "无复核任务"}</strong></div>
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

  function renderResubmissions() {
    const { products, reviews } = getState();
    const target = $("#farmerResubmissionList");
    if (!target) return;
    const pending = products.filter((item) => item.status === "needs_resubmission");
    target.innerHTML = pending.length ? pending.map((product) => {
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

  return { renderSamples, renderSelectedPreview, renderProducts, renderProductDetail, renderResubmissions };
}
