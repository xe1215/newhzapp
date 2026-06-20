const assert = require("assert");
const Module = require("module");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "wx-server-sdk") {
    return {
      DYNAMIC_CURRENT_ENV: "DYNAMIC_CURRENT_ENV",
      init() {},
      database() {
        throw new Error("Test must inject a fake database");
      },
      getWXContext() {
        throw new Error("Test must inject a fake WeChat context");
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

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

function createFakeDb(calls) {
  return {
    collection(name) {
      calls.push(["collection", name]);
      return {
        doc(id) {
          calls.push(["doc", name, id]);
          return {
            async get() {
              calls.push(["doc.get", name, id]);
              if (name === "reports" && id === "report-abc") {
                return {
                  data: {
                    _id: "report-abc",
                    testId: "test-abc",
                    openid: "openid-123",
                    status: "active",
                    generationStatus: "success",
                    previewImages: [
                      "cloud://env/bucket/one.jpg",
                      "cloud://env/bucket/two.jpg",
                      "cloud://env/bucket/three.jpg",
                    ],
                    paidImages: ["cloud://env/bucket/paid-one.jpg"],
                    snapshot: {
                      recommendations: [
                        {
                          rank: 1,
                          shadeName: "Rose Tea",
                          shadeCode: "A01",
                          colorHex: "#B84B65",
                        },
                      ],
                    },
                  },
                };
              }

              return { data: null };
            },
          };
        },
      };
    },
  };
}

test("report getPreview returns the current user's generated preview image file ids", async () => {
  const reportFunction = require("../cloudfunctions/report");
  const calls = [];

  const result = await reportFunction.main(
    {
      action: "getPreview",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.testId, "test-abc");
  assert.strictEqual(result.data.reportId, "report-abc");
  assert.strictEqual(result.data.generationStatus, "success");
  assert.strictEqual(result.data.locked, true);
  assert.deepStrictEqual(result.data.previewImages, [
    "cloud://env/bucket/one.jpg",
    "cloud://env/bucket/two.jpg",
    "cloud://env/bucket/three.jpg",
  ]);
  assert.deepStrictEqual(result.data.recommendations, [
    {
      rank: 1,
      shadeName: "Rose Tea",
      shadeCode: "A01",
      colorHex: "#B84B65",
    },
  ]);
});

test("report getPreview rejects reports that do not belong to the current user", async () => {
  const reportFunction = require("../cloudfunctions/report");
  const calls = [];

  const result = await reportFunction.main(
    {
      action: "getPreview",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "other-openid" },
    }
  );

  assert.strictEqual(result.code, "RESOURCE_NOT_FOUND");
});

test("preview page loads report preview images through the report service and renders image tags", () => {
  const page = readText("miniprogram/pages/preview/index.js");
  const template = readText("miniprogram/pages/preview/index.wxml");
  const styles = readText("miniprogram/pages/preview/index.wxss");
  const service = readText("miniprogram/services/report.js");

  assert.match(page, /require\("\.\.\/\.\.\/services\/report"\)/);
  assert.match(page, /onLoad\s*\(/);
  assert.match(page, /loadPreview\s*\(/);
  assert.match(page, /getPreview\s*\(/);
  assert.match(page, /getTempFileURL\s*\(/);
  assert.match(page, /previewImages/);
  assert.doesNotMatch(page, /wx\.cloud\.database\s*\(/);
  assert.match(template, /<image/);
  assert.match(template, /wx:for="\{\{previewImages\}\}"/);
  assert.match(template, /src="\{\{item\.url\}\}"/);
  assert.match(template, /wx:if="\{\{loading\}\}"/);
  assert.match(template, /wx:elif="\{\{errorText\}\}"/);
  assert.match(styles, /\.preview-image/);
  assert.match(service, /function getPreview/);
  assert.match(service, /callBusinessFunction\("report", "getPreview"/);
});
