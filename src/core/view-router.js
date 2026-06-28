const ROLE_META = {
  home: { eyebrow: "瑕果智选", title: "选择你的使用身份", subtitle: "进入对应端口后，只保留当前角色需要处理的功能。" },
  farmer: { eyebrow: "农户端", title: "苹果拍照分级与提交上架", subtitle: "选择样本或上传图片，补充产地、重量和价格后触发智能分级。" },
  consumer: { eyebrow: "消费者端", title: "可信苹果商品", subtitle: "查看已上架商品的瑕疵说明、食用建议和售后保障。" },
  ops: { eyebrow: "运营端", title: "风险复核与规则维护", subtitle: "处理待复核商品，维护坏例，并检查 AI 输出稳定性。" }
};

export function createViewRouter({ $, $$ }) {
  let currentView = $(".view.active")?.id || "roleSelect";
  function roleForView(viewId) {
    if (["roleSelect", "workbench", "uiStates", "roadmap", "share"].includes(viewId)) return "home";
    if (["farmer", "farmerForm", "farmerProductDetail", "agent"].includes(viewId)) return "farmer";
    if (["consumer", "consumerDetail"].includes(viewId)) return "consumer";
    if (["ops", "opsReview", "opsBadCases", "opsFeedback", "opsLogs", "rules", "eval", "ai"].includes(viewId)) return "ops";
    return document.body.dataset.role || "home";
  }

  function setRole(role) {
    const meta = ROLE_META[role] || ROLE_META.home;
    document.body.dataset.role = role;
    $("#roleEyebrow").textContent = meta.eyebrow;
    $("#roleTitle").textContent = meta.title;
    $("#roleSubtitle").textContent = meta.subtitle;
  }

  function switchView(viewId, options = {}) {
    const { updateHistory = true, focusMain = false } = options;
    if (!$(`#${CSS.escape(viewId)}`)) return false;
    const navViewId = ["farmerForm", "farmerProductDetail"].includes(viewId)
      ? "farmer"
      : viewId === "consumerDetail"
        ? "consumer"
        : viewId.startsWith("ops") ? "ops" : viewId;
    $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
    $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === navViewId));
    $$(".mini-tabbar-app button").forEach((item) => item.classList.toggle("active", item.dataset.viewJump === navViewId));
    setRole(roleForView(viewId));
    if (updateHistory && currentView !== viewId) {
      window.history.pushState({ xiaguoView: viewId }, "", `#${viewId}`);
    }
    currentView = viewId;
    const target = $(`#${CSS.escape(viewId)}`);
    if (target) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      if (focusMain) target.querySelector("h2, h3, button, [tabindex]")?.focus?.({ preventScroll: true });
    }
    return true;
  }

  function bindHistory() {
    const hashView = window.location.hash.slice(1);
    if (hashView && $(`#${CSS.escape(hashView)}`)) switchView(hashView, { updateHistory: false });
    window.history.replaceState({ xiaguoView: currentView }, "", `#${currentView}`);
    window.addEventListener("popstate", (event) => {
      const viewId = event.state?.xiaguoView || window.location.hash.slice(1) || "roleSelect";
      switchView(viewId, { updateHistory: false, focusMain: true });
    });
  }

  return { roleForView, setRole, switchView, bindHistory };
}
