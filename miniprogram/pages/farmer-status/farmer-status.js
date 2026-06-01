const store = require("../../utils/data-store");

Page({
  data: {
    productId: "",
    product: null
  },

  onLoad(options) {
    this.setData({ productId: options.id || "" });
    this.loadProduct();
  },

  onShow() {
    if (this.data.productId) this.loadProduct();
  },

  loadProduct() {
    const products = store.localState().products;
    const product = products.find((item) => item.id === this.data.productId);
    this.setData({ product: product ? this.decorate(product) : null });
  },

  decorate(product) {
    const statusMap = {
      listed: ["已上架", "ok"],
      pending_review: ["复核", "warning"],
      sold: ["已售出", "ok"],
      rejected: ["禁售", "danger"],
      needs_resubmission: ["待补充", "warning"]
    };
    const status = statusMap[product.status] || ["草稿", ""];
    return { ...product, statusLabel: status[0], statusClass: status[1] };
  },

  markSold() {
    store.updateProduct(this.data.productId, { status: "sold" });
    this.loadProduct();
    wx.showToast({ title: "已标记售出", icon: "success" });
  },

  goInfo() {
    wx.navigateTo({ url: `/pages/farmer-info/farmer-info?image=${encodeURIComponent(this.data.product.image || "")}` });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
