Page({
  data: {
    reportCount: 0,
    feedback: "",
  },

  onShow() {
    const app = getApp();
    const user = app.globalData && app.globalData.user;
    this.setData({
      reportCount: user && Number(user.reportCount || 0),
    });
  },

  openHome() { wx.redirectTo({ url: "/pages/home/index" }); },
  openReports() { wx.redirectTo({ url: "/pages/my-reports/index" }); },
  openReportHistory() { wx.navigateTo({ url: "/pages/report-history/index" }); },
  openRefundHelp() { wx.navigateTo({ url: "/pages/refund-help/index" }); },

  openAccountSettings() {
    this.setData({ feedback: "账号设置将在后续版本开放。" });
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "退出后需要重新登录才能查看账号下的报告。",
      confirmColor: "#9f5d59",
      success: (res) => {
        if (!res.confirm) return;
        const app = getApp();
        if (app.globalData) app.globalData.user = null;
        wx.reLaunch({ url: "/pages/home/index" });
      },
    });
  },
});
