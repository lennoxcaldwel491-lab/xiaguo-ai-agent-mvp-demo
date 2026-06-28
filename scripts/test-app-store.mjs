import assert from "node:assert/strict";
import { createAppStore } from "../src/core/app-store.js";

const store = createAppStore({ count: 1, items: [] });
const actions = [];
store.subscribe((state, action) => actions.push([action, state.count]));
store.set("count", 2, "count:set");
store.update("count", (count) => count + 1, "count:increment");
store.patch({ items: ["apple"] }, "items:replace");

assert.equal(store.state.count, 3);
assert.deepEqual(store.state.items, ["apple"]);
assert.deepEqual(actions.map(([action]) => action), ["count:set", "count:increment", "items:replace"]);
console.log("app store behavior: ok");
