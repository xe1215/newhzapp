const assert = require("assert");
const { rankLipsticks } = require("../cloudfunctions/test/recommendation");

const recommendations = rankLipsticks(
  [
    { _id: "one", status: "active", brand: "品牌 A", shadeName: "色号 A", shadeCode: "A", colorHex: "#A11111", budget: "100-300" },
    { _id: "two", status: "active", brand: "品牌 B", shadeName: "色号 B", shadeCode: "B", colorHex: "#B22222", budget: "100-300" },
    { _id: "three", status: "active", brand: "品牌 C", shadeName: "色号 C", shadeCode: "C", colorHex: "#C33333", budget: "100-300" },
  ],
  { skinTone: "冷白皮", budget: "100-300" },
  3
);

assert.strictEqual(recommendations.length, 3);
assert.deepStrictEqual(new Set(recommendations.map((item) => item.lipstickId)), new Set(["one", "two", "three"]));
console.log("ok - recommendation ranking accepts the current lipstick budget field");
