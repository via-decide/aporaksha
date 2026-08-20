import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
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
  const rawBody = JSON.stringify(body);
  const req = new EventEmitter();
  req.url = url;
  req.method = method;
  req.body = body;
  req.headers = authorization ? { authorization: `Bearer ${authorization}` } : {};
  process.nextTick(() => {
    req.emit('data', Buffer.from(rawBody));
    req.emit('end');
  });
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

test('1% platform fee exact on ₹100 sale (10000 paise)', async () => {
  const { platformFeeMinor, creatorPayoutMinor, PLATFORM_FEE_BASIS_POINTS } = await import('../lib/domain/money.js');
  const amount = 10000;
  const fee = platformFeeMinor(amount, PLATFORM_FEE_BASIS_POINTS);
  const payout = creatorPayoutMinor(amount, PLATFORM_FEE_BASIS_POINTS);
  assert.equal(fee, 100, '1% of 10000 paise = 100 paise');
  assert.equal(payout, 9900, 'creator gets 99%');
  assert.equal(fee + payout, amount, 'fee + payout = total');
});

test('refund zeroes gross ledger (sale + fee_reversal + refund sums to zero)', async () => {
  const db = await getDB();
  const orderId = 'gross-refund-test-' + Date.now();
  const sale = await financialLedger.recordSale({
    orderId, creatorHandle: 'gross-test-creator', buyerEmail: 'b@e.com',
    amountMinor: 10000, currency: 'INR', providerTxnId: 'pay-gross-1',
  });
  await financialLedger.recordRefund({
    orderId, creatorHandle: 'gross-test-creator', amountMinor: 10000, currency: 'INR',
    originalSaleId: sale.saleId,
  });
  const entries = await financialLedger.getLedgerByOrder(orderId);
  const gross = entries.reduce((sum, e) => sum + e.amount_minor, 0);
  assert.equal(gross, 0, `all ledger entries for a fully refunded order must sum to zero, got ${gross}`);
});

test('server-owned pricing: order uses offer amount from DB not request body', async () => {
  const db = await getDB();
  await db.run("UPDATE offers SET status = 'active' WHERE offer_id = 'ui-templates'");
  const offer = await store.getOffer('ui-templates');
  const key = 'server-price-' + Date.now();
  await creatorLedger.createOrder({
    orderId: 'server-price-order-' + Date.now(), creatorSlug: 'priya-design', offerId: 'ui-templates',
    offerTitle: 'UI Kit', amount: offer.amountMinor, currency: 'INR', buyerName: 'Test',
    buyerEmail: 'pricing@example.com', selectedDate: '', selectedTime: '', status: 'created',
    razorpayOrderId: 'rzp_sp', idempotencyKey: key,
  });
  const call = request('/api/creator-commerce/orders', 'POST', {
    creatorHandle: 'priya-design', offerId: 'ui-templates', buyerName: 'Test',
    buyerEmail: 'pricing@example.com', idempotencyKey: key,
    amountMinor: 99999,
  });
  await commerceHandler(call.req, call.res);
  assert.equal(call.res.body.amountMinor, offer.amountMinor,
    'response amount must be server-side offer amount, not client-submitted');
});

test('invalid webhook HMAC is rejected', async () => {
  const rawBody = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_bad' } } } });
  const call = request('/api/creator-commerce/payments/webhook', 'POST', {});
  call.req.rawBody = rawBody;
  call.req.body = JSON.parse(rawBody);
  call.req.headers['x-razorpay-signature'] = 'definitely-not-valid-hmac-signature-0000';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-test-secret';
  await commerceHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 400, 'invalid HMAC should be rejected');
  assert.equal(call.res.body.error, 'invalid_signature');
  process.env.RAZORPAY_WEBHOOK_SECRET = '';
});

test('verify rejects mismatched razorpay order ID', async () => {
  await creatorLedger.createOrder({
    orderId: 'order-mismatch-1', creatorSlug: 'priya-design', offerId: 'ui-templates',
    offerTitle: 'Test', amount: 10000, currency: 'INR', buyerName: 'Buyer',
    buyerEmail: 'mm@example.com', selectedDate: '', selectedTime: '', status: 'created',
    razorpayOrderId: 'order_rzp_real', idempotencyKey: 'mismatch-' + Date.now(),
  });
  const sig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update('order_rzp_fake|pay_mm').digest('hex');
  const call = request('/api/creator-commerce/payments/verify', 'POST', {
    orderId: 'order-mismatch-1', razorpayOrderId: 'order_rzp_fake',
    razorpayPaymentId: 'pay_mm', razorpaySignature: sig,
  });
  await commerceHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 400);
  assert.equal(call.res.body.error, 'order_mismatch');
});

test('typed fulfilment dispatches digital_file with download URL', async () => {
  const db = await getDB();
  await db.run("UPDATE offers SET file_url = 'https://cdn.example/file.zip' WHERE offer_id = 'ui-templates'");
  await creatorLedger.createOrder({
    orderId: 'fulfill-digital-1', creatorSlug: 'priya-design', offerId: 'ui-templates',
    offerTitle: 'UI Kit', amount: 10000, currency: 'INR', buyerName: 'Buyer',
    buyerEmail: 'f@e.com', selectedDate: '', selectedTime: '', status: 'paid',
    razorpayOrderId: 'order_rzp_f1', idempotencyKey: 'fulfill-' + Date.now(),
  });
  const call = request('/api/creator-commerce/fulfillment/fulfill-digital-1', 'GET');
  await commerceHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 200);
  assert.equal(call.res.body.type, 'digital_file');
  assert.equal(call.res.body.downloadUrl, 'https://cdn.example/file.zip');
});

test('fulfilment requires paid status', async () => {
  await creatorLedger.createOrder({
    orderId: 'fulfill-unpaid-1', creatorSlug: 'priya-design', offerId: 'ui-templates',
    offerTitle: 'UI Kit', amount: 10000, currency: 'INR', buyerName: 'Buyer',
    buyerEmail: 'unpaid@e.com', selectedDate: '', selectedTime: '', status: 'created',
    razorpayOrderId: 'order_rzp_unpaid', idempotencyKey: 'unpaid-' + Date.now(),
  });
  const call = request('/api/creator-commerce/fulfillment/fulfill-unpaid-1', 'GET');
  await commerceHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 403);
  assert.equal(call.res.body.error, 'payment_required');
});

test('seed requires admin role', async () => {
  let call = request('/api/creator-commerce/seed', 'POST', {}, token('user@example.com'));
  await commerceHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 403, 'non-admin should be forbidden');

  call = request('/api/creator-commerce/seed', 'POST', {}, token('admin@example.com', 'admin'));
  await commerceHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 200, 'admin should succeed');
});

test('offer creation requires creator ownership', async () => {
  const call = request('/api/creator-commerce/creators/ashok-verma/offers', 'POST',
    { title: 'Hostile Offer', amountMinor: 100, currency: 'INR', offerType: 'digital_file' },
    token('attacker@example.com'));
  await commerceHandler(call.req, call.res);
  assert.equal(call.res.statusCode, 403, 'non-owner should not create offers');
});

test.after(() => fs.rmSync(dbPath, { force: true }));
