const reportService = require("../../services/report");
const shareService = require("../../services/share");
const { unwrapCloudCall } = require("../../utils/business");

Page({
  data: {
    loading: true,
    errorText: "",
    reports: [],
  },

  onShow() {
    this.loadReports();
  },

  loadReports() {
    this.setData({
      loading: true,
      errorText: "",
    });

    reportService
      .listMyReports()
      .then((response) => {
        const result = unwrapCloudCall(response, "Unable to load reports.");
        this.setData({
          loading: false,
          reports: Array.isArray(result.reports) ? result.reports : [],
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          errorText: error.message || "Unable to load reports.",
        });
      });
  },

  viewReport(e) {
    const reportId = e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.reportId
      : "";
    const testId = e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.testId
      : "";

    if (!reportId || !testId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/report/index?testId=${testId}&reportId=${reportId}`,
    });
  },

  hideReport(e) {
    const reportId = e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.reportId
      : "";

    if (!reportId) {
      return;
    }

    reportService
      .hideReport({
        reportId,
      })
      .then(() => {
        this.loadReports();
      })
      .catch((error) => {
        this.setData({
          errorText: error.message || "Unable to hide report.",
        });
      });
  },

  shareReport(e) {
    const reportId = e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.reportId
      : "";

    if (!reportId) {
      return;
    }

    shareService
      .createShareEntry({
        reportId,
        recommendationIndex: 0,
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Unable to create share entry.");
        if (!data.shareId) {
          throw new Error("Unable to create share entry.");
        }

        wx.navigateTo({
          url: `/pages/share/index?shareId=${data.shareId}`,
        });
      })
      .catch((error) => {
        this.setData({
          errorText: error.message || "Unable to create share entry.",
        });
      });
  },
});
