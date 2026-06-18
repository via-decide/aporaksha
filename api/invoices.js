import path from "path";
import fs from "fs";
import { getDB } from "../lib/db.js";
import { initDB } from "../lib/initDb.js";
import { retryPendingPDFs, generateInvoicePDF } from "../lib/invoiceEngine.js";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  await initDB();
  const db = await getDB();

  const { invoice_id, format } = req.query;

  // Single Invoice Lookup
  if (invoice_id) {
    // Try lookup by invoice_id first, then by invoice_number
    let invoice = await db.get("SELECT * FROM invoices WHERE invoice_id = ?", [invoice_id]);
    if (!invoice) {
      invoice = await db.get("SELECT * FROM invoices WHERE invoice_number = ?", [invoice_id]);
    }

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // JSON format requested explicitly
    const acceptHeader = req.headers["accept"] || "";
    if (format === "json" || acceptHeader.includes("application/json")) {
      return res.status(200).json(invoice);
    }

    // Try to regenerate PDF if it was missing/failed during webhook (Error Handling Rule)
    if (!invoice.pdf_path || !fs.existsSync(invoice.pdf_path)) {
      const pdfPath = invoice.pdf_path || path.join("invoices", `${invoice.invoice_number}.pdf`);
      console.log(`[Billing] PDF file not found. Triggering active regeneration for ${invoice.invoice_number}...`);
      try {
        await generateInvoicePDF(invoice, pdfPath);
        if (!invoice.pdf_path) {
          await db.run("UPDATE invoices SET pdf_path = ? WHERE invoice_id = ?", [pdfPath, invoice.invoice_id]);
          // Update order invoice path
          if (invoice.order_id) {
            await db.run("UPDATE orders SET invoice_path = ? WHERE id = ?", [pdfPath, invoice.order_id]);
          }
        }
        // Reload record
        invoice = await db.get("SELECT * FROM invoices WHERE invoice_id = ?", [invoice.invoice_id]);
      } catch (err) {
        console.error(`[Billing] Failed to regenerate PDF on-the-fly for ${invoice.invoice_number}:`, err);
      }
    }

    // Send PDF file
    if (invoice.pdf_path && fs.existsSync(invoice.pdf_path)) {
      const absolutePath = path.resolve(invoice.pdf_path);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${invoice.invoice_number}.pdf"`);
      const fileBuffer = fs.readFileSync(absolutePath);
      return res.status(200).send(fileBuffer);
    } else {
      // PDF still unavailable (e.g. storage error) -> return JSON metadata as fallback
      return res.status(500).json({
        error: "PDF generation failed. Metadata JSON provided.",
        metadata: invoice
      });
    }
  }

  // List All Invoices (Admin View support)
  try {
    const invoices = await db.all("SELECT * FROM invoices ORDER BY created_at DESC");
    return res.status(200).json(invoices);
  } catch (err) {
    return res.status(500).json({ error: "Failed to query invoices", details: err.message });
  }
}
