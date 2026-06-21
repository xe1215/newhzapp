function includesValue(values, expected) {
  if (!expected) {
    return false;
  }

  if (Array.isArray(values)) {
    return values.includes(expected);
  }

  return values === expected;
}

function getBudget(item) {
  return item.budgetRange || item.priceRange || "";
}

function scoreLipstick(item, preferences) {
  let score = Number(item.manualBoost || 0);

  if (includesValue(item.skinToneTags, preferences.skinTone)) {
    score += 100;
  }

  if (includesValue(item.sceneTags, preferences.scene)) {
    score += 20;
  }

  if (includesValue(item.styleTags, preferences.style)) {
    score += 10;
  }

  return score;
}

function toRecommendationSnapshot(item, rank, preferences) {
  return {
    rank,
    lipstickId: item._id,
    brand: item.brand || "",
    shadeName: item.shadeName || "",
    shadeCode: item.shadeCode || "",
    colorHex: item.colorHex || "",
    priceRange: item.priceRange || item.budgetRange || "",
    skinToneTags: item.skinToneTags || [],
    budgetRange: item.budgetRange || "",
    sceneTags: item.sceneTags || [],
    styleTags: item.styleTags || [],
    manualBoost: Number(item.manualBoost || 0),
    recommendationReason: item.recommendationReason || "",
    cautionNote: item.cautionNote || "",
    substitute: item.substitute || "",
    searchKeywords: item.searchKeywords || [],
    matchedPreferences: {
      skinTone: preferences.skinTone,
      budget: preferences.budget,
      scene: preferences.scene,
      style: preferences.style,
    },
  };
}

function rankLipsticksExcluding(
  lipsticks,
  preferences,
  excludedLipstickIds,
  recommendationLimit
) {
  const excluded = new Set((excludedLipstickIds || []).map((id) => String(id)));
  const ranked = lipsticks
    .filter((item) => item.status === "active")
    .filter((item) => !excluded.has(String(item._id)))
    .filter((item) => includesValue(getBudget(item), preferences.budget))
    .map((item) => ({
      item,
      score: scoreLipstick(item, preferences),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return String(a.item._id).localeCompare(String(b.item._id));
    });
  const selected = [];
  const usedBrands = new Set();
  const usedColors = new Set();

  for (const entry of ranked) {
    const brandKey = String(entry.item.brand || "").trim().toLowerCase();
    const colorKey = String(entry.item.colorHex || "").trim().toLowerCase();

    if ((brandKey && usedBrands.has(brandKey)) || (colorKey && usedColors.has(colorKey))) {
      continue;
    }

    selected.push(entry);
    if (brandKey) {
      usedBrands.add(brandKey);
    }
    if (colorKey) {
      usedColors.add(colorKey);
    }

    if (selected.length >= recommendationLimit) {
      break;
    }
  }

  return selected.map((entry, index) =>
    toRecommendationSnapshot(entry.item, index + 1, preferences)
  );
}

function rankLipsticks(lipsticks, preferences, recommendationLimit) {
  return rankLipsticksExcluding(lipsticks, preferences, [], recommendationLimit);
}

function collectUsedLipstickIds(report) {
  const recommendations =
    report && report.snapshot && Array.isArray(report.snapshot.recommendations)
      ? report.snapshot.recommendations
      : [];

  return recommendations.map((item) => item.lipstickId).filter((id) => id);
}

function validatePreferences(data) {
  const preferences = data && data.preferences;

  if (!data || !data.testId || !preferences) {
    return null;
  }

  const required = ["skinTone", "budget", "scene", "style"];
  for (const field of required) {
    if (!preferences[field]) {
      return null;
    }
  }

  return {
    skinTone: preferences.skinTone,
    budget: preferences.budget,
    scene: preferences.scene,
    style: preferences.style,
  };
}

module.exports = {
  rankLipsticks,
  rankLipsticksExcluding,
  collectUsedLipstickIds,
  validatePreferences,
};
