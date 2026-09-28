const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const miniRoot = path.join(root, "miniprogram");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
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

test("three primary pages are registered as the new tab shell", () => {
  const app = JSON.parse(read("miniprogram/app.json"));
  assert.deepStrictEqual(app.pages.slice(0, 3), [
    "pages/discover/index",
    "pages/fit/index",
    "pages/mine/index",
  ]);
  assert.strictEqual(app.window.backgroundColor, "#F2EDE6");
  assert.strictEqual(app.window.navigationBarBackgroundColor, "#FFFEFB");
  assert.strictEqual(app.tabBar, undefined, "the design uses a custom bottom navigation shell");
});

test("primary pages expose the three-tab labels and use only local mock data", () => {
  for (const page of ["discover", "fit", "mine"]) {
    const template = fs.readFileSync(path.join(miniRoot, "pages", page, "index.wxml"), "utf8");
    assert.match(template, /首页/);
    assert.match(template, /适合我/);
    assert.match(template, /我的/);
    assert.doesNotMatch(template, /报告|退款|分享/);

    const script = fs.readFileSync(path.join(miniRoot, "pages", page, "index.js"), "utf8");
    assert.doesNotMatch(script, /services\/(report|payment|share|test)/);
    assert.match(script, /mock|data:/i);
  }
});

test("primary page styles preserve the HTML design tokens and fixed media geometry", () => {
  const style = fs.readFileSync(path.join(miniRoot, "pages", "design-shared.wxss"), "utf8");
  for (const token of ["#F2EDE6", "#FFFEFB", "#966B5B", "#3A2A25", "#EDE5DE"]) {
    assert.match(style, new RegExp(token.replace("#", "\\#"), "i"));
  }
  assert.match(style, /aspect-ratio|product-placeholder/);
  assert.match(style, /env\(safe-area-inset-bottom\)/);
});
