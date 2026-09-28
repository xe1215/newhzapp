const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const contractPath = path.join(root, "docs", "delivery", "iterations", "ITER-005", "CONTRACT.md");
const htmlPath = "D:\\index_embed.html";

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}

test("ITER-005 contract freezes the nine pages and three-tab information architecture", () => {
  const contract = readText(contractPath);

  for (const page of [
    "discover",
    "fit",
    "mine",
    "analyzing",
    "beauty-profile",
    "edit-profile",
    "product-detail",
    "recommend",
    "single-tryon",
  ]) {
    assert.match(contract, new RegExp(`\\b${page}\\b`));
  }

  assert.match(contract, /首页\s*[｜|]\s*适合我\s*[｜|]\s*我的/);
  assert.match(contract, /推荐页.*3.*商品/);
  assert.match(contract, /单支试色.*1.*张/);
});

test("ITER-005 contract defines the minimum view models, controlled tags, and credit boundary", () => {
  const contract = readText(contractPath);

  for (const viewModel of [
    "ProductCardVM",
    "BeautyProfileVM",
    "RecommendationCardVM",
    "TryOnJobVM",
    "TryOnHistoryItemVM",
  ]) {
    assert.match(contract, new RegExp(`##?[^\\n]*${viewModel}`));
  }

  for (const tag of ["色系", "冷暖", "明度", "饱和度", "妆感", "场景", "风格"]) {
    assert.match(contract, new RegExp(tag));
  }

  assert.match(contract, /singleTryOnCostCredits/);
  assert.match(contract, /套餐价格.*待产品确认|价格.*待产品确认/);
});

test("design baseline does not expose removed report, refund, or full-report actions", () => {
  if (!fs.existsSync(htmlPath)) {
    return;
  }

  const html = readText(htmlPath);
  for (const staleCopy of ["我的报告", "退款说明", "查看完整报告", "AI试色 · 效果示意"]) {
    assert.doesNotMatch(html, new RegExp(staleCopy.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")));
  }
});
