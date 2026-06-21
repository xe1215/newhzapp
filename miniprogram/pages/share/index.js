const shareService = require("../../services/share");

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
    const shareId = query && query.shareId ? query.shareId : "";

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
      .getShareEntry({
        shareId,
      })
      .then((response) => {
        const result = response.result || {};
        if (result.code !== 0) {
          throw new Error(result.message || "Shared card is unavailable.");
        }

        const data = result.data || {};

        this.setData({
          loading: false,
          recommendation: data.recommendation || null,
          shareStats: data.shareStats || null,
          restartPath: data.restartPath || "/pages/home/index",
        });

        return shareService.trackShareVisit({
          shareId,
        });
      })
      .catch(() => {
        this.setData({
          loading: false,
          feedback: "Shared visit tracking is temporarily unavailable.",
        });
      });
  },

  restartTest() {
    wx.reLaunch({
      url: this.data.restartPath || "/pages/home/index",
    });
  },
});
