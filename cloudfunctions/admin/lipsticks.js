const { fail, ok } = require("./response");
const { getRuntime, getEventData } = require("./runtime");
const { requireSession } = require("./session");
const { appendAdminAction } = require("./audit");
const {
  listCollectionRecords,
  normalizeStatus,
  normalizeText,
  parseCsvLine,
  toCsvValue,
} = require("./utils");
const { budgetOf, lipstickFields, mapLipstick } = require("./record-adapters");

function validateLipstickInput(input, existingRecords, currentId) {
  const existing = (existingRecords || []).find((item) => getLipstickId(item) === currentId) || {};
  const lipstick = lipstickFields(input, existing);
  const errors = [];

  if (!lipstick.brand) {
    errors.push("brand is required");
  }
  if (!lipstick.productName) {
    errors.push("productName is required");
  }
  if (!lipstick.shadeCode) {
    errors.push("shadeCode is required");
  }
  if (!lipstick.budget && currentId && existing._id) {
    // Historical records may not have had a budget field; allow editing them without inventing a value.
  } else if (!["100以内", "100-300", "300+"].includes(lipstick.budget)) {
    errors.push("budget must be 100以内, 100-300, or 300+");
  }
  if (!["active", "inactive"].includes(lipstick.status)) {
    errors.push("status must be active or inactive");
  }

  const duplicate = (existingRecords || []).find((item) => {
    if (getLipstickId(item) === currentId) {
      return false;
    }

    return (
      normalizeText(item.brand) === lipstick.brand &&
      normalizeText(item.productName || item.shadeName) === lipstick.productName &&
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

function getLipstickId(record) {
  const rawId = record && (record._id || record.id || record.lipstickId || record.productId);
  if (rawId && typeof rawId === "object") {
    return normalizeText(rawId.$oid || rawId.toString());
  }
  return normalizeText(rawId);
}

function documentData(record) {
  const { _id, ...data } = record;
  return data;
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

    if (normalizedFilters.budget && (item.budget || "") !== normalizedFilters.budget) {
      return false;
    }

    return true;
  });
}

function mapLipstickRecord(record) {
  return { ...mapLipstick(record), _id: getLipstickId(record), status: record.status || "inactive", budget: budgetOf(record) };
}

function buildLipstickFilters(records) {
  const brands = [...new Set((records || []).map((item) => normalizeText(item.brand)).filter(Boolean))].sort();
  return {
    brands,
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
    ).map(mapLipstickRecord),
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
  const lipstickId = normalizeText(input._id || input.id || input.lipstickId || input.productId);
  const records = await listCollectionRecords(runtime, "lipsticks");
  const previous = lipstickId
    ? (records.find((item) => getLipstickId(item) === lipstickId) || null)
    : null;
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
    data: documentData(nextRecord),
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
    data: documentData(nextRecord),
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
  const firstLineColumnCount = parseCsvLine(lines[0] || "").length;
  const hasSingleHeaderlessRow = lines.length === 1 && [8, 9].includes(firstLineColumnCount);
  if (lines.length < 2 && !hasSingleHeaderlessRow) {
    return fail("INVALID_CSV_IMPORT", "CSV must contain a header and at least one row", {
      errors: [{ rowNumber: 1, reason: "No data rows found" }],
    });
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, ""));
  const requiredHeaders = [
    "brand",
    "productName",
    "shadeCode",
    "texture",
    "productImage",
    "colorHex",
    "budget",
    "status",
  ];

  const legacyHeaders = [
    "brand",
    "shadeName",
    "shadeCode",
    "colorHex",
    "skinToneTags",
    "budgetMin",
    "budgetMax",
    "status",
  ];
  const isLegacyTemplate = headers.join(",") === legacyHeaders.join(",");
  const isHeaderlessTemplate = [8, 9].includes(headers.length) && !isLegacyTemplate && headers.join(",") !== requiredHeaders.join(",");
  if (headers.join(",") !== requiredHeaders.join(",") && !isLegacyTemplate && !isHeaderlessTemplate) {
    return fail("INVALID_CSV_IMPORT", "CSV header does not match the expected template", {
      errors: [{ rowNumber: 1, reason: "Unexpected header columns" }],
    });
  }

  const existingRecords = await listCollectionRecords(runtime, "lipsticks");
  const stagedRecords = [];
  const seenKeys = new Set(
    existingRecords.map((item) =>
      [normalizeText(item.brand), normalizeText(item.productName || item.shadeName), normalizeText(item.shadeCode)].join("::")
    )
  );
  const errors = [];

  const dataLines = isHeaderlessTemplate ? lines : lines.slice(1);
  const headerlessNineColumnHeaders = [
    "brand",
    "productName",
    "shadeCode",
    "texture",
    "productImage",
    "colorHex",
    "skinToneTags",
    "budget",
    "status",
  ];
  const rowHeaders = isHeaderlessTemplate
    ? (headers.length === headerlessNineColumnHeaders.length ? headerlessNineColumnHeaders : requiredHeaders)
    : headers;
  for (let index = 0; index < dataLines.length; index += 1) {
    const values = parseCsvLine(dataLines[index]);
    const record = Object.fromEntries(
      rowHeaders.map((header, valueIndex) => [header, values[valueIndex] || ""])
    );
    if (isLegacyTemplate) {
      record.productName = record.shadeName;
      const min = Number(record.budgetMin);
      const max = Number(record.budgetMax);
      record.budget = max <= 100 ? "100以内" : min > 300 ? "300+" : "100-300";
    }
    const rowNumber = isHeaderlessTemplate ? index + 1 : index + 2;
    const key = [
      normalizeText(record.brand),
      normalizeText(record.productName),
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
      data: documentData(nextRecord),
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
    "productName",
    "shadeCode",
    "texture",
    "productImage",
    "colorHex",
    "budget",
    "status",
  ];
  const rows = records
    .sort((left, right) =>
      `${left.brand || ""}${left.shadeCode || ""}`.localeCompare(`${right.brand || ""}${right.shadeCode || ""}`)
    )
    .map((item) =>
      [
        item.brand,
        item.productName || item.shadeName,
        item.shadeCode,
        item.texture,
        item.productImage,
        item.colorHex,
        item.budget,
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
