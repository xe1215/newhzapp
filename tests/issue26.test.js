const assert = require("assert");
const {
  PROFILE_ENUMS,
  normalizeProfile,
  createBeautyProfile,
  applyProfileOverride,
  confirmBeautyProfile,
  cancelBeautyProfile,
} = require("../miniprogram/ui/beauty-profile-model");

const aiOutput = {
  skinTone: "自然",
  undertone: "偏暖",
  faceShape: "偏椭圆",
  styles: ["温柔", "自然"],
  scenes: ["日常", "通勤"],
  colorFamilies: ["豆沙", "奶茶"],
};

const profile = createBeautyProfile(aiOutput);
assert.deepStrictEqual(profile.aiOutput, normalizeProfile(aiOutput));
assert.deepStrictEqual(profile.confirmedProfile, profile.aiOutput);

const edited = applyProfileOverride(profile, "undertone", ["偏冷"]);
assert.deepStrictEqual(edited.userOverrides.undertone, ["偏冷"]);
assert.deepStrictEqual(edited.aiOutput.undertone, ["偏暖"]);
assert.deepStrictEqual(confirmBeautyProfile(edited, "2026-09-25T00:00:00.000Z").confirmedProfile.undertone, ["偏冷"]);

const cancelled = cancelBeautyProfile(edited);
assert.deepStrictEqual(cancelled.confirmedProfile, profile.aiOutput);
assert.deepStrictEqual(cancelled.userOverrides, {});

const bounded = normalizeProfile({ undertone: ["偏冷", "偏暖"], styles: ["温柔", "未知"], scenes: ["日常", "未知"] });
assert.deepStrictEqual(bounded.undertone, ["偏冷"]);
assert.deepStrictEqual(bounded.styles, ["温柔"]);
assert.deepStrictEqual(bounded.scenes, ["日常"]);
assert.ok(PROFILE_ENUMS.faceShape.includes("偏椭圆"));
console.log("ok - issue26 beauty profile ViewModel preserves AI output and confirmed overrides");
console.log("ok - issue26 profile enums reject invalid values and bound single/multiple selections");
