const testService = require("../../services/test");
const { ERROR_MESSAGES } = require("../../utils/errors");
const { unwrapCloudCall } = require("../../utils/business");

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
  },

  chooseSelfie() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) {
          this.setData({ feedback: "No photo was selected." });
          return;
        }

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
        wx.navigateTo({
          url: `/pages/preferences/index?testId=${data.testId}`,
        });
      })
      .catch(() => {
        this.setData({
          uploading: false,
          feedback: ERROR_MESSAGES.UNKNOWN,
        });
      });
  },
});
