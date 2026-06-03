import assert from "node:assert/strict";
import test from "node:test";
import { type CloudFunctionClient, login } from "../miniprogram/services/auth.js";

test("小程序登录服务只通过用户认证云函数完成静默登录", async () => {
  const calls: string[] = [];

  const client: CloudFunctionClient = {
    cloud: {
      async callFunction(options) {
        calls.push(options.name);

        return {
          result: {
            openid: "openid-001",
            user: {
              _id: "openid-001",
              openid: "openid-001",
              createdAt: "2026-06-03T00:00:00.000Z",
              lastSeenAt: "2026-06-03T00:00:00.000Z",
            },
          },
        };
      },
    },
  };

  const result = await login(client);

  assert.deepEqual(calls, ["user-auth"]);
  assert.equal(result.user.openid, "openid-001");
});
