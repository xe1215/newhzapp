const reportService = require("../../services/report");
const shareService = require("../../services/share");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");
const { resolveCloudFileList } = require("../../utils/media");

function getRecommendations(snapshot) {
  return snapshot && Array.isArray(snapshot.recommendations) ? snapshot.recommendations : [];
}

function getDatasetValue(event, key) {
  const dataset = event && event.currentTarget ? event.currentTarget.dataset : null;
  return dataset && dataset[key] !== undefined ? dataset[key] : "";
}

function wrapCopyLine(label, value) {
  return value ? `${label}: ${value}` : "";
}

Page({
  data: {
    testId: "",
    reportId: "",
    loading: true,
    errorText: "",
    paidImages: [],
    recommendations: [],
    sharingIndex: -1,
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
          recommendations: getRecommendations(data.snapshot),
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

  createShareCard(recommendationIndex) {
    const recommendation = this.data.recommendations[recommendationIndex];

    if (!recommendation) {
      return Promise.reject(new Error("Selected card is unavailable."));
    }

    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery();
      query
        .select("#share-card-canvas")
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvasNode = res && res[0];
          if (!canvasNode || !canvasNode.node) {
            reject(new Error("Unable to prepare card canvas."));
            return;
          }

          const canvas = canvasNode.node;
          const ctx = canvas.getContext("2d");
          const width = 900;
          const height = 1200;
          canvas.width = width;
          canvas.height = height;

          ctx.fillStyle = "#fff8fa";
          ctx.fillRect(0, 0, width, height);
          ctx.fillStyle = "#24191d";
          ctx.font = "bold 54px sans-serif";
          ctx.fillText("Lip Result Card", 72, 130);

          ctx.fillStyle = "#b72957";
          ctx.font = "bold 72px sans-serif";
          ctx.fillText(
            `${recommendation.shadeName || ""} ${recommendation.shadeCode || ""}`.trim(),
            72,
            260
          );

          ctx.fillStyle = "#6d5960";
          ctx.font = "36px sans-serif";
          const detailLines = [
            recommendation.brand || "",
            recommendation.colorHex || "",
            recommendation.recommendationReason || "",
            wrapCopyLine("Caution", recommendation.cautionNote),
            wrapCopyLine("Substitute", recommendation.substitute),
          ].filter(Boolean);

          detailLines.forEach((line, index) => {
            ctx.fillText(line, 72, 360 + index * 72, width - 144);
          });

          wx.canvasToTempFilePath(
            {
              canvas,
              width,
              height,
              destWidth: width,
              destHeight: height,
              success: (result) => resolve(result.tempFilePath),
              fail: () => reject(new Error("Unable to export share card.")),
            },
            this
          );
        });
    });
  },

  saveCardToAlbum(e) {
    const recommendationIndex = Number(getDatasetValue(e, "recommendationIndex") || 0);

    this.createShareCard(recommendationIndex)
      .then((tempFilePath) => {
        return new Promise((resolve, reject) => {
          wx.saveImageToPhotosAlbum({
            filePath: tempFilePath,
            success: resolve,
            fail: reject,
          });
        });
      })
      .then(() => {
        this.setData({
          errorText: "Result card saved to your album.",
        });
      })
      .catch((error) => {
        this.setData({
          errorText: error.message || "Unable to save the result card.",
        });
      });
  },

  shareCard(e) {
    const recommendationIndex = Number(getDatasetValue(e, "recommendationIndex") || 0);

    this.setData({
      sharingIndex: recommendationIndex,
      errorText: "",
    });

    this.createShareCard(recommendationIndex)
      .then((tempFilePath) => {
        return shareService.createShareEntry({
          reportId: this.data.reportId,
          recommendationIndex,
          shareCardTempFilePath: tempFilePath,
        });
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
      })
      .finally(() => {
        this.setData({
          sharingIndex: -1,
        });
      });
  },
});
