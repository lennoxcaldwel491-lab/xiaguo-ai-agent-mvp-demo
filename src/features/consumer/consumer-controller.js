export function createConsumerController({
  $,
  $$,
  getState,
  getPendingExitProductId,
  setPendingExitProductId,
  getSelectedExitReason,
  setSelectedExitReason,
  renderAll,
  persistState,
  switchView,
  showToast,
  addActionLog,
  addBadCase,
  addFeedback,
  apiPost
}) {
  let returnFocusTarget = null;

  function hasPurchaseIntent(productId) {
    const { feedbacks } = getState();
    return feedbacks.some((item) => item.productId === productId && ["purchase_intent", "mock_purchase", "willing_to_buy"].includes(item.type));
  }

  function submitPurchaseIntent(productId) {
    const { products, feedbacks } = getState();
    const product = products.find((item) => item.id === productId);
    const amount = $(`#intentAmount_${productId}`)?.value || "未填写数量";
    const contact = $(`#intentContact_${productId}`)?.value?.trim() || "未留联系方式";
    const feedback = {
      id: `feedback_${Date.now()}`,
      productId,
      type: "purchase_intent",
      content: `${product?.title || productId}；${amount}；${contact}`,
      createdAt: new Date().toLocaleString()
    };
    addFeedback(feedback);
    apiPost("/api/feedback", feedback);
    addActionLog("提交购买意向", feedback.content, "消费者");
    renderAll();
    persistState();
    showToast("已记录购买意向，运营端可查看");
  }

  function openExitFeedback(productId) {
    if (!productId || hasPurchaseIntent(productId)) {
      switchView("consumer");
      return;
    }
    setPendingExitProductId(productId);
    setSelectedExitReason("safety_concern");
    $$("#exitFeedbackModal [data-exit-reason]")?.forEach((item) => item.classList.toggle("active", item.dataset.exitReason === "safety_concern"));
    const textarea = $("#exitFeedbackText");
    if (textarea) textarea.value = "";
    returnFocusTarget = globalThis.document?.activeElement || null;
    $("#exitFeedbackModal").classList.add("show");
    $("#exitFeedbackModal").setAttribute("aria-hidden", "false");
    globalThis.window?.setTimeout?.(() => $("#exitFeedbackModal [data-exit-reason]")?.focus?.(), 0);
  }

  function closeExitFeedback() {
    $("#exitFeedbackModal").classList.remove("show");
    $("#exitFeedbackModal").setAttribute("aria-hidden", "true");
    returnFocusTarget?.focus?.();
    returnFocusTarget = null;
  }

  function handleDocumentKeydown(event) {
    if (event.key !== "Escape" || $("#exitFeedbackModal")?.getAttribute?.("aria-hidden") !== "false") return false;
    setPendingExitProductId(null);
    closeExitFeedback();
    return true;
  }

  function submitExitFeedback() {
    const { products, feedbacks } = getState();
    const pendingExitProductId = getPendingExitProductId();
    const selectedExitReason = getSelectedExitReason();
    if (!pendingExitProductId) {
      closeExitFeedback();
      switchView("consumer");
      return;
    }
    const content = $("#exitFeedbackText")?.value?.trim() || "用户退出商品详情时未购买";
    const feedback = {
      id: `feedback_${Date.now()}`,
      productId: pendingExitProductId,
      type: selectedExitReason,
      content,
      createdAt: new Date().toLocaleString()
    };
    addFeedback(feedback);
    apiPost("/api/feedback", feedback);
    addActionLog("退出购买反馈", `${selectedExitReason}；${content}`, "消费者");
    addBadCase(products.find((item) => item.id === pendingExitProductId), "消费者退出反馈", `反馈类型：${selectedExitReason}；${content}`);
    setPendingExitProductId(null);
    closeExitFeedback();
    renderAll();
    persistState();
    switchView("consumer");
    showToast("反馈已进入运营复盘");
  }

  function submitFeedback(productId) {
    const { products, feedbacks } = getState();
    const type = $(`#feedbackType_${productId}`).value;
    const content = $(`#feedbackText_${productId}`).value.trim() || "未填写补充说明";
    const feedback = { id: `feedback_${Date.now()}`, productId, type, content, createdAt: new Date().toLocaleString() };
    addFeedback(feedback);
    apiPost("/api/feedback", feedback);
    addActionLog("提交消费者反馈", `${type}；${content}`, "消费者");
    if (type !== "willing_to_buy") addBadCase(products.find((item) => item.id === productId), "消费者信任反馈", `反馈类型：${type}；${content}`);
    renderAll();
    persistState();
    showToast("反馈已回流到后台");
  }

  function mockPurchase(productId) {
    submitPurchaseIntent(productId);
  }

  function handleDocumentClick(event) {
    const backBtn = event.target.closest("[data-consumer-back]");
    if (backBtn) {
      switchView("consumer");
      return true;
    }

    const exitDetailBtn = event.target.closest("[data-open-exit-feedback]");
    if (exitDetailBtn) {
      openExitFeedback(getState().activeConsumerProductId);
      return true;
    }

    const closeFeedbackBtn = event.target.closest("[data-close-feedback]");
    if (closeFeedbackBtn) {
      setPendingExitProductId(null);
      closeExitFeedback();
      switchView("consumer");
      return true;
    }

    const exitReasonBtn = event.target.closest("[data-exit-reason]");
    if (exitReasonBtn) {
      setSelectedExitReason(exitReasonBtn.dataset.exitReason);
      $$("#exitFeedbackModal [data-exit-reason]")?.forEach((item) => item.classList.toggle("active", item === exitReasonBtn));
      return true;
    }

    if (event.target.id === "submitExitFeedbackBtn") {
      submitExitFeedback();
      return true;
    }

    const intentBtn = event.target.closest("[data-intent-id]");
    if (intentBtn) {
      submitPurchaseIntent(intentBtn.dataset.intentId);
      return true;
    }

    const purchaseBtn = event.target.closest("[data-purchase-id]");
    if (purchaseBtn) {
      mockPurchase(purchaseBtn.dataset.purchaseId);
      return true;
    }

    const feedbackBtn = event.target.closest("[data-feedback-id]");
    if (feedbackBtn) {
      submitFeedback(feedbackBtn.dataset.feedbackId);
      return true;
    }

    return false;
  }

  return {
    handleDocumentClick,
    submitPurchaseIntent,
    mockPurchase,
    openExitFeedback,
    closeExitFeedback,
    submitExitFeedback,
    submitFeedback,
    handleDocumentKeydown
  };
}
