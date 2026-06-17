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
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // --- Color Palette ---
      const primaryColor = "#0f172a"; // slate-900
      const secondaryColor = "#475569"; // slate-600
      const lightGrey = "#f8fafc"; // slate-50
      const borderGrey = "#e2e8f0"; // slate-200

      // --- Header (Grid) ---
      doc.fillColor(primaryColor).fontSize(20).font("Helvetica-Bold").text(invoice.business_name, 50, 50);
      doc.fontSize(9).font("Helvetica").fillColor(secondaryColor);
      
      // Split business address lines
      const addrLines = invoice.business_address.split(", ");
      let headerY = 75;
      addrLines.forEach((line) => {
        doc.text(line, 50, headerY);
        headerY += 12;
      });

      // Invoice metadata on top-right
      doc.fillColor(primaryColor).fontSize(20).font("Helvetica-Bold").text("INVOICE", 400, 50, { align: "right" });
      doc.fontSize(9).font("Helvetica-Bold").fillColor(secondaryColor);
      doc.text(`Invoice No: ${invoice.invoice_number}`, 400, 75, { align: "right" });
      const formattedDate = new Date(invoice.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      doc.font("Helvetica").text(`Date: ${formattedDate}`, 400, 89, { align: "right" });

      doc.moveDown(3);

      // Horizontal Divider
      doc.strokeColor(borderGrey).lineWidth(1).moveTo(50, 140).lineTo(545, 140).stroke();

      // --- Customer Section ---
      let clientY = 160;
      doc.fillColor(primaryColor).fontSize(10).font("Helvetica-Bold").text("BILLED TO:", 50, clientY);
      doc.fontSize(12).font("Helvetica-Bold").text(invoice.customer_name, 50, clientY + 15);
      doc.fontSize(10).font("Helvetica").fillColor(secondaryColor).text(invoice.customer_email, 50, clientY + 30);

      // Payment Details (Right Column)
      doc.fillColor(primaryColor).fontSize(10).font("Helvetica-Bold").text("PAYMENT METHOD:", 350, clientY);
      doc.fontSize(10).font("Helvetica").fillColor(secondaryColor).text(`Provider: ${invoice.payment_provider.toUpperCase()}`, 350, clientY + 15);
      doc.text(`Payment ID: ${invoice.payment_id}`, 350, clientY + 30);

      doc.moveDown(4);

      // --- Purchase Section (Table) ---
      let tableY = 240;
      // Header Row Background
      doc.fillColor(lightGrey).rect(50, tableY, 495, 22).fill();
      
      // Header Text
      doc.fillColor(primaryColor).fontSize(9).font("Helvetica-Bold");
      doc.text("Product Details", 60, tableY + 6, { width: 220 });
      doc.text("Type", 280, tableY + 6, { width: 80 });
      doc.text("Qty", 370, tableY + 6, { width: 30, align: "center" });
      doc.text("Unit Price", 410, tableY + 6, { width: 60, align: "right" });
      doc.text("Total", 480, tableY + 6, { width: 55, align: "right" });

      // Table Row
      let rowY = tableY + 22;
      doc.fillColor(primaryColor).fontSize(10).font("Helvetica");
      doc.text(invoice.product_name, 60, rowY + 10, { width: 220 });
      doc.fontSize(9).fillColor(secondaryColor).text(invoice.product_type.toUpperCase(), 280, rowY + 10, { width: 80 });
      doc.fillColor(primaryColor).text("1", 370, rowY + 10, { width: 30, align: "center" });
      doc.text(formatPrice(invoice.amount, invoice.currency), 410, rowY + 10, { width: 60, align: "right" });
      doc.font("Helvetica-Bold").text(formatPrice(invoice.amount, invoice.currency), 480, rowY + 10, { width: 55, align: "right" });

      // Row divider
      doc.strokeColor(borderGrey).lineWidth(0.5).moveTo(50, rowY + 32).lineTo(545, rowY + 32).stroke();

      // --- Summary Section ---
      let summaryY = rowY + 50;
      doc.fontSize(10).font("Helvetica").fillColor(secondaryColor);
      
      doc.text("Subtotal:", 350, summaryY, { width: 100, align: "right" });
      doc.fillColor(primaryColor).text(formatPrice(invoice.amount, invoice.currency), 460, summaryY, { width: 85, align: "right" });
      
      doc.fillColor(secondaryColor).text("Tax (18% included):", 350, summaryY + 18, { width: 100, align: "right" });
      doc.fillColor(primaryColor).text(formatPrice(invoice.tax_amount, invoice.currency), 460, summaryY + 18, { width: 85, align: "right" });
      
      // Total divider
      doc.strokeColor(borderGrey).lineWidth(0.5).moveTo(380, summaryY + 34).lineTo(545, summaryY + 34).stroke();

      doc.fontSize(12).font("Helvetica-Bold").fillColor(primaryColor);
      doc.text("Grand Total:", 350, summaryY + 42, { width: 100, align: "right" });
      doc.text(formatPrice(invoice.total_amount, invoice.currency), 460, summaryY + 42, { width: 85, align: "right" });

      // --- Footer ---
      doc.fontSize(9).font("Helvetica").fillColor(secondaryColor);
      doc.text("Thank you for your purchase.", 50, 700, { align: "center", width: 495 });
      doc.fontSize(8).fillColor("#94a3b8"); // slate-400
      doc.text("Generated automatically by LogicHub Billing Engine.", 50, 715, { align: "center", width: 495 });

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
