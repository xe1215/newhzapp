const testService = require("../../services/test");
const { ERROR_MESSAGES } = require("../../utils/errors");
const { getQueryValue, unwrapCloudCall } = require("../../utils/business");

Page({
  data: {
    testId: "",
    skinTone: "neutral",
    budget: "mid",
    scene: "daily",
    style: "natural",
    submitting: false,
    feedback: "",
    options: {
      skinTone: [
        { value: "cool", label: "冷白" },
        { value: "neutral", label: "自然" },
        { value: "warm", label: "暖白" },
      ],
      budget: [
        { value: "low", label: "100 元内" },
        { value: "mid", label: "100-300" },
        { value: "high", label: "300+" },
      ],
      scene: [
        { value: "daily", label: "日常" },
        { value: "date", label: "约会" },
        { value: "commute", label: "通勤" },
      ],
      style: [
        { value: "natural", label: "温柔" },
        { value: "bold", label: "显气色" },
        { value: "commute", label: "清冷" },
      ],
    },
  },

  onLoad(query) {
    const testId = getQueryValue(query, "testId");

    wx.redirectTo({
      url: testId ? `/pages/upload/index?testId=${testId}` : "/pages/upload/index",
    });
  },

  selectOption(e) {
    const { field, value } = e.currentTarget.dataset;

    if (!field || !value) {
      return;
    }

    const fieldOptions =
      this.data && this.data.options && Array.isArray(this.data.options[field])
        ? this.data.options[field]
        : [];
    const isAllowedValue = fieldOptions.some((option) => option.value === value);

    if (!isAllowedValue) {
      return;
    }

    this.setData({
      [field]: value,
      feedback: "",
    });
  },

  startGenerating() {
    if (!this.data.testId) {
      this.setData({
        feedback: "Please upload a selfie before choosing preferences.",
      });
      return;
    }

    this.setData({
      submitting: true,
      feedback: "",
    });

    testService
      .submitPreferences({
        testId: this.data.testId,
        preferences: {
          skinTone: this.data.skinTone,
          budget: this.data.budget,
          scene: this.data.scene,
          style: this.data.style,
        },
      })
      .then((response) => {
        const data = unwrapCloudCall(response, ERROR_MESSAGES.UNKNOWN);

        wx.navigateTo({
          url: `/pages/generating/index?testId=${data.testId}&reportId=${data.reportId}`,
        });
      })
      .catch((error) => {
        this.setData({
          submitting: false,
          feedback: error.message || ERROR_MESSAGES.UNKNOWN,
        });
      });
  },
});
