import assert from "node:assert/strict";
import test from "node:test";
import { type CloudFunctionClient, getFreePreview } from "../miniprogram/services/report.js";

test("miniprogram report preview service reads only through the user report cloud function", async () => {
  const calls: Array<{ name: string; data?: Record<string, unknown> }> = [];
  const client: CloudFunctionClient = {
    cloud: {
      async callFunction(options) {
        calls.push(options);

        return {
          result: {
            ok: true,
            testId: "test-001",
            reportId: "report-001",
            previewImages: ["watermarked-1.jpg", "watermarked-2.jpg", "watermarked-3.jpg"],
            remainingFreeRegenerations: 3,
            paymentEntry: {
              enabled: true,
              amount: 599,
              currency: "CNY",
              reportId: "report-001",
            },
            lockedReport: {
              state: "locked",
              sections: [],
            },
          },
        };
      },
    },
  };

  const result = await getFreePreview(client, "test-001");

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    {
      name: "user-report",
      data: {
        action: "getFreePreview",
        testId: "test-001",
      },
    },
  ]);
});
