const store = require("../../utils/data-store");

Page({
  data: {
    products: []
  },

  onShow() {
    store.syncFromServer((state) => {
      this.setData({ products: this.decorateProducts(state.products) });
    });
  },

  chooseImage(event) {
    const source = event.currentTarget.dataset.source === "camera" ? "camera" : "album";
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: [source],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        wx.navigateTo({
          url: `/pages/farmer-info/farmer-info?image=${encodeURIComponent(file.tempFilePath)}`
        });
      },
      fail: () => {
        wx.showToast({ title: "已取消选择", icon: "none" });
      }
    });
  },

  goStatus(event) {
    wx.navigateTo({ url: `/pages/farmer-status/farmer-status?id=${event.currentTarget.dataset.id}` });
  },

  decorateProducts(products) {
    const statusMap = {
      listed: ["已上架", "ok"],
      pending_review: ["复核", "warning"],
      sold: ["已售出", "ok"],
      rejected: ["禁售", "danger"],
      needs_resubmission: ["待补充", "warning"]
    };
    return products.map((item) => {
      const status = statusMap[item.status] || ["草稿", ""];
      return { ...item, statusLabel: status[0], statusClass: status[1] };
    });
  }
});
