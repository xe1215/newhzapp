import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

globalThis.window = {
  location: {
    hostname: "127.0.0.1",
  },
  sessionStorage: {
    getItem() {
      return "";
    },
    setItem() {},
    removeItem() {},
  },
};

const moduleUrl = pathToFileURL(path.resolve("admin/src/lib/admin-api.js")).href;
const adminApi = await import(moduleUrl);
const token = adminApi.getPreviewToken();

const created = await adminApi.saveLipstick(token, {
  brand: "测试品牌",
  shadeName: "日常玫瑰",
  shadeCode: "A01",
  colorHex: "#CC6677",
  skinToneTags: ["neutral", "warm"],
  budgetMin: 50,
  budgetMax: 120,
  status: "active",
});

assert.equal(created.record.brand, "测试品牌");

const listed = await adminApi.listLipsticks(token, {
  status: "active",
});

assert.equal(listed.records.length, 1);
assert.equal(listed.records[0].brand, "测试品牌");
assert.deepEqual(listed.availableFilters.brands, ["测试品牌"]);

console.log("ok - preview lipstick saves are visible in the preview lipstick list");
