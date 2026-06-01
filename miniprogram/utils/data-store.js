const STORAGE_KEYS = {
  products: "farmerProducts",
  feedbacks: "consumerFeedbacks",
  badCases: "badCases",
  evalRuns: "evalRuns"
};

function apiBase() {
  const app = typeof getApp === "function" ? getApp() : null;
  return app && app.globalData ? app.globalData.apiBase : "";
}

function localState() {
  return {
    products: wx.getStorageSync(STORAGE_KEYS.products) || [],
    feedbacks: wx.getStorageSync(STORAGE_KEYS.feedbacks) || [],
    badCases: wx.getStorageSync(STORAGE_KEYS.badCases) || [],
    evalRuns: wx.getStorageSync(STORAGE_KEYS.evalRuns) || []
  };
}

function applyLocalState(state = {}) {
  if (Array.isArray(state.products)) wx.setStorageSync(STORAGE_KEYS.products, state.products);
  if (Array.isArray(state.feedbacks)) wx.setStorageSync(STORAGE_KEYS.feedbacks, state.feedbacks);
  if (Array.isArray(state.badCases)) wx.setStorageSync(STORAGE_KEYS.badCases, state.badCases);
  if (Array.isArray(state.evalRuns)) wx.setStorageSync(STORAGE_KEYS.evalRuns, state.evalRuns);
}

function mergeById(primary = [], secondary = []) {
  const seen = new Set();
  const merged = [];
  [...primary, ...secondary].forEach((item) => {
    if (!item || !item.id || seen.has(item.id)) return;
    seen.add(item.id);
    merged.push(item);
  });
  return merged;
}

function mergeState(serverState = {}, clientState = localState()) {
  return {
    products: mergeById(serverState.products || [], clientState.products),
    feedbacks: mergeById(serverState.feedbacks || [], clientState.feedbacks),
    badCases: mergeById(serverState.badCases || [], clientState.badCases),
    evalRuns: mergeById(serverState.evalRuns || [], clientState.evalRuns)
  };
}

function request(path, options = {}) {
  const base = apiBase();
  if (!base) return Promise.reject(new Error("apiBase is not configured"));
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${base}${path}`,
      method: options.method || "GET",
      data: options.data,
      header: { "Content-Type": "application/json" },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else reject(new Error(`HTTP ${res.statusCode}`));
      },
      fail: reject
    });
  });
}

function syncFromServer(callback) {
  request("/api/state")
    .then((state) => {
      const merged = mergeState(state);
      applyLocalState(merged);
      if (
        merged.products.length !== (state.products || []).length ||
        merged.feedbacks.length !== (state.feedbacks || []).length ||
        merged.badCases.length !== (state.badCases || []).length ||
        merged.evalRuns.length !== (state.evalRuns || []).length
      ) {
        saveState(merged);
      }
      callback && callback(localState(), true);
    })
    .catch(() => {
      callback && callback(localState(), false);
    });
}

function saveState(patch = {}) {
  const nextState = { ...localState(), ...patch };
  applyLocalState(nextState);
  return request("/api/state", {
    method: "POST",
    data: nextState
  }).catch(() => nextState);
}

function upsert(list, item) {
  if (!item || !item.id) return list;
  return [item, ...list.filter((entry) => entry.id !== item.id)];
}

function addProduct(product) {
  const state = localState();
  return saveState({ products: upsert(state.products, product) });
}

function updateProduct(productId, patch) {
  const state = localState();
  const products = state.products.map((item) => item.id === productId ? { ...item, ...patch } : item);
  return saveState({ products });
}

function addFeedback(feedback) {
  const state = localState();
  return saveState({ feedbacks: upsert(state.feedbacks, feedback) });
}

function addBadCase(badCase) {
  const state = localState();
  return saveState({ badCases: upsert(state.badCases, badCase) });
}

function addEvalRun(run) {
  const state = localState();
  return saveState({ evalRuns: upsert(state.evalRuns, run) });
}

function evalTemplate() {
  const types = [
    ["fresh", "A", false, false],
    ["scab_defect", "B", false, false],
    ["bruise_defect", "C", true, false],
    ["rot_defect", "blocked", true, true]
  ];
  return types.flatMap(([type, grade, mustReview, highRisk]) => (
    Array.from({ length: 10 }, (_, index) => ({
      id: `apple_${type.replace("_defect", "").replace("fresh", "fresh")}_${String(index + 1).padStart(3, "0")}`,
      expected_defect_type: type,
      expected_grade: grade,
      must_review: mustReview,
      high_risk: highRisk,
      human_label_status: index < 3 ? "seeded" : "to_label"
    }))
  ));
}

module.exports = {
  localState,
  syncFromServer,
  saveState,
  addProduct,
  updateProduct,
  addFeedback,
  addBadCase,
  addEvalRun,
  evalTemplate
};
