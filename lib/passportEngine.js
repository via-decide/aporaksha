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
        productName: "Zayvora OS License",
        entitlements: ["zayvora", "zayvora_cli"],
        onboardingSteps: ["Install Guide", "Activation", "Workspace Setup", "First Workflow"],
        downloadLink: "https://daxini.space/downloads/zayvora-os.zip"
      };
    case "daxini_stack":
      return {
        productName: "Daxini Stack PDF/ePub",
        entitlements: ["daxini_stack_reader"],
        onboardingSteps: ["Reader Access", "Companion Links", "Knowledge Trail"],
        downloadLink: "https://daxini.space/downloads/daxini-stack.epub"
      };
    case "forge_access":
      return {
        productName: "LogicHub Forge Access",
        entitlements: ["forge_builder"],
        onboardingSteps: ["Welcome", "Scaffold Project", "Compile & Export"],
        downloadLink: "https://logichub.app/forge"
      };
    case "scaffold":
      return {
        productName: "Production Scaffold",
        entitlements: ["hardened_scaffold_pack"],
        onboardingSteps: ["Download Templates", "Integration Guide"],
        downloadLink: "https://logichub.app/downloads/scaffolds.zip"
      };
    case "arch_audit":
      return {
        productName: "Architecture Audit Service",
        entitlements: ["priority_audit_slot"],
        onboardingSteps: ["Submit Architecture", "Schedule Debugging Session"],
        downloadLink: "https://hanuman.solutions/submit-spec"
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
export async function createOrUpdatePassport({ email, name, orderId, productId, razorpayCustomerId }) {
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
       SET customer_name = ?, order_id = ?, razorpay_customer_id = ?, 
           purchased_products = ?, access_entitlements = ?, onboarding_progress = ?
       WHERE email = ?`,
      [
        customerName,
        orderId || passport.order_id,
        razorpayCustomerId || passport.razorpay_customer_id,
        JSON.stringify(products),
        JSON.stringify(entitlements),
        JSON.stringify(progress),
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
        passport_id, customer_name, email, razorpay_customer_id, order_id, 
        purchased_products, access_entitlements, activation_status, onboarding_progress, support_history
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        passportId,
        customerName,
        email,
        razorpayCustomerId || "N/A",
        orderId || "N/A",
        JSON.stringify(products),
        JSON.stringify(entitlements),
        "activated",
        JSON.stringify(progress),
        JSON.stringify([]) // support history starts empty
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
