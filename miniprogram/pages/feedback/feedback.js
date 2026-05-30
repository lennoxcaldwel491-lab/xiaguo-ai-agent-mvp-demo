Page({
  submitIntent() {
    wx.showToast({ title: "意向已记录", icon: "success" });
  },
  submitFeedback() {
    wx.showToast({ title: "反馈已进入运营复盘", icon: "none" });
  }
});
