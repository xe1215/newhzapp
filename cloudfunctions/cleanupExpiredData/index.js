const { cloud, createRuntime, ok } = require("./business-runtime");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

function getRuntime(deps) {
  return createRuntime(deps, {
    deleteFile:
      deps && deps.deleteFile
        ? deps.deleteFile
        : async (fileID) => {
            if (!fileID) {
              return;
            }

            await cloud.deleteFile({ fileList: [fileID] });
          },
  }, { includeWxContext: false });
}

function isExpired(isoTime, nowMs) {
  if (!isoTime) {
    return false;
  }

  const expiresMs = Date.parse(isoTime);
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

async function clearExpiredSelfies(runtime, nowIso, nowMs) {
  const result = await runtime.db.collection("try_on_tests").where({}).get();
  const tests = result.data || [];
  const [reportResult, orderResult] = await Promise.all([
    runtime.db.collection("reports").where({}).get(),
    runtime.db.collection("orders").where({}).get(),
  ]);
  const retainedTestIds = new Set([
    ...(reportResult.data || [])
      .filter((report) => report.unlockedAt)
      .map((report) => report.testId),
    ...(orderResult.data || [])
      .filter((order) => order.status === "paid")
      .map((order) => order.testId),
  ].filter(Boolean));
  let cleanedSelfies = 0;

  for (const test of tests) {
    if (!test.selfieFileId || retainedTestIds.has(test._id) || !isExpired(test.expiresAt, nowMs)) {
      continue;
    }

    await runtime.deleteFile(test.selfieFileId).catch(() => null);
    await runtime.db.collection("try_on_tests").doc(test._id).update({
      data: {
        selfieFileId: "",
        updatedAt: nowIso,
      },
    });
    cleanedSelfies += 1;
  }

  return cleanedSelfies;
}

async function expireUnpaidReports(runtime, nowIso, nowMs) {
  const [reportResult, orderResult, testResult] = await Promise.all([
    runtime.db.collection("reports").where({}).get(),
    runtime.db.collection("orders").where({}).get(),
    runtime.db.collection("try_on_tests").where({}).get(),
  ]);
  const reports = reportResult.data || [];
  const paidReportIds = new Set(
    (orderResult.data || [])
      .filter((order) => order.status === "paid")
      .map((order) => order.reportId)
      .filter(Boolean)
  );
  const expiryByTestId = new Map(
    (testResult.data || []).map((test) => [test._id, test.expiresAt || ""])
  );
  const testById = new Map(
    (testResult.data || []).map((test) => [test._id, test])
  );
  let expiredReports = 0;

  for (const report of reports) {
    if (!report._id || report.deletedAt || report.unlockedAt || paidReportIds.has(report._id)) {
      continue;
    }

    const expiresAt = expiryByTestId.get(report.testId) || report.createdAt;
    if (!isExpired(expiresAt, nowMs)) {
      continue;
    }

    const imageFileIds = [...new Set([
      ...(Array.isArray(report.previewImages) ? report.previewImages : []),
      ...(Array.isArray(report.paidImages) ? report.paidImages : []),
    ].filter(Boolean))];
    await Promise.all(imageFileIds.map((fileId) => runtime.deleteFile(fileId).catch(() => null)));

    await runtime.db.collection("reports").doc(report._id).update({
      data: {
        status: "expired",
        deletedAt: nowIso,
        previewImages: [],
        paidImages: [],
        snapshot: {},
        updatedAt: nowIso,
      },
    });
    const test = testById.get(report.testId);
    if (test && test.activeReportId === report._id) {
      await runtime.db.collection("try_on_tests").doc(report.testId).update({
        data: {
          activeReportId: "",
          updatedAt: nowIso,
        },
      });
    }
    expiredReports += 1;
  }

  return expiredReports;
}

exports.main = async (event, context, deps) => {
  const runtime = getRuntime(deps);
  const now = runtime.now();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const cleanedSelfies = await clearExpiredSelfies(runtime, nowIso, nowMs);
  const expiredReports = await expireUnpaidReports(runtime, nowIso, nowMs);

  return ok({
    cleanedSelfies,
    expiredReports,
  });
};
