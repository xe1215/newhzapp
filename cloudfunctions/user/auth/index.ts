import type { AuthResult } from "../../../shared/types/user.js";
import { ERROR_CODES } from "../../../shared/constants/index.js";

interface CloudFunctionContext {
  openid?: string;
  OPENID?: string;
}

export async function main(
  _event: Record<string, unknown> = {},
  context: CloudFunctionContext = {},
): Promise<AuthResult> {
  const openid = context.openid ?? context.OPENID;

  if (!openid) {
    throw new Error(ERROR_CODES.authOpenidMissing);
  }

  const now = new Date().toISOString();

  return {
    openid,
    user: {
      _id: openid,
      openid,
      createdAt: now,
      lastSeenAt: now,
    },
  };
}
