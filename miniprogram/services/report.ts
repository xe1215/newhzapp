import type { FreePreviewResult } from "../../cloudfunctions/user/report/index.js";

export interface CloudFunctionClient {
  cloud: {
    callFunction(options: { name: string; data?: Record<string, unknown> }): Promise<{
      result: unknown;
    }>;
  };
}

export async function getFreePreview(
  client: CloudFunctionClient,
  testId: string,
): Promise<FreePreviewResult> {
  const response = await client.cloud.callFunction({
    name: "user-report",
    data: {
      action: "getFreePreview",
      testId,
    },
  });

  return response.result as FreePreviewResult;
}
