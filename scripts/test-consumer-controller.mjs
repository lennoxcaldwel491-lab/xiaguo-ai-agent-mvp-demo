import assert from "node:assert/strict";
import { createConsumerController } from "../src/features/consumer/consumer-controller.js";

const elements = {
  "#intentAmount_p1": { value: "3-5" },
  "#intentContact_p1": { value: "wx123" },
  "#feedbackType_p1": { value: "safety_concern" },
  "#feedbackText_p1": { value: "需要更清楚说明" },
  "#exitFeedbackText": { value: "担心安全" },
  "#exitFeedbackModal": {
    classList: { add() {}, remove() {} },
    setAttribute() {},
    querySelectorAll() { return []; }
  }
};

const products = [{ id: "p1", title: "测试苹果", grade: "B", status: "listed" }];
const feedbacks = [];
const logs = [];
const badCases = [];
let pendingExitProductId = null;
let selectedExitReason = "safety_concern";

const controller = createConsumerController({
  $: (selector) => elements[selector],
  $$: () => [],
  getState: () => ({ products, feedbacks, activeConsumerProductId: "p1" }),
  getPendingExitProductId: () => pendingExitProductId,
  setPendingExitProductId: (value) => { pendingExitProductId = value; },
  getSelectedExitReason: () => selectedExitReason,
  setSelectedExitReason: (value) => { selectedExitReason = value; },
  renderAll() {},
  persistState() {},
  switchView() {},
  showToast() {},
  addActionLog: (...args) => logs.push(args),
  addBadCase: (...args) => badCases.push(args),
  addFeedback: (feedback) => feedbacks.unshift(feedback),
  apiPost() {}
});

assert.equal(controller.handleDocumentClick({
  target: { closest: (selector) => selector === "[data-intent-id]" ? { dataset: { intentId: "p1" } } : null }
}), true);
assert.equal(feedbacks[0].type, "purchase_intent");

assert.equal(controller.handleDocumentClick({
  target: { closest: (selector) => selector === "[data-feedback-id]" ? { dataset: { feedbackId: "p1" } } : null }
}), true);
assert.equal(feedbacks[0].type, "safety_concern");
assert.equal(feedbacks[1].type, "purchase_intent");

pendingExitProductId = "p1";
assert.equal(controller.handleDocumentClick({
  target: { closest: (selector) => selector === "[data-consumer-back]" ? { dataset: {} } : null }
}), true);

assert.equal(controller.handleDocumentClick({
  target: { closest: (selector) => selector === "[data-open-exit-feedback]" ? { dataset: {} } : null }
}), true);
assert.equal(pendingExitProductId, "p1");

assert.equal(controller.handleDocumentClick({
  target: { closest: (selector) => selector === "[data-exit-reason]" ? { dataset: { exitReason: "price_not_attractive" } } : null }
}), true);
assert.equal(selectedExitReason, "price_not_attractive");

console.log("consumer controller behavior: ok");
