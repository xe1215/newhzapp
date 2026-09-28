const { fail, ok, getEventData, requireOpenId, buildRuntime } = require('./test-core');
const { creditPolicy } = require('./credit-policy');
const { createCreditJob, startCreditAttempt, settleCredits } = require('./credits');
const { createSingleImageProvider } = require('./single-image-provider');

function nowIso(runtime) {
  return runtime.now().toISOString();
}

async function findIdempotentJob(runtime, openid, idempotencyKey) {
  if (!idempotencyKey) return null;
  const query = runtime.db.collection('single_tryon_jobs').where({ openid, idempotencyKey });
  const result = await (typeof query.limit === 'function' ? query.limit(1) : query).get();
  return result && result.data && result.data[0] ? result.data[0] : null;
}

async function loadOwnedJob(runtime, jobId, openid) {
  const result = await runtime.db.collection('single_tryon_jobs').doc(jobId).get();
  const job = result.data || {};
  if (!job._id || job.openid !== openid) return null;
  return job;
}

function publicJob(job, extra) {
  return {
    id: job._id,
    jobId: job._id,
    testId: job.testId,
    productId: job.productId,
    product: job.product || {},
    status: job.status,
    imageCount: 1,
    resultImage: job.resultImage || '',
    beforeImage: job.beforeImage || '',
    afterImage: job.afterImage || job.resultImage || '',
    errorCode: job.errorCode || '',
    errorMessage: job.errorMessage || '',
    saved: Boolean(job.savedAt),
    deletedAt: job.deletedAt || '',
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(extra || {}),
  };
}

async function listMySingleTryOns(event, deps) {
  const runtime = buildRuntime(deps, {});
  const openid = requireOpenId(runtime);
  if (typeof openid !== 'string') return openid;
  const result = await runtime.db.collection('single_tryon_jobs').where({ openid }).get();
  const items = (result.data || [])
    .filter(job => job.status === 'succeeded' && job.savedAt && !job.deletedAt)
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
    .map(job => publicJob(job));
  return ok({ items });
}

async function getLatestTryOnTest(event, deps) {
  const runtime = buildRuntime(deps, {});
  const openid = requireOpenId(runtime);
  if (typeof openid !== 'string') return openid;
  const requested = getEventData(event).testId;
  const query = runtime.db.collection('try_on_tests').where(requested ? { openid, _id:requested } : { openid });
  const result = await (typeof query.orderBy === 'function' ? query.orderBy('createdAt', 'desc').limit(1) : query).get();
  const record = result && result.data && result.data[0];
  if (!record || !record.selfieFileId) return ok({ test: null });
  return ok({ test: { testId: record._id, selfieFileId: record.selfieFileId, createdAt: record.createdAt || '' } });
}

async function uploadSingleSelfie(event, deps) {
  const data = getEventData(event);
  const runtime = buildRuntime(deps, {});
  const openid = requireOpenId(runtime);
  if (typeof openid !== 'string') return openid;
  if (!data.tempFileID) return fail('INVALID_PAYLOAD', 'tempFileID is required');
  const nowDate = runtime.now();
  const testId = data.testId || runtime.id();
  const now = nowDate.toISOString();
  const moved = await runtime.moveFile({
    from: data.tempFileID,
    to: `selfies/${openid}/${testId}/original.jpg`,
  });
  const selfieFileId = moved && moved.fileID;
  if (!selfieFileId) return fail('UPLOAD_FAILED', 'Selfie upload failed');
  const record = {
    _id: testId,
    openid,
    status: 'selfie_uploaded',
    selfieFileId,
    generationStatus: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  await runtime.db.collection('try_on_tests').add({ data: record });
  return ok({ testId, selfieFileId, selfieUploaded: true });
}

async function createSingleTryOn(event, deps) {
  const data = getEventData(event);
  const runtime = buildRuntime(deps, {});
  const openid = requireOpenId(runtime);
  if (typeof openid !== 'string') return openid;
  if (!data.testId || !data.productId || !data.idempotencyKey) {
    return fail('INVALID_PAYLOAD', 'testId, productId and idempotencyKey are required');
  }
  const policy = creditPolicy(runtime.env);
  if (policy.providerNotReady) {
    return fail('CREDIT_PROVIDER_NOT_READY', 'Real credit charging is unavailable until image generation is verified');
  }
  if (policy.enabled && !policy.confirmed) {
    return fail('CREDIT_POLICY_UNCONFIRMED', 'Single try-on credit policy is not confirmed');
  }
  if (policy.enabled && !['mock', 'mock-fail', 'mock-timeout', 'jimeng', 'volcengine'].includes(String((runtime.env || {}).SINGLE_TRYON_PROVIDER || (runtime.env || {}).IMAGE_PROVIDER || 'mock').toLowerCase())) {
    return fail('CREDIT_PROVIDER_NOT_READY', 'Credit mock mode requires a mock image provider');
  }

  const existing = await findIdempotentJob(runtime, openid, String(data.idempotencyKey));
  if (existing) {
    if (policy.enabled && (existing.testId !== data.testId || existing.productId !== data.productId)) {
      return fail('IDEMPOTENCY_KEY_CONFLICT', 'Idempotency key was used for another try-on');
    }
    return ok(publicJob(existing, { idempotent: true }));
  }

  const testResult = await runtime.db.collection('try_on_tests').doc(data.testId).get();
  const testRecord = testResult.data || {};
  if (!testRecord._id || testRecord.openid !== openid) {
    return fail('RESOURCE_NOT_FOUND', 'Test does not belong to current user');
  }
  if (!testRecord.selfieFileId) {
    return fail('SELFIE_REQUIRED', 'A selfie is required before try-on');
  }

  const productResult = await runtime.db.collection('lipsticks').doc(data.productId).get();
  const product = productResult.data || {};
  if (!product._id || product.status !== 'active') {
    return fail('PRODUCT_UNAVAILABLE', 'Product is not active');
  }

  const now = nowIso(runtime);
  const job = {
    _id: runtime.id(),
    openid,
    testId: data.testId,
    productId: data.productId,
    product: {
      _id: product._id,
      brand: product.brand || '',
      productName: product.productName || product.name || '',
      shadeCode: product.shadeCode || '',
      shadeName: product.shadeName || '',
      colorHex: product.colorHex || '',
      texture: product.texture || product.finish || '',
      productImage: product.productImage || product.productImageFileId || product.productImageUrl || '',
    },
    selfieFileId: testRecord.selfieFileId,
    idempotencyKey: String(data.idempotencyKey),
    status: 'queued',
    resultImage: '',
    beforeImage: testRecord.selfieFileId,
    afterImage: '',
    errorCode: '',
    errorMessage: '',
    createdAt: now,
    updatedAt: now,
  };
  if (policy.enabled) {
    const created = await createCreditJob(runtime, job);
    if (created.code) return fail(created.code, created.code);
    return ok(publicJob(created.job, { idempotent: created.idempotent }));
  }
  await runtime.db.collection('single_tryon_jobs').add({ data: job });
  return ok(publicJob(job, { idempotent: false }));
}

async function processSingleTryOn(event, deps, options) {
  const data = getEventData(event);
  const runtime = buildRuntime(deps, {});
  const openid = requireOpenId(runtime);
  if (typeof openid !== 'string') return openid;
  if (!data.jobId) return fail('INVALID_PAYLOAD', 'jobId is required');
  let job = await loadOwnedJob(runtime, data.jobId, openid);
  if (!job || job.deletedAt) return fail('RESOURCE_NOT_FOUND', 'Try-on job does not belong to current user');
  const provider = String((runtime.env || {}).SINGLE_TRYON_PROVIDER || (runtime.env || {}).IMAGE_PROVIDER || 'mock').toLowerCase();
  const realProvider = provider === 'jimeng' || provider === 'volcengine';
  const creditJob = job.creditMode === 'mock';
  if (creditJob) {
    if (String((runtime.env || {}).SINGLE_TRYON_CREDIT_MODE || 'disabled') !== 'mock') {
      return fail('CREDIT_MODE_DISABLED', 'Credit try-on is not enabled');
    }
    if (!['mock', 'mock-fail', 'mock-timeout', 'jimeng', 'volcengine'].includes(String((runtime.env || {}).SINGLE_TRYON_PROVIDER || (runtime.env || {}).IMAGE_PROVIDER || 'mock').toLowerCase())) {
      return fail('CREDIT_PROVIDER_NOT_READY', 'Credit mock mode requires a mock image provider');
    }
    const retry = Boolean(options && options.retry);
    if (retry && !data.idempotencyKey) return fail('INVALID_PAYLOAD', 'Retry idempotencyKey is required');
    const attemptKey = retry ? `retry:${String(data.idempotencyKey)}` : 'initial';
    const started = await startCreditAttempt(runtime, job, attemptKey, retry);
    if (started.code) return fail(started.code, started.code);
    job = started.job;
    if (started.idempotent && job.status !== 'running') {
      if (job.status === 'failed' || job.status === 'timeout') {
        return fail(job.errorCode, job.errorMessage, publicJob(job, { idempotent: true, retryable: true }));
      }
      return ok(publicJob(job, { idempotent: true }));
    }
  } else {
    if (job.status === 'succeeded' || (job.status === 'running' && !realProvider)) return ok(publicJob(job, { idempotent: true }));
    if (!['queued', 'running', 'failed', 'timeout'].includes(job.status)) return fail('INVALID_STATE', 'Try-on job cannot be processed');
    if (realProvider && ['failed','timeout'].includes(job.status) && !(options && options.retry)) {
      return fail(job.errorCode || 'IMAGE_PROVIDER_FAILED', 'Try-on failed', publicJob(job, {retryable:true}));
    }
  }

  const now = nowIso(runtime);
  if (realProvider) {
    // A short lease prevents duplicate submissions from overlapping client polls.
    const claimed = await runtime.db.runTransaction(async transaction => {
      const current = (await transaction.collection('single_tryon_jobs').doc(job._id).get()).data;
      if (!current || current.openid !== openid || current.deletedAt) return {missing:true};
      if (current.status === 'succeeded' || Date.parse(current.providerLeaseUntil || '') > Date.parse(now)) return {busy:true,job:current};
      const restart = options && options.retry && ['failed','timeout'].includes(current.status);
      const resetTask = restart && ['JIMENG_TASK_FAILED','TRYON_TIMEOUT'].includes(current.errorCode);
      const update = {status:'running',errorCode:'',errorMessage:'',updatedAt:now,
        providerLeaseUntil:new Date(Date.parse(now)+30000).toISOString(),
        providerStartedAt:restart ? now : current.providerStartedAt || now,
        providerTask:resetTask ? '' : current.providerTask || '',
      };
      await transaction.collection('single_tryon_jobs').doc(job._id).update({data:update});
      return {job:{...current,...update}};
    });
    if (claimed.missing) return fail('RESOURCE_NOT_FOUND', 'Try-on unavailable');
    if (claimed.busy) return ok(publicJob(claimed.job, {idempotent:true}));
    job = claimed.job;
  } else if (!creditJob) {
    await runtime.db.collection('single_tryon_jobs').doc(job._id).update({ data: { status: 'running', errorCode: '', errorMessage: '', updatedAt: now } });
  }
  if (provider === 'mock-fail' || provider === 'mock-timeout') {
    const status = provider === 'mock-timeout' ? 'timeout' : 'failed';
    const errorCode = provider === 'mock-timeout' ? 'TRYON_TIMEOUT' : 'IMAGE_PROVIDER_FAILED';
    const errorMessage = provider === 'mock-timeout' ? 'Single try-on timed out' : 'Single try-on provider failed';
    if (job.creditCost) {
      const settled = await settleCredits(runtime, job, { status, errorCode, errorMessage, updatedAt: now });
      if (settled.code) return fail(settled.code, settled.code);
    } else {
      await runtime.db.collection('single_tryon_jobs').doc(job._id).update({ data: { status, errorCode, errorMessage, updatedAt: now } });
    }
    await runtime.db.collection('events').add({ data: { type: 'single_tryon_failed', status, openid, jobId: job._id, productId: job.productId, createdAt: now } });
    return fail(errorCode, errorMessage, publicJob({ ...job, status, errorCode, errorMessage, updatedAt: now }, { retryable: true }));
  }

  let resultImage = `cloud://tryon-single/${job._id}/${job.productId}.jpg`;
  if (provider === 'jimeng' || provider === 'volcengine') {
    try {
      if (Date.parse(now) - Date.parse(job.providerStartedAt) > 180000) throw Object.assign(new Error('Try-on timed out'),{code:'TRYON_TIMEOUT'});
      const generated = await createSingleImageProvider({ runtime }).generate({
        jobId: job._id,
        selfieFileId: job.selfieFileId,
        product: job.product,
        providerTask: job.providerTask,
      });
      if (generated.pending) {
        const update = {status:'running',providerTask:generated.providerTask,providerLeaseUntil:'',updatedAt:nowIso(runtime)};
        await runtime.db.collection('single_tryon_jobs').doc(job._id).update({data:update});
        return ok(publicJob({...job,...update}));
      }
      resultImage = generated.resultImage;
    } catch (error) {
      const errorCode = error.code || 'IMAGE_PROVIDER_FAILED';
      const errorMessage = error.message || 'Single try-on provider failed';
      if (job.creditCost) {
        const settled = await settleCredits(runtime, job, { status: 'failed', errorCode, errorMessage, updatedAt: now });
        if (settled.code) return fail(settled.code, settled.code);
      } else {
        await runtime.db.collection('single_tryon_jobs').doc(job._id).update({ data: { status: 'failed', errorCode, errorMessage, providerLeaseUntil:'', updatedAt: now } });
      }
      return fail(errorCode, errorMessage, publicJob({ ...job, status: 'failed', errorCode, errorMessage, updatedAt: now }, { retryable: true }));
    }
  }
  if (job.creditCost) {
    const settled = await settleCredits(runtime, job, { status: 'succeeded', resultImage, afterImage: resultImage, updatedAt: now });
    if (settled.code) return fail(settled.code, settled.code);
  } else {
    await runtime.db.collection('single_tryon_jobs').doc(job._id).update({ data: { status: 'succeeded', resultImage, afterImage: resultImage, updatedAt: now } });
  }
  await runtime.db.collection('events').add({ data: { type: 'single_tryon_succeeded', openid, jobId: job._id, productId: job.productId, resultImage, createdAt: now } });
  return ok(publicJob({ ...job, status: 'succeeded', resultImage, afterImage: resultImage, updatedAt: now }));
}

async function getSingleTryOn(event, deps) {
  const data = getEventData(event);
  const runtime = buildRuntime(deps, {});
  const openid = requireOpenId(runtime);
  if (typeof openid !== 'string') return openid;
  if (!data.jobId) return fail('INVALID_PAYLOAD', 'jobId is required');
  const job = await loadOwnedJob(runtime, data.jobId, openid);
  return job && !job.deletedAt ? ok(publicJob(job)) : fail('RESOURCE_NOT_FOUND', 'Try-on job does not belong to current user');
}

async function deleteSingleTryOn(event, deps) {
  const data = getEventData(event);
  const runtime = buildRuntime(deps, {});
  const openid = requireOpenId(runtime);
  if (typeof openid !== 'string') return openid;
  if (!data.jobId) return fail('INVALID_PAYLOAD', 'jobId is required');
  const job = await loadOwnedJob(runtime, data.jobId, openid);
  if (!job || job.deletedAt) return fail('RESOURCE_NOT_FOUND', 'Try-on job does not belong to current user');
  if (job.status !== 'succeeded' || !job.savedAt) return fail('INVALID_STATE', 'Only saved try-ons can be deleted from history');
  const now = nowIso(runtime);
  try {
    await runtime.db.collection('single_tryon_jobs').doc(job._id).update({ data: { deletedAt: now, updatedAt: now } });
  } catch (error) {
    return fail('DELETE_FAILED', 'Could not delete try-on history');
  }
  return ok({ jobId: job._id, deletedAt: now });
}

async function retrySingleTryOn(event, deps) {
  return processSingleTryOn(event, deps, { retry: true });
}

async function saveSingleTryOn(event, deps) {
  const data = getEventData(event);
  const runtime = buildRuntime(deps, {});
  const openid = requireOpenId(runtime);
  if (typeof openid !== 'string') return openid;
  if (!data.jobId) return fail('INVALID_PAYLOAD', 'jobId is required');
  const job = await loadOwnedJob(runtime, data.jobId, openid);
  if (!job || job.deletedAt) return fail('RESOURCE_NOT_FOUND', 'Try-on job does not belong to current user');
  if (job.status !== 'succeeded') return fail('INVALID_STATE', 'Only succeeded try-ons can be saved');
  const now = nowIso(runtime);
  await runtime.db.collection('single_tryon_jobs').doc(job._id).update({ data: { savedAt: now, updatedAt: now } });
  return ok(publicJob({ ...job, savedAt: now, updatedAt: now }));
}

module.exports = { createSingleTryOn, processSingleTryOn, getSingleTryOn, retrySingleTryOn, saveSingleTryOn, listMySingleTryOns, getLatestTryOnTest, uploadSingleSelfie, deleteSingleTryOn };
