const shareService = require("../../services/share");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");

Page({
  data: {
    shareId: "",
    feedback: "",
    loading: true,
    recommendation: null,
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
          shareStats: data.shareStats || null,
          restartPath: data.restartPath || "/pages/home/index",
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
      url: this.data.restartPath || "/pages/home/index",
    });
  },
});
