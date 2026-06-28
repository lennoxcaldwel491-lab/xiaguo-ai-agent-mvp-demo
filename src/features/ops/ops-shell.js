const OPS_NAV_GROUPS = [
  { view: "ops", label: "总览" },
  { view: "opsReview", label: "商品复核" },
  { view: "opsFeedback", label: "用户反馈" },
  { view: "opsBadCases", label: "AI 质量", children: [["opsBadCases", "坏例池"], ["rules", "规则"], ["eval", "批量评测"]] },
  { view: "opsLogs", label: "系统与日志", children: [["opsLogs", "操作日志"], ["ai", "AI 设置"]] }
];

function groupActive(group, activeView) {
  return group.view === activeView || group.children?.some(([view]) => view === activeView);
}

export function renderOpsShells({ $$ }) {
  $$("[data-ops-shell]").forEach((shell) => {
    const activeView = shell.dataset.opsShell;
    shell.setAttribute("aria-label", "运营模块导航");
    shell.innerHTML = `<div class="ops-nav-brand"><b>XIAGUO</b><span>运营工作台</span></div>${OPS_NAV_GROUPS.map((group) => {
      const active = groupActive(group, activeView);
      const children = active && group.children ? `<div class="ops-subnav">${group.children.map(([view, label]) => `<button class="tab-btn sub ${view === activeView ? "active" : ""}" data-view-jump="${view}" ${view === activeView ? 'aria-current="page"' : ""}>${label}</button>`).join("")}</div>` : "";
      return `<div class="ops-nav-group"><button class="tab-btn ${active ? "active" : ""}" data-view-jump="${group.view}" ${group.view === activeView ? 'aria-current="page"' : ""}>${group.label}</button>${children}</div>`;
    }).join("")}`;
  });
}
