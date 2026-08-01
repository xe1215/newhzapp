const testService = require("../../services/test");
const { ERROR_MESSAGES } = require("../../utils/errors");
const { unwrapCloudCall } = require("../../utils/business");
const { getQueryValue } = require("../../utils/business");

const SELFIE_REJECTION_REASON_MESSAGES = {
  content_unsafe: "This photo cannot be used because it did not pass content safety checks.",
  face_missing: "Please retake the photo with your full face clearly visible.",
  lips_not_visible: "Please retake the photo with your lips clearly visible.",
  image_blurry: "Please retake the photo in better light so your face looks clear.",
  face_occluded: "Please remove anything covering your face before retaking the photo.",
};

function formatSelfieRejectionFeedback(result) {
  const reasons =
    result &&
    result.data &&
    Array.isArray(result.data.reasons)
      ? result.data.reasons
      : [];

  if (!reasons.length) {
    return result.message || ERROR_MESSAGES[result.code] || ERROR_MESSAGES.UNKNOWN;
  }

  return reasons
    .map((reason) => SELFIE_REJECTION_REASON_MESSAGES[reason])
    .filter(Boolean)
    .join(" ");
}

Page({
  data: {
    uploading: false,
    feedback: "",
    testId: "",
    photoPath: "",
    skinTone: "neutral",
    budget: "mid",
    scene: "commute",
    style: "natural",
    submitting: false,
    options: {
      skinTone: [{ value: "warm", label: "\u6696\u767D" }, { value: "neutral", label: "\u81EA\u7136" }, { value: "cool", label: "\u5C0F\u9EA6" }],
      budget: [{ value: "low", label: "\u767E\u5143\u5185" }, { value: "mid", label: "100-300" }, { value: "high", label: "300+" }],
      scene: [{ value: "commute", label: "\u901A\u52E4" }, { value: "date", label: "\u7EA6\u4F1A" }],
      style: [{ value: "bold", label: "\u663E\u767D" }, { value: "natural", label: "\u6E29\u67D4" }],
    },
  },

  chooseCamera() {
    this.chooseSelfie("camera");
  },

  onLoad(query) {
    const testId = getQueryValue(query, "testId");
    if (testId) {
      this.setData({
        testId,
        feedback: "\u5DF2\u4FDD\u7559\u8FD9\u6B21\u8BD5\u8272\uFF0C\u8BF7\u5B8C\u6210\u504F\u597D\u9009\u62E9\u3002",
      });
    }
  },

  chooseAlbum() {
    this.chooseSelfie("album");
  },

  chooseSelfie(sourceType) {
    if (this.data.uploading || this.data.submitting) {
      return;
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: [sourceType],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) {
          this.setData({ feedback: "No photo was selected." });
          return;
        }

        this.setData({ photoPath: file.tempFilePath });

        this.uploadSelectedSelfie(file.tempFilePath);
      },
    });
  },

  uploadSelectedSelfie(tempFilePath) {
    const app = getApp();
    const openid =
      app.globalData && app.globalData.user && app.globalData.user.openid
        ? app.globalData.user.openid
        : "pending";
    const uploadPath = `uploads/${openid}/${Date.now()}-selfie.jpg`;

    this.setData({
      uploading: true,
      feedback: "Checking your selfie...",
    });

    return wx.cloud
      .uploadFile({
        cloudPath: uploadPath,
        filePath: tempFilePath,
      })
      .then((uploadResult) => {
        return testService.uploadSelfie({
          tempFileID: uploadResult.fileID,
        });
      })
      .then((response) => {
        const result = response && response.result ? response.result : {};
        if (result.code !== 0) {
          const message =
            result.code === "SELFIE_REJECTED"
              ? formatSelfieRejectionFeedback(result)
              : result.message || ERROR_MESSAGES[result.code] || ERROR_MESSAGES.UNKNOWN;
          this.setData({
            uploading: false,
            feedback: message,
          });
          return;
        }

        const data = unwrapCloudCall(response, ERROR_MESSAGES.UNKNOWN);
        this.setData({ testId: data.testId, uploading: false, feedback: "\u7167\u7247\u68C0\u67E5\u901A\u8FC7\uFF0C\u53EF\u4EE5\u751F\u6210\u8BD5\u8272\u3002" });
      })
      .catch(() => {
        this.setData({
          uploading: false,
          feedback: ERROR_MESSAGES.UNKNOWN,
        });
      });
  },

  selectOption(e) {
    const { field, value } = e.currentTarget.dataset;
    if (!field || !value || !this.data.options[field]) return;
    this.setData({ [field]: value, feedback: "" });
  },

  startGenerating() {
    if (!this.data.testId) {
      this.setData({ feedback: "\u8BF7\u5148\u4E0A\u4F20\u4E00\u5F20\u6E05\u6670\u81EA\u62CD\u3002" });
      return;
    }
    this.setData({ submitting: true, feedback: "" });
    testService.submitPreferences({
      testId: this.data.testId,
      preferences: { skinTone: this.data.skinTone, budget: this.data.budget, scene: this.data.scene, style: this.data.style },
    }).then((response) => {
      const data = unwrapCloudCall(response, ERROR_MESSAGES.UNKNOWN);
      wx.navigateTo({ url: `/pages/generating/index?testId=${data.testId}&reportId=${data.reportId}` });
    }).catch((error) => {
      this.setData({ submitting: false, feedback: error.message || ERROR_MESSAGES.UNKNOWN });
    });
  },
});
