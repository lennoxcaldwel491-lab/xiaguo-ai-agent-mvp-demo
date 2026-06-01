const store = require("../../utils/data-store");

const rules = {
  fresh: { label: "无明显瑕疵", grade: "A", status: "listed", defect: "外观完整", confidence: 90 },
  scab_defect: { label: "果锈/疮痂斑", grade: "B", status: "listed", defect: "表皮瑕疵", confidence: 84 },
  bruise_defect: { label: "轻微碰伤", grade: "C", status: "pending_review", defect: "局部碰伤", confidence: 76 },
  rot_defect: { label: "疑似腐烂", grade: "禁售", status: "rejected", defect: "食品安全风险", confidence: 68 }
};

Page({
  data: {
    image: "",
    defectIndex: 0,
    defectOptions: [
      { label: "无明显瑕疵", value: "fresh" },
      { label: "果锈/疮痂斑", value: "scab_defect" },
      { label: "轻微碰伤", value: "bruise_defect" },
      { label: "疑似腐烂", value: "rot_defect" }
    ],
    origin: "山东烟台",
    weight: "5",
    harvestDate: "2026-05-20",
    price: "29.9",
    note: "家庭装，适合鲜食或榨汁"
  },

  onLoad(options) {
    this.setData({ image: decodeURIComponent(options.image || "") });
  },

  changeDefect(event) { this.setData({ defectIndex: Number(event.detail.value) }); },
  setOrigin(event) { this.setData({ origin: event.detail.value }); },
  setWeight(event) { this.setData({ weight: event.detail.value }); },
  setHarvestDate(event) { this.setData({ harvestDate: event.detail.value }); },
  setPrice(event) { this.setData({ price: event.detail.value }); },
  setNote(event) { this.setData({ note: event.detail.value }); },

  runAgent() {
    const defectType = this.data.defectOptions[this.data.defectIndex].value;
    const rule = rules[defectType];
    const product = {
      id: `product_${Date.now()}`,
      title: `${this.data.origin} ${rule.grade}级苹果`,
      image: this.data.image,
      origin: this.data.origin,
      weight: this.data.weight,
      harvestDate: this.data.harvestDate,
      price: this.data.price,
      note: this.data.note,
      grade: rule.grade,
      status: rule.status,
      defect: rule.defect,
      confidence: rule.confidence,
      explanation: rule.status === "listed"
        ? "AI 初判风险较低，可进入上架状态。"
        : rule.status === "pending_review"
          ? "AI 初判需要人工复核，等待运营处理。"
          : "疑似食品安全风险，体验版直接进入禁售状态。"
    };
    store.addProduct(product);
    if (product.status === "rejected") {
      store.addBadCase({
        id: `badcase_${Date.now()}`,
        productId: product.id,
        title: product.title,
        caseType: "食品安全拦截",
        reason: "AI 直接禁售样本",
        status: "待复盘",
        severity: "高风险漏放",
        fixAction: "复盘禁售规则和高风险提示词，加入回归检查",
        addedToRegression: false,
        createdAt: new Date().toLocaleString()
      });
    }
    wx.navigateTo({ url: `/pages/farmer-status/farmer-status?id=${product.id}` });
  }
});
