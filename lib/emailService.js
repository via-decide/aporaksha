import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const EMAIL_OUT_DIR = "./invoices/emails";

function ensureEmailDir() {
  if (!fs.existsSync(EMAIL_OUT_DIR)) {
    fs.mkdirSync(EMAIL_OUT_DIR, { recursive: true });
  }
}

/**
 * Generate a premium dark-themed HTML template for confirmation emails
 */
function getHtmlTemplate({ customerName, passportId, productName, downloadLink }) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Confirmed & Passport Activated</title>
  <style>
    body {
      background-color: #0b0c10;
      color: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #0b0c10;
      padding: 40px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #121826;
      border: 1px solid #1e293b;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }
    .header {
      background-color: #ff671f;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #120b08;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .content {
      padding: 40px 30px;
      line-height: 1.6;
    }
    .content h2 {
      color: #fff;
      font-size: 20px;
      margin-top: 0;
      font-weight: 700;
    }
    .content p {
      color: #acacac;
      font-size: 15px;
    }
    .passport-box {
      background-color: #0b0c10;
      border: 1px dashed rgba(255, 103, 31, 0.45);
      border-radius: 8px;
      padding: 24px;
      margin: 24px 0;
      text-align: center;
    }
    .passport-label {
      color: #94a3b8;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 8px;
    }
    .passport-id {
      color: #ff671f;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 2px;
      margin: 0;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0 16px;
    }
    .btn {
      display: inline-block;
      background-color: #ff671f;
      color: #120b08;
      font-weight: 700;
      font-size: 15px;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 6px;
      transition: background-color 0.2s;
    }
    .product-meta {
      background-color: rgba(255, 103, 31, 0.04);
      border: 1px solid rgba(255, 103, 31, 0.15);
      border-radius: 6px;
      padding: 16px;
      margin-top: 24px;
    }
    .product-meta table {
      width: 100%;
      border-collapse: collapse;
    }
    .product-meta td {
      padding: 4px 0;
      font-size: 14px;
    }
    .meta-label {
      color: #94a3b8;
      font-weight: 600;
      width: 120px;
    }
    .meta-val {
      color: #fff;
    }
    .footer {
      background-color: #0b0c10;
      padding: 24px 30px;
      text-align: center;
      border-top: 1px solid #1e293b;
    }
    .footer p {
      margin: 4px 0;
      color: #64748b;
      font-size: 12px;
    }
    .footer a {
      color: #ff671f;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1>APORAKSHA</h1>
      </div>
      <div class="content">
        <h2>Welcome to the Sovereign Ecosystem</h2>
        <p>Hello ${customerName},</p>
        <p>Your payment has been successfully verified. Your Aporaksha Customer Passport has been generated and activated, granting you access to the local-first software suite.</p>
        
        <div class="passport-box">
          <div class="passport-label">Sovereign Passport ID</div>
          <div class="passport-id">${passportId}</div>
        </div>

        <p>Keep this Passport ID safe. It is your unique cryptographic identifier across all platforms in our ecosystem, including Zayvora OS, LogicHub, and VIA.</p>
        
        <div class="product-meta">
          <table>
            <tr>
              <td class="meta-label">Item Purchased:</td>
              <td class="meta-val">${productName}</td>
            </tr>
            <tr>
              <td class="meta-label">Access Status:</td>
              <td class="meta-val" style="color:#00e676; font-weight:700;">PROVISIONED</td>
            </tr>
            <tr>
              <td class="meta-label">Deliverable Link:</td>
              <td class="meta-val"><a href="${downloadLink}" style="color:#ff671f; text-decoration:underline;" target="_blank">Download Asset</a></td>
            </tr>
          </table>
        </div>

        <div class="btn-container">
          <a class="btn" href="https://aporaksha.com/passport?pid=${passportId}" target="_blank">Start Your Onboarding</a>
        </div>

        <p style="font-size: 13px; color: #64748b; text-align: center; margin-top: 20px;">
          Note: Your official tax invoice PDF has been attached to this email for your accounting records.
        </p>
      </div>
      <div class="footer">
        <p>Aporaksha sovereign local compute network.</p>
        <p>Direct founder assistance: <a href="mailto:dharam@viadecide.com">dharam@viadecide.com</a></p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send purchase confirmation email.
 * Falls back to local filesystem if SMTP credentials are not configured.
 */
export async function sendDeliveryEmail({ email, customerName, passportId, productName, downloadLink, invoicePath }) {
  ensureEmailDir();

  const subject = `[Aporaksha] Passport ${passportId} Activated - ${productName}`;
  const htmlContent = getHtmlTemplate({ customerName, passportId, productName, downloadLink });

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `"Aporaksha Core" <dharam@viadecide.com>`;

  let sentToSmtp = false;

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
      });

      const attachments = [];
      if (invoicePath && fs.existsSync(invoicePath)) {
        attachments.push({
          filename: path.basename(invoicePath),
          path: invoicePath
        });
      }

      const info = await transporter.sendMail({
        from,
        to: email,
        subject,
        html: htmlContent,
        attachments
      });

      console.log(`[Email] Transactional email sent successfully via SMTP: ${info.messageId}`);
      sentToSmtp = true;
    } catch (smtpErr) {
      console.error("[Email] SMTP sending failed, falling back to mock file:", smtpErr);
    }
  }

  // Always write mock confirmation to filesystem for verification/audit
  const mockFileName = `${passportId}-${Date.now()}.html`;
  const mockPath = path.join(EMAIL_OUT_DIR, mockFileName);
  fs.writeFileSync(mockPath, htmlContent, "utf8");
  console.log(`[Email] Local audit copy generated: ${mockPath}`);

  return {
    success: true,
    sentToSmtp,
    mockPath,
    passportId
  };
}
