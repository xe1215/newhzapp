const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'wx-server-sdk') return {
    DYNAMIC_CURRENT_ENV: 'test', init() {},
    database() { throw new Error('Inject database'); },
    getWXContext() { throw new Error('Inject context'); },
  };
  return originalLoad.call(this, request, parent, isMain);
};
const service = require('../cloudfunctions/test');
Module._load = originalLoad;

function test(name, fn) {
  Promise.resolve().then(fn).then(() => console.log(`ok - ${name}`), error => { console.error(`not ok - ${name}`); console.error(error); process.exitCode = 1; });
}

function fixture(env) {
  const data = {
    try_on_tests: { 'test-1': { _id: 'test-1', openid: 'user-1', selfieFileId: 'cloud://selfie' } },
    lipsticks: { 'lip-1': { _id: 'lip-1', status: 'active', brand: 'Brand', shadeCode: 'A01' } },
    single_tryon_jobs: {}, credit_accounts: {}, credit_ledger: {}, events: {},
  };
  const calls = [];
  function dbView(store) {
    return { collection(name) { return {
      doc(id) { return {
        async get() { return { data: store[name][id] || null }; },
        async update({ data: update }) { calls.push(['update', name, id]); store[name][id] = { ...store[name][id], ...update }; return { stats: { updated: 1 } }; },
        async set({ data: value }) { calls.push(['set', name, id]); store[name][id] = { ...value, _id: id }; return { stats: { updated: 1 } }; },
      }; },
      where(filter) { return { limit() { return this; }, async get() { return { data: Object.values(store[name]).filter(item => Object.entries(filter).every(([key, value]) => item[key] === value)) }; } }; },
      async add({ data: value }) { calls.push(['add', name, value._id]); const id = value._id || `${name}-${Object.keys(store[name]).length + 1}`; store[name][id] = { ...value, _id: id }; return { _id: id }; },
    }; },
      async runTransaction(fn) {
        const staged = JSON.parse(JSON.stringify(store));
        const result = await fn(dbView(staged));
        Object.keys(store).forEach(name => { store[name] = staged[name]; });
        return result;
      },
    };
  }
  const deps = { db: dbView(data), wxContext: { OPENID: 'user-1' }, env: env || {}, now: () => new Date('2026-09-26T00:00:00.000Z'), id: () => 'job-1' };
  return { data, calls, deps };
}

test('confirmed fixed policy does not require an environment-supplied price or daily quota', async () => {
  const { data, deps } = fixture({ SINGLE_TRYON_CREDIT_MODE: 'mock' });
  const result = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'request-1', balance: 999 } }, {}, deps);
  assert.equal(result.code, 0);
  assert.equal(Object.keys(data.single_tryon_jobs).length, 1);
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('creating a single try-on without starting generation does not spend credits or occupy the concurrency slot', async () => {
  const { data, deps } = fixture({ SINGLE_TRYON_CREDIT_MODE: 'mock' });
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 3, activeCount: 0 };
  const result = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'create-only' } }, {}, deps);
  assert.equal(result.code, 0);
  assert.equal(result.data.status, 'queued');
  assert.equal(data.credit_accounts['user-1'].balance, 3);
  assert.equal(data.credit_accounts['user-1'].activeCount, 0);
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('a queued credit job does not charge after the credit feature is disabled', async () => {
  const { data, deps } = fixture({ SINGLE_TRYON_CREDIT_MODE: 'mock' });
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 3, activeCount: 0 };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'feature-off' } }, {}, deps);
  deps.env.SINGLE_TRYON_CREDIT_MODE = 'disabled';
  const result = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(result.code, 'CREDIT_MODE_DISABLED');
  assert.equal(data.credit_accounts['user-1'].balance, 3);
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('a queued credit job refuses an unavailable provider before charging', async () => {
  const { data, deps } = fixture({ SINGLE_TRYON_CREDIT_MODE: 'mock' });
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 3, activeCount: 0 };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'provider-changed' } }, {}, deps);
  deps.env.SINGLE_TRYON_PROVIDER = 'jimeng';
  const result = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(result.code, 'CREDIT_PROVIDER_NOT_READY');
  assert.equal(data.credit_accounts['user-1'].balance, 3);
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('starting generation charges exactly one credit and duplicate requests do not charge again', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 5, activeCount: 0, dayKey: '2026-09-26', dailyUses: 0 };
  const request = { action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'request-1', balance: 999 } };
  const first = await service.main(request, {}, deps);
  assert.equal(first.code, 0);
  assert.equal(first.data.status, 'queued');
  assert.equal(data.credit_accounts['user-1'].balance, 5);
  const second = await service.main(request, {}, deps);
  assert.equal(second.code, 0);
  assert.equal(second.data.idempotent, true);
  const started = await service.main({ action: 'processSingleTryOn', data: { jobId: first.data.jobId } }, {}, deps);
  assert.equal(started.code, 0);
  assert.equal(data.credit_accounts['user-1'].balance, 4);
  assert.equal(Object.keys(data.credit_ledger).length, 1);
  const repeated = await service.main({ action: 'processSingleTryOn', data: { jobId: first.data.jobId } }, {}, deps);
  assert.equal(repeated.data.idempotent, true);
  assert.equal(data.credit_accounts['user-1'].balance, 4);
  assert.equal(Object.keys(data.credit_ledger).length, 1);
});

test('real credit mode refuses to charge while the single-try-on provider is still a placeholder', async () => {
  const { data, deps } = fixture({ SINGLE_TRYON_CREDIT_MODE: 'enforced', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true' });
  const result = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'live-1' } }, {}, deps);
  assert.equal(result.code, 'CREDIT_PROVIDER_NOT_READY');
  assert.equal(Object.keys(data.credit_ledger).length, 0);
  assert.equal(Object.keys(data.single_tryon_jobs).length, 0);
});

test('failure refunds one credit and a manual retry charges one credit again', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true', SINGLE_TRYON_PROVIDER: 'mock-fail' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 5, activeCount: 0, dayKey: '2026-09-26', dailyUses: 0 };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'failed-1' } }, {}, deps);
  const result = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(result.code, 'IMAGE_PROVIDER_FAILED');
  assert.equal(data.credit_accounts['user-1'].balance, 5);
  assert.equal(data.credit_accounts['user-1'].activeCount, 0);
  assert.equal(Object.keys(data.credit_ledger).length, 2);
  const retry = await service.main({ action: 'retrySingleTryOn', data: { jobId: created.data.jobId, idempotencyKey: 'retry-1' } }, {}, deps);
  assert.equal(retry.code, 'IMAGE_PROVIDER_FAILED');
  assert.equal(data.credit_accounts['user-1'].balance, 5);
  assert.equal(Object.keys(data.credit_ledger).length, 4);
  const retryEntries = Object.values(data.credit_ledger).filter(entry => entry.attempt === 2);
  assert.deepEqual(retryEntries.map(entry => entry.amount).sort((a, b) => a - b), [-1, 1]);
  assert.ok(retryEntries.every(entry => entry.idempotencyKey === 'retry:retry-1'));
  const duplicate = await service.main({ action: 'retrySingleTryOn', data: { jobId: created.data.jobId, idempotencyKey: 'retry-1' } }, {}, deps);
  assert.equal(duplicate.code, 'IMAGE_PROVIDER_FAILED');
  assert.equal(Object.keys(data.credit_ledger).length, 4);
});

test('reusing an older retry key after a newer retry cannot charge a third time', async () => {
  const { data, deps } = fixture({ SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_PROVIDER: 'mock-fail' });
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 2, activeCount: 0 };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'repeat-old-key' } }, {}, deps);
  await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  await service.main({ action: 'retrySingleTryOn', data: { jobId: created.data.jobId, idempotencyKey: 'retry-a' } }, {}, deps);
  await service.main({ action: 'retrySingleTryOn', data: { jobId: created.data.jobId, idempotencyKey: 'retry-b' } }, {}, deps);
  const ledgerCount = Object.keys(data.credit_ledger).length;
  const result = await service.main({ action: 'retrySingleTryOn', data: { jobId: created.data.jobId, idempotencyKey: 'retry-a' } }, {}, deps);
  assert.equal(result.code, 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(data.credit_accounts['user-1'].balance, 2);
  assert.equal(Object.keys(data.credit_ledger).length, ledgerCount);
});

test('a stale environment flag cannot disable the confirmed failure refund rule', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'false', SINGLE_TRYON_PROVIDER: 'mock-fail' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 5, activeCount: 0 };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'no-refund' } }, {}, deps);
  const result = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(result.code, 'IMAGE_PROVIDER_FAILED');
  assert.equal(data.credit_accounts['user-1'].balance, 5);
  assert.equal(data.credit_accounts['user-1'].activeCount, 0);
  assert.equal(Object.keys(data.credit_ledger).length, 2);
});

test('a reserved job keeps its refund rule even if configuration changes before processing', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true', SINGLE_TRYON_PROVIDER: 'mock-timeout' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 5, activeCount: 0 };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'policy-snapshot' } }, {}, deps);
  deps.env.SINGLE_TRYON_REFUND_ON_FAILURE = 'false';
  const result = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(result.code, 'TRYON_TIMEOUT');
  assert.equal(data.credit_accounts['user-1'].balance, 5);
  assert.equal(data.credit_accounts['user-1'].activeCount, 0);
  assert.equal(Object.keys(data.credit_ledger).length, 2);
});

test('insufficient balance returns a clear error without creating a debit', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 0, activeCount: 0 };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'poor', balance: 999 } }, {}, deps);
  const result = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId, balance: 999 } }, {}, deps);
  assert.equal(result.code, 'INSUFFICIENT_CREDITS');
  assert.equal(data.credit_accounts['user-1'].balance, 0);
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('an active try-on blocks another debit with a concurrency error', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 5, activeCount: 1 };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'concurrent' } }, {}, deps);
  const result = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(result.code, 'TRYON_CONCURRENT_LIMIT');
  assert.equal(data.credit_accounts['user-1'].balance, 5);
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('past daily usage never blocks a new try-on while the user has credits', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 5, activeCount: 0, dayKey: '2026-09-26', dailyUses: 3 };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'daily' } }, {}, deps);
  const result = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(result.code, 0);
  assert.equal(data.credit_accounts['user-1'].balance, 4);
  assert.equal(Object.keys(data.credit_ledger).length, 1);
});

test('a successful mock try-on spends one credit and releases its concurrency slot', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 5, activeCount: 0 };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'success' } }, {}, deps);
  const result = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(result.code, 0);
  assert.equal(result.data.status, 'succeeded');
  assert.equal(data.credit_accounts['user-1'].balance, 4);
  assert.equal(data.credit_accounts['user-1'].activeCount, 0);
  assert.equal(Object.keys(data.credit_ledger).length, 1);
});

test('credit mock mode refuses an unrecognized image provider before charging', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true', SINGLE_TRYON_PROVIDER: 'jimeng' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 5, activeCount: 0 };
  const result = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'unknown-provider' } }, {}, deps);
  assert.equal(result.code, 'CREDIT_PROVIDER_NOT_READY');
  assert.equal(data.credit_accounts['user-1'].balance, 5);
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('a caller cannot set its balance through a public action or access another user job', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 5, activeCount: 0 };
  const mutation = await service.main({ action: 'setCreditBalance', data: { openid: 'user-1', balance: 999 } }, {}, deps);
  assert.notEqual(mutation.code, 0);
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'owned', openid: 'user-2', balance: 999 } }, {}, deps);
  deps.wxContext.OPENID = 'user-2';
  const stolen = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(stolen.code, 'RESOURCE_NOT_FOUND');
  assert.equal(data.credit_accounts['user-1'].balance, 5);
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('a failed database transaction returns an error instead of acknowledging a debit', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 5, activeCount: 0 };
  deps.db.runTransaction = async () => { throw new Error('database unavailable'); };
  const result = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'transaction-failed' } }, {}, deps);
  assert.equal(result.code, 'CREDIT_TRANSACTION_FAILED');
  assert.equal(data.credit_accounts['user-1'].balance, 5);
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('a failed settlement can resume the same charged attempt without a second debit', async () => {
  const env = { SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_COST_CREDITS: '2', SINGLE_TRYON_DAILY_LIMIT: '3', SINGLE_TRYON_REFUND_ON_FAILURE: 'true', SINGLE_TRYON_PROVIDER: 'mock-timeout' };
  const { data, deps } = fixture(env);
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 5, activeCount: 0 };
  const created = await service.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'settlement-failed' } }, {}, deps);
  const transaction = deps.db.runTransaction;
  let transactionCalls = 0;
  deps.db.runTransaction = async fn => {
    transactionCalls += 1;
    if (transactionCalls === 2) throw new Error('temporary outage');
    return transaction(fn);
  };
  const failed = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(failed.code, 'CREDIT_TRANSACTION_FAILED');
  assert.equal(data.single_tryon_jobs[created.data.jobId].status, 'running');
  assert.equal(data.credit_accounts['user-1'].balance, 4);
  deps.db.runTransaction = transaction;
  const retried = await service.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
  assert.equal(retried.code, 'TRYON_TIMEOUT');
  assert.equal(data.credit_accounts['user-1'].balance, 5);
  assert.equal(Object.keys(data.credit_ledger).length, 2);
});
