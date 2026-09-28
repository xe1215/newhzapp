const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const designPage = fs.readFileSync(path.join(root, 'miniprogram/ui/design-page.js'), 'utf8');
const detail = fs.readFileSync(path.join(root, 'miniprogram/pages/product-detail/index.wxml'), 'utf8');

assert.match(designPage, /chooseMedia/);
assert.match(designPage, /chooseImage/);
assert.match(designPage, /uploadFile/);
assert.match(designPage, /uploadSingleSelfie/);
assert.match(designPage, /chooseSingleSelfie\(useCamera\)/);
assert.match(designPage, /sourceType/);
assert.match(detail, /relatedProducts/);
assert.match(detail, /selectRelatedProduct/);
assert.match(detail, /wx:for="\{\{relatedProducts\}\}"/);
console.log('ok - selfie upload fallback and related product selector are wired');
