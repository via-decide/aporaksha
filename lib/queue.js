import { getDB } from "./db.js";
import { logEvent } from "./logger.js";
import { createInvoiceForPayment } from "./invoiceEngine.js";
import { createOrUpdatePassport, getProductMetadata } from "./passportEngine.js";
import { sendDeliveryEmail } from "./emailService.js";


const queue = [];
let draining = false;

export function enqueue(task) {
  queue.push({ task, retries: 0 });
  void processQueue();
}

export async function processQueue() {
  if (draining) return;
  draining = true;

  while (queue.length > 0) {
    const item = queue[0];

    try {
      await item.task();
      queue.shift();
    } catch (err) {
      item.retries += 1;
      if (item.retries > 3) {
        console.error("Failed permanently:", err);
        queue.shift();
      }
    }
  }

  draining = false;
}

export async function processWebhookEvent(eventId) {
  const db = await getDB();
  const event = await db.get("SELECT * FROM webhook_events WHERE id = ?", [eventId]);
  if (!event || event.processing_state === "PROCESSED") return;
  try {
    await db.run("UPDATE webhook_events SET processing_state = 'PROCESSING', processing_attempts = processing_attempts + 1 WHERE id = ?", [eventId]);
    const payload = JSON.parse(event.payload_json || "{}");
    await logEvent("razorpay_webhook_received", { eventId, eventType: event.event_type, payloadId: payload?.id || null });

    const eventType = event.event_type;
    let paymentEntity = null;
    let orderEntity = null;
    let paymentLinkEntity = null;

    if (payload?.payload) {
      paymentEntity = payload.payload.payment?.entity;
      orderEntity = payload.payload.order?.entity;
      paymentLinkEntity = payload.payload.payment_link?.entity;
    }

    if (eventType === 'payment.captured' || eventType === 'order.paid' || eventType === 'payment_link.paid') {
      const paymentId = paymentEntity?.id;
      const orderId = paymentEntity?.order_id || orderEntity?.id || paymentLinkEntity?.id || paymentId;
      const amount = paymentEntity?.amount || orderEntity?.amount || paymentLinkEntity?.amount || 0;
      const currency = paymentEntity?.currency || orderEntity?.currency || paymentLinkEntity?.currency || 'INR';

      const notes = paymentEntity?.notes || orderEntity?.notes || paymentLinkEntity?.notes || {};
      const email = paymentEntity?.email || notes.customer_email || notes.email || '';
      const userId = notes.user_id || notes.customer_id || '';
      const productId = notes.product_id || '';
      const articleSlug = notes.article_slug || '';
      const newsletterSlug = notes.newsletter_slug || '';

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const expiresAtStr = expiresAt.toISOString();

      if (orderId) {
        const existingOrder = await db.get("SELECT * FROM orders WHERE id = ?", [orderId]);
        if (existingOrder) {
          await db.run(
            `UPDATE orders 
             SET status = 'paid', payment_id = ?, verified = 1, expires_at = ?
             WHERE id = ?`,
            [paymentId, expiresAtStr, orderId]
          );
          await logEvent("payment_processed_webhook", {
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            email: existingOrder.email || email,
            product_id: productId,
            status: "updated"
          });
        } else {
          await db.run(
            `INSERT INTO orders (id, amount, currency, status, payment_id, verified, email, user_id, article_slug, newsletter_slug, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [orderId, amount, currency, 'paid', paymentId, 1, email, userId, articleSlug, newsletterSlug, expiresAtStr]
          );
          await logEvent("payment_processed_webhook", {
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            email: email,
            product_id: productId,
            status: "inserted"
          });
        }

        await db.run(
          `INSERT INTO events (type, payload) VALUES (?, ?)`,
          ['payment_completed', JSON.stringify({ 
            razorpay_order_id: orderId, 
            razorpay_payment_id: paymentId, 
            product_id: productId, 
            user_id: userId,
            email: email,
            article_slug: articleSlug,
            newsletter_slug: newsletterSlug,
            source: 'webhook'
          })]
        );

        // 1. Generate the Invoice PDF & DB records
        let invoice = null;
        try {
          invoice = await createInvoiceForPayment(payload);
          console.log(`[Billing] Generated Invoice: ${invoice.invoice_number}`);
        } catch (invErr) {
          console.error("[Billing] Failed to generate invoice in queue worker:", invErr);
        }

        // 2. Generate/Update the Customer Passport
        let passport = null;
        try {
          passport = await createOrUpdatePassport({
            email: email,
            name: paymentEntity?.notes?.customer_name || orderEntity?.notes?.customer_name || paymentLinkEntity?.notes?.customer_name || "",
            orderId: orderId,
            productId: productId,
            razorpayCustomerId: paymentEntity?.customer_id || ""
          });
          console.log(`[Passport] Assigned Passport ID: ${passport.passport_id}`);
        } catch (passErr) {
          console.error("[Passport] Failed to generate passport in queue worker:", passErr);
        }

        // 3. Send Delivery & Onboarding Email
        if (passport && invoice) {
          try {
            const meta = getProductMetadata(productId);
            await sendDeliveryEmail({
              email: email,
              customerName: passport.customer_name,
              passportId: passport.passport_id,
              productName: meta.productName,
              downloadLink: meta.downloadLink,
              invoicePath: invoice.pdf_path
            });
            console.log(`[Email] Onboarding and delivery email dispatched to ${email}`);
          } catch (emailErr) {
            console.error("[Email] Failed to send delivery email:", emailErr);
          }
        }
      }
    }

    await db.run("UPDATE webhook_events SET processing_state = 'PROCESSED', processed_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?", [eventId]);
  } catch (error) {
    await db.run("UPDATE webhook_events SET processing_state = 'FAILED', last_error = ? WHERE id = ?", [error?.message || "unknown", eventId]);
    console.error(JSON.stringify({ provider: "razorpay", type: "worker_error", eventId, error: error?.message || "unknown", ts: new Date().toISOString() }));
    throw error;
  }
}
