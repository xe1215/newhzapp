const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function decodeUnicodeEscapes(text) {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
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

test("developer console shell uses Chinese module labels and route seams with lazy-loaded pages", () => {
  const appSource = readText("admin/src/App.jsx");
  const constantsSource = decodeUnicodeEscapes(readText("admin/src/constants/admin-shell.js"));
  const previewApiSource = readText("admin/src/lib/admin-api.js");
  const cloudConstantsSource = readText("cloudfunctions/admin/constants.js");

  ["运营仪表盘", "口红库维护", "测试记录", "报告记录", "订单与退款", "生成与事件日志"].forEach((label) => {
    assert.match(constantsSource, new RegExp(label));
    assert.match(previewApiSource, new RegExp(label));
    assert.match(cloudConstantsSource, new RegExp(label));
  });

  assert.match(appSource, /lazy\(\(\) => import\("\.\/pages\/LipstickLibraryPage"\)\)/);
  assert.match(appSource, /lazy\(\(\) => import\("\.\/pages\/LogsPage"\)\)/);
  assert.doesNotMatch(
    appSource,
    /navigate\("\/overview",\s*\{\s*replace:\s*true\s*\}\);/,
    "loading shell data should not redirect every selected sidebar route back to overview"
  );
});
