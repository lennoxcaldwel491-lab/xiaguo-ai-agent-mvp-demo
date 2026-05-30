Page({
  goFarmer() { wx.navigateTo({ url: "/pages/farmer-upload/farmer-upload" }); },
  goConsumer() { wx.switchTab({ url: "/pages/product-list/product-list" }); },
  goOps() { wx.switchTab({ url: "/pages/ops-review/ops-review" }); }
});
