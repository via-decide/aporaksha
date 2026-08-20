import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const dbPath = `/tmp/aporaksha-commerce-${process.pid}.db`;
process.env.APORAKSHA_DB_PATH = dbPath;
process.env.SECRET_KEY = 'commerce-security-test-secret';
process.env.RAZORPAY_KEY_SECRET = 'razorpay-test-secret';

const store = await import('../lib/domain/creatorStore.js');
const financialLedger = await import('../lib/domain/financialLedger.js');
const membership = await import('../lib/domain/membership.js');
const creatorLedger = await import('../lib/creatorLedger.js');
const { getDB } = await import('../lib/db.js');
const { default: commerceHandler } = await import('../api/creator-commerce/[...path].js');
const { default: membershipHandler } = await import('../api/membership/[...path].js');

function token(email, role = 'user') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ email, role, type: 'access', exp: Math.floor(Date.now() / 1000) + 60 });
  const signature = crypto.createHmac('sha256', process.env.SECRET_KEY)
    .update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function request(url, method, body = {}, authorization) {
  const req = { url, method, body, headers: authorization ? { authorization: `Bearer ${authorization}` } : {} };
  const res = {
    statusCode: 200,
    body: undefined,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
  return { req, res };
}

test('creator mutations require the owning identity', async () => {
  await store.seedAshokIfNeeded();
  const url = '/api/creator-commerce/creators/ashok-verma';

  let call = request(url, 'PUT', { bio: 'attacker' });
  await commerceHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 401);

  call = request(url, 'PUT', { bio: 'attacker' }, token('other@example.com'));
  await commerceHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 403);

  call = request(url, 'PUT', { bio: 'owner update' }, token('helloashokverma@gmail.com'));
  await commerceHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 200);
});

test('public offers omit fulfillment URLs', async () => {
  await store.seedPriyaIfNeeded();
  const db = await getDB();
  await db.run("UPDATE offers SET file_url = 'https://private.example/file' WHERE offer_id = 'ui-templates'");
  assert.equal((await store.getOffer('ui-templates')).fileUrl, undefined);
  assert.equal((await store.getOfferForFulfillment('ui-templates')).fileUrl, 'https://private.example/file');
});

test('payment verification records one sale and one entitlement', async () => {
  await creatorLedger.createOrder({
    orderId: 'order-domain-1', creatorSlug: 'priya-design', offerId: 'ui-templates',
    offerTitle: 'Startup UI Kit', amount: 10000, currency: 'INR', buyerName: 'Buyer',
    buyerEmail: 'buyer@example.com', selectedDate: '', selectedTime: '', status: 'created',
    razorpayOrderId: 'order_rzp_1', idempotencyKey: 'checkout-1',
  });
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update('order_rzp_1|pay_1').digest('hex');
  const body = { orderId: 'order-domain-1', razorpayOrderId: 'order_rzp_1', razorpayPaymentId: 'pay_1', razorpaySignature: signature };

  for (let i = 0; i < 2; i += 1) {
    const call = request('/api/creator-commerce/payments/verify', 'POST', body);
    await commerceHandler(call.req, call.res);
    assert.equal(call.res.statusCode, 200);
  }
  assert.equal((await financialLedger.getLedgerByOrder('order-domain-1')).filter(e => e.entry_type === 'sale').length, 1);
  assert.equal(await membership.hasEntitlement('buyer@example.com', 'ui-templates'), true);
});

test('membership cancellation ignores body email and requires a session', async () => {
  await membership.createMembership('victim@example.com', '2099-01-01');
  let call = request('/api/membership/cancel', 'POST', { email: 'victim@example.com' });
  await membershipHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 401);

  await membership.createMembership('owner@example.com', '2099-01-01');
  call = request('/api/membership/cancel', 'POST', { email: 'victim@example.com' }, token('owner@example.com'));
  await membershipHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 200);
  assert.equal((await membership.getMembership('victim@example.com')).status, 'active');
  assert.equal((await membership.getMembership('owner@example.com')).status, 'cancelled');
});

test('ledger retries are idempotent and a full refund clears creator balance', async () => {
  const sale = await financialLedger.recordSale({ orderId: 'refund-order', creatorHandle: 'creator', buyerEmail: 'buyer@example.com', amountMinor: 10000, currency: 'INR', providerTxnId: 'pay-sale' });
  await financialLedger.recordRefund({ orderId: 'refund-order', creatorHandle: 'creator', amountMinor: 10000, currency: 'INR', originalSaleId: sale.saleId });
  assert.equal(await financialLedger.getCreatorBalance('creator'), 0);

  await financialLedger.recordMembership({ buyerEmail: 'buyer@example.com', amountMinor: 2900, currency: 'INR', providerTxnId: 'pay-membership' });
  await financialLedger.recordMembership({ buyerEmail: 'buyer@example.com', amountMinor: 2900, currency: 'INR', providerTxnId: 'pay-membership' });
  const db = await getDB();
  const row = await db.get("SELECT COUNT(*) count FROM financial_ledger WHERE entry_type = 'membership' AND provider_txn_id = 'pay-membership'");
  assert.equal(row.count, 1);
});

test.after(() => fs.rmSync(dbPath, { force: true }));
