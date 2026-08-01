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

test("operations overview moved behind a dedicated page module while preserving dashboard structure", () => {
  const appSource = readText("admin/src/App.jsx");
  const pageSource = readText("admin/src/pages/OperationsDashboardPage.jsx");
  const apiSource = readText("admin/src/lib/admin-api.js");

  ["运营仪表盘", "最近订单", "风险提醒", "转化摘要", "运营漏斗", "最近生成失败", "最近异常订单"].forEach(
    (label) => {
      assert.match(pageSource, new RegExp(label));
    }
  );

  assert.match(pageSource, /overview-kpis/);
  assert.match(pageSource, /dashboard-grid/);
  assert.match(pageSource, /recent-orders/);
  assert.match(pageSource, /OperationsDashboardPage[\s\S]*useState\("last7Days"\)/);
  assert.doesNotMatch(pageSource, /overview\.empty\s*\?\s*\(/);
  assert.match(appSource, /lazy\(\(\) => import\("\.\/pages\/OperationsDashboardPage"\)\)/);
  assert.match(apiSource, /buildPreviewOverview/);
  assert.match(apiSource, /recentExceptionOrders/);
  assert.match(pageSource, /listOrders/);
  assert.match(pageSource, /fallbackRecentOrders/);
  assert.match(pageSource, /paidOrderCount/);
  assert.match(pageSource, /dashboardRecentOrders/);
  assert.match(pageSource, /const fallbackRangeStart = data\?\.range\?\.start \|\| \"\";/);
  assert.match(pageSource, /const fallbackRangeEnd = data\?\.range\?\.end \|\| \"\";/);
  assert.match(
    pageSource,
    /listOrders\(token,\s*\{\s*status: "paid",\s*startDate: fallbackRangeStart,\s*endDate: fallbackRangeEnd,\s*\}\)/
  );
});
