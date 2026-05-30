Page({
  approve() { wx.showToast({ title: "已通过上架", icon: "success" }); },
  requestMore() { wx.showToast({ title: "已要求农户补资料", icon: "none" }); },
  reject() { wx.showToast({ title: "已驳回并记坏例", icon: "none" }); }
});
