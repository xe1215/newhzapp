const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'wx-server-sdk') return { DYNAMIC_CURRENT_ENV: 'test', init() {}, database() { throw new Error('Inject database'); }, getWXContext() { throw new Error('Inject context'); } };
  return originalLoad.call(this, request, parent, isMain);
};
const payment = require('../cloudfunctions/payment');
Module._load = originalLoad;

function createDb(records) {
  return { collection(name) { return { doc(id) { return { async get() { return { data: records[name]?.[id] || {} }; } }; } }; } };
}

test('credit balance is zero for a new user and returns only the current user balance', async () => {
  const records = { credit_accounts: { 'user-1': { _id: 'user-1', openid: 'user-1', balance: 7 } } };
  const deps = { env: {}, wxContext: { OPENID: 'user-1' }, db: createDb(records) };
  const current = await payment.main({ action: 'getCreditBalance', data: {} }, {}, deps);
  assert.deepEqual(current, { code: 0, message: 'ok', data: { balance: 7 } });

  const fresh = await payment.main({ action: 'getCreditBalance', data: {} }, {}, {
    env: {}, wxContext: { OPENID: 'new-user' }, db: createDb(records),
  });
  assert.deepEqual(fresh, { code: 0, message: 'ok', data: { balance: 0 } });
});
