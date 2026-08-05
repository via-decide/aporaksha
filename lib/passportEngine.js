import { getDB } from "./db.js";
import crypto from "crypto";

/**
 * Generate next sequential Passport ID: PPT-000143
 */
async function getNextPassportId(db) {
  await db.run("INSERT OR IGNORE INTO passport_sequences (id, last_val) VALUES (1, 0)");
  await db.run("UPDATE passport_sequences SET last_val = last_val + 1 WHERE id = 1");
  const row = await db.get("SELECT last_val FROM passport_sequences WHERE id = 1");
  return `PPT-${String(row.last_val).padStart(6, "0")}`;
}

/**
 * Get access entitlements and onboarding flow metadata by product ID
 */
export function getProductMetadata(productId) {
  switch (productId) {
    case "zayvora_os":
      return {
        deliveryNote: "Your Zayvora OS license is active. The installer is not yet published — you will receive the download link directly.",
        ctaLabel: "Open your dashboard",
        deliverable: false,
        productName: "Zayvora OS License",
        entitlements: ["zayvora", "zayvora_cli"],
        onboardingSteps: ["Install Guide", "Activation", "Workspace Setup", "First Workflow"],
        downloadLink: "https://daxini.space/downloads/zayvora-os.zip"
      };
    case "daxini_stack":
      return {
        deliveryNote: "Your Daxini Stack reader access is active. The ePub is not yet published — you will receive it directly.",
        ctaLabel: "Open your dashboard",
        deliverable: false,
        productName: "Daxini Stack PDF/ePub",
        entitlements: ["daxini_stack_reader"],
        onboardingSteps: ["Reader Access", "Companion Links", "Knowledge Trail"],
        downloadLink: "https://daxini.space/downloads/daxini-stack.epub"
      };
    case "forge_access":
      return {
        deliveryNote: "Forge Access is unlocked on your account. Sign in with this email to use it.",
        ctaLabel: "Open Forge",
        deliverable: true,
        productName: "LogicHub Forge Access",
        entitlements: ["forge_builder"],
        onboardingSteps: ["Welcome", "Scaffold Project", "Compile & Export"],
        downloadLink: "https://logichub.app/forge"
      };
    case "scaffold":
      return {
        deliveryNote: "Your Production Scaffold bundle is ready to download.",
        ctaLabel: "Download the scaffolds",
        deliverable: true,
        productName: "Production Scaffold",
        entitlements: ["hardened_scaffold_pack"],
        onboardingSteps: ["Download Templates", "Integration Guide"],
        downloadLink: "https://logichub.app/downloads/scaffolds.zip"
      };
    case "arch_audit":
      return {
        deliveryNote: "Your Website Refinement is booked. Send your site URL and what you want improved through the intake form, and you will get the review within 12 hours.",
        ctaLabel: "Send your site details",
        deliverable: true,
        productName: "Website Refinement",
        entitlements: ["priority_audit_slot"],
        onboardingSteps: ["Send your site URL and goals", "Receive the written review within 12h"],
        downloadLink: "https://hanuman.solutions/intake"
      };
    case "test_product":
      return {
        deliveryNote: "Validation purchase — no deliverable. Used for pipeline checks only.",
        ctaLabel: "Open your dashboard",
        deliverable: false,
        productName: "Validation Product",
        entitlements: ["test_entitlement"],
        onboardingSteps: ["Step 1", "Step 2"],
        downloadLink: "https://aporaksha.com/downloads/test-asset.zip"
      };
    case "digital_architect":
      return {
        deliveryNote: "The full Sovereign Digital Architect bundle is unlocked on your account.",
        ctaLabel: "Open your dashboard",
        deliverable: true,
        productName: "Sovereign Digital Architect Bundle",
        entitlements: ["LogicHub Founder Pass", "Premium OS Features", "Advanced App Modules"],
        onboardingSteps: ["Ecosystem Onboarding", "Founder Setup", "Access Credentials"],
        downloadLink: "https://aporaksha.com/dashboard"
      };
    case "smarttag_lite_single":
      return {
        deliveryNote: "Your SmartTag Lite is queued for production. Setup instructions are on the product page; tracking follows by email once it ships.",
        ctaLabel: "Setup instructions",
        deliverable: true,
        productName: "SmartTag Lite — Single",
        entitlements: ["smarttag_lite", "nfc_dashboard"],
        onboardingSteps: ["Order Confirmed", "Shipping Update", "NFC Setup Guide"],
        downloadLink: "https://viadecide.com/printbydd-store/smarttag-lite"
      };
    case "smarttag_lite_bulk":
      return {
        deliveryNote: "Your SmartTag Lite 5-pack is queued for production. Setup instructions are on the product page; tracking follows by email once it ships.",
        ctaLabel: "Setup instructions",
        deliverable: true,
        productName: "SmartTag Lite — Bulk (5-pack)",
        entitlements: ["smarttag_lite", "smarttag_bulk", "nfc_dashboard"],
        onboardingSteps: ["Order Confirmed", "Shipping Update", "Bulk NFC Setup"],
        downloadLink: "https://viadecide.com/printbydd-store/smarttag-lite"
      };
    default:
      return {
        productName: "Ecosystem Item",
        entitlements: ["ecosystem_general"],
        onboardingSteps: ["Welcome", "System Setup", "Ecosystem Access"],
        downloadLink: "https://aporaksha.com/dashboard"
      };
  }
}

/**
 * Create or update a Customer Passport upon payment completion
 */
export async function createOrUpdatePassport({ email, name, orderId, razorpaySubscriptionId, productId, razorpayCustomerId, country, timezone, locale }) {
  const db = await getDB();
  const meta = getProductMetadata(productId);

  // Normalize name
  let customerName = name || "Valued Builder";
  if (customerName === "Valued Builder" && email) {
    const prefix = email.split("@")[0];
    customerName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }

  // Check if passport already exists for email
  let passport = await db.get("SELECT * FROM passports WHERE email = ?", [email]);

  if (passport) {
    // Already exists — update list of products & entitlements
    let products = [];
    let entitlements = [];
    let progress = {};

    try {
      products = JSON.parse(passport.purchased_products || "[]");
      entitlements = JSON.parse(passport.access_entitlements || "[]");
      progress = JSON.parse(passport.onboarding_progress || "{}");
    } catch (e) {
      console.error("Failed to parse passport JSON fields:", e);
    }

    if (!products.includes(meta.productName)) {
      products.push(meta.productName);
    }
    
    meta.entitlements.forEach(ent => {
      if (!entitlements.includes(ent)) {
        entitlements.push(ent);
      }
    });

    // Merge onboarding steps if new
    progress[productId] = {
      steps: meta.onboardingSteps,
      completedSteps: [],
      status: "pending",
      updated_at: new Date().toISOString()
    };

    await db.run(
      `UPDATE passports 
       SET customer_name = ?, order_id = ?, razorpay_subscription_id = ?, billing_status = ?, razorpay_customer_id = ?, 
           purchased_products = ?, access_entitlements = ?, onboarding_progress = ?,
           country = COALESCE(?, country), timezone = COALESCE(?, timezone), locale = COALESCE(?, locale)
       WHERE email = ?`,
      [
        customerName,
        orderId || passport.order_id,
        razorpaySubscriptionId || passport.razorpay_subscription_id,
        (razorpaySubscriptionId ? 'ACTIVE' : (orderId ? 'ACTIVE' : passport.billing_status)),
        razorpayCustomerId || passport.razorpay_customer_id,
        JSON.stringify(products),
        JSON.stringify(entitlements),
        JSON.stringify(progress),
        country || null,
        timezone || null,
        locale || null,
        email
      ]
    );

    passport = await db.get("SELECT * FROM passports WHERE email = ?", [email]);
    console.log(`[Passport] Updated customer passport: ${passport.passport_id}`);
    
    // Log event
    await db.run(
      "INSERT INTO events (type, payload) VALUES (?, ?)",
      ["passport_updated", JSON.stringify({ passport_id: passport.passport_id, email, product: meta.productName })]
    );
  } else {
    // Generate new sequential ID
    const passportId = await getNextPassportId(db);
    const products = [meta.productName];
    const entitlements = meta.entitlements;
    
    const progress = {};
    progress[productId] = {
      steps: meta.onboardingSteps,
      completedSteps: [],
      status: "pending",
      updated_at: new Date().toISOString()
    };

    await db.run(
      `INSERT INTO passports (
        passport_id, customer_name, email, razorpay_customer_id, order_id, razorpay_subscription_id, billing_status,
        purchased_products, access_entitlements, activation_status, onboarding_progress, support_history,
        country, timezone, locale, auth_depth
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        passportId,
        customerName,
        email,
        razorpayCustomerId || "N/A",
        orderId || "N/A",
        razorpaySubscriptionId || null,
        (razorpaySubscriptionId || orderId) ? 'ACTIVE' : 'PENDING',
        JSON.stringify(products),
        JSON.stringify(entitlements),
        "activated",
        JSON.stringify(progress),
        JSON.stringify([]),
        country || null,
        timezone || null,
        locale || null,
        1
      ]
    );

    passport = await db.get("SELECT * FROM passports WHERE passport_id = ?", [passportId]);
    console.log(`[Passport] Created customer passport: ${passportId} for ${email}`);
    
    // Log event
    await db.run(
      "INSERT INTO events (type, payload) VALUES (?, ?)",
      ["passport_created", JSON.stringify({ passport_id: passportId, email, product: meta.productName })]
    );
  }

  return passport;
}

/**
 * Revoke passport entitlements when a refund is processed
 */
export async function revokePassportEntitlements({ email, productId }) {
  const db = await getDB();
  const meta = getProductMetadata(productId);
  const passport = await db.get("SELECT * FROM passports WHERE email = ?", [email]);
  if (!passport) return null;

  let products = [];
  let entitlements = [];
  let progress = {};

  try {
    products = JSON.parse(passport.purchased_products || "[]");
    entitlements = JSON.parse(passport.access_entitlements || "[]");
    progress = JSON.parse(passport.onboarding_progress || "{}");
  } catch (e) {
    console.error("Failed to parse passport JSON fields on revoke:", e);
  }

  // Remove the product name
  products = products.filter(p => p !== meta.productName);
  
  // Remove the entitlements
  meta.entitlements.forEach(ent => {
    entitlements = entitlements.filter(e => e !== ent);
  });

  // Mark onboarding status as revoked
  if (progress[productId]) {
    progress[productId].status = "revoked";
    progress[productId].updated_at = new Date().toISOString();
  }

  await db.run(
    `UPDATE passports 
     SET purchased_products = ?, access_entitlements = ?, onboarding_progress = ?
     WHERE email = ?`,
    [
      JSON.stringify(products),
      JSON.stringify(entitlements),
      JSON.stringify(progress),
      email
    ]
  );

  await db.run(
    "INSERT INTO events (type, payload) VALUES (?, ?)",
    ["passport_revoked", JSON.stringify({ passport_id: passport.passport_id, email, product: meta.productName })]
  );

  return await db.get("SELECT * FROM passports WHERE email = ?", [email]);
}

let mockHealthFailure = false;
export function setMockHealthFailure(value) {
  mockHealthFailure = value;
}

/**
 * Check health of the passport system / DB
 */
export async function checkHealth() {
  if (mockHealthFailure) {
    console.log("[Passport Health Mock] Simulating DB offline");
    return false;
  }
  try {
    const db = await getDB();
    // Simple query to ensure DB is responsive
    const row = await db.get("SELECT 1 AS ok");
    return row && row.ok === 1;
  } catch (error) {
    console.error("[Passport Health] DB check failed:", error);
    return false;
  }
}
