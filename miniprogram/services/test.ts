import type { SubmitPreferencesResult, UploadSelfieRejectedResult, UploadSelfieResult } from "../../cloudfunctions/user/test/index.js";
import type { Preferences } from "../../shared/types/test.js";

export interface CloudFunctionClient {
  cloud: {
    callFunction(options: { name: string; data?: Record<string, unknown> }): Promise<{
      result: unknown;
    }>;
  };
}

export interface SelfieFile {
  name: string;
  contentType: string;
  buffer: string;
}

export async function uploadSelfie(
  client: CloudFunctionClient,
  file: SelfieFile,
): Promise<UploadSelfieResult | UploadSelfieRejectedResult> {
  const response = await client.cloud.callFunction({
    name: "user-test",
    data: {
      action: "uploadSelfie",
      file,
    },
  });

  return response.result as UploadSelfieResult | UploadSelfieRejectedResult;
}

export async function submitPreferences(
  client: CloudFunctionClient,
  testId: string,
  preferences: Preferences,
): Promise<SubmitPreferencesResult> {
  const response = await client.cloud.callFunction({
    name: "user-test",
    data: {
      action: "submitPreferences",
      testId,
      preferences,
    },
  });

  return response.result as SubmitPreferencesResult;
}
