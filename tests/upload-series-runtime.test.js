const assert = require('node:assert/strict');
const { test } = require('node:test');

const calls = [];
global.wx = {
  chooseMedia(options) { options.fail({ errMsg: 'unsupported' }); },
  chooseImage(options) { options.success({ tempFilePaths: ['/tmp/selfie.jpg'] }); },
  cloud: {
    uploadFile: async (options) => { calls.push(['uploadFile', options.filePath]); return { fileID: 'cloud://selfie' }; },
    callFunction: async (options) => { calls.push(['callFunction', options.data.action]); return { result: { code: 0 } }; },
  },
  showLoading: () => {},
  hideLoading: () => {},
  showToast: (value) => calls.push(['toast', value.title]),
  navigateTo: (value) => calls.push(['navigateTo', value.url]),
  getWindowInfo: () => ({ windowWidth: 375, windowHeight: 760, screenHeight: 760, statusBarHeight: 36 }),
};

const { createDesignPage } = require('../miniprogram/ui/design-page');

test('selfie upload falls back from chooseMedia to chooseImage and calls the business action', async () => {
  const page = createDesignPage('fit');
  page.setData = (patch) => Object.assign(page.data, patch);
  page.chooseSingleSelfie(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.slice(0, 2), [['uploadFile', '/tmp/selfie.jpg'], ['callFunction', 'uploadSingleSelfie']]);
  assert.equal(calls.at(-1)[0], 'navigateTo');
});

test('an unavailable demonstration product cannot start a real CloudBase try-on', async () => {
  const actions = [];
  global.wx.cloud.database = () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: null }) }) }) });
  global.wx.cloud.callFunction = async ({ data }) => {
    actions.push(data.action);
    if (data.action === 'getLatestTryOnTest') return { result: { code: 0, data: { test: { testId: 'test-1' } } } };
    if (data.action === 'createSingleTryOn') return { result: { code: 0, data: { jobId: 'job-1' } } };
    return { result: { code: 0, data: { status: 'succeeded', resultImage: 'https://after', beforeImage: 'https://before' } } };
  };
  const page = createDesignPage('tryon');
  page.setData = (patch) => Object.assign(page.data, patch);
  page.onLoad({ productId: 'mock-jd-p02' });
  await new Promise((resolve) => setImmediate(() => setImmediate(resolve)));
  assert.deepEqual(actions, []);
  assert.equal(page.data.status, 'failed');
  assert.match(page.data.tryOnMessage, /商品/);
  assert.equal(page.data.resultImageUrl, '');
  page.onUnload();
});
