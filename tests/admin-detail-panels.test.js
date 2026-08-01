const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

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

test("detail panels keep full record visibility while sharing a common detail module", () => {
  const primitivesSource = readText("admin/src/components/admin-primitives.jsx");
  const detailBuildersSource = readText("admin/src/components/detail-builders.js");
  const logsPageSource = readText("admin/src/pages/LogsPage.jsx");
  const ordersPageSource = readText("admin/src/pages/OrdersPage.jsx");

  assert.match(primitivesSource, /function DetailList\(/);
  assert.match(primitivesSource, /function buildDetailItem\(/);

  [
    "currentReportId",
    "preferences.skinTone",
    "lifecycle.reportReadyAt",
    "assets.previewImages",
    "snapshot.recommendations",
    "audit.flaggedAt",
    "transactionId",
    "outTradeNo",
    "originalImageFileId",
    "watermarkedImageFileId",
  ].forEach((field) => {
    assert.match(detailBuildersSource, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  ["refundReason", "adminNote"].forEach((field) => {
    assert.match(ordersPageSource, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  assert.match(logsPageSource, /buildEventDetailItems\(selectedEvent\)/);
  assert.match(logsPageSource, /selectedEvent \? \(/);
  assert.match(logsPageSource, /formatTimestamp/);
  assert.match(logsPageSource, /\\u521b\\u5efa\\u65f6\\u95f4/);
});

test("report and log detail panels guard empty selection before reading nested payloads", () => {
  const reportsPageSource = readText("admin/src/pages/ReportsPage.jsx");
  const logsPageSource = readText("admin/src/pages/LogsPage.jsx");

  assert.doesNotMatch(reportsPageSource, /selectedDetail\.snapshot/);
  assert.doesNotMatch(logsPageSource, /selectedEvent\.metadata/);
});
