import type { AuthResult } from "../../shared/types/user.js";

export interface CloudFunctionClient {
  cloud: {
    callFunction(options: { name: string; data?: Record<string, unknown> }): Promise<{
      result: unknown;
    }>;
  };
}

export async function login(client: CloudFunctionClient): Promise<AuthResult> {
  const response = await client.cloud.callFunction({
    name: "user-auth",
  });

  return response.result as AuthResult;
}
