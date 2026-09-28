export const MODULES = [
  { key: "overview", label: "\u8fd0\u8425\u4eea\u8868\u76d8", path: "/overview" },
  { key: "lipsticks", label: "\u53e3\u7ea2\u5e93\u7ef4\u62a4", path: "/lipsticks" },
  { key: "tags", label: "\u5546\u54c1\u6807\u7b7e", path: "/tags" },
  { key: "recommendationSets", label: "\u63a8\u8350\u96c6", path: "/recommendation-sets" },
  { key: "singleTryOns", label: "\u5355\u652f\u4efb\u52a1", path: "/single-tryons" },
  { key: "credits", label: "\u79ef\u5206\u8d26\u6237\u4e0e\u6d41\u6c34", path: "/credits" },
  { key: "orders", label: "\u79ef\u5206\u8ba2\u5355", path: "/orders" },
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
  shadeCode: "",
  productName: "",
  texture: "",
  productImage: "",
  colorHex: "",
  budget: "",
  status: "active",
  tags: { colorFamily: [], undertone: [], brightness: [], saturation: [], finish: [], scenes: [], styles: [] },
};

export const PRODUCT_TAG_GROUPS = {
  colorFamily: { label: "色系", options: ["豆沙", "奶茶", "暖玫瑰", "柔和红棕", "正红", "莓果"] },
  undertone: { label: "冷暖", options: ["偏暖", "中性", "偏冷"] },
  brightness: { label: "明度", options: ["低", "中", "高"] },
  saturation: { label: "饱和度", options: ["低", "中", "高"] },
  finish: { label: "妆感", options: ["柔雾", "丝绒", "奶油", "水光", "镜面"] },
  scenes: { label: "场景", options: ["日常", "通勤", "约会", "正式", "夜间"] },
  styles: { label: "风格", options: ["温柔", "自然", "显气色", "复古", "浓郁"] },
};
