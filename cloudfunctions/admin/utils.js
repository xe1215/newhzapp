function toIsoString(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function maskOpenId(openid) {
  const value = String(openid || "");

  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}...${value.slice(-2)}`;
  }

  return `${value.slice(0, 9)}...${value.slice(-4)}`;
}

function stringField(value, fallback) {
  return typeof value === "string" && value ? value : fallback || "";
}

function numberField(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback || 0);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeStatus(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeColorHex(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  return normalizeText(value)
    .split("|")
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function normalizeBudget(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

async function listCollectionRecords(runtime, name) {
  const result = await runtime.db.collection(name).get();
  return result.data || [];
}

function buildRecordDateQuery(filters) {
  const startDate = toIsoString(filters && filters.startDate);
  const endDate = toIsoString(filters && filters.endDate);

  if (!startDate && !endDate) {
    return null;
  }

  const query = {};

  if (startDate) {
    query.$gte = startDate;
  }

  if (endDate) {
    query.$lt = endDate;
  }

  return Object.keys(query).length ? query : null;
}

function buildAdminRecordQuery(filters, fields) {
  const safeFilters = filters || {};
  const query = {};

  fields.forEach((field) => {
    if (safeFilters[field]) {
      query[field] = safeFilters[field];
    }
  });

  const createdAt = buildRecordDateQuery(safeFilters);
  if (createdAt) {
    query.createdAt = createdAt;
  }

  return query;
}

function parseCsvLine(line) {
  return String(line || "")
    .split(",")
    .map((item) => item.trim());
}

function toCsvValue(value) {
  const text = String(value === undefined || value === null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

module.exports = {
  toIsoString,
  maskOpenId,
  stringField,
  numberField,
  normalizeText,
  normalizeStatus,
  normalizeColorHex,
  normalizeTags,
  normalizeBudget,
  clone,
  listCollectionRecords,
  buildAdminRecordQuery,
  parseCsvLine,
  toCsvValue,
};
