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
  const reportOverrides = calls.reportOverrides || {};
  return {
    collection(name) {
      calls.push(["collection", name]);
      return {
        doc(id) {
          calls.push(["doc", name, id]);
          return {
            async get() {
              calls.push(["doc.get", name, id]);
              if (name === "try_on_tests") {
                return {
                  data: {
                    _id: "test-abc",
                    openid: "openid-123",
                    selfieFileId: "cloud://selfies/openid-123/test-abc/original.jpg",
                    activeReportId: "report-abc",
                  },
                };
              }

              if (name === "reports") {
                return {
                  data: {
                    _id: "report-abc",
                    openid: "openid-123",
                    testId: "test-abc",
                    ...reportOverrides,
                    snapshot: {
                      recommendations: [
                        {
                          lipstickId: "best",
                          rank: 1,
                          role: "best_match",
                          brand: "Brand A",
                          shadeName: "Rose Tea",
                          shadeCode: "A01",
                          colorHex: "#b84b65",
                          texture: "velvet",
                          textureLabel: "丝绒",
                          matchedPreferences: {
                            scene: "daily",
                            style: "natural",
                          },
                        },
                        {
                          lipstickId: "second",
                          rank: 2,
                          role: "daily_safe",
                          brand: "Brand C",
                          shadeName: "Cocoa Pink",
                          shadeCode: "C12",
                          colorHex: "#9f5060",
                          texture: "matte",
                          textureLabel: "哑光",
                          matchedPreferences: {
                            scene: "daily",
                            style: "commute",
                          },
                        },
                        {
                          lipstickId: "third",
                          rank: 3,
                          role: "style_boost",
                          brand: "Brand D",
                          shadeName: "Clear Berry",
                          shadeCode: "D08",
                          colorHex: "#b33258",
                          texture: "glossy",
                          textureLabel: "水光",
                          matchedPreferences: {
                            scene: "date",
                            style: "natural",
                          },
                        },
                      ],
                    },
                  },
                };
              }

              return { data: null };
            },
            async update(payload) {
              calls.push(["doc.update", name, id, payload]);
              return { stats: { updated: 1 } };
            },
          };
        },
        async add(payload) {
          calls.push(["add", name, payload]);
          return { _id: `${name}-1` };
        },
      };
    },
  };
}

test("generateTryOnImages uses provider adapter, records provider run, updates report images, and emits success event", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const env = {
    IMAGE_PROVIDER: "mock",
    IMAGE_PROVIDER_MODEL: "mock-tryon-v1",
    IMAGE_PROVIDER_API_KEY: "test-key",
    TRYON_PROMPT_VERSION: "v1",
    TRYON_PROMPT: "Keep identity, only change lip color.",
    TRYON_NEGATIVE_PROMPT: "Do not alter teeth, skin, nose, or face shape.",
    IMAGE_PROVIDER_TIMEOUT_MS: "30000",
  };

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env,
      durationMs: () => 1234,
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.provider, "mock");
  assert.strictEqual(result.data.previewImages.length, 3);
  assert.strictEqual(result.data.paidImages.length, 3);
  assert.ok(result.data.previewImages.every((fileId) => fileId.includes("report-abc")));
  assert.ok(result.data.paidImages.every((fileId) => fileId.includes("report-abc")));

  const reportUpdate = calls.find((call) => call[0] === "doc.update" && call[1] === "reports");
  const providerRun = calls.find((call) => call[0] === "add" && call[1] === "provider_runs");
  const successEvent = calls.find((call) => call[0] === "add" && call[1] === "events");

  assert.ok(reportUpdate, "report should be updated with images");
  assert.deepStrictEqual(reportUpdate[3].data.previewImages, result.data.previewImages);
  assert.deepStrictEqual(reportUpdate[3].data.paidImages, result.data.paidImages);
  assert.ok(providerRun, "provider run should be recorded");
  assert.strictEqual(providerRun[2].data.provider, "mock");
  assert.strictEqual(providerRun[2].data.status, "success");
  assert.strictEqual(providerRun[2].data.durationMs, 1234);
  assert.strictEqual(providerRun[2].data.retryIndex, 0);
  assert.strictEqual(providerRun[2].data.promptVersion, "v1");
  assert.strictEqual(providerRun[2].data.prompts.length, 3);
  assert.ok(providerRun[2].data.prompts[0].prompt.includes("Brand A A01"));
  assert.ok(providerRun[2].data.prompts[0].prompt.includes("#b84b65"));
  assert.ok(providerRun[2].data.prompts[0].prompt.includes("丝绒"));
  assert.ok(providerRun[2].data.prompts[0].prompt.includes("参考强度为85"));
  assert.ok(providerRun[2].data.prompts[0].prompt.includes("1:1 像素级精确复刻"));
  assert.ok(providerRun[2].data.prompts[0].prompt.includes("以上传的参考图片为唯一且绝对的基准"));
  assert.ok(providerRun[2].data.prompts[0].prompt.includes("一次生成 3 张不同口红颜色的试色图"));
  assert.strictEqual(providerRun[2].data.prompts[0].referenceStrength, 85);
  assert.ok(providerRun[2].data.prompts[0].cleanPrompt.includes("无水印版本要求"));
  assert.ok(providerRun[2].data.prompts[0].watermarkedPrompt.includes("水印版本要求"));
  assert.ok(providerRun[2].data.prompts[0].negativePrompt.includes("不要缩放"));
  assert.deepStrictEqual(providerRun[2].data.imageFileIds, [
    ...result.data.previewImages,
    ...result.data.paidImages,
  ]);
  assert.ok(successEvent, "generation success event should be recorded");
  assert.strictEqual(successEvent[2].data.type, "generation_success");
});

test("generateTryOnImages records provider failure with clear retryable error code", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
        retryIndex: 2,
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "mock-fail",
        IMAGE_PROVIDER_MODEL: "mock-tryon-v1",
        IMAGE_PROVIDER_TIMEOUT_MS: "30000",
      },
      durationMs: () => 30000,
    }
  );

  assert.strictEqual(result.code, "IMAGE_PROVIDER_FAILED");
  assert.strictEqual(result.data.retryable, true);

  const providerRun = calls.find((call) => call[0] === "add" && call[1] === "provider_runs");
  const failEvent = calls.find((call) => call[0] === "add" && call[1] === "events");
  const reportUpdate = calls.find(
    (call) =>
      call[0] === "doc.update" &&
      call[1] === "reports" &&
      call[3].data.generationStatus === "failed"
  );

  assert.ok(providerRun, "failed provider run should be recorded");
  assert.strictEqual(providerRun[2].data.provider, "mock-fail");
  assert.strictEqual(providerRun[2].data.status, "failed");
  assert.strictEqual(providerRun[2].data.retryIndex, 2);
  assert.strictEqual(providerRun[2].data.errorCode, "IMAGE_PROVIDER_FAILED");
  assert.ok(reportUpdate, "failed generation should be visible on the report");
  assert.strictEqual(reportUpdate[3].data.generationStatus, "failed");
  assert.strictEqual(reportUpdate[3].data.generationErrorCode, "IMAGE_PROVIDER_FAILED");
  assert.strictEqual(reportUpdate[3].data.generationErrorMessage, "Mock provider failed");
  assert.ok(failEvent, "generation fail event should be recorded");
  assert.strictEqual(failEvent[2].data.type, "generation_fail");
});

test("generateTryOnImages returns clear configuration error when Jimeng credentials are missing", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
      },
      durationMs: () => 10,
    }
  );

  assert.strictEqual(result.code, "JIMENG_CREDENTIALS_REQUIRED");
  assert.strictEqual(result.data.retryable, false);

  const providerRun = calls.find((call) => call[0] === "add" && call[1] === "provider_runs");
  assert.ok(providerRun, "failed Jimeng configuration should be recorded");
  assert.strictEqual(providerRun[2].data.provider, "jimeng");
  assert.strictEqual(providerRun[2].data.errorCode, "JIMENG_CREDENTIALS_REQUIRED");
});

test("skip legacy synchronous Jimeng task flow test", async () => {
  return;
});

test("skip legacy synchronous Jimeng task flow body", async () => {
  return;
});
/*
test("generateTryOnImages can submit Jimeng tasks, poll image URLs, upload generated images, and store report files", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const httpCalls = [];
  let taskSeq = 0;

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
        JIMENG_MAX_POLLS: "1",
        JIMENG_POLL_INTERVAL_MS: "0",
        TRYON_PROMPT_VERSION: "jimeng-test",
      },
      durationMs: () => 4567,
      getTempFileURL: async (fileId) => `https://temp.example/${encodeURIComponent(fileId)}`,
      sleep: async () => {},
      httpRequest: async (options, body) => {
        httpCalls.push({ options, body: JSON.parse(body) });

        if (options.path.includes("JimengSeedream46CVToBSubmitTask")) {
          taskSeq += 1;
          return {
            statusCode: 200,
            json: {
              Result: {
                task_id: `task-${taskSeq}`,
              },
            },
          };
        }

        return {
          statusCode: 200,
          json: {
            Result: {
              status: "done",
              image_urls: [`https://result.example/${httpCalls.length}.jpg`],
            },
          },
        };
      },
      uploadFileFromUrl: async ({ url, cloudPath }) => {
        calls.push(["uploadFileFromUrl", url, cloudPath]);
        return `cloud://generated/${cloudPath}`;
      },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.provider, "jimeng");
  assert.strictEqual(result.data.previewImages.length, 3);
  assert.strictEqual(result.data.paidImages.length, 3);
  assert.strictEqual(httpCalls.filter((call) => call.options.path.includes("SubmitTask")).length, 3);
  assert.strictEqual(httpCalls.filter((call) => call.options.path.includes("GetResult")).length, 3);
  assert.ok(httpCalls[0].options.headers.Authorization.includes("Credential=ak/"));
  assert.strictEqual(httpCalls[0].body.req_key, "jimeng_seedream46_cvtob");
  assert.deepStrictEqual(httpCalls[0].body.image_urls, [
    "https://temp.example/cloud%3A%2F%2Fselfies%2Fopenid-123%2Ftest-abc%2Foriginal.jpg",
  ]);
  assert.strictEqual(httpCalls[0].body.logo_info.add_logo, false);
  for (const call of httpCalls.filter((item) => item.options.path.includes("SubmitTask"))) {
    assert.ok(
      call.body.prompt.length <= 800,
      `Jimeng prompt should not exceed 800 chars, got ${call.body.prompt.length}`
    );
    assert.ok(call.body.prompt.includes("仅修改嘴唇颜色"));
    assert.ok(call.body.prompt.includes("#"));
    assert.ok(call.body.prompt.includes("质地"));
    assert.ok(call.body.prompt.includes("禁止缩放/裁剪/旋转/平移"));
  }
  assert.ok(httpCalls[0].body.prompt.includes("无水印版"));

  const uploads = calls.filter((call) => call[0] === "uploadFileFromUrl");
  assert.strictEqual(uploads.length, 3);
  assert.ok(uploads[0][2].includes("tryon-results/report-abc/1-best-clean.jpg"));

  const reportUpdate = calls.find((call) => call[0] === "doc.update" && call[1] === "reports");
  const providerRun = calls.find((call) => call[0] === "add" && call[1] === "provider_runs");
  assert.deepStrictEqual(reportUpdate[3].data.previewImages, result.data.previewImages);
  assert.deepStrictEqual(reportUpdate[3].data.paidImages, result.data.paidImages);
  assert.deepStrictEqual(result.data.previewImages, result.data.paidImages);
  assert.strictEqual(providerRun[2].data.provider, "jimeng");
  assert.strictEqual(providerRun[2].data.promptVersion, "jimeng-test");
});
*/

test("skip legacy sequential Jimeng sync test", async () => {
  return;
});
/*
test("generateTryOnImages finishes each Jimeng image before submitting the next one", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const sequence = [];
  let taskSeq = 0;

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
        JIMENG_MAX_POLLS: "1",
        JIMENG_POLL_INTERVAL_MS: "0",
      },
      durationMs: () => 3210,
      getTempFileURL: async () => "https://temp.example/selfie.jpg",
      sleep: async () => {},
      httpRequest: async (options) => {
        if (options.path.includes("JimengSeedream46CVToBSubmitTask")) {
          taskSeq += 1;
          sequence.push(`submit-${taskSeq}`);
          return {
            statusCode: 200,
            json: {
              Result: {
                task_id: `task-${taskSeq}`,
              },
            },
          };
        }

        sequence.push("poll");
        return {
          statusCode: 200,
          json: {
            Result: {
              status: "done",
              image_urls: [`https://result.example/${sequence.length}.jpg`],
            },
          },
        };
      },
      uploadFileFromUrl: async ({ cloudPath }) => {
        sequence.push("upload");
        return `cloud://generated/${cloudPath}`;
      },
    }
  );

  assert.strictEqual(result.code, 0);
  assert.deepStrictEqual(sequence, [
    "submit-1",
    "poll",
    "upload",
    "submit-2",
    "poll",
    "upload",
    "submit-3",
    "poll",
    "upload",
  ]);
  assert.strictEqual(sequence.filter((item) => item.startsWith("submit")).length, 3);
});
*/

test("skip legacy synchronous nested task id test", async () => {
  return;
});
/*
test("generateTryOnImages accepts Jimeng submit responses with stringified nested data task id", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  let taskSeq = 0;

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
        JIMENG_MAX_POLLS: "1",
        JIMENG_POLL_INTERVAL_MS: "0",
      },
      durationMs: () => 888,
      getTempFileURL: async () => "https://temp.example/selfie.jpg",
      sleep: async () => {},
      httpRequest: async (options) => {
        if (options.path.includes("JimengSeedream46CVToBSubmitTask")) {
          taskSeq += 1;
          return {
            statusCode: 200,
            json: {
              Result: JSON.stringify({
                data: {
                  task_id: `nested-task-${taskSeq}`,
                },
              }),
            },
          };
        }

        return {
          statusCode: 200,
          json: {
            Result: JSON.stringify({
              data: {
                status: "done",
                image_urls: ["https://result.example/image.jpg"],
              },
            }),
          },
        };
      },
      uploadFileFromUrl: async ({ cloudPath }) => `cloud://generated/${cloudPath}`,
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.previewImages.length, 3);
  assert.strictEqual(result.data.paidImages.length, 3);
});
*/

test("generateTryOnImages does not treat Jimeng request id as a task id", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const httpCalls = [];

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
        JIMENG_MAX_POLLS: "1",
        JIMENG_POLL_INTERVAL_MS: "0",
      },
      durationMs: () => 100,
      getTempFileURL: async () => "https://temp.example/selfie.jpg",
      httpRequest: async (options) => {
        httpCalls.push(options.path);
        return {
          statusCode: 200,
          json: {
            Result: {
              request_id: "202606152254267AB7A80BB95D5B10AD92",
              status: 10000,
              message: "success",
            },
          },
        };
      },
    }
  );

  assert.strictEqual(result.code, "JIMENG_TASK_ID_MISSING");
  assert.strictEqual(httpCalls.filter((path) => path.includes("GetResult")).length, 0);
});

test("generateTryOnImages stores Jimeng running task check diagnostics on the report job", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  calls.reportOverrides = {
    generationJob: {
      provider: "jimeng",
      promptVersion: "jimeng-test",
      startedAt: "2026-06-13T07:59:00.000Z",
      updatedAt: "2026-06-13T07:59:30.000Z",
      prompts: [],
      completedImages: [],
      currentIndex: 0,
      currentTask: {
        index: 0,
        kind: "clean",
        taskId: "task-running",
        recommendation: {
          lipstickId: "best",
          rank: 1,
          brand: "Brand A",
          shadeName: "Rose Tea",
          shadeCode: "A01",
          colorHex: "#b84b65",
          textureLabel: "丝绒",
        },
        submittedAt: "2026-06-13T07:59:00.000Z",
      },
    },
  };

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
      },
      durationMs: () => 222,
      httpRequest: async () => ({
        statusCode: 200,
        json: {
          Result: {
            code: 10000,
            status: "running",
            message: "task is running",
            data: {
              task_status: "running",
            },
            request_id: "request-running",
          },
        },
      }),
    }
  );

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.status, "generating");

  const reportUpdate = calls.find(
    (call) =>
      call[0] === "doc.update" &&
      call[1] === "reports" &&
      call[3].data.generationStatus === "generating"
  );
  assert.ok(reportUpdate, "running Jimeng task should update the report job");
  const updatedJob = reportUpdate[3].data.generationJob;
  assert.strictEqual(updatedJob.currentTask.taskId, "task-running");
  assert.strictEqual(updatedJob.lastCheck.taskId, "task-running");
  assert.strictEqual(updatedJob.lastCheck.status, "running");
  assert.strictEqual(updatedJob.lastCheck.requestId, "request-running");
  assert.strictEqual(updatedJob.lastCheck.imageUrlCount, 0);
  assert.strictEqual(updatedJob.lastCheck.checkedAt, "2026-06-13T08:00:00.000Z");
});

test("generateTryOnImages uses standard Jimeng async actions and asks result API to return image URLs", async () => {
  const testFunction = require("../cloudfunctions/test");
  const submitCalls = [];
  const submitDbCalls = [];

  const submitResult = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(submitDbCalls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
      },
      durationMs: () => 10,
      getTempFileURL: async () => "https://temp.example/selfie.jpg",
      httpRequest: async (options, body) => {
        submitCalls.push({ options, body: JSON.parse(body) });
        return {
          statusCode: 200,
          json: {
            Result: {
              data: {
                task_id: "task-standard-action",
              },
            },
          },
        };
      },
    }
  );

  assert.strictEqual(submitResult.code, 0);
  assert.strictEqual(submitResult.data.status, "generating");
  assert.strictEqual(submitCalls.length, 1);
  assert.match(submitCalls[0].options.path, /Action=CVSync2AsyncSubmitTask/);
  assert.match(submitCalls[0].options.path, /Version=2022-08-31/);

  const queryDbCalls = [];
  queryDbCalls.reportOverrides = {
    generationJob: {
      provider: "jimeng",
      promptVersion: "jimeng-test",
      startedAt: "2026-06-13T07:59:00.000Z",
      updatedAt: "2026-06-13T07:59:30.000Z",
      prompts: [],
      completedImages: [],
      currentIndex: 0,
      currentTask: {
        index: 0,
        kind: "clean",
        taskId: "task-standard-action",
        recommendation: {
          lipstickId: "best",
          rank: 1,
          brand: "Brand A",
          shadeName: "Rose Tea",
          shadeCode: "A01",
          colorHex: "#b84b65",
          textureLabel: "涓濈粧",
        },
        submittedAt: "2026-06-13T07:59:00.000Z",
      },
    },
  };
  const queryCalls = [];

  const queryResult = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(queryDbCalls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
      },
      durationMs: () => 10,
      httpRequest: async (options, body) => {
        queryCalls.push({ options, body: JSON.parse(body) });
        return {
          statusCode: 200,
          json: {
            Result: {
              code: 10000,
              message: "Success",
              data: {
                status: "in_queue",
              },
            },
          },
        };
      },
    }
  );

  assert.strictEqual(queryResult.code, 0);
  assert.strictEqual(queryResult.data.status, "generating");
  assert.strictEqual(queryCalls.length, 1);
  assert.match(queryCalls[0].options.path, /Action=CVSync2AsyncGetResult/);
  assert.match(queryCalls[0].options.path, /Version=2022-08-31/);
  assert.strictEqual(queryCalls[0].body.req_key, "jimeng_seedream46_cvtob");
  assert.strictEqual(queryCalls[0].body.task_id, "task-standard-action");
  assert.deepStrictEqual(JSON.parse(queryCalls[0].body.req_json), {
    return_url: true,
  });
});

test("generateTryOnImages fails a stale Jimeng task instead of polling forever", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  calls.reportOverrides = {
    generationJob: {
      provider: "jimeng",
      promptVersion: "jimeng-test",
      startedAt: "2026-06-13T07:30:00.000Z",
      updatedAt: "2026-06-13T07:30:00.000Z",
      prompts: [],
      completedImages: [],
      currentIndex: 0,
      currentTask: {
        index: 0,
        kind: "clean",
        taskId: "task-stale",
        recommendation: {
          lipstickId: "best",
          rank: 1,
          brand: "Brand A",
          shadeName: "Rose Tea",
          shadeCode: "A01",
          colorHex: "#b84b65",
          textureLabel: "丝绒",
        },
        submittedAt: "2026-06-13T07:30:00.000Z",
      },
    },
  };

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
        JIMENG_TASK_STALE_MS: String(20 * 60 * 1000),
      },
      durationMs: () => 50,
      httpRequest: async () => ({
        statusCode: 200,
        json: {
          Result: {
            code: 10000,
            status: "running",
            message: "Success",
            request_id: "request-stale",
          },
        },
      }),
    }
  );

  assert.strictEqual(result.code, "JIMENG_TASK_STALE");
  assert.strictEqual(result.data.retryable, true);
  const reportUpdate = calls.find(
    (call) =>
      call[0] === "doc.update" &&
      call[1] === "reports" &&
      call[3].data.generationStatus === "failed"
  );
  assert.ok(reportUpdate, "stale task should mark the report as failed");
  assert.strictEqual(reportUpdate[3].data.generationErrorCode, "JIMENG_TASK_STALE");
});

test("skip legacy synchronous 429 retry success test", async () => {
  return;
});
/*
test("generateTryOnImages retries Jimeng HTTP 429 responses before failing the provider run", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const sleeps = [];
  let submitCalls = 0;
  let taskSeq = 0;

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
        JIMENG_HTTP_MAX_RETRIES: "2",
        JIMENG_HTTP_RETRY_DELAY_MS: "7",
        JIMENG_MAX_POLLS: "1",
        JIMENG_POLL_INTERVAL_MS: "0",
      },
      durationMs: () => 777,
      getTempFileURL: async () => "https://temp.example/selfie.jpg",
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      httpRequest: async (options) => {
        if (options.path.includes("JimengSeedream46CVToBSubmitTask")) {
          submitCalls += 1;
          if (submitCalls === 1) {
            return {
              statusCode: 429,
              headers: { "retry-after": "1" },
              body: JSON.stringify({ message: "too many requests" }),
              json: { message: "too many requests" },
            };
          }

          taskSeq += 1;
          return {
            statusCode: 200,
            json: {
              Result: {
                task_id: `task-${taskSeq}`,
              },
            },
          };
        }

        return {
          statusCode: 200,
          json: {
            Result: {
              status: "done",
              image_urls: ["https://result.example/image.jpg"],
            },
          },
        };
      },
      uploadFileFromUrl: async ({ cloudPath }) => `cloud://generated/${cloudPath}`,
    }
  );

  assert.strictEqual(result.code, 0);
  assert.deepStrictEqual(sleeps, [7]);
  assert.strictEqual(result.data.previewImages.length, 3);
  assert.strictEqual(result.data.paidImages.length, 3);
});
*/

test("generateTryOnImages records Jimeng HTTP error diagnostics after retry attempts are exhausted", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const sleeps = [];

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
        JIMENG_HTTP_MAX_RETRIES: "1",
        JIMENG_HTTP_RETRY_DELAY_MS: "11",
      },
      durationMs: () => 999,
      getTempFileURL: async () => "https://temp.example/selfie.jpg",
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      httpRequest: async () => ({
        statusCode: 429,
        headers: { "x-tt-logid": "log-123" },
        body: JSON.stringify({ message: "too many requests" }),
        json: { message: "too many requests" },
      }),
    }
  );

  assert.strictEqual(result.code, "JIMENG_HTTP_ERROR");
  assert.deepStrictEqual(sleeps, [11]);

  const providerRun = calls.find((call) => call[0] === "add" && call[1] === "provider_runs");
  assert.strictEqual(providerRun[2].data.errorDetails.statusCode, 429);
  assert.strictEqual(providerRun[2].data.errorDetails.headers["x-tt-logid"], "log-123");
  assert.strictEqual(providerRun[2].data.errorDetails.body.message, "too many requests");
});

test("generateTryOnImages records sanitized Jimeng response details when task id is missing", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];

  const result = await testFunction.main(
    {
      action: "generateTryOnImages",
      data: {
        testId: "test-abc",
        reportId: "report-abc",
      },
    },
    {},
    {
      db: createFakeDb(calls),
      wxContext: { OPENID: "openid-123" },
      now: () => new Date("2026-06-13T08:00:00.000Z"),
      env: {
        IMAGE_PROVIDER: "jimeng",
        IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
        JIMENG_ACCESS_KEY_ID: "ak",
        JIMENG_SECRET_ACCESS_KEY: "sk",
      },
      durationMs: () => 999,
      getTempFileURL: async () => "https://temp.example/selfie.jpg",
      httpRequest: async () => ({
        statusCode: 200,
        json: {
          Result: {
            unexpected_data: {
              provider_trace_id: "trace-123",
            },
          },
        },
      }),
    }
  );

  assert.strictEqual(result.code, "JIMENG_TASK_ID_MISSING");

  const providerRun = calls.find((call) => call[0] === "add" && call[1] === "provider_runs");
  assert.ok(providerRun, "failed Jimeng run should be recorded");
  assert.deepStrictEqual(providerRun[2].data.errorDetails.responseKeys, ["Result"]);
  assert.strictEqual(
    providerRun[2].data.errorDetails.response.Result.unexpected_data.provider_trace_id,
    "trace-123"
  );
});

test("mini program triggers generation through business cloud function without provider knowledge", () => {
  const generatingPage = readText("miniprogram/pages/generating/index.js");
  const testService = readText("miniprogram/services/test.js");

  assert.match(generatingPage, /generateTryOnImages\s*\(/);
  assert.match(generatingPage, /onShow\s*\(/);
  assert.match(generatingPage, /generationFinished:\s*false/);
  assert.doesNotMatch(generatingPage, /IMAGE_PROVIDER/);
  assert.doesNotMatch(generatingPage, /mock-tryon/);
  assert.match(testService, /function generateTryOnImages/);
  assert.match(testService, /callBusinessFunction\("test", "generateTryOnImages"/);
});

test("generateTryOnImages can continue Jimeng generation across multiple calls", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  let submitCalls = 0;
  let pollCalls = 0;
  const generationJobs = new Map();

  function createContinuableDb() {
    return {
      collection(name) {
        calls.push(["collection", name]);
        return {
          doc(id) {
            calls.push(["doc", name, id]);
            return {
              async get() {
                calls.push(["doc.get", name, id]);
                if (name === "try_on_tests") {
                  return {
                    data: {
                      _id: "test-abc",
                      openid: "openid-123",
                      selfieFileId: "cloud://selfies/openid-123/test-abc/original.jpg",
                      activeReportId: "report-abc",
                      generationStatus: "generating",
                    },
                  };
                }

                if (name === "reports") {
                  return {
                    data: {
                      _id: "report-abc",
                      openid: "openid-123",
                      testId: "test-abc",
                      previewImages: [],
                      paidImages: [],
                      generationJob: generationJobs.get(id) || null,
                      snapshot: {
                        recommendations: [
                          {
                            lipstickId: "best",
                            rank: 1,
                            role: "best_match",
                            brand: "Brand A",
                            shadeName: "Rose Tea",
                            shadeCode: "A01",
                            colorHex: "#b84b65",
                            texture: "velvet",
                            textureLabel: "涓濈粧",
                            matchedPreferences: {
                              scene: "daily",
                              style: "natural",
                            },
                          },
                          {
                            lipstickId: "second",
                            rank: 2,
                            role: "daily_safe",
                            brand: "Brand C",
                            shadeName: "Cocoa Pink",
                            shadeCode: "C12",
                            colorHex: "#9f5060",
                            texture: "matte",
                            textureLabel: "鍝戝厜",
                            matchedPreferences: {
                              scene: "daily",
                              style: "commute",
                            },
                          },
                          {
                            lipstickId: "third",
                            rank: 3,
                            role: "style_boost",
                            brand: "Brand D",
                            shadeName: "Clear Berry",
                            shadeCode: "D08",
                            colorHex: "#b33258",
                            texture: "glossy",
                            textureLabel: "姘村厜",
                            matchedPreferences: {
                              scene: "date",
                              style: "natural",
                            },
                          },
                        ],
                      },
                    },
                  };
                }

                return { data: null };
              },
              async update(payload) {
                calls.push(["doc.update", name, id, payload]);
                if (name === "reports" && Object.prototype.hasOwnProperty.call(payload.data, "generationJob")) {
                  generationJobs.set(id, payload.data.generationJob);
                }
                if (name === "reports" && payload.data.previewImages && payload.data.paidImages) {
                  generationJobs.delete(id);
                }
                return { stats: { updated: 1 } };
              },
            };
          },
          async add(payload) {
            calls.push(["add", name, payload]);
            return { _id: `${name}-1` };
          },
        };
      },
    };
  }

  async function invoke() {
    return testFunction.main(
      {
        action: "generateTryOnImages",
        data: {
          testId: "test-abc",
          reportId: "report-abc",
        },
      },
      {},
      {
        db: createContinuableDb(),
        wxContext: { OPENID: "openid-123" },
        now: () => new Date("2026-06-13T08:00:00.000Z"),
        env: {
          IMAGE_PROVIDER: "jimeng",
          IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
          JIMENG_ACCESS_KEY_ID: "ak",
          JIMENG_SECRET_ACCESS_KEY: "sk",
          JIMENG_MAX_POLLS: "1",
          JIMENG_POLL_INTERVAL_MS: "0",
        },
        durationMs: () => 111,
        getTempFileURL: async () => "https://temp.example/selfie.jpg",
        sleep: async () => {},
        httpRequest: async (options) => {
          if (options.path.includes("CVSync2AsyncSubmitTask")) {
            submitCalls += 1;
            return {
              statusCode: 200,
              json: {
                Result: {
                  task_id: `task-${submitCalls}`,
                },
              },
            };
          }

          pollCalls += 1;
          if (pollCalls % 2 === 1) {
            return {
              statusCode: 200,
              json: {
                Result: {
                  status: "running",
                },
              },
            };
          }

          return {
            statusCode: 200,
            json: {
              Result: {
                status: "done",
                image_urls: [`https://result.example/${pollCalls}.jpg`],
              },
            },
          };
        },
        uploadFileFromUrl: async ({ cloudPath }) => `cloud://generated/${cloudPath}`,
        createWatermarkedFile: async ({ cloudPath }) => `cloud://generated/${cloudPath}`,
      }
    );
  }

  const first = await invoke();
  assert.strictEqual(first.code, 0);
  assert.strictEqual(first.data.status, "generating");
  assert.strictEqual(first.data.completedCount, 0);
  assert.strictEqual(first.data.totalCount, 3);
  assert.strictEqual(submitCalls, 1);
  assert.strictEqual(pollCalls, 0);

  const second = await invoke();
  assert.strictEqual(second.code, 0);
  assert.strictEqual(second.data.status, "generating");
  assert.strictEqual(second.data.completedCount, 0);
  assert.strictEqual(submitCalls, 1);
  assert.strictEqual(pollCalls, 1);

  const third = await invoke();
  assert.strictEqual(third.code, 0);
  assert.strictEqual(third.data.status, "generating");
  assert.strictEqual(third.data.completedCount, 1);
  assert.strictEqual(submitCalls, 2);
  assert.strictEqual(pollCalls, 2);

  const fourth = await invoke();
  assert.strictEqual(fourth.code, 0);
  assert.strictEqual(fourth.data.status, "generating");
  assert.strictEqual(fourth.data.completedCount, 1);
  assert.strictEqual(submitCalls, 2);
  assert.strictEqual(pollCalls, 3);

  const fifth = await invoke();
  assert.strictEqual(fifth.code, 0);
  assert.strictEqual(fifth.data.status, "generating");
  assert.strictEqual(fifth.data.completedCount, 2);
  assert.strictEqual(submitCalls, 3);
  assert.strictEqual(pollCalls, 4);

  const sixth = await invoke();
  assert.strictEqual(sixth.code, 0);
  assert.strictEqual(sixth.data.status, "generating");
  assert.strictEqual(sixth.data.completedCount, 2);
  assert.strictEqual(submitCalls, 3);
  assert.strictEqual(pollCalls, 5);

  const seventh = await invoke();
  assert.strictEqual(seventh.code, 0);
  assert.strictEqual(seventh.data.status, "success");
  assert.strictEqual(seventh.data.previewImages.length, 3);
  assert.strictEqual(seventh.data.paidImages.length, 3);
  assert.strictEqual(submitCalls, 3);
  assert.strictEqual(pollCalls, 6);
});

test("generateTryOnImages stores local watermarked previews separately from clean paid Jimeng images", async () => {
  const testFunction = require("../cloudfunctions/test");
  const calls = [];
  const generationJobs = new Map();
  let submitCalls = 0;
  let pollCalls = 0;

  function createDb() {
    return {
      collection(name) {
        calls.push(["collection", name]);
        return {
          doc(id) {
            calls.push(["doc", name, id]);
            return {
              async get() {
                calls.push(["doc.get", name, id]);
                if (name === "try_on_tests") {
                  return {
                    data: {
                      _id: "test-abc",
                      openid: "openid-123",
                      selfieFileId: "cloud://selfies/openid-123/test-abc/original.jpg",
                      activeReportId: "report-abc",
                    },
                  };
                }

                if (name === "reports") {
                  return {
                    data: {
                      _id: "report-abc",
                      openid: "openid-123",
                      testId: "test-abc",
                      generationJob: generationJobs.get(id) || null,
                      snapshot: {
                        recommendations: [
                          {
                            lipstickId: "best",
                            rank: 1,
                            role: "best_match",
                            brand: "Brand A",
                            shadeName: "Rose Tea",
                            shadeCode: "A01",
                            colorHex: "#b84b65",
                            texture: "velvet",
                            textureLabel: "丝绒",
                            matchedPreferences: {
                              scene: "daily",
                              style: "natural",
                            },
                          },
                          {
                            lipstickId: "second",
                            rank: 2,
                            role: "daily_safe",
                            brand: "Brand C",
                            shadeName: "Cocoa Pink",
                            shadeCode: "C12",
                            colorHex: "#9f5060",
                            texture: "matte",
                            textureLabel: "哑光",
                            matchedPreferences: {
                              scene: "daily",
                              style: "commute",
                            },
                          },
                          {
                            lipstickId: "third",
                            rank: 3,
                            role: "style_boost",
                            brand: "Brand D",
                            shadeName: "Clear Berry",
                            shadeCode: "D08",
                            colorHex: "#b33258",
                            texture: "glossy",
                            textureLabel: "水光",
                            matchedPreferences: {
                              scene: "date",
                              style: "natural",
                            },
                          },
                        ],
                      },
                    },
                  };
                }

                return { data: null };
              },
              async update(payload) {
                calls.push(["doc.update", name, id, payload]);
                if (name === "reports" && Object.prototype.hasOwnProperty.call(payload.data, "generationJob")) {
                  generationJobs.set(id, payload.data.generationJob);
                }
                if (name === "reports" && payload.data.generationJob === null) {
                  generationJobs.delete(id);
                }
                return { stats: { updated: 1 } };
              },
            };
          },
          async add(payload) {
            calls.push(["add", name, payload]);
            return { _id: `${name}-1` };
          },
        };
      },
    };
  }

  async function invoke() {
    return testFunction.main(
      {
        action: "generateTryOnImages",
        data: {
          testId: "test-abc",
          reportId: "report-abc",
        },
      },
      {},
      {
        db: createDb(),
        wxContext: { OPENID: "openid-123" },
        now: () => new Date("2026-06-13T08:00:00.000Z"),
        env: {
          IMAGE_PROVIDER: "jimeng",
          IMAGE_PROVIDER_MODEL: "jimeng_seedream46_cvtob",
          JIMENG_ACCESS_KEY_ID: "ak",
          JIMENG_SECRET_ACCESS_KEY: "sk",
          JIMENG_MAX_POLLS: "1",
          JIMENG_POLL_INTERVAL_MS: "0",
        },
        durationMs: () => 111,
        getTempFileURL: async () => "https://temp.example/selfie.jpg",
        sleep: async () => {},
        httpRequest: async (options) => {
          if (options.path.includes("CVSync2AsyncSubmitTask")) {
            submitCalls += 1;
            return {
              statusCode: 200,
              json: {
                Result: {
                  task_id: `task-${submitCalls}`,
                },
              },
            };
          }

          pollCalls += 1;
          return {
            statusCode: 200,
            json: {
              Result: {
                status: "done",
                image_urls: [`https://result.example/${pollCalls}.jpg`],
              },
            },
          };
        },
        uploadFileFromUrl: async ({ url, cloudPath }) => {
          calls.push(["uploadFileFromUrl", url, cloudPath]);
          return `cloud://generated/${cloudPath}`;
        },
        createWatermarkedFile: async ({ sourceFileId, cloudPath, watermarkText }) => {
          calls.push(["createWatermarkedFile", sourceFileId, cloudPath, watermarkText]);
          return `cloud://generated/${cloudPath}`;
        },
      }
    );
  }

  let result = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    result = await invoke();
    if (result.data && result.data.status === "success") {
      break;
    }
  }

  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.data.status, "success");
  assert.strictEqual(result.data.previewImages.length, 3);
  assert.strictEqual(result.data.paidImages.length, 3);
  assert.notDeepStrictEqual(result.data.previewImages, result.data.paidImages);
  assert.ok(result.data.previewImages.every((fileId) => fileId.includes("-watermark.jpg")));
  assert.ok(result.data.paidImages.every((fileId) => fileId.includes("-clean.jpg")));

  const cleanUploads = calls.filter((call) => call[0] === "uploadFileFromUrl");
  const watermarkUploads = calls.filter((call) => call[0] === "createWatermarkedFile");
  assert.strictEqual(cleanUploads.length, 3);
  assert.strictEqual(watermarkUploads.length, 3);
  assert.deepStrictEqual(
    watermarkUploads.map((call) => call[1]),
    result.data.paidImages
  );
  assert.ok(watermarkUploads.every((call) => call[2].includes("tryon-results/report-abc/")));
  assert.ok(watermarkUploads.every((call) => call[2].endsWith("-watermark.jpg")));

  const reportUpdate = calls.find(
    (call) =>
      call[0] === "doc.update" &&
      call[1] === "reports" &&
      call[3].data.generationStatus === "success"
  );
  const providerRun = calls.find((call) => call[0] === "add" && call[1] === "provider_runs");
  assert.deepStrictEqual(reportUpdate[3].data.previewImages, result.data.previewImages);
  assert.deepStrictEqual(reportUpdate[3].data.paidImages, result.data.paidImages);
  assert.deepStrictEqual(providerRun[2].data.imageFileIds, [
    ...result.data.previewImages,
    ...result.data.paidImages,
  ]);
});
