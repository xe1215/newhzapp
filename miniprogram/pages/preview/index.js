const reportService = require("../../services/report");
const paymentService = require("../../services/payment");
const testService = require("../../services/test");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");
const { resolveCloudFileList } = require("../../utils/media");

Page({
  data: {
    testId: "",
    reportId: "",
    loading: true,
    errorText: "",
    previewImages: [],
    remainingRegenerateCount: null,
    canRegeneratePreview: true,
    unlocking: false,
  },

  onLoad(query) {
    const testId = getQueryValue(query, "testId");
    const reportId = getQueryValue(query, "reportId");

    this.setData({
      testId,
      reportId,
    });
    this.loadPreview();
  },

  loadPreview() {
    if (!this.data.testId || !this.data.reportId) {
      this.setData({
        loading: false,
        errorText: "Missing report information. Please generate again.",
      });
      return;
    }

    this.setData({
      loading: true,
      errorText: "",
    });

    reportService
      .getPreview({
        testId: this.data.testId,
        reportId: this.data.reportId,
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Preview is not ready.");
        this.setData({
          remainingRegenerateCount:
            typeof data.remainingRegenerateCount === "number"
              ? data.remainingRegenerateCount
              : this.data.remainingRegenerateCount,
          canRegeneratePreview:
            typeof data.remainingRegenerateCount === "number"
              ? data.remainingRegenerateCount > 0
              : this.data.canRegeneratePreview,
        });

        return this.resolvePreviewImages(data);
      })
      .then((previewImages) => {
        this.setData({
          loading: false,
          previewImages,
          errorText: previewImages.length ? "" : "No preview images are ready yet.",
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          errorText: error.message || "Preview failed to load.",
          previewImages: [],
        });
      });
  },

  resolvePreviewImages(report) {
    return resolveCloudFileList(report.previewImages, "Look", (fileList) =>
      wx.cloud.getTempFileURL({
        fileList,
      })
    );
  },

  unlockReport() {
    if (!this.data.testId) {
      this.setData({
        errorText: "Missing test information. Please generate again.",
      });
      return;
    }

    this.setData({
      unlocking: true,
      errorText: "",
    });

    paymentService
      .createReportOrder({
        testId: this.data.testId,
      })
      .then((response) => {
        const order = unwrapCloudCall(response, "Unable to create payment order.");
        wx.navigateTo({
          url:
            `/pages/payment-result/index?orderId=${order.orderId}` +
            `&testId=${this.data.testId}` +
            `&reportId=${order.reportId || this.data.reportId}`,
        });
      })
      .catch((error) => {
        this.setData({
          errorText: error.message || "Unable to create payment order.",
        });
      })
      .finally(() => {
        this.setData({
          unlocking: false,
        });
      });
  },

  regeneratePreview() {
    if (!this.data.testId || !this.data.reportId) {
      this.setData({
        errorText: "Missing report information. Please generate again.",
      });
      return;
    }

    if (!this.data.canRegeneratePreview) {
      this.setData({
        errorText: "No free refreshes left. Please adjust preferences and try again.",
      });
      return;
    }

    this.setData({
      loading: true,
      errorText: "",
    });

    testService
      .regeneratePreview({
        testId: this.data.testId,
        reportId: this.data.reportId,
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Preview refresh failed.");
        if (data.status === "generating") {
          this.setData({
            loading: false,
            remainingRegenerateCount:
              typeof data.remainingRegenerateCount === "number"
                ? data.remainingRegenerateCount
                : this.data.remainingRegenerateCount,
            canRegeneratePreview: true,
            errorText: "Preview refresh is still generating. Tap refresh again in a moment.",
          });
          return null;
        }

        this.setData({
          reportId: data.reportId || this.data.reportId,
          remainingRegenerateCount:
            typeof data.remainingRegenerateCount === "number"
              ? data.remainingRegenerateCount
              : this.data.remainingRegenerateCount,
          canRegeneratePreview:
            typeof data.remainingRegenerateCount === "number"
              ? data.remainingRegenerateCount > 0
              : this.data.canRegeneratePreview,
        });

        return this.resolvePreviewImages(data);
      })
      .then((previewImages) => {
        if (previewImages === null) {
          return;
        }

        this.setData({
          loading: false,
          previewImages,
          errorText: previewImages.length ? "" : "No preview images are ready yet.",
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          errorText: error.message || "Preview refresh failed.",
        });
      });
  },

  deleteSelfie() {
    if (!this.data.testId) {
      this.setData({
        errorText: "Missing test information. Please generate again.",
      });
      return;
    }

    testService
      .deleteSelfie({
        testId: this.data.testId,
      })
      .then(() => {
        this.setData({
          errorText: "Original selfie deleted. Generated reports stay available.",
        });
      })
      .catch((error) => {
        this.setData({
          errorText: error.message || "Unable to delete the original selfie.",
        });
      });
  },
});
