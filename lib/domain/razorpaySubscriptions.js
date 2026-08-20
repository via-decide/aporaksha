import Razorpay from 'razorpay';
import { PLAN_AMOUNT_MINOR, PLAN_CURRENCY, PLAN_ID } from './membership.js';

function getRzp() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error('razorpay_not_configured');
  return new Razorpay({ key_id, key_secret });
}

let cachedPlanId = null;

export async function ensureRazorpayPlan() {
  if (cachedPlanId) return cachedPlanId;
  const rzp = getRzp();

  const plans = await rzp.plans.all({ count: 50 });
  const existing = plans.items.find(
    p => p.item?.amount === PLAN_AMOUNT_MINOR &&
         p.item?.currency === PLAN_CURRENCY &&
         p.period === 'monthly' &&
         p.interval === 1
  );

  if (existing) {
    cachedPlanId = existing.id;
    return cachedPlanId;
  }

  const plan = await rzp.plans.create({
    period: 'monthly',
    interval: 1,
    item: {
      name: 'ViaDecide Membership',
      amount: PLAN_AMOUNT_MINOR,
      currency: PLAN_CURRENCY,
      description: 'Monthly membership — access to membership content across all creators',
    },
  });

  cachedPlanId = plan.id;
  return cachedPlanId;
}

export async function createSubscription(buyerEmail) {
  const rzp = getRzp();
  const planId = await ensureRazorpayPlan();

  const subscription = await rzp.subscriptions.create({
    plan_id: planId,
    total_count: 120,
    quantity: 1,
    notes: { buyerEmail, planId: PLAN_ID },
  });

  return {
    subscriptionId: subscription.id,
    shortUrl: subscription.short_url,
    status: subscription.status,
  };
}

export async function cancelSubscription(razorpaySubscriptionId, immediate = false) {
  const rzp = getRzp();
  const result = await rzp.subscriptions.cancel(razorpaySubscriptionId, !immediate);
  return { status: result.status };
}

export async function fetchSubscription(razorpaySubscriptionId) {
  const rzp = getRzp();
  const sub = await rzp.subscriptions.fetch(razorpaySubscriptionId);
  return {
    id: sub.id,
    status: sub.status,
    currentStart: sub.current_start,
    currentEnd: sub.current_end,
    endedAt: sub.ended_at,
    chargeAt: sub.charge_at,
  };
}
