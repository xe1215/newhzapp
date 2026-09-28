const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pages = ['analyzing','beauty-profile','edit-profile','product-detail','recommend','single-tryon'];
const app = JSON.parse(fs.readFileSync(path.join(root,'miniprogram/app.json'),'utf8'));
for (const page of pages) {
  assert.ok(app.pages.includes('pages/'+page+'/index'));
  for (const ext of ['json','js','wxml','wxss']) {
    assert.ok(fs.existsSync(path.join(root,'miniprogram/pages',page,'index.'+ext)));
  }
  const template = fs.readFileSync(path.join(root,'miniprogram/pages',page,'index.wxml'),'utf8');
  for (const match of template.matchAll(/src="(\/images\/[^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(root,'miniprogram',match[1])), 'missing asset '+match[1]);
  }
  const options = JSON.parse(fs.readFileSync(path.join(root,'miniprogram/pages',page,'index.json'),'utf8'));
  assert.equal(options.navigationStyle,'custom');
}
console.log('ok - six secondary pages registered with valid local assets');
const recommend=fs.readFileSync(path.join(root,'miniprogram/pages/recommend/index.wxml'),'utf8');
assert.equal((recommend.match(/class="rec-num"/g)||[]).length,3);
console.log('ok - three recommendation roles retained');
// Real page controllers are exercised via the same event interface used by WXML.
require('./design-interactions.test.js');
// Real WXML/WXSS compilation: node tests/support/compile-design.cjs (WeChat Tools required).
