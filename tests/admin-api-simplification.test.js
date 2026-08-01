const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "admin/src/lib/admin-api.js"), "utf8");

function test(name, fn) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

test("admin api centralizes preview detail defaults through shared helpers", () => {
  assert.match(source, /function invokeWithPreview/);
  assert.match(source, /function createPreviewListResponse\(/);
  assert.match(source, /function createPreviewRecordDetail\(/);
  assert.match(source, /getTestDetail[\s\S]*createPreviewRecordDetail\(/);
  assert.match(source, /getReportDetail[\s\S]*createPreviewRecordDetail\(/);
  assert.match(source, /getOrderDetail[\s\S]*createPreviewRecordDetail\(/);
  assert.match(source, /getProviderRunDetail[\s\S]*createPreviewRecordDetail\(/);
  assert.match(source, /getEventDetail[\s\S]*createPreviewRecordDetail\(/);
});
