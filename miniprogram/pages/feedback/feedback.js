const store = require("../../utils/data-store");

Page({
  data: {
    productId: "",
    intentIndex: 0,
    intentOptions: ["1 箱试吃", "3-5 箱家庭团购", "10 箱以上批量意向"],
    reasonIndex: 0,
    reasonOptions: [
      { label: "我担心食用安全", value: "safety_concern" },
      { label: "说明不够清楚", value: "unclear_copy" },
      { label: "价格不够有吸引力", value: "price_not_attractive" },
      { label: "不接受这种瑕疵", value: "defect_unacceptable" }
    ],
    content: ""
  },

  onLoad(options) {
    this.setData({ productId: options.id || "" });
  },

  changeIntent(event) { this.setData({ intentIndex: Number(event.detail.value) }); },
  changeReason(event) { this.setData({ reasonIndex: Number(event.detail.value) }); },
  setContent(event) { this.setData({ content: event.detail.value }); },

  submitIntent() {
    this.saveFeedback("purchase_intent", this.data.intentOptions[this.data.intentIndex]);
    wx.showToast({ title: "意向已记录", icon: "success" });
  },

  submitFeedback() {
    const reason = this.data.reasonOptions[this.data.reasonIndex];
    this.saveFeedback(reason.value, this.data.content || reason.label);
    this.saveBadCase(reason.label);
    wx.showToast({ title: "反馈已进入运营复盘", icon: "none" });
  },

  saveFeedback(type, content) {
    store.addFeedback({
      id: `feedback_${Date.now()}`,
      productId: this.data.productId,
      type,
      content,
      createdAt: new Date().toLocaleString()
    });
  },

  saveBadCase(reason) {
    const products = store.localState().products;
    const product = products.find((item) => item.id === this.data.productId);
    store.addBadCase({
      id: `badcase_${Date.now()}`,
      productId: this.data.productId,
      title: product ? product.title : "消费者反馈样本",
      caseType: "消费者信任反馈",
      reason,
      status: "待复盘",
      severity: reason.includes("安全") ? "高风险漏放" : "用户信任问题",
      fixAction: "复盘商品说明、价格和食用边界表达",
      addedToRegression: false,
      createdAt: new Date().toLocaleString()
    });
  }
});
