const store = require("../../utils/data-store");

Page({
  data: {
    products: []
  },

  onShow() {
    store.syncFromServer((state) => {
      this.setData({ products: state.products.filter((item) => item.status === "listed") });
    });
  },

  goDetail(event) {
    wx.navigateTo({ url: `/pages/product-detail/product-detail?id=${event.currentTarget.dataset.id}` });
  }
});
