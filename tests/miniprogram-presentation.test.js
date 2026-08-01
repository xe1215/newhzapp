const assert = require("assert");
const { mapRecommendation, mapReportPresentation } = require("../miniprogram/utils/presentation");

const recommendation = mapRecommendation({
  brand: "YSL",
  shadeName: "玫瑰豆沙",
  shadeCode: "N216",
  colorHex: "#A85A5D",
  tags: ["显气色", "约会"],
});

assert.equal(recommendation.brand, "YSL");
assert.equal(recommendation.shadeCode, "N216");
assert.equal(recommendation.title, "最适合你");
assert.deepEqual(recommendation.tags, ["显气色", "约会"]);
assert.ok(recommendation.recommendationReason.length > 0);

const report = mapReportPresentation(
  {
    _id: "report-1",
    testId: "test-1",
    snapshot: { recommendations: [{ shadeName: "玫瑰豆沙" }] },
  },
  [{ url: "https://example.test/paid.jpg" }]
);

assert.equal(report.reportId, "report-1");
assert.equal(report.coverImage, "https://example.test/paid.jpg");
assert.equal(report.recommendations.length, 1);
assert.equal(report.recommendations[0].shadeName, "玫瑰豆沙");
