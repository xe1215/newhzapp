const shareService = require("../../services/share");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");

function getRestartPath(value) {
  return value || "/pages/home/index";
}

Page({
  data: {
    shareId: "",
    feedback: "",
    loading: true,
    recommendation: null,
    shareCardImage: "",
    shareStats: null,
    restartPath: "/pages/home/index",
  },

  onLoad(query) {
    const shareId = getQueryValue(query, "shareId");

    this.setData({
      shareId,
    });

    if (!shareId) {
      this.setData({
        loading: false,
        feedback: "Missing shared card information.",
      });
      return;
    }

    shareService
      .loadShareLanding({
        shareId,
      })
      .then((response) => {
        const data = unwrapCloudCall(response, "Shared card is unavailable.");

        this.setData({
          loading: false,
          recommendation: data.recommendation || null,
          shareCardImage: data.shareCardImage || "",
          shareStats: data.shareStats || null,
          restartPath: getRestartPath(data.restartPath),
        });
      })
      .catch((error) => {
        this.setData({
          loading: false,
          feedback: error.message || "Shared card is unavailable.",
        });
      });
  },

  restartTest() {
    wx.reLaunch({
      url: getRestartPath(this.data.restartPath),
    });
  },
});
