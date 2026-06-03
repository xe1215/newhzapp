export type TryOnTestStatus = "selfie_uploaded";
export type SafetyStatus = "passed" | "rejected";
export type QualityStatus = "passed" | "rejected";

export interface Preferences {
  skinTone: string;
  budgetRange: string;
  scenes: string[];
  styles: string[];
}

export interface Lipstick {
  _id: string;
  brand: string;
  shadeName: string;
  shadeCode: string;
  colorHex: string;
  swatchImageFileId: string;
  texture: string;
  undertone: string;
  skinToneTags: string[];
  budgetRange: string;
  sceneTags: string[];
  styleTags: string[];
  baseScore: number;
  manualBoost: number;
  recommendationReason: string;
  cautionNote: string;
  substitute: string | null;
  searchKeywords: string[];
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface Recommendation {
  lipstickId: string;
  brand: string;
  shadeName: string;
  shadeCode: string;
  colorHex: string;
  swatchImageFileId: string;
  texture: string;
  undertone: string;
  budgetRange: string;
  recommendationReason: string;
  cautionNote: string;
  substitute: string | null;
  searchKeywords: string[];
  score: number;
}

export interface TryOnTest {
  _id: string;
  openid: string;
  status: TryOnTestStatus;
  selfieFileId: string;
  preferences: Preferences | null;
  safetyStatus: SafetyStatus;
  qualityStatus: QualityStatus;
  generationStatus: "pending";
  generationRetryCount: number;
  previewRegenerateCount: number;
  maxPreviewRegenerateCount: number;
  activeReportId: string | null;
  sourceShareId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}
