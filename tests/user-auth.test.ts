import assert from "node:assert/strict";
import test from "node:test";
import { main as authMain } from "../cloudfunctions/user/auth/index.js";

test("静默登录会返回当前 openid 对应的用户记录", async () => {
  const result = await authMain(
    {},
    {
      openid: "openid-001",
    },
  );

  assert.equal(result.openid, "openid-001");
  assert.equal(result.user.openid, "openid-001");
  assert.equal(typeof result.user.createdAt, "string");
  assert.equal(typeof result.user.lastSeenAt, "string");
});
