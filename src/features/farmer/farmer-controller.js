export function createFarmerController({
  $,
  samples,
  getSelectedSample,
  setSelectedSample,
  clearCurrentReport,
  renderAll,
  persistState,
  switchView,
  showToast,
  runAgent,
  confirmListing,
  markProductSold,
  completeResubmission,
  FileReaderCtor = window.FileReader,
  now = () => Date.now()
}) {
  function formInput() {
    const selectedSample = getSelectedSample();
    return {
      fruit_type: $("#fruitType").value,
      origin: $("#origin").value.trim() || selectedSample.origin,
      weight: Number($("#weight").value || selectedSample.weight),
      harvest_date: $("#harvestDate").value,
      expected_price: Number($("#expectedPrice").value || selectedSample.expectedPrice),
      farmer_note: $("#farmerNote").value.trim()
    };
  }

  function validateInput() {
    const fields = ["#origin", "#weight", "#harvestDate", "#expectedPrice"]
      .map((selector) => $(selector))
      .filter(Boolean);
    const invalid = fields.find((field) => typeof field.checkValidity === "function" && !field.checkValidity());
    if (!invalid) return true;
    invalid.setAttribute?.("aria-invalid", "true");
    invalid.reportValidity?.();
    invalid.focus?.();
    showToast("请先补全有效的产地、重量、采摘时间和售价");
    return false;
  }

  function selectSample(sampleId) {
    const sample = samples.find((item) => item.id === sampleId);
    if (!sample) return false;
    setSelectedSample(sample);
    clearCurrentReport();
    renderAll();
    persistState();
    switchView("farmerForm");
    return true;
  }

  function openImagePicker(source) {
    const input = $("#customImage");
    if (!input) return false;
    if (source === "camera") input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.click();
    return true;
  }

  function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReaderCtor();
    reader.onload = () => {
      setSelectedSample({
        id: `upload_${now()}`,
        label: $("#customLabel").value,
        image: reader.result,
        origin: $("#origin").value || "山东烟台",
        weight: Number($("#weight").value || 5),
        expectedPrice: Number($("#expectedPrice").value || 29.9),
        custom: true
      });
      clearCurrentReport();
      renderAll();
      switchView("farmerForm");
      showToast("本地图片已载入，可以开始智能分级");
    };
    reader.readAsDataURL(file);
  }

  function handleLabelChange() {
    const selectedSample = getSelectedSample();
    if (!selectedSample?.custom) return;
    setSelectedSample({ ...selectedSample, label: $("#customLabel").value });
    clearCurrentReport();
    renderAll();
  }

  function handleDocumentClick(event) {
    const uploadTrigger = event.target.closest("[data-upload-trigger]");
    if (uploadTrigger) return openImagePicker(uploadTrigger.dataset.uploadTrigger);

    const sampleCard = event.target.closest("[data-sample-id]");
    if (sampleCard) return selectSample(sampleCard.dataset.sampleId);

    if (event.target.id === "confirmListingBtn") {
      confirmListing?.();
      return true;
    }

    if (event.target.closest("[data-run-agent-form]")) {
      if (!validateInput()) return true;
      runAgent();
      return true;
    }

    const soldBtn = event.target.closest("[data-mark-sold]");
    if (soldBtn) {
      markProductSold?.(soldBtn.dataset.markSold);
      return true;
    }

    const completeResubmissionBtn = event.target.closest("[data-complete-resubmission]");
    if (completeResubmissionBtn) {
      completeResubmission?.(completeResubmissionBtn.dataset.completeResubmission);
      return true;
    }

    return false;
  }

  function bindInputs() {
    $("#customImage")?.addEventListener("change", handleImageChange);
    $("#customLabel")?.addEventListener("change", handleLabelChange);
  }

  return { bindInputs, formInput, validateInput, handleDocumentClick };
}
