import assert from "node:assert/strict";
import { createProductFromReport, upsertProduct } from "../src/features/farmer/farmer-workflow.js";

const report = {
  product_id: "p1", origin: "烟台", image: "apple.jpg", grade: "B", weight: 5,
  expected_price: 29.9, confidence: 0.88, defect_label: "果锈", safety_label: "通常可食用", consumer_copy: "透明说明"
};
const product = createProductFromReport(report, "listed", () => ({ label: "家庭消费", detail: "透明说明后销售" }));
assert.equal(product.title, "烟台 B 级苹果");
assert.equal(product.status, "listed");
assert.deepEqual(upsertProduct([{ id: "p1", status: "draft" }, { id: "p2" }], product).map((item) => item.id), ["p1", "p2"]);
console.log("farmer workflow behavior: ok");
