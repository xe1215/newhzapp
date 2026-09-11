const { normalizeText, normalizeStatus } = require("./utils");

function budgetOf(record) {
  if (record && record.budget) return normalizeText(record.budget);
  const min = Number(record && record.budgetMin);
  const max = Number(record && record.budgetMax);
  if (max <= 100) return "100以内";
  if (min > 300) return "300+";
  if (min > 100) return "100-300";
  return "";
}

function lipstickFields(input, existing) {
  const source = input || {};
  const previous = existing || {};
  const legacyMin = Number(source.budgetMin);
  const legacyMax = Number(source.budgetMax);
  const budget = source.budget || budgetOf(previous) || (legacyMax <= 100 ? "100以内" : legacyMin > 300 ? "300+" : legacyMin > 100 ? "100-300" : "");
  return {
    brand: normalizeText(source.brand),
    productName: normalizeText(source.productName || source.shadeName),
    shadeCode: normalizeText(source.shadeCode),
    texture: normalizeText(source.texture),
    productImage: normalizeText(source.productImage),
    colorHex: normalizeText(source.colorHex),
    budget: normalizeText(budget),
    status: normalizeStatus(source.status),
  };
}

function mapLipstick(record) {
  const fields = lipstickFields(record);
  return { ...fields, _id: normalizeText(record && record._id), createdAt: record.createdAt || "", updatedAt: record.updatedAt || "" };
}

module.exports = { budgetOf, lipstickFields, mapLipstick };
