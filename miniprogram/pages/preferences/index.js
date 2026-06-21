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
        { value: "cool", label: "Cool" },
        { value: "neutral", label: "Neutral" },
        { value: "warm", label: "Warm" },
      ],
      budget: [
        { value: "low", label: "Low" },
        { value: "mid", label: "Mid" },
        { value: "high", label: "High" },
      ],
      scene: [
        { value: "daily", label: "Daily" },
        { value: "date", label: "Date" },
        { value: "commute", label: "Commute" },
      ],
      style: [
        { value: "natural", label: "Natural" },
        { value: "bold", label: "Bold" },
        { value: "commute", label: "Commute" },
      ],
    },
  },

  onLoad(query) {
    this.setData({
      testId: getQueryValue(query, "testId"),
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
