// Local mock ViewModel for the profile confirmation flow. It has no backend side effects.
const PROFILE_ENUMS = {
  skinTone: ["白皙", "自然", "小麦"],
  undertone: ["偏冷", "中性", "偏暖"],
  faceShape: ["偏圆", "偏椭圆", "偏长"],
  styles: ["温柔", "自然", "清冷", "明艳"],
  scenes: ["日常", "通勤", "约会", "聚会"],
  colorFamilies: ["豆沙", "奶茶", "暖玫瑰", "柔和红棕"],
};

const PROFILE_FIELDS = ["skinTone", "undertone", "faceShape", "styles", "scenes", "colorFamilies"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function listValue(value) {
  if (Array.isArray(value)) return [...new Set(value.filter(Boolean))];
  return value ? [value] : [];
}

function normalizeProfile(profile) {
  const source = profile || {};
  const next = {
    skinTone: listValue(source.skinTone).filter((value) => PROFILE_ENUMS.skinTone.includes(value)).slice(0, 1),
    undertone: listValue(source.undertone).filter((value) => PROFILE_ENUMS.undertone.includes(value)).slice(0, 1),
    faceShape: listValue(source.faceShape).filter((value) => PROFILE_ENUMS.faceShape.includes(value)).slice(0, 1),
    styles: listValue(source.styles).filter((value) => PROFILE_ENUMS.styles.includes(value)),
    scenes: listValue(source.scenes).filter((value) => PROFILE_ENUMS.scenes.includes(value)),
    colorFamilies: listValue(source.colorFamilies).filter((value) => PROFILE_ENUMS.colorFamilies.includes(value)),
  };
  return next;
}

function createBeautyProfile(aiOutput, previous) {
  const ai = normalizeProfile(aiOutput);
  const old = previous || {};
  return {
    id: old.id || "mock-beauty-profile",
    schemaVersion: 1,
    aiOutput: clone(ai),
    userOverrides: normalizeProfile(old.userOverrides),
    confirmedProfile: normalizeProfile(old.confirmedProfile || ai),
    updatedAt: old.updatedAt || "",
  };
}

function applyProfileOverride(viewModel, field, values) {
  if (!PROFILE_FIELDS.includes(field)) return clone(viewModel);
  const next = clone(viewModel);
  next.userOverrides[field] = normalizeProfile({ [field]: values })[field];
  return next;
}

function confirmBeautyProfile(viewModel, now) {
  const next = clone(viewModel);
  next.confirmedProfile = normalizeProfile({ ...next.aiOutput, ...next.userOverrides });
  next.updatedAt = now || new Date().toISOString();
  return next;
}

function cancelBeautyProfile(viewModel) {
  const next = clone(viewModel);
  next.userOverrides = {};
  next.confirmedProfile = normalizeProfile(next.aiOutput);
  return next;
}

module.exports = {
  PROFILE_ENUMS,
  PROFILE_FIELDS,
  normalizeProfile,
  createBeautyProfile,
  applyProfileOverride,
  confirmBeautyProfile,
  cancelBeautyProfile,
};
