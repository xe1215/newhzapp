const shareService = require("../../services/share");

Page({
  data: {
    shareId: "",
    feedback: "",
  },

  onLoad(query) {
    const shareId = query && query.shareId ? query.shareId : "";

    this.setData({
      shareId,
    });

    if (!shareId) {
      this.setData({
        feedback: "Missing shared card information.",
      });
      return;
    }

    shareService
      .trackShareVisit({
        shareId,
      })
      .catch(() => {
        this.setData({
          feedback: "Shared visit tracking is temporarily unavailable.",
        });
      });
  },

  restartTest() {
    wx.reLaunch({
      url: "/pages/home/index",
    });
  },
});
