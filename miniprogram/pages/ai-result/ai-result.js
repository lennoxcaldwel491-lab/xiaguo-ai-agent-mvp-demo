Page({
  submitReview() {
    wx.showToast({ title: "已进入人工复核", icon: "success" });
    wx.switchTab({ url: "/pages/ops-review/ops-review" });
  }
});
