const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let definition;
global.Component = value => { definition = value; };
require('../miniprogram/components/creditPricing/index');
delete global.Component;

function mount() {
  const events = [];
  const component = {
    data: { ...definition.data },
    setData(patch) { Object.assign(this.data, patch); },
    triggerEvent(name, detail) { events.push({ name, detail }); },
  };
  Object.assign(component, definition.methods);
  return { component, events };
}

test('credit pricing requires an explicit package choice and resets on reopen', () => {
  const { component, events } = mount();
  assert.equal(component.data.selectedCredits, 0);
  component.purchase();
  assert.equal(events.length, 0);

  component.selectPackage({ currentTarget: { dataset: { credits: 40 } } });
  assert.equal(component.data.selectedPrice, '¥28');
  component.purchase();
  assert.equal(events[0].name, 'purchase');
  assert.equal(events[0].detail.credits, 40);
  assert.equal(events[0].detail.amountCents, 2800);

  component.close();
  assert.equal(events[1].name, 'close');
  definition.properties.visible.observer.call(component, true);
  assert.equal(component.data.selectedCredits, 0);
  component.purchase();
  assert.equal(events.length, 2);
});

test('four target pages use the same pricing component outside their scroll views', () => {
  for (const page of ['discover', 'fit', 'beauty-profile', 'recommend']) {
    const base = path.resolve('miniprogram/pages', page);
    const wxml = fs.readFileSync(path.join(base, 'index.wxml'), 'utf8');
    const config = JSON.parse(fs.readFileSync(path.join(base, 'index.json'), 'utf8'));
    assert.equal(config.usingComponents['credit-pricing'], '/components/creditPricing/index');
    assert.match(wxml, /<\/scroll-view>\s*<credit-pricing /);
  }
});
