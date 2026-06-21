const express = require('express');
const { pgPool } = require('../../lib/tenantSafeDb.js');

const router = express.Router();

/**
 * GET /api/tokens/balance
 * Returns the immutable dual-ledger token balance for the authenticated user.
 */
router.get('/tokens/balance', async (req, res) => {
  let client;
  try {
    // In a real app, this comes from req.user set by auth middleware
    const customerId = req.headers['x-tenant-id'] || 'tenant-12345';

    client = await pgPool.connect();
    // Simulate setting session variable to match TenantSafeDatabase concept if needed
    // await client.query(\`SET LOCAL app.current_tenant = '\${customerId}'\`);
    
    const result = await client.query(
      `SELECT balance_z_tokens FROM token_balance_current WHERE customer_id = $1`,
      [customerId]
    );

    const balance = result.rows[0]?.balance_z_tokens || 10000; // fallback default
    
    res.json({
      success: true,
      data: {
        total: balance,
        available: balance,
        deployed: 0
      }
    });

  } catch (error) {
    console.error('[Token API] Balance fetch failed:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /api/synthesize
 * Initiates an SSE stream for Code Synthesis
 * Simulates the Cloudflare Worker optimistic token deduction stream.
 */
router.post('/synthesize', async (req, res) => {
  const customerId = req.headers['x-tenant-id'] || 'tenant-12345';
  
  // Set headers for Server-Sent Events (SSE)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Fetch starting balance to simulate the edge deduction
  let currentBalance = 10000;
  let client;
  try {
    client = await pgPool.connect();
    const result = await client.query(
      `SELECT balance_z_tokens FROM token_balance_current WHERE customer_id = $1`,
      [customerId]
    );
    if (result.rows[0]) currentBalance = result.rows[0].balance_z_tokens;
  } catch (e) {
    console.error('[Token API] DB connection failed, using dummy balance.');
  } finally {
    if (client) client.release();
  }

  const prompt = req.body?.prompt || 'No prompt provided';
  let tokensUsed = 0;
  
  const interval = setInterval(() => {
    // Simulate generation chunks
    const costPerChunk = 25; // tokens deducted per chunk
    
    if (currentBalance <= 0) {
      clearInterval(interval);
      // Engage Kill-Switch
      res.write(`data: [ZAYVORA_ERR: INSUFFICIENT_FUNDS_HALTING_DEPLOYMENT]\n\n`);
      res.end();
      return;
    }

    currentBalance -= costPerChunk;
    tokensUsed += costPerChunk;

    const mockCodeChunk = `// Synthesizing logic based on: ${prompt.slice(0,10)}...\n`;
    
    res.write(`data: ${JSON.stringify({ 
      chunk: mockCodeChunk, 
      tokensUsed, 
      currentLedger: currentBalance 
    })}\n\n`);

    // Simulate completion after 500 tokens
    if (tokensUsed >= 500) {
      clearInterval(interval);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }, 200);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

module.exports = router;
