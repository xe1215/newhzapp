const assert = require('node:assert/strict');

const { mapProductRecord, mapProductRecords } = require('../miniprogram/services/products');
const { createSingleImageProvider } = require('../cloudfunctions/test/single-image-provider');
const fs = require('node:fs');
const path = require('node:path');

async function run() {
  const mapped = mapProductRecord({
    _id: 'lip-1',
    brand: 'Brand',
    productName: 'Velvet',
    shadeCode: 'A01',
    colorHex: '#aa1122',
    productImage: 'cloud://env/products/lip-1.jpg',
    status: 'active',
  });
  assert.equal(mapped.id, 'lip-1');
  assert.equal(mapped.name, 'Velvet');
  assert.equal(mapped.productImage, 'cloud://env/products/lip-1.jpg');
  assert.equal(mapped.image, 'cloud://env/products/lip-1.jpg');
  assert.deepEqual(mapProductRecords([
    { _id: 'active', status: 'active', brand: 'A', productName: 'One', shadeCode: '01' },
    { _id: 'inactive', status: 'inactive', brand: 'B', productName: 'Two', shadeCode: '02' },
  ]).map((item) => item.id), ['active']);

  let submitted;
  let uploaded;
  const provider = createSingleImageProvider({
    runtime: {
      env: { JIMENG_ACCESS_KEY_ID: 'test', JIMENG_SECRET_ACCESS_KEY: 'test' },
      now: () => new Date('2026-09-27T00:00:00.000Z'),
      getTempFileURL: async () => 'https://private/selfie.jpg',
      uploadFileFromUrl: async (input) => { uploaded = input; return 'cloud://tryon-single/job-1/result.jpg'; },
      httpRequest: async (options, body) => {
        submitted = { options, body: JSON.parse(body) };
        return { statusCode: 200, json: { data: { image_url: 'https://provider/result.jpg' } } };
      },
    },
  });
  const result = await provider.generate({
    jobId: 'job-1',
    selfieFileId: 'cloud://selfie/user.jpg',
    product: { brand: 'Brand', shadeCode: 'A01', colorHex: '#aa1122', productName: 'Velvet' },
  });
  assert.equal(result.resultImage, 'cloud://tryon-single/job-1/result.jpg');
  assert.equal(result.imageCount, 1);
  assert.equal(uploaded.cloudPath, 'tryon-single/job-1/result.jpg');
  assert.deepEqual(submitted.body.image_urls, ['https://private/selfie.jpg']);

  const detailWxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/product-detail/index.wxml'), 'utf8');
  const tryonWxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/single-tryon/index.wxml'), 'utf8');
  const homeWxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/discover/index.wxml'), 'utf8');
  const fitWxml = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/pages/fit/index.wxml'), 'utf8');
  const designPage = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/ui/design-page.js'), 'utf8');
  const singleTryon = fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions/test/single-tryon.js'), 'utf8');
  assert.match(detailWxml, /product\.imageUrl/);
  assert.match(tryonWxml, /resultImageUrl/);
  assert.match(homeWxml, /wx:for="\{\{products\}\}"/);
  assert.match(homeWxml, /item\.shade\.code/);
  assert.match(designPage, /listProducts\(\)/);
  assert.match(homeWxml, /data-product-id/);
  assert.match(fitWxml, /data-action="uploadSelfie"/);
  assert.match(fitWxml, /data-action="takeSelfie"/);
  assert.match(designPage, /wx\.cloud\.uploadFile/);
  assert.match(singleTryon, /uploadSingleSelfie/);
}

run().then(() => console.log('ok - reconnect business contracts')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
