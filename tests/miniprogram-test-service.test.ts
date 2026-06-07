import assert from "node:assert/strict";
import test from "node:test";
import { generatePreview, type CloudFunctionClient, regeneratePreview, submitPreferences, uploadSelfie } from "../miniprogram/services/test.js";

test("小程序自拍上传服务只通过用户测试云函数提交自拍", async () => {
  const calls: Array<{ name: string; data?: Record<string, unknown> }> = [];

  const client: CloudFunctionClient = {
    cloud: {
      async callFunction(options) {
        calls.push(options);

        return {
          result: {
            ok: true,
            testId: "test-001",
            selfieFileId: "cloud://selfies/openid-001/test-001/original.jpg",
          },
        };
      },
    },
  };

  const result = await uploadSelfie(client, {
    name: "selfie.jpg",
    contentType: "image/jpeg",
    buffer: "base64-image-data",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    {
      name: "user-test",
      data: {
        action: "uploadSelfie",
        file: {
          name: "selfie.jpg",
          contentType: "image/jpeg",
          buffer: "base64-image-data",
        },
      },
    },
  ]);
});

test("miniprogram preview regeneration service calls only the user test cloud function", async () => {
  const calls: Array<{ name: string; data?: Record<string, unknown> }> = [];
  const client: CloudFunctionClient = {
    cloud: {
      async callFunction(options) {
        calls.push(options);

        return {
          result: {
            ok: true,
            reportId: "report-002",
            recommendations: [],
            cleanImages: ["clean-4.jpg", "clean-5.jpg", "clean-6.jpg"],
            watermarkedImages: ["watermarked-4.jpg", "watermarked-5.jpg", "watermarked-6.jpg"],
            remainingFreeRegenerations: 2,
          },
        };
      },
    },
  };

  const result = await regeneratePreview(client, "test-001");

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    {
      name: "user-test",
      data: {
        action: "regeneratePreview",
        testId: "test-001",
      },
    },
  ]);
});

test("小程序偏好提交服务只通过用户测试云函数提交偏好", async () => {
  const calls: Array<{ name: string; data?: Record<string, unknown> }> = [];
  const client: CloudFunctionClient = {
    cloud: {
      async callFunction(options) {
        calls.push(options);

        return {
          result: {
            ok: true,
            reportId: "report-001",
            recommendations: [],
          },
        };
      },
    },
  };
  const preferences = {
    skinTone: "fair",
    budgetRange: "mid",
    scenes: ["commute"],
    styles: ["brightening"],
  };

  const result = await submitPreferences(client, "test-001", preferences);

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    {
      name: "user-test",
      data: {
        action: "submitPreferences",
        testId: "test-001",
        preferences,
      },
    },
  ]);
});

test("小程序试色生成服务只通过用户测试云函数触发生成", async () => {
  const calls: Array<{ name: string; data?: Record<string, unknown> }> = [];
  const client: CloudFunctionClient = {
    cloud: {
      async callFunction(options) {
        calls.push(options);

        return {
          result: {
            ok: true,
            reportId: "report-001",
            cleanImages: ["clean-1.jpg", "clean-2.jpg", "clean-3.jpg"],
            watermarkedImages: ["watermarked-1.jpg", "watermarked-2.jpg", "watermarked-3.jpg"],
          },
        };
      },
    },
  };

  const result = await generatePreview(client, "test-001");

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    {
      name: "user-test",
      data: {
        action: "generatePreview",
        testId: "test-001",
      },
    },
  ]);
});
