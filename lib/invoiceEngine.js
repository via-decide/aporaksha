import fs from "fs";
import path from "path";
import crypto from "crypto";
import PDFDocument from "pdfkit";
import { getDB } from "./db.js";

const INVOICES_DIR = "./invoices";
const JSON_DIR = "./invoices/json";

// Ensure directories exist
function ensureDirs() {
  if (!fs.existsSync(INVOICES_DIR)) {
    fs.mkdirSync(INVOICES_DIR, { recursive: true });
  }
  if (!fs.existsSync(JSON_DIR)) {
    fs.mkdirSync(JSON_DIR, { recursive: true });
  }
}

/**
 * Get next unique sequential invoice number in the format INV-YYYY-000001
 */
async function getNextInvoiceNumber(db, year) {
  await db.run("INSERT OR IGNORE INTO invoice_sequences (year, last_val) VALUES (?, 0)", [year]);
  await db.run("UPDATE invoice_sequences SET last_val = last_val + 1 WHERE year = ?", [year]);
  const row = await db.get("SELECT last_val FROM invoice_sequences WHERE year = ?", [year]);
  const lastVal = row.last_val;
  return `INV-${year}-${String(lastVal).padStart(6, "0")}`;
}

/**
 * Helper to format price in INR
 */
function formatPrice(amount, currency) {
  const symbol = currency === "INR" ? "Rs. " : "$";
  return `${symbol}${(amount / 100).toFixed(2)}`;
}

/**
 * Generate a professional invoice PDF using pdfkit
 */
export function generateInvoicePDF(invoice, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // Create document without margins initially to allow full-bleed background
      const doc = new PDFDocument({ margin: 0, size: "A4" });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const W = doc.page.width;
      const H = doc.page.height;
      const marginL = 50;

      // 1. Background
      doc.rect(0, 0, W, H).fillColor([10, 10, 10]).fill();

      // 2. Orange Header Bar
      doc.rect(0, 0, W, 108).fillColor([255, 103, 31]).fill();

      // Brand
      doc.fillColor([0, 0, 0]).fontSize(42).font("Helvetica-Bold").text("DECIDE", marginL, 30);
      doc.fontSize(14).font("Helvetica").text("India's Smart Marketplace", marginL, 75);

      // Receipt Title
      doc.fontSize(24).font("Helvetica-Bold").text("ORDER RECEIPT", W - marginL, 35, { align: "right" });
      doc.fontSize(12).font("Helvetica-Bold").fillColor([20, 20, 20]).text("TAX INVOICE", W - marginL, 65, { align: "right" });

      // Calculate SHA256 hash for auditability
      const hashInput = `${invoice.invoice_number}|${invoice.payment_id}|${invoice.amount}|${invoice.created_at}`;
      const txnHash = crypto.createHash('sha256').update(hashInput).digest('hex');

      let y = 140;

      // Left Box: ORDER META
      const boxW = (W / 2) - marginL - 10;
      doc.roundedRect(marginL, y, boxW, 85, 8).fillAndStroke([25, 25, 25], [60, 60, 60]);
      
      doc.fillColor([130, 130, 130]).fontSize(10).font("Helvetica").text("ORDER ID", marginL + 15, y + 15);
      doc.fillColor([255, 103, 31]).fontSize(14).font("Helvetica-Bold").text(invoice.order_id || invoice.invoice_id.substring(0,8), marginL + 15, y + 30);
      
      doc.fillColor([130, 130, 130]).fontSize(10).font("Helvetica").text("DATE & TIME", marginL + 15, y + 55);
      const dateStr = new Date(invoice.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
      doc.fillColor([220, 220, 220]).fontSize(12).font("Helvetica").text(dateStr, marginL + 15, y + 70);

      // Right Box: PAYMENT
      const col2 = (W / 2) + 10;
      doc.roundedRect(col2, y, boxW, 85, 8).fillAndStroke([25, 25, 25], [60, 60, 60]);

      doc.fillColor([130, 130, 130]).fontSize(10).font("Helvetica").text("PAYMENT METHOD", col2 + 15, y + 15);
      doc.fillColor([0, 230, 118]).fontSize(14).font("Helvetica-Bold").text(String(invoice.payment_provider || "UPI").toUpperCase(), col2 + 15, y + 30);

      doc.fillColor([130, 130, 130]).fontSize(10).font("Helvetica").text("PAYMENT ID", col2 + 15, y + 55);
      doc.fillColor([220, 220, 220]).fontSize(12).font("Helvetica").text(invoice.payment_id, col2 + 15, y + 70);

      y += 115;

      // STATUS BANNER
      const sc = [0, 230, 118]; // green for Paid
      doc.roundedRect(marginL, y, W - (marginL * 2), 35, 8)
         .fillOpacity(0.15).fill(sc)
         .fillOpacity(1);
      
      doc.roundedRect(marginL, y, W - (marginL * 2), 35, 8)
         .stroke(sc);
      
      doc.fillColor(sc).fontSize(14).font("Helvetica-Bold").text(`STATUS: ${String(invoice.status || "PAID").toUpperCase()}`, 0, y + 12, { align: "center" });
      
      y += 65;

      // ITEMS TABLE
      doc.fillColor([180, 180, 180]).fontSize(12).font("Helvetica-Bold").text("ITEMS ORDERED", marginL, y);
      y += 20;

      // Header row
      doc.rect(marginL, y, W - (marginL * 2), 25).fillAndStroke([40, 40, 40], [60, 60, 60]);
      doc.fillColor([200, 200, 200]).fontSize(11).font("Helvetica-Bold");
      doc.text("Item", marginL + 10, y + 8, { width: 220 });
      doc.text("Type", W * 0.55, y + 8, { width: 80 });
      doc.text("Qty", W * 0.75, y + 8, { width: 40 });
      doc.text("Price", W - marginL - 10, y + 8, { width: 80, align: "right" });
      y += 25;

      // Single item row
      doc.rect(marginL, y, W - (marginL * 2), 28).fillAndStroke([26, 26, 26], [45, 45, 45]);
      doc.fillColor([240, 240, 240]).fontSize(11).font("Helvetica");
      doc.text(String(invoice.product_name).substring(0, 35), marginL + 10, y + 9, { width: 220 });
      doc.fillColor([160, 160, 160]).text(String(invoice.product_type).toUpperCase(), W * 0.55, y + 9, { width: 80 });
      doc.text("1", W * 0.75, y + 9, { width: 40 });
      doc.fillColor([255, 103, 31]).font("Helvetica-Bold").text(formatPrice(invoice.amount, invoice.currency), W - marginL - 10, y + 9, { width: 80, align: "right" });
      y += 28;

      y += 15;

      // TOTALS
      doc.moveTo(marginL, y).lineTo(W - marginL, y).dash(5, { space: 5 }).strokeColor([180, 100, 30]).stroke();
      doc.undash();
      y += 20;

      doc.fillColor([160, 160, 160]).fontSize(12).font("Helvetica").text("Subtotal", W * 0.55, y);
      doc.text(formatPrice(invoice.amount, invoice.currency), W - marginL - 10, y, { align: "right" });
      y += 20;

      doc.text("Tax / GST (Included)", W * 0.55, y);
      doc.text(formatPrice(invoice.tax_amount, invoice.currency), W - marginL - 10, y, { align: "right" });
      y += 20;

      doc.moveTo(marginL, y).lineTo(W - marginL, y).dash(5, { space: 5 }).strokeColor([180, 100, 30]).stroke();
      doc.undash();
      y += 25;

      doc.fillColor([160, 160, 160]).fontSize(16).font("Helvetica-Bold").text("TOTAL PAID", W * 0.55, y);
      doc.fillColor([255, 103, 31]).text(formatPrice(invoice.total_amount, invoice.currency), W - marginL - 10, y, { align: "right" });
      
      y += 40;

      // AUDIT SECTION
      doc.fillColor([180, 180, 180]).fontSize(12).font("Helvetica-Bold").text("AUDIT TRAIL", marginL, y);
      y += 20;
      doc.fillColor([100, 100, 100]).fontSize(10).font("Helvetica");
      doc.text(`Customer: ${invoice.customer_name} (${invoice.customer_email})`, marginL, y); y += 15;
      doc.text(`Transaction Hash (SHA-256): ${txnHash}`, marginL, y); y += 15;
      doc.text(`GSTIN Reference: 24XXXXX0000X1Z5`, marginL, y); y += 15;
      doc.text(`ISO Timestamp: ${invoice.created_at}`, marginL, y); y += 15;

      // Footer
      y = H - 50;
      doc.rect(0, y, W, 10).fillColor([255, 103, 31]).fill();
      y += 20;
      doc.fillColor([100, 100, 100]).fontSize(9).font("Helvetica").text("DECIDE INDIA • India's Commission-Free Marketplace • decideindia.com", 0, y, { align: "center" });
      doc.fillColor([80, 80, 80]).text(`Generated securely by Decide Ledger • Hash: ${txnHash.substring(0, 16)}`, 0, y + 15, { align: "center" });

      doc.end();

      stream.on("finish", () => resolve(outputPath));
      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Handle successful payment event: Create JSON metadata, generate PDF, store everything and update DB.
 * Returns the created invoice model.
 */
export async function createInvoiceForPayment(paymentPayload) {
  ensureDirs();
  const db = await getDB();

  const entity = paymentPayload?.payload?.payment?.entity;
  if (!entity) {
    throw new Error("Invalid payment payload structure");
  }

  const paymentId = entity.id;
  const orderId = entity.order_id;
  const currency = entity.currency || "INR";
  const totalAmount = entity.amount; // total amount in cents/paise

  // Duplicate protection check
  const existingInvoice = await db.get("SELECT * FROM invoices WHERE payment_id = ?", [paymentId]);
  if (existingInvoice) {
    console.log(`[Billing] Duplicate payment detected. Invoice already exists: ${existingInvoice.invoice_number}`);
    return existingInvoice;
  }

  // Lookup order to extract slug & exact product info
  const order = await db.get("SELECT * FROM orders WHERE id = ?", [orderId]);
  
  const customerEmail = entity.email || order?.email || "customer@email.com";
  
  // Extract customer name from notes or fallback
  let customerName = entity.notes?.customer_name || "Valued Customer";
  if (customerName === "Valued Customer" && customerEmail) {
    // Generate name using email prefix if missing
    const prefix = customerEmail.split("@")[0];
    customerName = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  }

  // Determine product name and type
  let productName = entity.notes?.product_name || entity.description || "Ecosystem Bundle Purchase";
  let productType = entity.notes?.product_type || "product";

  if (order) {
    if (order.article_slug) {
      productName = `Article Access: ${order.article_slug}`;
      productType = "article";
    } else if (order.newsletter_slug) {
      productName = `Newsletter Subscription: ${order.newsletter_slug}`;
      productType = "newsletter";
    }
  }

  // Calculate Tax Amount (Standard 18% inclusive tax unless explicit in notes)
  let taxAmount = 0;
  if (entity.notes?.tax_amount) {
    taxAmount = Math.round(Number(entity.notes.tax_amount));
  } else {
    taxAmount = Math.round(totalAmount - (totalAmount / 1.18));
  }
  const amount = totalAmount - taxAmount; // subtotal

  // Generate unique invoice number
  const createdDate = new Date();
  const year = createdDate.getFullYear();
  const invoiceNumber = await getNextInvoiceNumber(db, year);
  const invoiceId = "inv_" + crypto.randomBytes(8).toString("hex");

  const invoice = {
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    created_at: createdDate.toISOString(),
    payment_id: paymentId,
    order_id: orderId || "N/A",
    customer_name: customerName,
    customer_email: customerEmail,
    product_name: productName,
    product_type: productType,
    currency,
    amount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    payment_provider: "razorpay",
    status: "paid",
    business_name: "LogicHub Billing Engine",
    business_address: "Sovereign Workstation Node, Daxini Stack",
    pdf_path: path.join(INVOICES_DIR, `${invoiceNumber}.pdf`),
    json_path: path.join(JSON_DIR, `${invoiceNumber}.json`),
  };

  // 1. Store JSON file
  fs.writeFileSync(invoice.json_path, JSON.stringify(invoice, null, 2), "utf8");

  // 2. Generate PDF file
  let pdfSuccess = false;
  try {
    await generateInvoicePDF(invoice, invoice.pdf_path);
    pdfSuccess = true;
  } catch (pdfErr) {
    console.error(`[Billing] Failed to generate PDF for ${invoiceNumber}:`, pdfErr);
    // Mark PDF as pending in local system/DB for retry (as per error handling rules)
    invoice.pdf_path = null;
  }

  // 3. Save to database
  await db.run(
    `INSERT INTO invoices (
      invoice_id, invoice_number, created_at, payment_id, order_id, 
      customer_name, customer_email, product_name, product_type, currency, 
      amount, tax_amount, total_amount, payment_provider, status, 
      business_name, business_address, pdf_path, json_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoice.invoice_id, invoice.invoice_number, invoice.created_at, invoice.payment_id, invoice.order_id,
      invoice.customer_name, invoice.customer_email, invoice.product_name, invoice.product_type, invoice.currency,
      invoice.amount, invoice.tax_amount, invoice.total_amount, invoice.payment_provider, invoice.status,
      invoice.business_name, invoice.business_address, invoice.pdf_path, invoice.json_path
    ]
  );

  // 4. Attach invoice path to order
  if (orderId) {
    await db.run("UPDATE orders SET invoice_path = ?, payment_id = ?, status = 'paid', verified = 1 WHERE id = ?", [
      invoice.pdf_path,
      paymentId,
      orderId
    ]);
  }

  // Log successful event
  await db.run(
    "INSERT INTO events (type, payload) VALUES (?, ?)",
    ["invoice_generated", JSON.stringify({ invoice_number: invoiceNumber, payment_id: paymentId, pdf_success: pdfSuccess })]
  );

  return invoice;
}

/**
 * PDF Retry Queue: scan database for missing PDFs and attempt to regenerate them.
 */
export async function retryPendingPDFs() {
  const db = await getDB();
  const pending = await db.all("SELECT * FROM invoices WHERE pdf_path IS NULL OR pdf_path = ''");
  if (pending.length === 0) return;

  console.log(`[Billing] Retrying PDF generation for ${pending.length} invoices...`);
  for (const inv of pending) {
    const pdfPath = path.join(INVOICES_DIR, `${inv.invoice_number}.pdf`);
    try {
      await generateInvoicePDF(inv, pdfPath);
      await db.run("UPDATE invoices SET pdf_path = ? WHERE invoice_id = ?", [pdfPath, inv.invoice_id]);
      
      // Update order as well if path was missing
      if (inv.order_id) {
        await db.run("UPDATE orders SET invoice_path = ? WHERE id = ?", [pdfPath, inv.order_id]);
      }
      
      console.log(`[Billing] Successfully regenerated PDF for ${inv.invoice_number}`);
    } catch (err) {
      console.error(`[Billing] Retry failed for invoice ${inv.invoice_number}:`, err);
    }
  }
}
