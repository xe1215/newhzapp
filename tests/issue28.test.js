const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function test(name, fn) {
  Promise.resolve().then(fn).then(
    () => console.log(`ok - ${name}`),
    (error) => { console.error(`not ok - ${name}`); console.error(error); process.exitCode = 1; }
  );
}

function createDb(calls, overrides = {}) {
  const jobs = overrides.jobs || {};
  const tests = overrides.tests || {
    'test-1': { _id: 'test-1', openid: 'user-1', selfieFileId: 'cloud://selfies/user-1/test-1/original.jpg' },
  };
  const lipsticks = overrides.lipsticks || {
    'product-1': { _id: 'product-1', status: 'active', brand: 'Brand', shadeCode: 'A01' },
  };
  return {
    collection(name) {
      calls.push(['collection', name]);
      return {
        doc(id) {
          calls.push(['doc', name, id]);
          return {
            async get() {
              calls.push(['doc.get', name, id]);
              if (name === 'try_on_tests') return { data: tests[id] || null };
              if (name === 'lipsticks') return { data: lipsticks[id] || null };
              if (name === 'single_tryon_jobs') return { data: jobs[id] || null };
              return { data: null };
            },
            async update(payload) {
              calls.push(['doc.update', name, id, payload]);
              if (name === 'single_tryon_jobs' && jobs[id]) Object.assign(jobs[id], payload.data || {});
              return { stats: { updated: 1 } };
            },
          };
        },
        where(query) {
          calls.push(['where', name, query]);
          return {
            limit() { return this; },
            async get() {
              calls.push(['where.get', name, query]);
              const found = Object.values(jobs).filter((job) => Object.entries(query).every(([key, value]) => job[key] === value));
              return { data: found };
            },
          };
        },
        async add(payload) {
          calls.push(['add', name, payload]);
          const id = payload.data._id || `${name}-${Object.keys(jobs).length + 1}`;
          if (name === 'single_tryon_jobs') jobs[id] = { ...payload.data, _id: id };
          return { _id: id };
        },
      };
    },
  };
}

test('issue28 exposes single-product client actions after legacy three-image retirement', async () => {
  const service = fs.readFileSync(path.join(root, 'miniprogram/services/test.js'), 'utf8');
  const backend = fs.readFileSync(path.join(root, 'cloudfunctions/test/index.js'), 'utf8');
  assert.match(service, /createSingleTryOn/);
  assert.match(service, /processSingleTryOn/);
  assert.match(service, /saveSingleTryOn/);
  assert.doesNotMatch(backend, /generateTryOnImages/);
  assert.match(backend, /createSingleTryOn/);
});

test('issue28 creates one queued single-product try-on job and is idempotent', async () => {
  const calls = [];
  const service = require('../cloudfunctions/test');
  const deps = { db: createDb(calls), wxContext: { OPENID: 'user-1' }, now: () => new Date('2026-09-26T00:00:00.000Z'), id: () => 'job-1' };

  const first = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'product-1', idempotencyKey: 'idem-1' } }, {}, deps);
  assert.equal(first.code, 0);
  assert.equal(first.data.status, 'queued');
  assert.equal(first.data.productId, 'product-1');
  assert.equal(first.data.resultImage, '');
  assert.equal(first.data.imageCount, 1);

  const second = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'product-1', idempotencyKey: 'idem-1' } }, {}, deps);
  assert.equal(second.code, 0);
  assert.equal(second.data.idempotent, true);
  assert.equal(calls.filter((call) => call[0] === 'add' && call[1] === 'single_tryon_jobs').length, 1);
});

test('issue28 processes one job into one result image and supports retry after failure', async () => {
  const calls = [];
  const service = require('../cloudfunctions/test');
  const deps = { db: createDb(calls), wxContext: { OPENID: 'user-1' }, now: () => new Date('2026-09-26T00:00:00.000Z'), id: () => 'job-2' };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'product-1', idempotencyKey: 'idem-2' } }, {}, deps);
  const succeeded = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(succeeded.code, 0);
  assert.equal(succeeded.data.status, 'succeeded');
  assert.equal(succeeded.data.imageCount, 1);
  assert.match(succeeded.data.resultImage, /tryon-single\/job-2\/product-1\.jpg$/);
  assert.equal(succeeded.data.beforeImage, 'cloud://selfies/user-1/test-1/original.jpg');
  assert.equal(succeeded.data.afterImage, succeeded.data.resultImage);

  const failCalls = [];
  const failDeps = { db: createDb(failCalls), wxContext: { OPENID: 'user-1' }, env: { SINGLE_TRYON_PROVIDER: 'mock-fail' }, now: deps.now, id: () => 'job-fail' };
  const failedJob = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'product-1', idempotencyKey: 'idem-fail' } }, {}, failDeps);
  const failed = await service.main({ action: 'processSingleTryOn', data: { jobId: failedJob.data.jobId } }, {}, failDeps);
  assert.equal(failed.code, 'IMAGE_PROVIDER_FAILED');
  assert.equal(failed.data.status, 'failed');
  const retry = await service.main({ action: 'retrySingleTryOn', data: { jobId: failedJob.data.jobId } }, {}, { ...failDeps, env: { SINGLE_TRYON_PROVIDER: 'mock' } });
  assert.equal(retry.code, 0);
  assert.equal(retry.data.status, 'succeeded');
});

test('issue28 rejects inactive or foreign resources, times out explicitly, and saves only succeeded results', async () => {
  const service = require('../cloudfunctions/test');
  const inactiveCalls = [];
  const inactive = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'inactive', idempotencyKey: 'idem-inactive' } }, {}, {
    db: createDb(inactiveCalls, { lipsticks: { inactive: { _id: 'inactive', status: 'inactive' } } }),
    wxContext: { OPENID: 'user-1' }, now: () => new Date('2026-09-26T00:00:00.000Z'), id: () => 'job-inactive',
  });
  assert.equal(inactive.code, 'PRODUCT_UNAVAILABLE');

  const foreign = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'product-1', idempotencyKey: 'idem-foreign' } }, {}, {
    db: createDb([], { tests: { 'test-1': { _id: 'test-1', openid: 'other-user', selfieFileId: 'cloud://other/selfie.jpg' } } }),
    wxContext: { OPENID: 'user-1' }, now: () => new Date('2026-09-26T00:00:00.000Z'), id: () => 'job-foreign',
  });
  assert.equal(foreign.code, 'RESOURCE_NOT_FOUND');

  const timeoutCalls = [];
  const timeoutDeps = { db: createDb(timeoutCalls), wxContext: { OPENID: 'user-1' }, env: { SINGLE_TRYON_PROVIDER: 'mock-timeout' }, now: () => new Date('2026-09-26T00:00:00.000Z'), id: () => 'job-timeout' };
  const queued = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'product-1', idempotencyKey: 'idem-timeout' } }, {}, timeoutDeps);
  const timeout = await service.main({ action: 'processSingleTryOn', data: { jobId: queued.data.jobId } }, {}, timeoutDeps);
  assert.equal(timeout.code, 'TRYON_TIMEOUT');
  assert.equal(timeout.data.status, 'timeout');
  const notSaved = await service.main({ action: 'saveSingleTryOn', data: { jobId: queued.data.jobId } }, {}, timeoutDeps);
  assert.equal(notSaved.code, 'INVALID_STATE');

  const savedCalls = [];
  const savedDeps = { db: createDb(savedCalls), wxContext: { OPENID: 'user-1' }, now: () => new Date('2026-09-26T00:00:00.000Z'), id: () => 'job-save' };
  const savedJob = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'product-1', idempotencyKey: 'idem-save' } }, {}, savedDeps);
  await service.main({ action: 'processSingleTryOn', data: { jobId: savedJob.data.jobId } }, {}, savedDeps);
  const saved = await service.main({ action: 'saveSingleTryOn', data: { jobId: savedJob.data.jobId } }, {}, savedDeps);
  assert.equal(saved.code, 0);
  assert.equal(saved.data.saved, true);
});
