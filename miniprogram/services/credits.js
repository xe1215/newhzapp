const { callBusinessFunction } = require('./cloud');

const CREDIT_PACKAGES = Object.freeze([
  { credits: 1, amountCents: 100, price: '1元', unitPrice: '1元/积分' },
  { credits: 20, amountCents: 1600, price: '16元', unitPrice: '0.8元/积分' },
  { credits: 40, amountCents: 2800, price: '28元', unitPrice: '0.7元/积分' },
  { credits: 60, amountCents: 3600, price: '36元', unitPrice: '0.6元/积分' },
]);

function getCreditBalance() {
  return callBusinessFunction('payment', 'getCreditBalance', {});
}

module.exports = { CREDIT_PACKAGES, getCreditBalance };
