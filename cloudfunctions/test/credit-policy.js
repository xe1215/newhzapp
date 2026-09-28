function creditPolicy(env) {
  const source = env || {};
  const mode = String(source.SINGLE_TRYON_CREDIT_MODE || 'disabled');
  if (mode === 'disabled') return { enabled: false };
  if (mode !== 'mock') return { enabled: true, confirmed: false, providerNotReady: true };
  return { enabled: true, confirmed: true, cost: 1, refundOnFailure: true, concurrencyLimit: 1 };
}

module.exports = { creditPolicy };
