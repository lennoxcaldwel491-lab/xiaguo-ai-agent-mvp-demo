import assert from "node:assert/strict";
import { createFarmerController } from "../src/features/farmer/farmer-controller.js";

const handlers = {};
const elements = {
  "#fruitType": { value: "apple" },
  "#origin": { value: "山东烟台" },
  "#weight": { value: "6" },
  "#harvestDate": { value: "2026-06-19" },
  "#expectedPrice": { value: "31.5" },
  "#farmerNote": { value: "测试批次" },
  "#customLabel": { value: "bruise_defect", addEventListener: (type, handler) => { handlers.label = handler; } },
  "#customImage": {
    files: [{ name: "apple.png" }],
    addEventListener: (type, handler) => { handlers.image = handler; },
    setAttribute() {},
    removeAttribute() {},
    click() {}
  }
};

const samples = [
  { id: "sample_a", label: "fresh", origin: "默认产地", weight: 5, expectedPrice: 29.9 },
  { id: "sample_b", label: "scab_defect" }
];
let selectedSample = samples[0];
const views = [];
let persisted = 0;
const actions = [];

class FakeFileReader {
  readAsDataURL() {
    this.result = "data:image/png;base64,test";
    this.onload();
  }
}

const controller = createFarmerController({
  $: (selector) => elements[selector],
  samples,
  getSelectedSample: () => selectedSample,
  setSelectedSample: (sample) => { selectedSample = sample; },
  clearCurrentReport() {},
  renderAll() {},
  persistState: () => { persisted += 1; },
  switchView: (view) => views.push(view),
  showToast() {},
  runAgent: () => actions.push("runAgent"),
  confirmListing: () => actions.push("confirmListing"),
  markProductSold: (productId) => actions.push(`mark:${productId}`),
  completeResubmission: (productId) => actions.push(`resubmit:${productId}`),
  FileReaderCtor: FakeFileReader,
  now: () => 123
});

assert.deepEqual(controller.formInput(), {
  fruit_type: "apple",
  origin: "山东烟台",
  weight: 6,
  harvest_date: "2026-06-19",
  expected_price: 31.5,
  farmer_note: "测试批次"
});

const selected = controller.handleDocumentClick({
  target: {
    closest: (selector) => selector === "[data-sample-id]" ? { dataset: { sampleId: "sample_b" } } : null
  }
});
assert.equal(selected, true);
assert.equal(selectedSample.id, "sample_b");
assert.equal(persisted, 1);
assert.equal(views.at(-1), "farmerForm");

controller.bindInputs();
handlers.image({ target: elements["#customImage"] });
assert.deepEqual(selectedSample, {
  id: "upload_123",
  label: "bruise_defect",
  image: "data:image/png;base64,test",
  origin: "山东烟台",
  weight: 6,
  expectedPrice: 31.5,
  custom: true
});
assert.equal(views.at(-1), "farmerForm");

assert.equal(
  controller.handleDocumentClick({
    target: {
      id: "confirmListingBtn",
      closest: () => null
    }
  }),
  true
);
assert.equal(actions.at(-1), "confirmListing");

assert.equal(
  controller.handleDocumentClick({
    target: {
      closest: (selector) => selector === "[data-mark-sold]" ? { dataset: { markSold: "p-1" } } : null
    }
  }),
  true
);
assert.equal(actions.at(-1), "mark:p-1");

assert.equal(
  controller.handleDocumentClick({
    target: {
      closest: (selector) => selector === "[data-complete-resubmission]" ? { dataset: { completeResubmission: "p-2" } } : null
    }
  }),
  true
);
assert.equal(actions.at(-1), "resubmit:p-2");

console.log("farmer controller behavior: ok");
