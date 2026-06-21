const reportService = require("../../services/report");
const shareService = require("../../services/share");
const { unwrapCloudCall } = require("../../utils/business");

function getDatasetValue(event, key) {
  const dataset = event && event.currentTarget ? event.currentTarget.dataset : null;
  return dataset && dataset[key] ? dataset[key] : "";
}

function getReportList(result) {
  return Array.isArray(result.reports) ? result.reports : [];
}

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
          reports: getReportList(result),
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
    const reportId = getDatasetValue(e, "reportId");
    const testId = getDatasetValue(e, "testId");

    if (!reportId || !testId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/report/index?testId=${testId}&reportId=${reportId}`,
    });
  },

  hideReport(e) {
    const reportId = getDatasetValue(e, "reportId");

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
    const reportId = getDatasetValue(e, "reportId");

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
