import { generateInvoicePDF } from "./lib/invoiceEngine.js";
import path from "path";

const dummyInvoice = {
  invoice_number: "INV-2026-000042",
  invoice_id: "inv_abc123def456",
  created_at: new Date().toISOString(),
  payment_id: "pay_xyz987lmnop",
  order_id: "order_1001",
  customer_name: "Alice Blockchain",
  customer_email: "alice@decide.network",
  product_name: "Aporaksha Ecosystem Bundle - Lifetime",
  product_type: "bundle",
  currency: "INR",
  amount: 499900,
  tax_amount: 89982,
  total_amount: 589882,
  payment_provider: "razorpay",
  status: "paid",
  business_name: "DECIDE INDIA",
  business_address: "Gandhidham, Gujarat"
};

async function run() {
  const outputPath = path.join(process.cwd(), "invoices", "test_ondc_invoice.pdf");
  try {
    console.log("Generating ONDC styled PDF...");
    await generateInvoicePDF(dummyInvoice, outputPath);
    console.log("Success! PDF saved to:", outputPath);
  } catch (err) {
    console.error("Error generating PDF:", err);
  }
}

run();
