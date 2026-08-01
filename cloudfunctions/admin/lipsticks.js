const { fail, ok } = require("./response");
const { getRuntime, getEventData } = require("./runtime");
const { requireSession } = require("./session");
const { appendAdminAction } = require("./audit");
const {
  listCollectionRecords,
  normalizeBudget,
  normalizeColorHex,
  normalizeStatus,
  normalizeTags,
  normalizeText,
  parseCsvLine,
  toCsvValue,
} = require("./utils");

function validateLipstickInput(input, existingRecords, currentId) {
  const lipstick = {
    brand: normalizeText(input.brand),
    shadeName: normalizeText(input.shadeName),
    shadeCode: normalizeText(input.shadeCode),
    colorHex: normalizeColorHex(input.colorHex),
    skinToneTags: normalizeTags(input.skinToneTags),
    budgetMin: normalizeBudget(input.budgetMin),
    budgetMax: normalizeBudget(input.budgetMax),
    status: normalizeStatus(input.status),
  };
  const errors = [];

  if (!lipstick.brand) {
    errors.push("brand is required");
  }
  if (!lipstick.shadeName) {
    errors.push("shadeName is required");
  }
  if (!lipstick.shadeCode) {
    errors.push("shadeCode is required");
  }
  if (!/^#[0-9A-F]{6}$/.test(lipstick.colorHex)) {
    errors.push("colorHex must be a #RRGGBB value");
  }
  if (!lipstick.skinToneTags.length) {
    errors.push("skinToneTags must contain at least one tag");
  }
  if (!Number.isFinite(lipstick.budgetMin) || lipstick.budgetMin < 0) {
    errors.push("budgetMin must be a valid non-negative number");
  }
  if (!Number.isFinite(lipstick.budgetMax) || lipstick.budgetMax < 0) {
    errors.push("budgetMax must be a valid non-negative number");
  }
  if (
    Number.isFinite(lipstick.budgetMin) &&
    Number.isFinite(lipstick.budgetMax) &&
    lipstick.budgetMin > lipstick.budgetMax
  ) {
    errors.push("budgetMin cannot be greater than budgetMax");
  }
  if (!["active", "inactive"].includes(lipstick.status)) {
    errors.push("status must be active or inactive");
  }

  const duplicate = (existingRecords || []).find((item) => {
    if (item._id === currentId) {
      return false;
    }

    return (
      normalizeText(item.brand) === lipstick.brand &&
      normalizeText(item.shadeName) === lipstick.shadeName &&
      normalizeText(item.shadeCode) === lipstick.shadeCode
    );
  });

  if (duplicate) {
    errors.push("duplicate brand/shadeName/shadeCode combination");
  }

  return {
    lipstick,
    errors,
  };
}

function filterLipsticks(records, filters) {
  const normalizedFilters = filters || {};

  return (records || []).filter((item) => {
    if (
      normalizedFilters.brand &&
      normalizeText(item.brand).toLowerCase() !== normalizeText(normalizedFilters.brand).toLowerCase()
    ) {
      return false;
    }

    if (
      normalizedFilters.status &&
      normalizeStatus(item.status) !== normalizeStatus(normalizedFilters.status)
    ) {
      return false;
    }

    if (normalizedFilters.skinToneTag) {
      const tags = normalizeTags(item.skinToneTags).map((tag) => tag.toLowerCase());
      if (!tags.includes(normalizeText(normalizedFilters.skinToneTag).toLowerCase())) {
        return false;
      }
    }

    if (
      Number.isFinite(Number(normalizedFilters.budgetMin)) &&
      Number(item.budgetMin || 0) < Number(normalizedFilters.budgetMin)
    ) {
      return false;
    }

    if (
      Number.isFinite(Number(normalizedFilters.budgetMax)) &&
      Number(item.budgetMax || 0) > Number(normalizedFilters.budgetMax)
    ) {
      return false;
    }

    return true;
  });
}

function buildLipstickFilters(records) {
  const brands = [...new Set((records || []).map((item) => normalizeText(item.brand)).filter(Boolean))].sort();
  const skinToneTags = [
    ...new Set(
      (records || [])
        .flatMap((item) => normalizeTags(item.skinToneTags))
        .filter(Boolean)
    ),
  ].sort();

  return {
    brands,
    skinToneTags,
    statuses: ["active", "inactive"],
  };
}

async function listLipsticks(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  const records = await listCollectionRecords(runtime, "lipsticks");
  const filtered = filterLipsticks(records, data.filters);

  return ok({
    records: filtered.sort((left, right) =>
      `${left.brand || ""}${left.shadeCode || ""}`.localeCompare(`${right.brand || ""}${right.shadeCode || ""}`)
    ),
    availableFilters: buildLipstickFilters(records),
  });
}

async function saveLipstick(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  const input = data.lipstick || {};
  const lipstickId = normalizeText(input._id);
  const records = await listCollectionRecords(runtime, "lipsticks");
  const previous = lipstickId ? (await runtime.db.collection("lipsticks").doc(lipstickId).get()).data || null : null;
  const { lipstick, errors } = validateLipstickInput(input, records, lipstickId || "");

  if (errors.length) {
    return fail("INVALID_LIPSTICK", "Lipstick validation failed", { errors });
  }

  const now = runtime.now().toISOString();
  const nextId = lipstickId || runtime.id();
  const nextRecord = {
    _id: nextId,
    ...lipstick,
    createdAt: previous && previous.createdAt ? previous.createdAt : now,
    updatedAt: now,
  };

  await runtime.db.collection("lipsticks").doc(nextId).set({
    data: nextRecord,
  });

  await appendAdminAction(
    runtime,
    previous ? "lipstick_update" : "lipstick_create",
    "lipstick",
    nextId,
    previous || null,
    nextRecord
  );

  return ok({
    record: nextRecord,
  });
}

async function setLipstickStatus(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  const lipstickId = normalizeText(data.lipstickId);
  const status = normalizeStatus(data.status);
  const previous = lipstickId ? (await runtime.db.collection("lipsticks").doc(lipstickId).get()).data || null : null;

  if (!previous) {
    return fail("RESOURCE_NOT_FOUND", "Lipstick record was not found");
  }

  if (!["active", "inactive"].includes(status)) {
    return fail("INVALID_LIPSTICK", "status must be active or inactive", {
      errors: ["status must be active or inactive"],
    });
  }

  const nextRecord = {
    ...previous,
    status,
    updatedAt: runtime.now().toISOString(),
  };

  await runtime.db.collection("lipsticks").doc(lipstickId).set({
    data: nextRecord,
  });

  await appendAdminAction(
    runtime,
    "lipstick_status_change",
    "lipstick",
    lipstickId,
    previous,
    nextRecord
  );

  return ok({
    record: nextRecord,
  });
}

async function importLipsticksCsv(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  const csvText = String(data.csvText || "");
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return fail("INVALID_CSV_IMPORT", "CSV must contain a header and at least one row", {
      errors: [{ rowNumber: 1, reason: "No data rows found" }],
    });
  }

  const headers = parseCsvLine(lines[0]);
  const requiredHeaders = [
    "brand",
    "shadeName",
    "shadeCode",
    "colorHex",
    "skinToneTags",
    "budgetMin",
    "budgetMax",
    "status",
  ];

  if (headers.join(",") !== requiredHeaders.join(",")) {
    return fail("INVALID_CSV_IMPORT", "CSV header does not match the expected template", {
      errors: [{ rowNumber: 1, reason: "Unexpected header columns" }],
    });
  }

  const existingRecords = await listCollectionRecords(runtime, "lipsticks");
  const stagedRecords = [];
  const seenKeys = new Set(
    existingRecords.map((item) =>
      [normalizeText(item.brand), normalizeText(item.shadeName), normalizeText(item.shadeCode)].join("::")
    )
  );
  const errors = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index]);
    const record = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex] || ""]));
    const rowNumber = index + 1;
    const key = [
      normalizeText(record.brand),
      normalizeText(record.shadeName),
      normalizeText(record.shadeCode),
    ].join("::");
    const validation = validateLipstickInput(record, [], "");

    if (seenKeys.has(key)) {
      validation.errors.push("duplicate brand/shadeName/shadeCode combination");
    }

    if (validation.errors.length) {
      errors.push({
        rowNumber,
        reason: validation.errors.join("; "),
      });
      continue;
    }

    seenKeys.add(key);
    stagedRecords.push(validation.lipstick);
  }

  if (errors.length) {
    return fail("INVALID_CSV_IMPORT", "CSV import validation failed", {
      errors,
    });
  }

  const importedRecords = [];
  const now = runtime.now().toISOString();
  for (const lipstick of stagedRecords) {
    const lipstickId = runtime.id();
    const nextRecord = {
      _id: lipstickId,
      ...lipstick,
      createdAt: now,
      updatedAt: now,
    };
    await runtime.db.collection("lipsticks").doc(lipstickId).set({
      data: nextRecord,
    });
    importedRecords.push(nextRecord);
  }

  await appendAdminAction(
    runtime,
    "lipstick_import_csv",
    "lipstick",
    "batch",
    null,
    {
      importedCount: importedRecords.length,
      records: importedRecords,
    }
  );

  return ok({
    importedCount: importedRecords.length,
  });
}

async function exportLipsticksCsv(event, deps) {
  const runtime = getRuntime(deps);
  const data = getEventData(event);
  const session = await requireSession(runtime, data.token);

  if (session.code) {
    return session;
  }

  const records = await listCollectionRecords(runtime, "lipsticks");
  const header = [
    "brand",
    "shadeName",
    "shadeCode",
    "colorHex",
    "skinToneTags",
    "budgetMin",
    "budgetMax",
    "status",
  ];
  const rows = records
    .sort((left, right) =>
      `${left.brand || ""}${left.shadeCode || ""}`.localeCompare(`${right.brand || ""}${right.shadeCode || ""}`)
    )
    .map((item) =>
      [
        item.brand,
        item.shadeName,
        item.shadeCode,
        item.colorHex,
        normalizeTags(item.skinToneTags).join("|"),
        item.budgetMin,
        item.budgetMax,
        item.status,
      ]
        .map(toCsvValue)
        .join(",")
    );

  return ok({
    fileName: `lipsticks-${runtime.now().toISOString().slice(0, 10)}.csv`,
    csvText: [header.join(","), ...rows].join("\n"),
  });
}

module.exports = {
  listLipsticks,
  saveLipstick,
  setLipstickStatus,
  importLipsticksCsv,
  exportLipsticksCsv,
};
