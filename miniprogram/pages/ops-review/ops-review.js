const store = require("../../utils/data-store");

Page({
  data: {
    reviews: [],
    feedbacks: []
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    const state = store.localState();
    const products = state.products;
    const feedbacks = state.feedbacks;
    this.setData({
      reviews: products.filter((item) => item.status === "pending_review"),
      feedbacks: feedbacks.map((item) => ({
        ...item,
        typeLabel: this.feedbackTypeLabel(item.type),
        isIntent: item.type === "purchase_intent"
      }))
    });
  },

  approve(event) {
    this.updateProduct(event.currentTarget.dataset.id, "listed");
    wx.showToast({ title: "已通过上架", icon: "success" });
  },

  requestMore(event) {
    this.updateProduct(event.currentTarget.dataset.id, "needs_resubmission");
    wx.showToast({ title: "已要求农户补资料", icon: "none" });
  },

  reject(event) {
    this.updateProduct(event.currentTarget.dataset.id, "rejected");
    const products = store.localState().products;
    const product = products.find((item) => item.id === event.currentTarget.dataset.id);
    if (product) {
      store.addBadCase({
        id: `badcase_${Date.now()}`,
        productId: product.id,
        title: product.title,
        caseType: "运营禁售",
        reason: "运营禁售并记录坏例",
        status: "待复盘",
        severity: /腐烂|软烂|食品安全|禁售/.test(`${product.defect}${product.explanation}`) ? "高风险漏放" : "人工修正",
        fixAction: "复盘分级规则和复核策略，必要时加入回归检查",
        addedToRegression: false,
        createdAt: new Date().toLocaleString()
      });
    }
    wx.showToast({ title: "已禁售并记坏例", icon: "none" });
  },

  updateProduct(productId, status) {
    store.updateProduct(productId, { status });
    this.loadData();
  },

  feedbackTypeLabel(type) {
    const labels = {
      purchase_intent: "购买意向",
      safety_concern: "担心安全",
      unclear_copy: "说明不清楚",
      price_not_attractive: "价格顾虑",
      defect_unacceptable: "不接受瑕疵"
    };
    return labels[type] || "用户反馈";
  }
});
