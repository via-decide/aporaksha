import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import Razorpay from 'razorpay';

// Mock Razorpay SDK to prevent network requests in tests
Object.defineProperty(Razorpay.prototype, 'orders', {
  set(val) {
    this._orders = {
      create: async function(options) {
        return {
          id: 'order_' + crypto.randomBytes(8).toString('hex'),
          amount: options.amount,
          currency: options.currency,
          receipt: options.receipt,
          notes: options.notes
        };
      }
    };
  },
  get() {
    return this._orders;
  },
  configurable: true
});

// 1. Configure test environment variables BEFORE importing core modules
const DB_PATH = './data.test.db';
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
}

delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
delete process.env.SMTP_PORT;

process.env.APORAKSHA_DB_PATH = DB_PATH;
process.env.RAZORPAY_KEY_ID = 'rzp_test_key_id';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_key_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'rzp_test_webhook_secret';
process.env.SECRET_KEY = 'test_passport_access_secret';
process.env.ALLOW_LOCAL_EMAIL = 'true';
process.env.NODE_ENV = 'development';

// Import handlers & helper functions
import { getDB } from '../lib/db.js';
import { initDB } from '../lib/initDb.js';
import { getProductMetadata } from '../lib/passportEngine.js';

// Setup colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function logStep(msg) {
  console.log(`${colors.blue}${colors.bold}➔ ${msg}${colors.reset}`);
}

function logPass(msg) {
  console.log(`  ${colors.green}✓ PASS: ${msg}${colors.reset}`);
}

function logFail(msg) {
  console.log(`  ${colors.red}✗ FAIL: ${msg}${colors.reset}`);
  process.exit(1);
}

// Helper to sign JWT tokens for client requests
function signJWT(payload, secret) {
  const base64url = (input) => Buffer.from(input).toString("base64url");
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

// Generate valid JWT
const testUser = { id: 'usr_test123', email: 'architect@zayvora.space' };
const validToken = signJWT({
  userId: testUser.id,
  email: testUser.email,
  exp: Math.floor(Date.now() / 1000) + 3600
}, process.env.SECRET_KEY);

// Helper to mock request/response pairs for Vercel handler execution
function mockReqRes(options = {}) {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    }
  };
  const req = {
    method: 'POST',
    headers: {},
    body: {},
    ...options
  };
  return { req, res };
}

// Helper to mock Vercel stream-based webhook handler request
function mockWebhookReqRes(rawBody, headers = {}) {
  const req = Readable.from([rawBody]);
  req.method = 'POST';
  req.headers = headers;
  
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    }
  };

  return { req, res };
}

async function runTests() {
  console.log(`\n${colors.yellow}${colors.bold}==============================================`);
  console.log(`    APORAKSHA COMMERCE VALIDATION TASK ENGINE    `);
  console.log(`==============================================${colors.reset}\n`);

  const { default: createOrderHandler } = await import('../api/payments/create-order.js');
  const { default: verifyPaymentHandler } = await import('../api/payments/verify.js');
  const { default: webhookHandler } = await import('../api/webhooks/razorpay.js');
  const { default: verifyPassportHandler } = await import('../api/passport/verify.js');
  const passportEngine = await import('../lib/passportEngine.js');

  // Initialize DB
  await initDB();
  const db = await getDB();

  // -------------------------------------------------------------
  // PHASE 10: GEO-FENCING VALIDATION
  // -------------------------------------------------------------
  logStep("Phase 10 — Geo-Fencing Validation");
  
  // 1. Test Blocked Country (CN)
  {
    const { req, res } = mockReqRes({
      headers: {
        'x-vercel-ip-country': 'CN',
        'authorization': `Bearer ${validToken}`
      },
      body: {
        product_id: 'test_product',
        email: testUser.email
      }
    });
    await createOrderHandler(req, res);
    if (res.statusCode === 403 && res.body.code === 'GEO_BLOCKED') {
      logPass("Blocked country denied correctly (CN)");
    } else {
      logFail(`Blocked country not blocked. Code: ${res.statusCode}, Body: ${JSON.stringify(res.body)}`);
    }
  }

  // 2. Test Allowed Country (IN)
  let testOrderId;
  {
    const { req, res } = mockReqRes({
      headers: {
        'x-vercel-ip-country': 'IN',
        'authorization': `Bearer ${validToken}`
      },
      body: {
        product_id: 'test_product',
        email: testUser.email
      }
    });
    await createOrderHandler(req, res);
    if (res.statusCode === 200 && res.body.order_id) {
      testOrderId = res.body.order_id;
      logPass(`Allowed country accepted (IN). Order ID: ${testOrderId}`);
    } else {
      logFail(`Allowed country rejected. Code: ${res.statusCode}, Body: ${JSON.stringify(res.body)}`);
    }
  }

  // -------------------------------------------------------------
  // PHASE 11: AUTH-DOWN PROTECTION
  // -------------------------------------------------------------
  logStep("Phase 11 — Auth-Down Protection");
  
  // Mock DB Check failure (simulate database offline)
  passportEngine.setMockHealthFailure(true);

  {
    const { req, res } = mockReqRes({
      headers: {
        'x-vercel-ip-country': 'IN',
        'authorization': `Bearer ${validToken}`
      },
      body: {
        product_id: 'test_product',
        email: testUser.email
      }
    });
    await createOrderHandler(req, res);
    if (res.statusCode === 503) {
      logPass("Checkout blocked correctly when identity infrastructure (Passport DB) is offline.");
    } else {
      logFail(`Checkout not blocked when DB was offline. Code: ${res.statusCode}`);
    }
  }

  // Restore health check
  passportEngine.setMockHealthFailure(false);

  // -------------------------------------------------------------
  // PHASE 1: PAYMENT VALIDATION (Order verification)
  // -------------------------------------------------------------
  logStep("Phase 1 — Payment Validation");

  const testPaymentId = 'pay_' + crypto.randomBytes(8).toString('hex');
  const testSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${testOrderId}|${testPaymentId}`)
    .digest('hex');

  // Verify successful signature verification
  {
    const { req, res } = mockReqRes({
      headers: {
        'authorization': `Bearer ${validToken}`,
        'origin': 'https://aporaksha.com'
      },
      body: {
        razorpay_order_id: testOrderId,
        razorpay_payment_id: testPaymentId,
        razorpay_signature: testSignature,
        product_id: 'test_product',
        email: testUser.email
      }
    });
    await verifyPaymentHandler(req, res);
    if (res.statusCode === 200 && res.body.success) {
      logPass("Payment signature verified and logged successfully.");
    } else {
      logFail(`Payment signature verification failed. Code: ${res.statusCode}`);
    }
  }

  // Verify Duplicate Payment Protection (Verify signature fails/ignored if trying to verify order twice)
  {
    const orderBefore = await db.get("SELECT * FROM orders WHERE id = ?", [testOrderId]);
    // Try inserting again
    try {
      await db.run(
        `INSERT INTO orders (id, amount, currency, status, payment_id, verified, email, user_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [testOrderId, 0, 'INR', 'paid', testPaymentId, 1, testUser.email, testUser.id]
      );
      logFail("Duplicate payment protection in SQLite failed. Primary key conflict allowed duplicate insert.");
    } catch (err) {
      logPass("Duplicate payment protection prevents identical orders at DB level.");
    }
  }

  // -------------------------------------------------------------
  // PHASE 2-7: FULFILLMENT & SERVICE PROVISIONING
  // -------------------------------------------------------------
  logStep("Phase 2 to 7 — Fulfillment & Provisioning");

  // Construct mock Razorpay payment.captured webhook payload
  const webhookEventId = 'evt_' + crypto.randomBytes(8).toString('hex');
  const webhookPayload = {
    id: webhookEventId,
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: testPaymentId,
          order_id: testOrderId,
          amount: 100, // paise
          currency: 'INR',
          email: testUser.email,
          notes: {
            product_id: 'test_product',
            product_name: 'Validation Product',
            customer_name: 'Architect Dharam',
            country: 'IN',
            timezone: 'Asia/Kolkata',
            locale: 'en-IN'
          }
        }
      }
    }
  };

  const webhookRawBody = JSON.stringify(webhookPayload);
  const webhookSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(webhookRawBody)
    .digest('hex');

  // Deliver webhook
  {
    const { req, res } = mockWebhookReqRes(webhookRawBody, {
      'x-razorpay-signature': webhookSignature,
      'x-razorpay-event-id': webhookEventId
    });

    await webhookHandler(req, res);
    if (res.statusCode === 200 && res.body.ok) {
      logPass("Razorpay webhook delivery accepted and queued.");
    } else {
      logFail(`Webhook delivery failed. Code: ${res.statusCode}`);
    }
  }

  // Verify Invoice (Phase 2)
  const invoice = await db.get("SELECT * FROM invoices WHERE order_id = ?", [testOrderId]);
  if (invoice) {
    if (invoice.customer_name === 'Architect Dharam' && invoice.customer_email === testUser.email && invoice.product_name === 'Validation Product') {
      logPass("Phase 2: Invoice generated automatically with correct customer and order details.");
    } else {
      logFail(`Invoice details incorrect: ${JSON.stringify(invoice)}`);
    }

    if (fs.existsSync(invoice.pdf_path)) {
      logPass("Phase 2: Invoice PDF created successfully on disk.");
    } else {
      logFail(`Invoice PDF missing on disk path: ${invoice.pdf_path}`);
    }
  } else {
    logFail("No invoice record found in DB after webhook execution.");
  }

  // Verify Email (Phase 3)
  const passportForEmail = await db.get("SELECT * FROM passports WHERE email = ?", [testUser.email]);
  const emailDir = './invoices/emails';
  const emailFiles = fs.readdirSync(emailDir);
  const userEmailFile = emailFiles.find(file => file.includes(testUser.email) || (passportForEmail && file.includes(passportForEmail.passport_id)));
  if (userEmailFile) {
    const emailHtml = fs.readFileSync(path.join(emailDir, userEmailFile), 'utf8');
    logPass("Phase 3: Delivery email successfully generated.");

    // Verify Onboarding link embedded (Phase 5)
    if (emailHtml.includes(`https://aporaksha.com/passport?pid=${passportForEmail?.passport_id}`)) {
      logPass("Phase 5: Onboarding link generated and embedded in delivery email.");
    } else {
      logFail("Onboarding link missing or incorrect in email HTML.");
    }

    // Verify Download link exists (Phase 4)
    const meta = getProductMetadata('test_product');
    if (emailHtml.includes(meta.downloadLink)) {
      logPass("Phase 4: Correct product download link embedded in delivery email.");
    } else {
      logFail("Download link missing or incorrect in email HTML.");
    }
  } else {
    logFail("No delivery email HTML file found in local output directory.");
  }

  // Verify Passport & Entitlement assignment (Phase 6 & 7)
  const passport = await db.get("SELECT * FROM passports WHERE email = ?", [testUser.email]);
  if (passport) {
    logPass(`Phase 6: Passport record created correctly in DB (Passport ID: ${passport.passport_id}).`);
    
    const entitlements = JSON.parse(passport.access_entitlements);
    if (entitlements.includes('test_entitlement')) {
      logPass("Phase 7: Entitlement 'test_entitlement' successfully provisioned to Passport.");
    } else {
      logFail(`Passport entitlements missing provisioned access. Has: ${JSON.stringify(entitlements)}`);
    }

    // Query Passport verification endpoint to ensure LogicHub can verify this user
    {
      const { req, res } = mockReqRes({
        method: 'GET',
        query: { email: testUser.email }
      });
      await verifyPassportHandler(req, res);
      if (res.statusCode === 200 && res.body.hasAccess && res.body.passport_id === passport.passport_id) {
        logPass("Phase 7: Ecosystem verification endpoint returned correct authorization.");
      } else {
        logFail(`Ecosystem verification endpoint failed. Result: ${JSON.stringify(res.body)}`);
      }
    }
  } else {
    logFail("Passport missing from database.");
  }

  // Verify Duplicate Webhook Protection
  {
    // Try delivering the exact same webhook event again
    const { req, res } = mockWebhookReqRes(webhookRawBody, {
      'x-razorpay-signature': webhookSignature,
      'x-razorpay-event-id': webhookEventId
    });
    await webhookHandler(req, res);
    // Double check that we only have 1 invoice for this order
    const count = await db.get("SELECT COUNT(*) as count FROM invoices WHERE order_id = ?", [testOrderId]);
    if (count.count === 1) {
      logPass("Duplicate payment webhook processed safely without generating a second invoice.");
    } else {
      logFail(`Duplicate webhook created duplicate invoices! Count: ${count.count}`);
    }
  }

  // -------------------------------------------------------------
  // PHASE 8: REFUND VALIDATION
  // -------------------------------------------------------------
  logStep("Phase 8 — Refund Validation");

  const refundWebhookEventId = 'evt_ref_' + crypto.randomBytes(8).toString('hex');
  const refundWebhookPayload = {
    id: refundWebhookEventId,
    event: 'payment.refunded',
    payload: {
      payment: {
        entity: {
          id: testPaymentId,
          order_id: testOrderId
        }
      },
      refund: {
        entity: {
          id: 'rfnd_' + crypto.randomBytes(8).toString('hex'),
          payment_id: testPaymentId,
          amount: 100
        }
      }
    }
  };

  const refundRawBody = JSON.stringify(refundWebhookPayload);
  const refundSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(refundRawBody)
    .digest('hex');

  // Deliver refund webhook
  {
    const { req, res } = mockWebhookReqRes(refundRawBody, {
      'x-razorpay-signature': refundSignature,
      'x-razorpay-event-id': refundWebhookEventId
    });

    await webhookHandler(req, res);
    if (res.statusCode === 200 && res.body.ok) {
      logPass("Refund webhook delivered and processed successfully.");
    } else {
      logFail(`Refund webhook processing failed. Code: ${res.statusCode}`);
    }
  }

  // Verify Entitlement and Product Revocation
  const refundedPassport = await db.get("SELECT * FROM passports WHERE email = ?", [testUser.email]);
  const refundedProducts = JSON.parse(refundedPassport.purchased_products);
  const refundedEntitlements = JSON.parse(refundedPassport.access_entitlements);
  const refundedOrder = await db.get("SELECT * FROM orders WHERE id = ?", [testOrderId]);

  if (refundedOrder.status === 'refunded') {
    logPass("Refund updates order status to 'refunded'.");
  } else {
    logFail(`Refunded order status not updated. Has: ${refundedOrder.status}`);
  }

  if (!refundedProducts.includes('Validation Product') && !refundedEntitlements.includes('test_entitlement')) {
    logPass("Refund successfully removes entitlements and products from the Passport.");
  } else {
    logFail(`Refund did not remove access. Purchased: ${JSON.stringify(refundedProducts)}, Entitlements: ${JSON.stringify(refundedEntitlements)}`);
  }

  // Verify Audit Trail for refund
  const refundEvent = await db.get("SELECT * FROM events WHERE type = 'refund_completed'");
  if (refundEvent) {
    logPass("Refund completion recorded in audit events log.");
  } else {
    logFail("Refund completion audit event missing.");
  }

  // Verify Customer notification (Refund email)
  const refundEmailFiles = fs.readdirSync(emailDir).filter(file => file.startsWith('refund'));
  if (refundEmailFiles.length > 0) {
    logPass("Refund confirmation email generated successfully.");
  } else {
    logFail("Refund confirmation email not generated.");
  }

  // -------------------------------------------------------------
  // PHASE 9: FAILED PAYMENT VALIDATION
  // -------------------------------------------------------------
  logStep("Phase 9 — Failed Payment Validation");

  const failedWebhookEventId = 'evt_fail_' + crypto.randomBytes(8).toString('hex');
  const failedWebhookPayload = {
    id: failedWebhookEventId,
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: 'pay_fail_' + crypto.randomBytes(8).toString('hex'),
          order_id: 'order_fail_' + crypto.randomBytes(8).toString('hex'),
          amount: 100,
          currency: 'INR',
          email: 'failed_buyer@gmail.com'
        }
      }
    }
  };

  const failedRawBody = JSON.stringify(failedWebhookPayload);
  const failedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(failedRawBody)
    .digest('hex');

  // Deliver failed payment webhook
  {
    const { req, res } = mockWebhookReqRes(failedRawBody, {
      'x-razorpay-signature': failedSignature,
      'x-razorpay-event-id': failedWebhookEventId
    });

    await webhookHandler(req, res);
    
    // Assert no orders/invoices/passports were created for failed payment email
    const failedOrder = await db.get("SELECT * FROM orders WHERE email = 'failed_buyer@gmail.com'");
    const failedInvoice = await db.get("SELECT * FROM invoices WHERE customer_email = 'failed_buyer@gmail.com'");
    const failedPassport = await db.get("SELECT * FROM passports WHERE email = 'failed_buyer@gmail.com'");

    if (!failedOrder && !failedInvoice && !failedPassport) {
      logPass("Failed payments create zero customer database records or access entitlements.");
    } else {
      logFail("Failed payment incorrectly generated customer records or entitlements!");
    }
  }

  console.log(`\n${colors.green}${colors.bold}==============================================`);
  console.log(`      ALL 11 PHASES SUCCESSFULLY VALIDATED      `);
  console.log(`==============================================${colors.reset}\n`);

  // Cleanup test database file
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }
}

runTests().catch(err => {
  console.error("Test execution aborted:", err);
  process.exit(1);
});
