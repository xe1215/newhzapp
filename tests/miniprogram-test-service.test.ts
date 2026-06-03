import assert from "node:assert/strict";
import test from "node:test";
import { type CloudFunctionClient, uploadSelfie } from "../miniprogram/services/test.js";

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
