export type ProviderRunStatus = "success" | "failed";

export interface ProviderRun {
  _id: string;
  testId: string;
  reportId: string;
  openid: string;
  provider: string;
  status: ProviderRunStatus;
  durationMs: number;
  retryIndex: number;
  errorCode: string | null;
  errorMessage: string | null;
  cleanImageFileIds: string[];
  watermarkedImageFileIds: string[];
  createdAt: string;
}
