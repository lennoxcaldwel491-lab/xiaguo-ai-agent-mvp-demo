export function createConsumerView({ $, gradeClass, statusClass, statusLabel, channelForGrade, getState, setActiveProductId }) {
  function renderProductDetail(productId) {
    const { products, feedbacks } = getState();
    const product = products.find((item) => item.id === productId);
    if (!product || product.status !== "listed") return;
    setActiveProductId(productId);
    const channel = channelForGrade(product.grade);
    const intent = feedbacks.find((item) => item.productId === product.id && ["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type));
    $("#productDetail").innerHTML = `
      <div class="detail">
        <img class="detail-image" src="${product.image}" alt="${product.title}" />
        <div class="grade-band grade-${product.grade}">
          <span class="grade-code">${product.grade === "blocked" ? "!" : product.grade}</span>
          <span><strong>${product.grade === "blocked" ? "禁售 · 食安风险" : `${product.grade} 级瑕疵果`}</strong><small>${product.defectLabel}</small></span>
        </div>
        <div class="detail-tags"><span>${product.origin}</span><span>${product.weight} kg</span><strong>¥${product.price}</strong></div>
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

  function renderProducts() {
    const { products, activeConsumerProductId } = getState();
    const listed = products.filter((item) => item.status === "listed");
    const listTarget = $("#productList");
    if (!listTarget) return;
    if (!listed.length) {
      listTarget.innerHTML = `
        <div class="mini-empty-state">
          <strong>暂无可展示商品</strong>
          <p>农户确认低风险商品，或运营复核通过后，会出现在这里。</p>
          <button class="btn primary" id="seedEmptyProductsBtn">生成演示商品</button>
        </div>
      `;
      const detailTarget = $("#productDetail");
      if (detailTarget) detailTarget.innerHTML = `
        <div class="mini-empty-state">
          <strong>请选择商品</strong>
          <p>商品详情会展示瑕疵原因、食用边界、建议流向和购买意向入口。</p>
        </div>
      `;
      return;
    }
    listTarget.innerHTML = listed.map((product) => `
      <article class="product-tile grade-${product.grade}">
        <div class="product-photo-wrap"><img src="${product.image}" alt="${product.title}" loading="lazy" /><span class="grade-rail"><b>${product.grade}</b>${product.grade === "blocked" ? "禁售" : "级"}</span></div>
        <div class="product-card-body">
          <div class="product-meta"><span>${product.origin}</span><span>${product.weight} kg</span><span>${product.defectLabel}</span></div>
          <h4>${product.title}</h4>
          <p class="product-reason">${product.consumerCopy}</p>
          <div class="product-tile-foot"><div class="price-row"><strong>¥${product.price}</strong><span>透明分级价</span></div><button class="btn primary" data-detail-id="${product.id}">查看果面说明</button></div>
        </div>
      </article>
    `).join("");
    if (activeConsumerProductId && listed.some((item) => item.id === activeConsumerProductId)) {
      renderProductDetail(activeConsumerProductId);
    }
  }

  return { renderProducts, renderProductDetail };
}
