export type TryOnTestStatus = "selfie_uploaded";
export type SafetyStatus = "passed" | "rejected";
export type QualityStatus = "passed" | "rejected";

export interface TryOnTest {
  _id: string;
  openid: string;
  status: TryOnTestStatus;
  selfieFileId: string;
  preferences: null;
  safetyStatus: SafetyStatus;
  qualityStatus: QualityStatus;
  generationStatus: "pending";
  generationRetryCount: number;
  previewRegenerateCount: number;
  maxPreviewRegenerateCount: number;
  activeReportId: null;
  sourceShareId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}
