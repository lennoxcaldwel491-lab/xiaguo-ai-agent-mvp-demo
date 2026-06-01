const store = require("../../utils/data-store");

Page({
  data: {
    productId: "",
    product: null
  },

  onLoad(options) {
    const productId = options.id || "";
    const products = store.localState().products;
    this.setData({
      productId,
      product: products.find((item) => item.id === productId) || null
    });
  },

  submitIntent() {
    this.saveFeedback("purchase_intent", "消费者提交购买意向");
    wx.showToast({ title: "意向已记录", icon: "success" });
  },

  goFeedback() {
    wx.navigateTo({ url: `/pages/feedback/feedback?id=${this.data.productId}` });
  },

  goList() {
    wx.switchTab({ url: "/pages/product-list/product-list" });
  },

  saveFeedback(type, content) {
    store.addFeedback({
      id: `feedback_${Date.now()}`,
      productId: this.data.productId,
      type,
      content,
      createdAt: new Date().toLocaleString()
    });
  }
});
