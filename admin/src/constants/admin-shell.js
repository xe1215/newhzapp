export const MODULES = [
  { key: "overview", label: "\u8fd0\u8425\u4eea\u8868\u76d8", path: "/overview" },
  { key: "lipsticks", label: "\u53e3\u7ea2\u5e93\u7ef4\u62a4", path: "/lipsticks" },
  { key: "tests", label: "\u6d4b\u8bd5\u8bb0\u5f55", path: "/tests" },
  { key: "reports", label: "\u62a5\u544a\u8bb0\u5f55", path: "/reports" },
  { key: "orders", label: "\u8ba2\u5355\u4e0e\u9000\u6b3e", path: "/orders" },
  { key: "logs", label: "\u751f\u6210\u4e0e\u4e8b\u4ef6\u65e5\u5fd7", path: "/logs" },
];

export const OVERVIEW_RANGES = [
  { key: "today", label: "\u4eca\u5929" },
  { key: "yesterday", label: "\u6628\u5929" },
  { key: "last7Days", label: "\u8fd1 7 \u5929" },
  { key: "last30Days", label: "\u8fd1 30 \u5929" },
];

export const EMPTY_LIPSTICK_FORM = {
  _id: "",
  brand: "",
  shadeName: "",
  shadeCode: "",
  colorHex: "",
  skinToneTags: "",
  budgetMin: "",
  budgetMax: "",
  status: "active",
};
