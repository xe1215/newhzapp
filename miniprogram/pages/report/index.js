const reportService = require("../../services/report");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");
const { resolveCloudFileList } = require("../../utils/media");

Page({
  data: {
    testId: "",
    reportId: "",
    loading: true,
    errorText: "",
    paidImages: [],
    recommendations: [],
  },

  onLoad(query) {
    this.setData({
      testId: getQueryValue(query, "testId"),
      reportId: getQueryValue(query, "reportId"),
    });
    this.loadReport();
  },

  loadReport() {
    if (!this.data.testId || !this.data.reportId) {
      this.setData({
        loading: false,
        errorText: "Missing report information.",
      });
      return;
    }

    this.setData({
      loading: true,
      errorText: "",
    });

    reportService
      .getReport({
        testId: this.data.testId,
        reportId: this.data.reportId,
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Report is unavailable.");
        return this.resolvePaidImages(data).then((paidImages) => ({
          paidImages,
          recommendations:
            data.snapshot && Array.isArray(data.snapshot.recommendations)
              ? data.snapshot.recommendations
              : [],
        }));
      })
      .then((payload) => {
        this.setData({
          loading: false,
          paidImages: payload.paidImages,
          recommendations: payload.recommendations,
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          errorText: error.message || "Report is unavailable.",
        });
      });
  },

  resolvePaidImages(report) {
    return resolveCloudFileList(report.paidImages, "Look", (fileList) =>
      wx.cloud.getTempFileURL({
        fileList,
      })
    );
  },

  shareCard() {
    wx.navigateTo({ url: "/pages/share/index" });
  },
});
