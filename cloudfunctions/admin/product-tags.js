const { normalizeText } = require("./utils");

const PRODUCT_TAG_GROUPS = {
  colorFamily: ["豆沙", "奶茶", "暖玫瑰", "柔和红棕", "正红", "莓果"],
  undertone: ["偏暖", "中性", "偏冷"],
  brightness: ["低", "中", "高"],
  saturation: ["低", "中", "高"],
  finish: ["柔雾", "丝绒", "奶油", "水光", "镜面"],
  scenes: ["日常", "通勤", "约会", "正式", "夜间"],
  styles: ["温柔", "自然", "显气色", "复古", "浓郁"],
};
const PRODUCT_TAG_FIELDS = Object.keys(PRODUCT_TAG_GROUPS);
function normalizeTagList(value) {
  const values = Array.isArray(value) ? value : normalizeText(value).split("|");
  return values.map(normalizeText).filter(Boolean);
}
function normalizeProductTags(input) {
  const source = input && input.tags && typeof input.tags === "object" ? input.tags : input || {};
  const tags = {};
  PRODUCT_TAG_FIELDS.forEach((field) => {
    const values = normalizeTagList(source[field]);
    if (values.length) tags[field] = [...new Set(values)];
  });
  return tags;
}
function validateProductTags(input, options) {
  const source = input && input.tags && typeof input.tags === "object" ? input.tags : null;
  if (!source && !(options && options.require)) return { tags: {}, errors: [] };
  const tags = normalizeProductTags(input);
  const errors = [];
  PRODUCT_TAG_FIELDS.forEach((field) => {
    const values = tags[field] || [];
    if (!values.length) errors.push(`${field} is required`);
    values.forEach((value) => {
      if (!PRODUCT_TAG_GROUPS[field].includes(value)) errors.push(`${field} contains unsupported value: ${value}`);
    });
  });
  return { tags, errors };
}
module.exports = { PRODUCT_TAG_GROUPS, PRODUCT_TAG_FIELDS, normalizeProductTags, validateProductTags };
