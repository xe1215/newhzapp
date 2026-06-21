const reportService = require("../../services/report");
const paymentService = require("../../services/payment");
const testService = require("../../services/test");

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
    const testId = query && query.testId ? query.testId : "";
    const reportId = query && query.reportId ? query.reportId : "";

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
        const result = response.result || {};
        if (result.code !== 0) {
          throw new Error(result.message || "Preview is not ready.");
        }

        const data = result.data || {};
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
    const fileIDs = Array.isArray(report.previewImages) ? report.previewImages : [];

    if (!fileIDs.length) {
      return Promise.resolve([]);
    }

    return wx.cloud
      .getTempFileURL({
        fileList: fileIDs,
      })
      .then((res) => {
        const fileList = res.fileList || [];
        return fileIDs.map((fileID, index) => {
          const file = fileList[index] || {};
          return {
            fileID,
            url: file.tempFileURL || file.fileID || fileID,
            title: `Look ${index + 1}`,
          };
        });
      });
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
        const result = response.result || {};
        if (result.code !== 0) {
          throw new Error(result.message || "Unable to create payment order.");
        }

        const order = result.data || {};
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
        const result = response.result || {};
        if (result.code !== 0) {
          throw new Error(result.message || "Preview refresh failed.");
        }

        const data = result.data || {};
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
});
