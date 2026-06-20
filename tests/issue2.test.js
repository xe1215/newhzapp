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
    .then(() => {
      console.log(`ok - ${name}`);
    })
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
        async add(payload) {
          calls.push(["add", name, payload]);
          return { _id: `${name}-1` };
        },
        doc(id) {
          calls.push(["doc", name, id]);
          return {
            async update(payload) {
              calls.push(["doc.update", name, id, payload]);
              return { stats: { updated: 1 } };
            },
          };
        },
      };
    },
  };
}

function loadUploadPage(options) {
  const pagePath = path.join(root, "miniprogram/pages/upload/index.js");
  const originalPage = global.Page;
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  const cached = require.cache[pagePath];
  let pageDefinition;

  global.Page = function registerPage(definition) {
    pageDefinition = definition;
  };
  global.wx = options.wx;
  global.getApp = options.getApp;

  Module._load = function patchedLoadWithTestService(request, parent, isMain) {
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

    if (request === "../../services/test") {
      return options.testService;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[pagePath];
  require(pagePath);

  Module._load = originalLoad;
  global.Page = originalPage;
  global.wx = originalWx;
  global.getApp = originalGetApp;

  if (cached) {
    require.cache[pagePath] = cached;
  } else {
    delete require.cache[pagePath];
  }

  return pageDefinition;
}

test("test cloud function accepts a qualified selfie and creates a private test record", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];

  const result = await testFunction.main(
    {
      action: "uploadSelfie",
      data: {
        tempFileID: "cloud://tmp/selfie.jpg",
        checks: {
          contentSafe: true,
          faceDetected: true,
          lipsVisible: true,
          blurScore: 0.18,
          occlusionScore: 0.1,
        },
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      id: () => "test-abc",
      moveFile: async ({ from, to }) => {
        calls.push(["moveFile", from, to]);
        return { fileID: `cloud://${to}` };
      },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.deepStrictEqual(result.data, {
    testId: "test-abc",
    selfieFileId: "cloud://selfies/openid-123/test-abc/original.jpg",
    safetyStatus: "passed",
    qualityStatus: "passed",
    expiresAt: "2026-06-14T08:00:00.000Z",
  });
  assert.deepStrictEqual(calls[0], [
    "moveFile",
    "cloud://tmp/selfie.jpg",
    "selfies/openid-123/test-abc/original.jpg",
  ]);
  const testAdd = calls.find((call) => call[0] === "add" && call[1] === "try_on_tests");
  const eventAdd = calls.find((call) => call[0] === "add" && call[1] === "events");
  assert.ok(testAdd, "try_on_tests record should be created");
  assert.ok(eventAdd, "upload success event should be created");
  assert.strictEqual(testAdd[2].data.selfieFileId, result.data.selfieFileId);
  assert.strictEqual(eventAdd[2].data.type, "upload_selfie_success");
});

test("test cloud function rejects unsafe or low quality selfies with clear reasons", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const deletedFiles = [];

  const result = await testFunction.main(
    {
      action: "uploadSelfie",
      data: {
        tempFileID: "cloud://tmp/selfie.jpg",
        checks: {
          contentSafe: false,
          faceDetected: false,
          lipsVisible: false,
          blurScore: 0.9,
          occlusionScore: 0.8,
        },
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      id: () => "test-abc",
      deleteFile: async (fileID) => {
        deletedFiles.push(fileID);
      },
      moveFile: async () => {
        throw new Error("moveFile should not be called for rejected selfies");
      },
    }
  );

  assert.strictEqual(result.code, "SELFIE_REJECTED");
  assert.deepStrictEqual(result.data.reasons, [
    "content_unsafe",
    "face_missing",
    "lips_not_visible",
    "image_blurry",
    "face_occluded",
  ]);
  assert.strictEqual(calls.length, 0);
  assert.deepStrictEqual(deletedFiles, ["cloud://tmp/selfie.jpg"]);
});

test("upload page stores selfie privately through cloud function after client upload", () => {
  const uploadPage = readText("miniprogram/pages/upload/index.js");
  const testService = readText("miniprogram/services/test.js");

  assert.match(uploadPage, /uploadFile\s*\(/);
  assert.match(uploadPage, /uploadSelfie\s*\(/);
  assert.doesNotMatch(uploadPage, /wx\.cloud\.database\s*\(/);
  assert.doesNotMatch(uploadPage, /cloudPath:\s*["']selfies\//);
  assert.match(testService, /function uploadSelfie/);
  assert.match(testService, /callBusinessFunction\("test", "uploadSelfie"/);
});

test("upload page surfaces concrete selfie rejection reasons for the user", async () => {
  const wxRuntime = {
    cloud: {
      uploadFile() {
        return Promise.resolve({ fileID: "cloud://tmp/selfie.jpg" });
      },
    },
    navigateTo() {
      throw new Error("navigateTo should not be called for rejected selfies");
    },
  };
  const getAppRuntime = () => ({
    globalData: {
      user: { openid: "openid-123" },
    },
  });
  const page = loadUploadPage({
    getApp: getAppRuntime,
    wx: wxRuntime,
    testService: {
      uploadSelfie() {
        return Promise.resolve({
          result: {
            code: "SELFIE_REJECTED",
            message: "",
            data: {
              reasons: ["image_blurry", "lips_not_visible"],
            },
          },
        });
      },
    },
  });

  const state = {
    data: {
      uploading: false,
      feedback: "",
    },
    setData(update) {
      this.data = Object.assign({}, this.data, update);
    },
  };

  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  global.wx = wxRuntime;
  global.getApp = getAppRuntime;

  try {
    await page.uploadSelectedSelfie.call(state, "C:/tmp/selfie.jpg");
  } finally {
    global.wx = originalWx;
    global.getApp = originalGetApp;
  }

  assert.strictEqual(state.data.uploading, false);
  assert.match(state.data.feedback, /clear/i);
  assert.match(state.data.feedback, /lips/i);
});
