const MODULES = [
  { key: "overview", label: "运营仪表盘", path: "/overview" },
  { key: "lipsticks", label: "口红库维护", path: "/lipsticks" },
  { key: "tests", label: "测试记录", path: "/tests" },
  { key: "reports", label: "报告记录", path: "/reports" },
  { key: "orders", label: "订单与退款", path: "/orders" },
  { key: "logs", label: "生成与事件日志", path: "/logs" },
];

const OVERVIEW_RANGES = {
  today: {
    key: "today",
    label: "今天",
    getBounds(now) {
      const start = new Date(now);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      return { start, end };
    },
  },
  yesterday: {
    key: "yesterday",
    label: "昨天",
    getBounds(now) {
      const end = new Date(now);
      end.setUTCHours(0, 0, 0, 0);
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      return { start, end };
    },
  },
  last7Days: {
    key: "last7Days",
    label: "近 7 天",
    getBounds(now) {
      const end = new Date(now);
      end.setUTCHours(24, 0, 0, 0);
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start, end };
    },
  },
  last30Days: {
    key: "last30Days",
    label: "近 30 天",
    getBounds(now) {
      const end = new Date(now);
      end.setUTCHours(24, 0, 0, 0);
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start, end };
    },
  },
};

module.exports = {
  MODULES,
  OVERVIEW_RANGES,
};
