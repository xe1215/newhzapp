function stringValue(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function listValue(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function mapRecommendation(recommendation = {}, rank = 0) {
  const tags = listValue(recommendation.tags);
  return {
    rank: Number(recommendation.rank || rank + 1),
    title: stringValue(recommendation.title, ["最适合你", "日常不出错", "风格加分款"][rank] || "推荐色"),
    brand: stringValue(recommendation.brand, ""),
    shadeName: stringValue(recommendation.shadeName, "未命名色号"),
    shadeCode: stringValue(recommendation.shadeCode, ""),
    colorHex: stringValue(recommendation.colorHex, "#B86B70"),
    colorEnglish: stringValue(recommendation.colorEnglish, "ROSE NUDE"),
    texture: stringValue(recommendation.texture, "柔雾质地"),
    recommendationReason: stringValue(recommendation.recommendationReason, "这支颜色能提升气色，日常使用自然耐看。"),
    sceneText: stringValue(recommendation.sceneText, "通勤、约会和轻正式场合"),
    outfitText: stringValue(recommendation.outfitText, "白衬衫、针织衫和低饱和色系"),
    tags: tags.length ? tags : ["显气色", "日常"],
    cautionNote: stringValue(recommendation.cautionNote, ""),
    substitute: stringValue(recommendation.substitute, ""),
    productImage: stringValue(
      recommendation.productImage || recommendation.productImageUrl || recommendation.productImageFileId || recommendation.lipstickImage,
      ""
    ),
  };
}

function mapReportPresentation(report = {}, paidImages = []) {
  const snapshot = report.snapshot || {};
  const recommendations = listValue(snapshot.recommendations).map(mapRecommendation);
  return {
    reportId: stringValue(report._id || report.reportId, ""),
    testId: stringValue(report.testId, ""),
    coverImage: stringValue(report.coverImage, paidImages[0] && paidImages[0].url ? paidImages[0].url : ""),
    paidImages: listValue(paidImages),
    recommendations,
    reportDate: stringValue(report.createdAt, ""),
  };
}

module.exports = {
  mapRecommendation,
  mapReportPresentation,
};
