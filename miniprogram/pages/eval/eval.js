const store = require("../../utils/data-store");

Page({
  data: {
    badCases: [],
    evalRuns: [],
    concernCount: 0,
    metrics: {
      total: 0,
      listed: 0,
      review: 0,
      rejected: 0,
      rotLeakCount: 0,
      highRiskRecall: 100
    },
    labelMetrics: {
      total: 0,
      seeded: 0,
      toLabel: 0,
      regressionLinked: 0
    }
  },

  onShow() {
    store.syncFromServer(() => this.loadEvalState());
  },

  loadEvalState() {
    const state = store.localState();
    const products = state.products;
    const feedbacks = state.feedbacks;
    const badCases = state.badCases;
    const evalRuns = state.evalRuns;
    const concerns = feedbacks.filter((item) => item.type !== "purchase_intent");
    this.setData({
      badCases: badCases.map((item) => this.decorateBadCase(item)),
      evalRuns,
      concernCount: concerns.length,
      metrics: this.computeMetrics(products),
      labelMetrics: this.computeLabelMetrics(badCases)
    });
  },

  computeLabelMetrics(badCases) {
    const template = store.evalTemplate();
    return {
      total: template.length,
      seeded: template.filter((item) => item.human_label_status === "seeded").length,
      toLabel: template.filter((item) => item.human_label_status === "to_label").length,
      regressionLinked: badCases.filter((item) => item.status === "已进入回归" || item.addedToRegression).length
    };
  },

  computeMetrics(products) {
    const total = products.length;
    const listed = products.filter((item) => item.status === "listed" || item.status === "sold").length;
    const review = products.filter((item) => item.status === "pending_review" || item.status === "needs_resubmission").length;
    const rejected = products.filter((item) => item.status === "rejected").length;
    const highRisk = products.filter((item) => this.isHighRisk(item));
    const recalled = highRisk.filter((item) => item.status === "rejected" || item.status === "pending_review" || item.status === "needs_resubmission").length;
    const rotLeakCount = highRisk.filter((item) => item.status === "listed" || item.status === "sold").length;
    return {
      total,
      listed,
      review,
      rejected,
      rotLeakCount,
      highRiskRecall: highRisk.length ? Math.round(recalled / highRisk.length * 100) : 100
    };
  },

  isHighRisk(product) {
    const text = `${product.defect || ""}${product.explanation || ""}${product.grade || ""}`;
    return /腐烂|软烂|食品安全|禁售/.test(text);
  },

  runEval() {
    const products = store.localState().products;
    const metrics = this.computeMetrics(products);
    const run = {
      id: `eval_${Date.now()}`,
      pass: metrics.rotLeakCount === 0 && metrics.highRiskRecall === 100,
      rotLeakCount: metrics.rotLeakCount,
      highRiskRecall: metrics.highRiskRecall,
      createdAt: new Date().toLocaleString()
    };
    store.addEvalRun(run);
    this.loadEvalState();
    wx.showToast({ title: run.pass ? "回归通过" : "发现风险漏放", icon: "none" });
  },

  decorateBadCase(item) {
    const status = item.status || "待复盘";
    return {
      ...item,
      statusLabel: status,
      statusClass: status === "已修复" || status === "已进入回归" ? "ok" : "warning",
      severity: item.severity || "未分级",
      fixAction: item.fixAction || "待复盘后补充修复动作"
    };
  },

  markFixed(event) {
    this.updateBadCaseStatus(event.currentTarget.dataset.id, "已修复");
  },

  addRegression(event) {
    this.updateBadCaseStatus(event.currentTarget.dataset.id, "已进入回归");
  },

  updateBadCaseStatus(caseId, status) {
    const state = store.localState();
    const badCases = state.badCases.map((item) => {
      if (item.id !== caseId) return item;
      return {
        ...item,
        status,
        addedToRegression: status === "已进入回归" ? true : item.addedToRegression,
        fixAction: item.fixAction || (status === "已进入回归" ? "加入回归检查" : "已复盘并修正规则"),
        updatedAt: new Date().toLocaleString()
      };
    });
    store.saveState({ badCases });
    this.loadEvalState();
    wx.showToast({ title: `已标记${status}`, icon: "none" });
  }
});
