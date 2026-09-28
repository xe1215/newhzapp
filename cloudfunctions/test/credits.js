const crypto = require('crypto');

function creditJobId(openid, idempotencyKey) {
  return `single-${crypto.createHash('sha256').update(`${openid}:${idempotencyKey}`).digest('hex')}`;
}

function creditDebitId(jobId, attemptKey) {
  return `debit-${crypto.createHash('sha256').update(`${jobId}:${attemptKey}`).digest('hex')}`;
}

async function createCreditJob(runtime, job) {
  if (!runtime.db || typeof runtime.db.runTransaction !== 'function') {
    return { code: 'CREDIT_TRANSACTION_UNAVAILABLE' };
  }
  const jobId = creditJobId(job.openid, job.idempotencyKey);
  try {
    return await runtime.db.runTransaction(async transaction => {
      const previous = (await transaction.collection('single_tryon_jobs').doc(jobId).get()).data || {};
      if (previous._id) {
        if (previous.testId !== job.testId || previous.productId !== job.productId || previous.openid !== job.openid) {
          return { code: 'IDEMPOTENCY_KEY_CONFLICT' };
        }
        return { job: previous, idempotent: true };
      }
      const queued = { ...job, _id: jobId, creditMode: 'mock', creditAttempt: 0, creditSettled: true };
      const fields = { ...queued };
      delete fields._id;
      await transaction.collection('single_tryon_jobs').doc(jobId).set({ data: fields });
      return { job: queued, idempotent: false };
    });
  } catch (error) {
    return { code: 'CREDIT_TRANSACTION_FAILED' };
  }
}

async function startCreditAttempt(runtime, job, attemptKey, retry) {
  if (!runtime.db || typeof runtime.db.runTransaction !== 'function') {
    return { code: 'CREDIT_TRANSACTION_UNAVAILABLE' };
  }
  try {
    return await runtime.db.runTransaction(async transaction => {
      const current = (await transaction.collection('single_tryon_jobs').doc(job._id).get()).data || {};
      if (!current._id || current.openid !== job.openid || current.creditMode !== 'mock') {
        return { code: 'CREDIT_JOB_INVALID' };
      }
      if (current.creditAttemptKey === attemptKey && current.creditAttempt > 0) {
        return { job: current, idempotent: true };
      }
      const debitId = creditDebitId(job._id, attemptKey);
      const previousDebit = (await transaction.collection('credit_ledger').doc(debitId).get()).data || {};
      if (previousDebit._id) return { code: 'IDEMPOTENCY_KEY_REUSED' };
      const canStart = retry
        ? ['failed', 'timeout'].includes(current.status) && current.creditSettled
        : current.status === 'queued' && current.creditAttempt === 0;
      if (!canStart) {
        return { code: 'INVALID_STATE' };
      }
      const account = (await transaction.collection('credit_accounts').doc(job.openid).get()).data || {};
      const balance = Number(account.balance || 0);
      const activeCount = Number(account.activeCount || 0);
      if (activeCount >= 1) return { code: 'TRYON_CONCURRENT_LIMIT' };
      if (balance < 1) return { code: 'INSUFFICIENT_CREDITS' };
      let purchaseOrder = null;
      if (account.hasPurchaseLots === true) {
        const orders = (await transaction.collection('credit_orders').where({ openid: job.openid, status: 'paid' }).get()).data || [];
        purchaseOrder = orders
          .filter(order => Number.isSafeInteger(order.remainingCredits) && order.remainingCredits > 0)
          .sort((a, b) => Number(a.purchaseSequence || 0) - Number(b.purchaseSequence || 0) ||
            String(a.paidAt || a.createdAt).localeCompare(String(b.paidAt || b.createdAt)) ||
            String(a._id).localeCompare(String(b._id)))[0] || null;
      }
      const attempt = Number(current.creditAttempt || 0) + 1;
      const now = runtime.now().toISOString();
      if (purchaseOrder) {
        await transaction.collection('credit_orders').doc(purchaseOrder._id).update({ data: {
          remainingCredits: purchaseOrder.remainingCredits - 1, updatedAt: now,
        } });
      }
      await transaction.collection('credit_accounts').doc(job.openid).update({ data: {
        balance: balance - 1, activeCount: activeCount + 1, updatedAt: now,
      } });
      await transaction.collection('credit_ledger').doc(debitId).set({ data: {
        openid: job.openid, jobId: job._id, type: 'single_tryon_debit',
        amount: -1, orderId: purchaseOrder ? purchaseOrder._id : '',
        idempotencyKey: attemptKey, attempt, createdAt: now,
      } });
      const patch = {
        status: 'running', creditCost: 1, creditAttempt: attempt,
        creditAttemptKey: attemptKey, creditSettled: false,
        creditRefundOnFailure: true, errorCode: '', errorMessage: '', updatedAt: now,
      };
      await transaction.collection('single_tryon_jobs').doc(job._id).update({ data: patch });
      return { job: { ...current, ...patch }, idempotent: false };
    });
  } catch (error) {
    return { code: 'CREDIT_TRANSACTION_FAILED' };
  }
}

async function settleCredits(runtime, job, result) {
  if (!runtime.db || typeof runtime.db.runTransaction !== 'function') {
    return { code: 'CREDIT_TRANSACTION_UNAVAILABLE' };
  }
  try {
    return await runtime.db.runTransaction(async transaction => {
      const current = (await transaction.collection('single_tryon_jobs').doc(job._id).get()).data || {};
      if (!current._id || current.openid !== job.openid || !current.creditCost) {
        return { code: 'CREDIT_JOB_INVALID' };
      }
      if (current.creditAttempt !== job.creditAttempt) return { code: 'CREDIT_ATTEMPT_CONFLICT' };
      if (current.creditSettled) return { job: current, idempotent: true };
      const account = (await transaction.collection('credit_accounts').doc(job.openid).get()).data || {};
      if (account.openid !== job.openid || Number(account.activeCount || 0) < 1) {
        return { code: 'CREDIT_ACCOUNT_INVALID' };
      }
      const shouldRefund = result.status !== 'succeeded' && current.creditRefundOnFailure === true;
      const now = result.updatedAt;
      await transaction.collection('credit_accounts').doc(job.openid).update({ data: {
        balance: Number(account.balance || 0) + (shouldRefund ? current.creditCost : 0),
        activeCount: Number(account.activeCount) - 1,
        updatedAt: now,
      } });
      if (shouldRefund) {
        const debit = (await transaction.collection('credit_ledger').doc(creditDebitId(job._id, current.creditAttemptKey)).get()).data || {};
        if (debit.orderId) {
          const sourceOrder = (await transaction.collection('credit_orders').doc(debit.orderId).get()).data || {};
          if (sourceOrder.openid !== job.openid || !Number.isSafeInteger(sourceOrder.remainingCredits) ||
              sourceOrder.remainingCredits >= sourceOrder.credits) return { code: 'CREDIT_ORDER_INVALID' };
          await transaction.collection('credit_orders').doc(debit.orderId).update({ data: {
            remainingCredits: sourceOrder.remainingCredits + current.creditCost, updatedAt: now,
          } });
        }
        const ledgerId = `${job._id}-refund-${current.creditAttempt}`;
        await transaction.collection('credit_ledger').doc(ledgerId).set({ data: {
          openid: job.openid, jobId: job._id, orderId: debit.orderId || '',
          type: 'single_tryon_refund', amount: current.creditCost,
          idempotencyKey: current.creditAttemptKey, attempt: current.creditAttempt, createdAt: now,
        } });
      }
      const settled = { ...current, ...result, creditSettled: true, creditRefunded: shouldRefund };
      await transaction.collection('single_tryon_jobs').doc(job._id).update({ data: {
        ...result, creditSettled: true, creditRefunded: shouldRefund,
      } });
      return { job: settled, idempotent: false };
    });
  } catch (error) {
    return { code: 'CREDIT_TRANSACTION_FAILED' };
  }
}

module.exports = { createCreditJob, startCreditAttempt, settleCredits };
