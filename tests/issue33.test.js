const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = JSON.parse(fs.readFileSync(path.join(root, "miniprogram", "app.json"), "utf8"));

assert.deepEqual(app.pages, [
  "pages/discover/index",
  "pages/fit/index",
  "pages/mine/index",
  "pages/analyzing/index",
  "pages/beauty-profile/index",
  "pages/edit-profile/index",
  "pages/product-detail/index",
  "pages/recommend/index",
  "pages/single-tryon/index",
]);
console.log("ok - mini program registers only the nine replacement pages");

const retiredPages = ["home", "upload", "preferences", "generating", "preview", "payment-result", "report", "my-reports", "report-history", "my", "share", "privacy", "refund-help"];
for (const page of retiredPages) {
  assert.equal(fs.existsSync(path.join(root, "miniprogram", "pages", page, "index.js")), false, `${page} page must be removed`);
}
for (const service of ["report", "share"]) {
  assert.equal(fs.existsSync(path.join(root, "miniprogram", "services", `${service}.js`)), false);
}
for (const fn of ["report", "share"]) {
  assert.equal(fs.existsSync(path.join(root, "cloudfunctions", fn, "index.js")), false);
}
assert.equal(fs.existsSync(path.join(root, "cloudfunctions", "cleanupExpiredData", "index.js")), false);
for (const moduleName of ["recommendation", "recommendation-rules", "preview-regeneration", "preview-regenerate-handlers", "jimeng-provider", "jimeng-helpers", "generation-records", "generation-flow", "generate-tryon-handlers"]) {
  assert.equal(fs.existsSync(path.join(root, "cloudfunctions", "test", `${moduleName}.js`)), false, `${moduleName} remains`);
}
for (const moduleName of ["overview", "recommendation-rules"]) {
  assert.equal(fs.existsSync(path.join(root, "cloudfunctions", "admin", `${moduleName}.js`)), false, `${moduleName} remains`);
}
const testService = require("../miniprogram/services/test");
const paymentService = require("../miniprogram/services/payment");
for (const action of ["createTest", "uploadSelfie", "submitPreferences", "regeneratePreview", "generateTryOnImages", "deleteSelfie"]) {
  assert.equal(testService[action], undefined, `${action} service must be removed`);
}
for (const action of ["createReportOrder", "confirmPayment", "requestRefund"]) {
  assert.equal(paymentService[action], undefined, `${action} service must be removed`);
}
assert.equal(typeof testService.createSingleTryOn, "function");
assert.equal(typeof paymentService.createCreditOrder, "function");
assert.equal(require("../cloudfunctions/test/package.json").dependencies.jimp, undefined);
console.log("ok - old mini program and cloud function files are gone while replacement services remain");

async function verifyRetiredActions() {
  const Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "wx-server-sdk") return { DYNAMIC_CURRENT_ENV: "test", init() {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  const test = require("../cloudfunctions/test");
  const payment = require("../cloudfunctions/payment");
  const admin = require("../cloudfunctions/admin");
  Module._load = originalLoad;
  for (const action of ["createTest", "uploadSelfie", "submitPreferences", "regeneratePreview", "generateTryOnImages", "deleteSelfie"]) {
    assert.equal((await test.main({ action })).code, "INVALID_ACTION", `test.${action} remains callable`);
  }
  for (const action of ["createReportOrder", "confirmPayment", "requestRefund"]) {
    assert.equal((await payment.main({ action })).code, "INVALID_ACTION", `payment.${action} remains callable`);
  }
  for (const action of ["listTests", "getTestDetail", "listReports", "getReportDetail", "listOrders", "getOrderDetail", "flagReport"]) {
    assert.equal((await admin.main({ action })).code, "INVALID_ACTION", `admin.${action} remains callable`);
  }
  console.log("ok - old cloud actions are no longer callable");
}
verifyRetiredActions().catch((error) => { console.error(error); process.exitCode = 1; });
