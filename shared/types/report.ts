import type { Preferences, Recommendation } from "./test.js";

export type ReportStatus = "active" | "replaced" | "unlocked" | "deleted" | "expired";

export interface Report {
  _id: string;
  openid: string;
  testId: string;
  version: number;
  status: ReportStatus;
  snapshot: {
    preferences: Preferences;
    recommendations: Recommendation[];
  };
  previewImages: string[];
  paidImages: string[];
  shareCardImages: string[];
  replacedByReportId: string | null;
  unlockedAt: string | null;
  expiresAt: string;
  deletedAt: string | null;
  createdAt: string;
}
