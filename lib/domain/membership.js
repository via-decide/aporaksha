/**
 * Buyer membership — ₹29/month (BUYER_MEMBER_29_V1).
 *
 * Membership grants access to content with access_policy = 'membership'
 * or 'membership_or_purchase'. It does NOT grant access to
 * purchase_only content — that requires a separate purchase.
 *
 * paidThrough: the date through which the membership is active.
 * A membership is active when paidThrough >= today.
 */

import crypto from 'crypto';
import { getDB } from '../db.js';

const PLAN_ID = 'BUYER_MEMBER_29_V1';
const PLAN_AMOUNT_MINOR = 2900;
const PLAN_CURRENCY = 'INR';

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  const db = await getDB();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS buyer_memberships (
      buyer_email TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL DEFAULT '${PLAN_ID}',
      status TEXT NOT NULL DEFAULT 'active',
      paid_through TEXT NOT NULL,
      razorpay_subscription_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_entitlements (
      entitlement_id TEXT PRIMARY KEY,
      buyer_email TEXT NOT NULL,
      offer_id TEXT NOT NULL,
      creator_handle TEXT NOT NULL,
      order_id TEXT NOT NULL,
      granted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_entitlements_buyer ON purchase_entitlements(buyer_email);
    CREATE INDEX IF NOT EXISTS idx_entitlements_offer ON purchase_entitlements(offer_id, buyer_email);
  `);
  schemaReady = true;
}

// ── Content access policies ──────────────────────────────────────────

export const ACCESS_POLICIES = Object.freeze([
  'public',
  'membership',
  'purchase_only',
  'membership_or_purchase',
]);

export function checkAccess(policy, { isMember, hasPurchased }) {
  switch (policy) {
    case 'public':
      return true;
    case 'membership':
      return !!isMember;
    case 'purchase_only':
      return !!hasPurchased;
    case 'membership_or_purchase':
      return !!isMember || !!hasPurchased;
    default:
      return false;
  }
}

// ── Membership CRUD ──────────────────────────────────────────────────

export async function getMembership(buyerEmail) {
  await ensureSchema();
  const db = await getDB();
  const row = await db.get('SELECT * FROM buyer_memberships WHERE buyer_email = ?', [buyerEmail]);
  if (!row) return null;
  return {
    buyerEmail: row.buyer_email,
    planId: row.plan_id,
    status: row.status,
    paidThrough: row.paid_through,
    razorpaySubscriptionId: row.razorpay_subscription_id,
    createdAt: row.created_at,
  };
}

export function isMembershipActive(membership) {
  if (!membership || membership.status !== 'active') return false;
  const today = new Date().toISOString().slice(0, 10);
  return membership.paidThrough >= today;
}

export async function createMembership(buyerEmail, paidThrough, razorpaySubscriptionId) {
  await ensureSchema();
  const db = await getDB();

  const existing = await db.get('SELECT buyer_email FROM buyer_memberships WHERE buyer_email = ?', [buyerEmail]);
  if (existing) {
    await db.run(
      `UPDATE buyer_memberships SET status = 'active', paid_through = ?, razorpay_subscription_id = ?, updated_at = CURRENT_TIMESTAMP WHERE buyer_email = ?`,
      [paidThrough, razorpaySubscriptionId || null, buyerEmail]
    );
  } else {
    await db.run(
      `INSERT INTO buyer_memberships (buyer_email, plan_id, status, paid_through, razorpay_subscription_id) VALUES (?, ?, 'active', ?, ?)`,
      [buyerEmail, PLAN_ID, paidThrough, razorpaySubscriptionId || null]
    );
  }
  return { buyerEmail, paidThrough };
}

export async function extendMembership(buyerEmail, newPaidThrough) {
  await ensureSchema();
  const db = await getDB();
  await db.run(
    `UPDATE buyer_memberships SET paid_through = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE buyer_email = ?`,
    [newPaidThrough, buyerEmail]
  );
}

export async function cancelMembership(buyerEmail) {
  await ensureSchema();
  const db = await getDB();
  await db.run(
    `UPDATE buyer_memberships SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE buyer_email = ?`,
    [buyerEmail]
  );
}

// ── Purchase entitlements ────────────────────────────────────────────

export async function grantEntitlement(buyerEmail, offerId, creatorHandle, orderId) {
  await ensureSchema();
  const db = await getDB();
  const entitlementId = crypto.randomUUID();
  await db.run(
    `INSERT OR IGNORE INTO purchase_entitlements (entitlement_id, buyer_email, offer_id, creator_handle, order_id) VALUES (?, ?, ?, ?, ?)`,
    [entitlementId, buyerEmail, offerId, creatorHandle, orderId]
  );
  return { entitlementId };
}

export async function hasEntitlement(buyerEmail, offerId) {
  await ensureSchema();
  const db = await getDB();
  const row = await db.get(
    'SELECT entitlement_id FROM purchase_entitlements WHERE buyer_email = ? AND offer_id = ?',
    [buyerEmail, offerId]
  );
  return !!row;
}

export async function getBuyerEntitlements(buyerEmail) {
  await ensureSchema();
  const db = await getDB();
  return db.all(
    'SELECT * FROM purchase_entitlements WHERE buyer_email = ? ORDER BY granted_at DESC',
    [buyerEmail]
  );
}

// ── Plan constants ───────────────────────────────────────────────────

export { PLAN_ID, PLAN_AMOUNT_MINOR, PLAN_CURRENCY };
