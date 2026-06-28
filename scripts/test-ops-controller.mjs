import assert from "node:assert/strict";
import { createOpsController } from "../src/features/ops/ops-controller.js";

const calls = [];
const controller = createOpsController({
  approveReview: (id) => calls.push(["approve", id]),
  requestResubmission: (id) => calls.push(["resubmit", id]),
  rejectReview: (id) => calls.push(["reject", id]),
  updateBadCaseStatus: (id, status) => calls.push(["badcase", id, status])
});

function click(selector, dataset) {
  return controller.handleDocumentClick({
    target: { closest: (candidate) => candidate === selector ? { dataset } : null }
  });
}

assert.equal(click("[data-approve-id]", { approveId: "p1" }), true);
assert.equal(click("[data-resubmit-id]", { resubmitId: "p2" }), true);
assert.equal(click("[data-reject-id]", { rejectId: "p3" }), true);
assert.equal(click("[data-badcase-status]", { badcaseStatus: "b1", nextStatus: "已修复" }), true);
assert.deepEqual(calls, [["approve", "p1"], ["resubmit", "p2"], ["reject", "p3"], ["badcase", "b1", "已修复"]]);
console.log("ops controller behavior: ok");
