export function createOpsController({ approveReview, requestResubmission, rejectReview, updateBadCaseStatus }) {
  function handleDocumentClick(event) {
    const approveButton = event.target.closest("[data-approve-id]");
    if (approveButton) {
      approveReview(approveButton.dataset.approveId);
      return true;
    }

    const resubmitButton = event.target.closest("[data-resubmit-id]");
    if (resubmitButton) {
      requestResubmission(resubmitButton.dataset.resubmitId);
      return true;
    }

    const rejectButton = event.target.closest("[data-reject-id]");
    if (rejectButton) {
      rejectReview(rejectButton.dataset.rejectId);
      return true;
    }

    const statusButton = event.target.closest("[data-badcase-status]");
    if (statusButton) {
      updateBadCaseStatus(statusButton.dataset.badcaseStatus, statusButton.dataset.nextStatus);
      return true;
    }

    return false;
  }

  return { handleDocumentClick };
}
