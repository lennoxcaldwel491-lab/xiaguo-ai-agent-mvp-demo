Page({
  chooseImage() {
    wx.showToast({ title: "体验版：此处接入 chooseMedia", icon: "none" });
  },
  goResult() {
    wx.navigateTo({ url: "/pages/ai-result/ai-result" });
  }
});
