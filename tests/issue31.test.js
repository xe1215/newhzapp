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
const payment = require('../cloudfunctions/payment');
const tryon = require('../cloudfunctions/test');
Module._load = originalLoad;

function test(name, fn) {
  Promise.resolve().then(fn).then(() => console.log(`ok - ${name}`), error => {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  });
}

function fixture(env) {
  const data = {
    credit_products: {}, credit_orders: {}, credit_accounts: {}, credit_ledger: {},
    try_on_tests: { 'test-1': { _id: 'test-1', openid: 'user-1', selfieFileId: 'cloud://selfie' } },
    lipsticks: { 'lip-1': { _id: 'lip-1', status: 'active', brand: 'Brand', shadeCode: 'A01' } },
    single_tryon_jobs: {}, events: {},
  };
  const calls = [];
  function view(store) {
    return {
      collection(name) {
        if (!store[name]) throw new Error(`Unexpected collection: ${name}`);
        return {
          doc(id) { return {
            async get() { return { data: store[name][id] || null }; },
            async set({ data: value }) { calls.push(['set', name, id]); store[name][id] = { ...value, _id: id }; },
            async update({ data: value }) { calls.push(['update', name, id]); store[name][id] = { ...store[name][id], ...value }; },
          }; },
          where(filter) { return { limit() { return this; }, async get() { return { data: Object.values(store[name]).filter(item => Object.entries(filter).every(([key, value]) => item[key] === value)) }; } }; },
          async add({ data: value }) { const id = value._id || `${name}-${Object.keys(store[name]).length + 1}`; store[name][id] = { ...value, _id: id }; return { _id: id }; },
        };
      },
      async runTransaction(fn) {
        const staged = JSON.parse(JSON.stringify(store));
        const result = await fn(view(staged));
        Object.keys(store).forEach(name => { store[name] = staged[name]; });
        return result;
      },
    };
  }
  const deps = { db: view(data), env: env || {}, wxContext: { OPENID: 'user-1' }, now: () => new Date('2026-09-26T00:00:00.000Z'), id: () => 'order-1' };
  return { data, calls, deps };
}

test('unconfirmed packages show coming soon and legacy report payment actions are disabled', async () => {
  const { data, deps } = fixture();
  const products = await payment.main({ action: 'listCreditProducts' }, {}, deps);
  assert.equal(products.code, 0);
  assert.equal(products.data.status, 'coming_soon');
  assert.deepEqual(products.data.items, []);
  for (const action of ['createReportOrder', 'confirmPayment', 'requestRefund']) {
    const legacy = await payment.main({ action, data: { testId: 'test-1', orderId: 'old-1' } }, {}, deps);
    assert.equal(legacy.code, 'INVALID_ACTION');
  }
  assert.equal(Object.keys(data.credit_orders).length, 0);
  assert.equal(payment.createReportOrder, undefined);
  assert.equal(payment.confirmPayment, undefined);
  assert.equal(payment.requestRefund, undefined);
});

test('unconfirmed packages cannot create a real or mock order', async () => {
  const { data, deps } = fixture();
  const result = await payment.main({ action: 'createCreditOrder', data: { productId: 'pack-1', amountCents: 1, credits: 999, idempotencyKey: 'request-1' } }, {}, deps);
  assert.equal(result.code, 'CREDIT_PRODUCTS_UNCONFIRMED');
  assert.equal(Object.keys(data.credit_orders).length, 0);
  assert.equal(Object.keys(data.credit_accounts).length, 0);
});

test('explicit development mock mode lists only valid mock credit products', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  data.credit_products['pack-1'] = { _id: 'pack-1', status: 'active', mode: 'mock', amountCents: 100, credits: 1, bonusCredits: 0, currency: 'CNY' };
  data.credit_products['pack-2'] = { _id: 'pack-2', status: 'inactive', mode: 'mock', amountCents: 100, credits: 1, bonusCredits: 0, currency: 'CNY' };
  data.credit_products['pack-3'] = { _id: 'pack-3', status: 'active', mode: 'live', amountCents: 100, credits: 1, bonusCredits: 0, currency: 'CNY' };
  const result = await payment.main({ action: 'listCreditProducts' }, {}, deps);
  assert.equal(result.code, 0);
  assert.equal(result.data.status, 'mock');
  assert.deepEqual(result.data.items.map(item => item.productId), ['pack-1']);
});

test('confirmed packages expose only the four fixed prices with no bonus or expiry', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  for (const [credits, amountCents] of [[1, 100], [20, 1600], [40, 2800], [60, 3600]]) {
    data.credit_products[`pack-${credits}`] = { _id: `pack-${credits}`, status: 'active', mode: 'mock', currency: 'CNY', credits, amountCents, bonusCredits: 0 };
  }
  data.credit_products['wrong-price'] = { _id: 'wrong-price', status: 'active', mode: 'mock', currency: 'CNY', credits: 20, amountCents: 2000, bonusCredits: 0 };
  data.credit_products['wrong-bonus'] = { _id: 'wrong-bonus', status: 'active', mode: 'mock', currency: 'CNY', credits: 1, amountCents: 100, bonusCredits: 1 };
  const listed = await payment.main({ action: 'listCreditProducts' }, {}, deps);
  assert.equal(listed.code, 0);
  assert.deepEqual(listed.data.items.map(item => [item.credits, item.amountCents, item.bonusCredits]), [[1, 100, 0], [20, 1600, 0], [40, 2800, 0], [60, 3600, 0]]);
  const rejected = await payment.main({ action: 'createCreditOrder', data: { productId: 'wrong-price', idempotencyKey: 'invalid' } }, {}, deps);
  assert.equal(rejected.code, 'CREDIT_PRODUCT_UNAVAILABLE');
});

test('mock products with unsafe total credits cannot be ordered', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  data.credit_products['overflow'] = { _id: 'overflow', status: 'active', mode: 'mock', amountCents: 100, credits: Number.MAX_SAFE_INTEGER, bonusCredits: 1, currency: 'CNY' };
  const result = await payment.main({ action: 'createCreditOrder', data: { productId: 'overflow', idempotencyKey: 'unsafe' } }, {}, deps);
  assert.equal(result.code, 'CREDIT_PRODUCT_UNAVAILABLE');
  assert.equal(Object.keys(data.credit_orders).length, 0);
});

test('a mock credit order snapshots server product values and duplicate creation is idempotent', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  data.credit_products['pack-1'] = { _id: 'pack-1', status: 'active', mode: 'mock', amountCents: 100, credits: 1, bonusCredits: 0, currency: 'CNY' };
  const request = { action: 'createCreditOrder', data: { productId: 'pack-1', idempotencyKey: 'buy-1', amountCents: 1, credits: 999 } };
  const first = await payment.main(request, {}, deps);
  assert.equal(first.code, 0);
  assert.equal(first.data.amountCents, 100);
  assert.equal(first.data.credits, 1);
  assert.equal(first.data.paymentStatus, 'pending');
  assert.equal(Object.keys(data.credit_orders).length, 1);
  assert.equal(Object.keys(data.credit_ledger).length, 0);
  const second = await payment.main(request, {}, deps);
  assert.equal(second.code, 0);
  assert.equal(second.data.idempotent, true);
  assert.equal(second.data.orderId, first.data.orderId);
  assert.equal(Object.keys(data.credit_orders).length, 1);
});

test('a client payment-success claim cannot mark an order paid or mint credits', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  data.credit_products['pack-1'] = { _id: 'pack-1', status: 'active', mode: 'mock', amountCents: 100, credits: 1, bonusCredits: 0, currency: 'CNY' };
  const created = await payment.main({ action: 'createCreditOrder', data: { productId: 'pack-1', idempotencyKey: 'buy-claim' } }, {}, deps);
  const claim = await payment.main({ action: 'confirmCreditOrder', data: {
    orderId: created.data.orderId, paymentStatus: 'paid', transactionId: 'fake', amountCents: 100,
  } }, {}, deps);
  assert.equal(claim.code, 'PAYMENT_CONFIRMATION_UNTRUSTED');
  assert.equal(data.credit_orders[created.data.orderId].status, 'pending');
  assert.equal(Object.keys(data.credit_accounts).length, 0);
  assert.equal(Object.keys(data.credit_ledger).length, 0);
  const directCallback = await payment.main({ action: 'settleVerifiedCreditOrder', data: {
    outTradeNo: created.data.outTradeNo, transactionId: 'fake', amountCents: 100,
  } }, {}, deps);
  assert.equal(directCallback.code, 'INVALID_ACTION');
});

test('the settlement helper rejects a callback without server-side verification', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  const result = await payment.settleVerifiedCreditOrder({
    outTradeNo: 'hz-fake', transactionId: 'fake', amountCents: 100, currency: 'CNY', tradeState: 'SUCCESS',
  }, deps);
  assert.equal(result.code, 'PAYMENT_CALLBACK_UNVERIFIED');
  assert.equal(Object.keys(data.credit_accounts).length, 0);
});

test('malformed verified callback fields fail closed without throwing or writing', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  deps.verifiedCallback = true;
  const result = await payment.settleVerifiedCreditOrder({
    outTradeNo: 'hz-fake', transactionId: { value: 'bad' }, amountCents: 100,
    currency: 'CNY', payerOpenid: 'user-1', tradeState: 'SUCCESS',
  }, deps);
  assert.equal(result.code, 'PAYMENT_NOTICE_INVALID');
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('a verified matching mock payment credits the account exactly once', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  data.credit_products['pack-1'] = { _id: 'pack-1', status: 'active', mode: 'mock', amountCents: 100, credits: 1, bonusCredits: 0, currency: 'CNY' };
  data.credit_accounts['user-1'] = { _id: 'user-1', openid: 'user-1', balance: 2, activeCount: 0 };
  const created = await payment.main({ action: 'createCreditOrder', data: { productId: 'pack-1', idempotencyKey: 'buy-paid' } }, {}, deps);
  deps.verifiedCallback = true;
  const notice = { outTradeNo: created.data.outTradeNo, transactionId: 'wx-transaction-1', amountCents: 100, currency: 'CNY', payerOpenid: 'user-1', tradeState: 'SUCCESS' };
  const first = await payment.settleVerifiedCreditOrder(notice, deps);
  assert.equal(first.code, 0);
  assert.equal(first.data.paymentStatus, 'paid');
  assert.equal(data.credit_accounts['user-1'].balance, 3);
  assert.equal(Object.keys(data.credit_ledger).length, 1);
  const second = await payment.settleVerifiedCreditOrder(notice, deps);
  assert.equal(second.code, 0);
  assert.equal(second.data.idempotent, true);
  assert.equal(data.credit_accounts['user-1'].balance, 3);
  assert.equal(Object.keys(data.credit_ledger).length, 1);
});

test('a paid package keeps a permanent refundable balance and its purchase-time unit price', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  data.credit_products['pack-20'] = { _id: 'pack-20', status: 'active', mode: 'mock', amountCents: 1600, credits: 20, bonusCredits: 0, currency: 'CNY' };
  const created = await payment.main({ action: 'createCreditOrder', data: { productId: 'pack-20', idempotencyKey: 'buy-20' } }, {}, deps);
  deps.verifiedCallback = true;
  const paid = await payment.settleVerifiedCreditOrder({ outTradeNo: created.data.outTradeNo, transactionId: 'wx-pack-20', amountCents: 1600, currency: 'CNY', payerOpenid: 'user-1', tradeState: 'SUCCESS' }, deps);
  assert.equal(paid.code, 0);
  const order = data.credit_orders[created.data.orderId];
  assert.equal(order.remainingCredits, 20);
  assert.equal(order.unitPriceCents, 80);
  assert.equal(order.expiresAt, null);
});

test('single try-ons consume the earliest paid order before a later purchase', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock', SINGLE_TRYON_CREDIT_MODE: 'mock' });
  for (const [credits, amountCents] of [[1, 100], [20, 1600]]) {
    data.credit_products[`pack-${credits}`] = { _id: `pack-${credits}`, status: 'active', mode: 'mock', currency: 'CNY', credits, amountCents, bonusCredits: 0 };
  }
  deps.verifiedCallback = true;
  const orderIds = [];
  for (const [credits, amountCents] of [[1, 100], [20, 1600]]) {
    const created = await payment.main({ action: 'createCreditOrder', data: { productId: `pack-${credits}`, idempotencyKey: `buy-${credits}` } }, {}, deps);
    const paid = await payment.settleVerifiedCreditOrder({ outTradeNo: created.data.outTradeNo, transactionId: `wx-${credits}`, amountCents, currency: 'CNY', payerOpenid: 'user-1', tradeState: 'SUCCESS' }, deps);
    assert.equal(paid.code, 0);
    orderIds.push(created.data.orderId);
  }
  for (const key of ['tryon-a', 'tryon-b']) {
    const created = await tryon.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: key } }, {}, deps);
    assert.equal(created.code, 0);
    const finished = await tryon.main({ action: 'processSingleTryOn', data: { jobId: created.data.jobId } }, {}, deps);
    assert.equal(finished.code, 0);
  }
  assert.equal(data.credit_orders[orderIds[0]].remainingCredits, 0);
  assert.equal(data.credit_orders[orderIds[1]].remainingCredits, 19);
  assert.equal(data.credit_accounts['user-1'].balance, 19);
});

test('a failed try-on restores its credit to the same purchase order', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock', SINGLE_TRYON_CREDIT_MODE: 'mock', SINGLE_TRYON_PROVIDER: 'mock-fail' });
  data.credit_products['pack-1'] = { _id: 'pack-1', status: 'active', mode: 'mock', amountCents: 100, credits: 1, bonusCredits: 0, currency: 'CNY' };
  const created = await payment.main({ action: 'createCreditOrder', data: { productId: 'pack-1', idempotencyKey: 'buy-failed' } }, {}, deps);
  deps.verifiedCallback = true;
  await payment.settleVerifiedCreditOrder({ outTradeNo: created.data.outTradeNo, transactionId: 'wx-failed', amountCents: 100, currency: 'CNY', payerOpenid: 'user-1', tradeState: 'SUCCESS' }, deps);
  const job = await tryon.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'fail' } }, {}, deps);
  const failed = await tryon.main({ action: 'processSingleTryOn', data: { jobId: job.data.jobId } }, {}, deps);
  assert.equal(failed.code, 'IMAGE_PROVIDER_FAILED');
  assert.equal(data.credit_orders[created.data.orderId].remainingCredits, 1);
  assert.equal(data.credit_accounts['user-1'].balance, 1);
});

test('refund quote uses only unused credits of the selected order at its purchase price', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock', SINGLE_TRYON_CREDIT_MODE: 'mock' });
  data.credit_products['pack-20'] = { _id: 'pack-20', status: 'active', mode: 'mock', amountCents: 1600, credits: 20, bonusCredits: 0, currency: 'CNY' };
  const created = await payment.main({ action: 'createCreditOrder', data: { productId: 'pack-20', idempotencyKey: 'buy-quote' } }, {}, deps);
  deps.verifiedCallback = true;
  await payment.settleVerifiedCreditOrder({ outTradeNo: created.data.outTradeNo, transactionId: 'wx-quote', amountCents: 1600, currency: 'CNY', payerOpenid: 'user-1', tradeState: 'SUCCESS' }, deps);
  const job = await tryon.main({ action: 'createSingleTryOn', data: { testId: 'test-1', productId: 'lip-1', idempotencyKey: 'quote-tryon' } }, {}, deps);
  await tryon.main({ action: 'processSingleTryOn', data: { jobId: job.data.jobId } }, {}, deps);
  const quote = await payment.main({ action: 'getCreditRefundQuote', data: { orderId: created.data.orderId } }, {}, deps);
  assert.equal(quote.code, 0);
  assert.equal(quote.data.refundableCredits, 19);
  assert.equal(quote.data.refundAmountCents, 1520);
  assert.equal(quote.data.unitPriceCents, 80);
  assert.equal(quote.data.currency, 'CNY');
  assert.equal(data.credit_accounts['user-1'].balance, 19);
  deps.wxContext.OPENID = 'user-2';
  const forbidden = await payment.main({ action: 'getCreditRefundQuote', data: { orderId: created.data.orderId } }, {}, deps);
  assert.equal(forbidden.code, 'RESOURCE_NOT_FOUND');
});

test('a verified callback with a mismatched amount or payer cannot grant credits', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  data.credit_products['pack-1'] = { _id: 'pack-1', status: 'active', mode: 'mock', amountCents: 100, credits: 1, bonusCredits: 0, currency: 'CNY' };
  const created = await payment.main({ action: 'createCreditOrder', data: { productId: 'pack-1', idempotencyKey: 'buy-mismatch' } }, {}, deps);
  deps.verifiedCallback = true;
  const notice = { outTradeNo: created.data.outTradeNo, transactionId: 'wx-mismatch', amountCents: 1, currency: 'CNY', payerOpenid: 'user-1', tradeState: 'SUCCESS' };
  const wrongAmount = await payment.settleVerifiedCreditOrder(notice, deps);
  assert.equal(wrongAmount.code, 'PAYMENT_NOTICE_MISMATCH');
  const wrongPayer = await payment.settleVerifiedCreditOrder({ ...notice, amountCents: 100, payerOpenid: 'user-2' }, deps);
  assert.equal(wrongPayer.code, 'PAYMENT_NOTICE_MISMATCH');
  assert.equal(data.credit_orders[created.data.orderId].status, 'pending');
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('an old order with an unconfirmed package cannot be settled after the fixed policy takes effect', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  data.credit_orders['legacy-order'] = { _id: 'legacy-order', openid: 'user-1', productId: 'legacy',
    amountCents: 100, currency: 'CNY', credits: 2, bonusCredits: 1,
    status: 'pending', mode: 'mock', outTradeNo: 'hz-legacy', paymentTransactionId: '' };
  deps.verifiedCallback = true;
  const result = await payment.settleVerifiedCreditOrder({ outTradeNo: 'hz-legacy', transactionId: 'wx-legacy', amountCents: 100, currency: 'CNY', payerOpenid: 'user-1', tradeState: 'SUCCESS' }, deps);
  assert.equal(result.code, 'CREDIT_ORDER_INVALID');
  assert.equal(Object.keys(data.credit_accounts).length, 0);
});

test('a duplicate paid callback still checks the immutable order amount and payer', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  data.credit_products['pack-1'] = { _id: 'pack-1', status: 'active', mode: 'mock', amountCents: 100, credits: 1, bonusCredits: 0, currency: 'CNY' };
  const created = await payment.main({ action: 'createCreditOrder', data: { productId: 'pack-1', idempotencyKey: 'paid-validate' } }, {}, deps);
  deps.verifiedCallback = true;
  const notice = { outTradeNo: created.data.outTradeNo, transactionId: 'wx-validate', amountCents: 100, currency: 'CNY', payerOpenid: 'user-1', tradeState: 'SUCCESS' };
  await payment.settleVerifiedCreditOrder(notice, deps);
  const altered = await payment.settleVerifiedCreditOrder({ ...notice, amountCents: 1 }, deps);
  assert.equal(altered.code, 'PAYMENT_NOTICE_MISMATCH');
  assert.equal(data.credit_accounts['user-1'].balance, 1);
});

test('the same verified transaction cannot fund two different orders', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  data.credit_products['pack-1'] = { _id: 'pack-1', status: 'active', mode: 'mock', amountCents: 100, credits: 1, bonusCredits: 0, currency: 'CNY' };
  const first = await payment.main({ action: 'createCreditOrder', data: { productId: 'pack-1', idempotencyKey: 'buy-a' } }, {}, deps);
  const second = await payment.main({ action: 'createCreditOrder', data: { productId: 'pack-1', idempotencyKey: 'buy-b' } }, {}, deps);
  deps.verifiedCallback = true;
  const notice = { transactionId: 'wx-once', amountCents: 100, currency: 'CNY', payerOpenid: 'user-1', tradeState: 'SUCCESS' };
  const paid = await payment.settleVerifiedCreditOrder({ ...notice, outTradeNo: first.data.outTradeNo }, deps);
  assert.equal(paid.code, 0);
  const replay = await payment.settleVerifiedCreditOrder({ ...notice, outTradeNo: second.data.outTradeNo }, deps);
  assert.equal(replay.code, 'PAYMENT_TRANSACTION_CONFLICT');
  assert.equal(data.credit_accounts['user-1'].balance, 1);
  assert.equal(data.credit_orders[second.data.orderId].status, 'pending');
});

test('a user can query only their own credit order status without confirming payment', async () => {
  const { data, deps } = fixture({ CREDIT_PURCHASE_MODE: 'mock' });
  data.credit_products['pack-1'] = { _id: 'pack-1', status: 'active', mode: 'mock', amountCents: 100, credits: 1, bonusCredits: 0, currency: 'CNY' };
  const created = await payment.main({ action: 'createCreditOrder', data: { productId: 'pack-1', idempotencyKey: 'query-order' } }, {}, deps);
  const own = await payment.main({ action: 'getCreditOrder', data: { orderId: created.data.orderId } }, {}, deps);
  assert.equal(own.code, 0);
  assert.equal(own.data.paymentStatus, 'pending');
  deps.wxContext.OPENID = 'user-2';
  const foreign = await payment.main({ action: 'getCreditOrder', data: { orderId: created.data.orderId } }, {}, deps);
  assert.equal(foreign.code, 'RESOURCE_NOT_FOUND');
  assert.equal(Object.keys(data.credit_ledger).length, 0);
});

test('mini program payment service exposes only read and order-creation calls for new credit flow', async () => {
  const calls = [];
  const previousWx = global.wx;
  global.wx = { cloud: { callFunction(payload) { calls.push(payload); return Promise.resolve({ result: { code: 0 } }); } } };
  try {
    const service = require('../miniprogram/services/payment');
    await service.listCreditProducts();
    await service.createCreditOrder({ productId: 'pack-1', idempotencyKey: 'buy-1' });
    await service.getCreditOrder({ orderId: 'order-1' });
    assert.deepEqual(calls.map(call => call.data.action), ['listCreditProducts', 'createCreditOrder', 'getCreditOrder']);
    assert.equal(service.confirmCreditOrder, undefined);
  } finally {
    global.wx = previousWx;
  }
});
