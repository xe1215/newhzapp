// Local recommendation mock. It consumes confirmed profile data and product tags only.
const ROLES = [
  { key: "best", label: "AI 首选", subtitle: "最符合你的整体画像" },
  { key: "daily", label: "日常通勤", subtitle: "比较容易驾驭的日常色" },
  { key: "style", label: "风格尝试", subtitle: "在适合你的基础上尝试一点变化" },
];

function values(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function scoreProduct(product, profile) {
  const tags = product.tags || {};
  const confirmed = profile && profile.confirmedProfile ? profile.confirmedProfile : profile || {};
  const wanted = [
    ...values(confirmed.skinTone),
    ...values(confirmed.undertone),
    ...values(confirmed.styles),
    ...values(confirmed.scenes),
    ...values(confirmed.colorFamilies),
  ];
  const matched = wanted.filter((item) => Object.values(tags).some((tagValues) => values(tagValues).includes(item)));
  const score = matched.length * 20 + (product.manualBoost || 0);
  return { score, matched: [...new Set(matched)] };
}

function reasonFor(role, product, matched) {
  const signal = matched.length ? matched.slice(0, 2).join("、") : "整体妆感";
  if (role === "daily") return `颜色更自然，${signal}与日常通勤场景比较协调，容易驾驭。`;
  if (role === "style") return `在适合你的基础上增加一点变化，仍然保留${signal}的协调感。`;
  return `这支颜色与${signal}比较协调，整体饱和度适中，适合你的温柔自然风格。`;
}

function recommendProducts(products, profile, excludedIds) {
  const excluded = new Set(values(excludedIds).map(String));
  const candidates = (products || [])
    .filter((product) => product && product.isActive !== false && product.status !== "inactive" && Object.keys(product.tags || {}).length > 0)
    .filter((product) => !excluded.has(String(product.id || product._id)))
    .map((product) => ({ product, ...scoreProduct(product, profile) }))
    .sort((left, right) => right.score - left.score || String(left.product.id || left.product._id).localeCompare(String(right.product.id || right.product._id)));
  const selected = [];
  const used = new Set();
  for (const role of ROLES) {
    const next = candidates.find((entry) => !used.has(String(entry.product.id || entry.product._id)));
    if (!next) break;
    const id = String(next.product.id || next.product._id);
    used.add(id);
    selected.push({
      productId: id,
      role: role.key,
      roleLabel: role.label,
      roleSubtitle: role.subtitle,
      matchScore: next.score,
      reason: reasonFor(role.key, next.product, next.matched),
      matchedSignals: next.matched,
      product: next.product,
    });
  }
  return selected;
}

module.exports = { ROLES, scoreProduct, recommendProducts };
