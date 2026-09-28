const assert = require("assert");
const { recommendProducts, scoreProduct } = require("../miniprogram/ui/recommendation-model");

const profile = { confirmedProfile: { undertone: ["偏暖"], styles: ["温柔", "自然"], scenes: ["日常", "通勤"], colorFamilies: ["豆沙"] } };
const products = [
  { id: "a", status: "active", brand: "A", tags: { undertone: ["偏暖"], styles: ["温柔"] } },
  { id: "b", status: "active", brand: "B", tags: { scenes: ["通勤"] } },
  { id: "c", status: "active", brand: "C", tags: { colorFamily: ["豆沙"] } },
  { id: "inactive", status: "inactive", tags: { undertone: ["偏暖"] } },
];
assert.ok(scoreProduct(products[0], profile).score > scoreProduct(products[1], profile).score);
const first = recommendProducts(products, profile);
assert.strictEqual(first.length, 3);
assert.strictEqual(new Set(first.map((item) => item.productId)).size, 3);
assert.deepStrictEqual(first.map((item) => item.role), ["best", "daily", "style"]);
assert.ok(first.every((item) => item.matchScore >= 0 && item.reason && !/一定|保证|医学/.test(item.reason)));
assert.ok(!first.some((item) => item.productId === "inactive"));
const refreshed = recommendProducts(products, profile, [first[0].productId]);
assert.ok(!refreshed.some((item) => item.productId === first[0].productId));
assert.strictEqual(recommendProducts(products.slice(0, 2), profile).length, 2);
console.log("ok - issue27 ranks active tagged products into three recommendation roles");
console.log("ok - issue27 excludes current products and handles insufficient candidates");
