const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'wx-server-sdk') return { DYNAMIC_CURRENT_ENV: 'test', init() {}, database() { throw new Error('Inject DB'); }, getWXContext() { throw new Error('Inject context'); } };
  return originalLoad.call(this, request, parent, isMain);
};
const service = require('../cloudfunctions/test');
Module._load = originalLoad;

function test(name, fn) {
  Promise.resolve().then(fn).then(() => console.log(`ok - ${name}`), error => { console.error(`not ok - ${name}`); console.error(error); process.exitCode = 1; });
}

function fixture() {
  const jobs = {
    mine: { _id: 'mine', openid: 'user-1', testId: 'test-1', productId: 'lip-1', product: { brand: 'JUDYDOLL', shadeCode: 'P02' }, status: 'succeeded', resultImage: 'cloud://result-1', beforeImage: 'cloud://selfie-1', savedAt: '2026-09-25T00:00:00Z', createdAt: '2026-09-25T00:00:00Z' },
    other: { _id: 'other', openid: 'user-2', testId: 'test-2', productId: 'lip-2', status: 'succeeded', resultImage: 'cloud://result-2', savedAt: '2026-09-25T00:00:00Z' },
    unsaved: { _id: 'unsaved', openid: 'user-1', testId: 'test-1', productId: 'lip-3', status: 'succeeded', resultImage: 'cloud://result-3' },
  };
  const calls = [];
  const db = { collection(name) { return {
    where(filter) { return { async get() { calls.push(['get', name, filter]); return { data: Object.values(jobs).filter(job => Object.entries(filter).every(([key, value]) => job[key] === value)) }; } }; },
    doc(id) { return {
      async get() { return { data: name === 'single_tryon_jobs' ? jobs[id] || null : null }; },
      async update({ data }) { calls.push(['update', name, id, data]); Object.assign(jobs[id], data); return { stats: { updated: 1 } }; },
    }; },
  }; } };
  return { jobs, calls, deps: { db, wxContext: { OPENID: 'user-1' }, now: () => new Date('2026-09-26T00:00:00.000Z') } };
}

test('saved single try-ons appear only in their owner history', async () => {
  const { deps } = fixture();
  const result = await service.main({ action: 'listMySingleTryOns', data: {} }, {}, deps);
  assert.equal(result.code, 0);
  assert.deepEqual(result.data.items.map(item => item.jobId), ['mine']);
  assert.equal(result.data.items[0].product.brand, 'JUDYDOLL');
});

test('deleting a saved try-on hides it from history and detail without deleting another user job', async () => {
  const { deps, jobs, calls } = fixture();
  const forbidden = await service.main({ action: 'deleteSingleTryOn', data: { jobId: 'other' } }, {}, deps);
  assert.equal(forbidden.code, 'RESOURCE_NOT_FOUND');
  assert.equal(calls.filter(call => call[0] === 'update').length, 0);
  const deleted = await service.main({ action: 'deleteSingleTryOn', data: { jobId: 'mine' } }, {}, deps);
  assert.equal(deleted.code, 0);
  assert.ok(jobs.mine.deletedAt);
  const history = await service.main({ action: 'listMySingleTryOns', data: {} }, {}, deps);
  assert.deepEqual(history.data.items, []);
  const detail = await service.main({ action: 'getSingleTryOn', data: { jobId: 'mine' } }, {}, deps);
  assert.equal(detail.code, 'RESOURCE_NOT_FOUND');
  const replay = await service.main({ action: 'processSingleTryOn', data: { jobId: 'mine' } }, {}, deps);
  assert.equal(replay.code, 'RESOURCE_NOT_FOUND');
  const saveAgain = await service.main({ action: 'saveSingleTryOn', data: { jobId: 'mine' } }, {}, deps);
  assert.equal(saveAgain.code, 'RESOURCE_NOT_FOUND');
});

function mount(pageName) {
  const file = path.resolve(__dirname, '../miniprogram/pages', pageName, 'index.js');
  let definition;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page: value => { definition = value; }, require: createRequire(file) });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)) };
  page.setData = update => Object.assign(page.data, update);
  return page;
}

test('a successful mock single try-on appears in Mine and deletion removes it from history', async () => {
  const calls = [];
  global.wx = {
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 760, screenHeight: 760, statusBarHeight: 36, safeArea: { bottom: 760 } }),
    navigateTo: value => calls.push(value), reLaunch: value => calls.push(value), showToast: value => calls.push(value),
  };
  const tryon = mount('single-tryon');
  tryon.onLoad({ productId: 'mock-into-em08' });
  const mine = mount('mine');
  mine.onLoad({});
  mine.onShow();
  assert.ok(mine.data.tryOnHistory.some(item => item.productId === 'mock-into-em08'));
  const item = mine.data.tryOnHistory.find(value => value.productId === 'mock-into-em08');
  mine.onAction({ currentTarget: { dataset: { action: 'deleteTryOn', id: item.id } } });
  assert.ok(!mine.data.tryOnHistory.some(value => value.id === item.id));
  assert.match(mine.data.mineFeedback, /已删除/);
});

test('Mine shows delete errors and blocks a new mock try-on after selfie deletion', async () => {
  const calls = [];
  global.wx = {
    getWindowInfo: () => ({ windowWidth: 375, windowHeight: 760, screenHeight: 760, statusBarHeight: 36, safeArea: { bottom: 760 } }),
    navigateTo: value => calls.push(['navigateTo', value]), reLaunch: value => calls.push(['reLaunch', value]), showToast: value => calls.push(['showToast', value]),
  };
  const mine = mount('mine');
  mine.onLoad({});
  mine.onShow();
  mine._deleteSelfie = () => { throw new Error('network'); };
  mine.onAction({ currentTarget: { dataset: { action: 'deleteSelfie' } } });
  assert.match(mine.data.mineError, /删除自拍失败/);
  assert.equal(mine.data.selfieAvailable, true);
  mine._deleteSelfie = null;
  mine.onAction({ currentTarget: { dataset: { action: 'deleteSelfie' } } });
  assert.equal(mine.data.selfieAvailable, false);
  const detail = mount('product-detail');
  detail.onLoad({ productId: 'mock-jd-p02' });
  detail.onAction({ currentTarget: { dataset: { action: 'navigateTo', target: 'tryon' } } });
  assert.equal(calls[calls.length - 1][0], 'showToast');
  assert.match(calls[calls.length - 1][1].title, /上传自拍/);
});

test('Mine renders dynamic try-on history, empty and error states without legacy report actions', async () => {
  const template = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/mine/index.wxml'), 'utf8');
  assert.match(template, /visibleTryOnHistory/);
  assert.match(template, /deleteTryOn/);
  assert.match(template, /deleteSelfie/);
  assert.match(template, /mineError/);
  assert.match(template, /暂无试色记录/);
  for (const old of ['LIP REPORT', '已解锁', '3 支推荐', '退款', '分享', '查看完整报告']) assert.ok(!template.includes(old), old);
});

test('a deleted history detail presents an unavailable state instead of the old comparison', async () => {
  const template = fs.readFileSync(path.join(__dirname, '../miniprogram/pages/single-tryon/index.wxml'), 'utf8');
  assert.match(template, /historyUnavailable/);
  global.wx = { getWindowInfo: () => ({ windowWidth: 375, windowHeight: 760, screenHeight: 760, statusBarHeight: 36, safeArea: { bottom: 760 } }) };
  const detail = mount('single-tryon');
  detail.onLoad({ productId: 'mock-into-em08', historyId: 'missing-history' });
  assert.equal(detail.data.historyUnavailable, true);
});

test('mini program service exposes owned history and deletion actions for later CloudBase integration', async () => {
  const serviceSource = fs.readFileSync(path.join(__dirname, '../miniprogram/services/test.js'), 'utf8');
  assert.match(serviceSource, /function listMySingleTryOns\(/);
  assert.match(serviceSource, /function deleteSingleTryOn\(/);
});
