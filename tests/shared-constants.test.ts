import assert from "node:assert/strict";
import test from "node:test";
import { ERROR_CODES, ORDER_AMOUNT_CENTS, REPORT_STATUS } from "../shared/constants/index.js";

test("基础业务常量集中从 shared 导出", () => {
  assert.equal(ORDER_AMOUNT_CENTS, 599);
  assert.equal(ERROR_CODES.authOpenidMissing, "AUTH_OPENID_MISSING");
  assert.deepEqual(REPORT_STATUS, {
    active: "active",
    replaced: "replaced",
    unlocked: "unlocked",
    deleted: "deleted",
    expired: "expired",
  });
});
