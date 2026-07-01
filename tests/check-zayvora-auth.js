import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for terminal log formatting
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function logStep(msg) {
  console.log(`\n${colors.blue}${colors.bold}➔ ${msg}${colors.reset}`);
}

function logPass(msg) {
  console.log(`  ${colors.green}✓ PASS: ${msg}${colors.reset}`);
}

function logFail(msg) {
  console.log(`  ${colors.red}✗ FAIL: ${msg}${colors.reset}`);
  process.exit(1);
}

// Secret keys for local testing
const TEST_SECRET = 'zayvora_dev_access_secret';
process.env.SECRET_KEY = TEST_SECRET;

// Helper to sign JWT standard tokens (Aporaksha standard)
function signJWT(payload, secret) {
  const base64url = (input) => Buffer.from(input).toString('base64url');
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

// Generate tokens for test users
const userA = { id: 'usr_test_a', email: 'user_a@test.com' };
const userB = { id: 'usr_test_b', email: 'user_b@test.com' };

const tokenA = signJWT({
  userId: userA.id,
  email: userA.email,
  role: 'user',
  ecosystem_uid: userA.email,
  jti: 'jti_test_a',
  type: 'access',
  exp: Math.floor(Date.now() / 1000) + 3600
}, TEST_SECRET);

const tokenB = signJWT({
  userId: userB.id,
  email: userB.email,
  role: 'user',
  ecosystem_uid: userB.email,
  jti: 'jti_test_b',
  type: 'access',
  exp: Math.floor(Date.now() / 1000) + 3600
}, TEST_SECRET);

const invalidToken = signJWT({
  userId: userA.id,
  email: userA.email,
  type: 'access',
  exp: Math.floor(Date.now() / 1000) + 3600
}, 'wrong_secret_123');

// Custom Ports for Isolated Verification
const TERMINAL_PORT = 18080;
const LOGICHUB_PORT = 17001;

async function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test production crash on default/missing secrets
async function testProductionSecretCheck() {
  logStep('Testing Fail-Secure Production Secret Check...');

  const terminalPath = path.resolve(__dirname, '../../api/server.js');
  const logichubPath = path.resolve(__dirname, '../../LogicHub/apps/sovereign-api/server.js');

  const verifyProcessExit = (serverPath, envOverrides) => {
    return new Promise((resolve) => {
      const serverProcess = spawn('node', [serverPath], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: 19999, // dummy port
          ...envOverrides
        },
        stdio: 'ignore'
      });
      
      const timeoutId = setTimeout(() => {
        serverProcess.kill();
        resolve({ crashed: false }); // didn't crash within 1.5 seconds
      }, 1500);

      serverProcess.on('exit', (code) => {
        clearTimeout(timeoutId);
        resolve({ crashed: code !== 0 && code !== null, code });
      });
    });
  };

  // Test Zayvora Terminal server with default secret key
  const terminalResult = await verifyProcessExit(terminalPath, { SECRET_KEY: 'zayvora_dev_access_secret' });
  if (terminalResult.crashed) {
    logPass('Zayvora Terminal server correctly failed to start in production mode with default secret');
  } else {
    logFail('Zayvora Terminal server security bypass! Started in production mode with default secret');
  }

  // Test LogicHub server with missing secret key
  const logichubResult = await verifyProcessExit(logichubPath, { SECRET_KEY: 'zayvora_dev_access_secret' });
  if (logichubResult.crashed) {
    logPass('LogicHub server correctly failed to start in production mode with default secret');
  } else {
    logFail('LogicHub server security bypass! Started in production mode with default secret');
  }
}

async function runSuite() {
  // Run production crash tests first
  await testProductionSecretCheck();

  console.log(`\n${colors.yellow}${colors.bold}==============================================`);
  console.log(`    ZAYVORA SECURITY INTEGRATION TEST SUITE     `);
  console.log(`==============================================${colors.reset}\n`);

  logStep('Starting Zayvora Terminal server and LogicHub Sovereign server...');

  const terminalPath = path.resolve(__dirname, '../../api/server.js');
  const logichubPath = path.resolve(__dirname, '../../LogicHub/apps/sovereign-api/server.js');

  const env = { ...process.env, SECRET_KEY: TEST_SECRET, NODE_ENV: 'test' };

  const terminalProcess = spawn('node', [terminalPath], {
    env: { ...env, PORT: TERMINAL_PORT },
    stdio: 'inherit'
  });

  const logichubProcess = spawn('node', [logichubPath], {
    env: { ...env, PORT: LOGICHUB_PORT },
    stdio: 'inherit'
  });

  // Wait 1.5 seconds for servers to initialize
  await waitMs(1500);

  let passed = true;

  try {
    // -------------------------------------------------------------
    // 1. Test Zayvora Terminal Authentication Endpoints
    // -------------------------------------------------------------
    logStep('Testing Zayvora Terminal Endpoint Security (Port 18080)...');

    const terminalEndpoints = [
      '/api/zayvora/execute',
      '/api/zayvora/plan',
      '/api/zayvora/synthesize',
      '/api/zayvora/verify',
      '/api/zayvora/chat'
    ];

    for (const endpoint of terminalEndpoints) {
      // A. Unauthenticated Request
      const resUnauth = await fetch(`http://localhost:${TERMINAL_PORT}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test', thread: 't1', message: 'test' })
      });

      if (resUnauth.status === 401) {
        logPass(`Unauthenticated request blocked correctly for ${endpoint} (401)`);
      } else {
        logFail(`Security bypass! Unauthenticated request to ${endpoint} returned status ${resUnauth.status}`);
      }

      // B. Invalid Token Request
      const resInvalid = await fetch(`http://localhost:${TERMINAL_PORT}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${invalidToken}`
        },
        body: JSON.stringify({ prompt: 'test', thread: 't1', message: 'test' })
      });

      if (resInvalid.status === 401) {
        logPass(`Invalid token request blocked correctly for ${endpoint} (401)`);
      } else {
        logFail(`Security bypass! Invalid token request to ${endpoint} returned status ${resInvalid.status}`);
      }
    }

    // -------------------------------------------------------------
    // 2. Test Zayvora Multi-Tenant Session Isolation
    // -------------------------------------------------------------
    logStep('Testing Zayvora Chat Multi-Tenant Session Isolation...');

    const threadId = 'shared_thread_123';

    // A. User A sends a message to threadId
    const sendResA = await fetch(`http://localhost:${TERMINAL_PORT}/api/zayvora/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        thread: threadId,
        message: '[UserA] Hello from User A'
      })
    });

    if (sendResA.ok) {
      logPass('User A sent message successfully');
    } else {
      logFail(`Failed to send message for User A: ${sendResA.status}`);
    }

    // B. User B requests raw messages for the SAME threadId
    const getResB = await fetch(`http://localhost:${TERMINAL_PORT}/api/zayvora/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenB}`
      },
      body: JSON.stringify({
        thread: threadId,
        action: 'raw'
      })
    });

    if (getResB.ok) {
      const bodyB = await getResB.json();
      const messagesB = bodyB.messages || [];
      
      // Since User B is isolated, they should NOT see User A's message.
      const hasUserAMessage = messagesB.some(m => m.content && m.content.includes('Hello from User A'));
      if (!hasUserAMessage) {
        logPass(`Session Isolation Success: User B cannot view User A's messages in thread "${threadId}"`);
      } else {
        logFail(`Security leakage! User B was able to view User A's thread history: ${JSON.stringify(messagesB)}`);
      }
    } else {
      logFail(`User B query failed with status ${getResB.status}`);
    }

    // C. User A requests raw messages for threadId
    const getResA = await fetch(`http://localhost:${TERMINAL_PORT}/api/zayvora/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        thread: threadId,
        action: 'raw'
      })
    });

    if (getResA.ok) {
      const bodyA = await getResA.json();
      const messagesA = bodyA.messages || [];
      const hasUserAMessage = messagesA.some(m => m.content && m.content.includes('Hello from User A'));
      if (hasUserAMessage) {
        logPass('Session Isolation Success: User A can read their own message thread history');
      } else {
        logFail('Self-retrieval failed: User A could not view their own message thread history');
      }
    } else {
      logFail(`User A query failed with status ${getResA.status}`);
    }

    // -------------------------------------------------------------
    // 3. Test LRU Cache Capacity & Idle Eviction
    // -------------------------------------------------------------
    logStep('Testing Zayvora Chat LRU Cache Capacity Eviction...');

    // Since Cache Limit is 500, we write messages to 505 threads: t_1 to t_505.
    // This should evict t_1 to t_5 (oldest).
    console.log('  Generating 505 distinct thread requests...');
    for (let i = 1; i <= 505; i++) {
      await fetch(`http://localhost:${TERMINAL_PORT}/api/zayvora/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenA}`
        },
        body: JSON.stringify({
          thread: `t_${i}`,
          message: `Msg in thread ${i}`
        })
      });
    }

    // Query t_1 thread history -> should have been evicted (meaning when requested, it resets/initializes back to system role only, length = 1)
    const resEvicted = await fetch(`http://localhost:${TERMINAL_PORT}/api/zayvora/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        thread: 't_1',
        action: 'raw'
      })
    });

    if (resEvicted.ok) {
      const bodyEv = await resEvicted.json();
      const messagesEv = bodyEv.messages || [];
      // Thread got evicted, so t_1 was initialized from scratch, message length is 1 (system only).
      if (messagesEv.length === 1) {
        logPass('LRU cache capacity limit enforced: oldest thread t_1 evicted correctly');
      } else {
        logFail(`LRU capacity limit failed! Thread t_1 was not evicted. Length: ${messagesEv.length}`);
      }
    } else {
      logFail(`Eviction check query failed with status ${resEvicted.status}`);
    }

    // Query t_505 thread history -> should exist with 2 messages (system + user msg)
    const resActive = await fetch(`http://localhost:${TERMINAL_PORT}/api/zayvora/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        thread: 't_505',
        action: 'raw'
      })
    });

    if (resActive.ok) {
      const bodyAct = await resActive.json();
      const messagesAct = bodyAct.messages || [];
      // system msg + sent message + simulated ACK
      if (messagesAct.length >= 2) {
        logPass('LRU cache active thread t_505 preserved correctly');
      } else {
        logFail(`LRU active thread check failed! Thread t_505 had message size: ${messagesAct.length}`);
      }
    } else {
      logFail(`Active check query failed with status ${resActive.status}`);
    }

    // -------------------------------------------------------------
    // 4. Test Access Token Logout Blacklist / Revocation Flow
    // -------------------------------------------------------------
    logStep('Testing Access Token Logout Blacklisting...');

    const testEmail = `user_${crypto.randomBytes(4).toString('hex')}@test.com`;
    const testPassword = 'SecurePassword123!'; // conforms to requirements

    // A. Sign up new test user
    const signupRes = await fetch(`http://localhost:${TERMINAL_PORT}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });

    if (signupRes.status === 201) {
      logPass(`Signed up user "${testEmail}" successfully`);
    } else {
      const signupErr = await signupRes.text();
      logFail(`Signup failed! Status: ${signupRes.status}, Body: ${signupErr}`);
    }

    // B. Login
    const loginRes = await fetch(`http://localhost:${TERMINAL_PORT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });

    let logoutToken;
    let logoutRefreshToken;

    if (loginRes.ok) {
      const loginBody = await loginRes.json();
      logoutToken = loginBody.accessToken;
      logoutRefreshToken = loginBody.refreshToken;
      logPass('Logged in successfully, tokens generated');
    } else {
      logFail(`Login failed! Status: ${loginRes.status}`);
    }

    // C. Make request with active token (should pass auth)
    const executeBeforeLogout = await fetch(`http://localhost:${TERMINAL_PORT}/api/zayvora/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${logoutToken}`
      },
      body: JSON.stringify({ prompt: 'test' })
    });

    if (executeBeforeLogout.status !== 401) {
      logPass('Authorized API call bypassed 401 gate successfully before logout');
    } else {
      logFail(`Authorized API call blocked with 401 before logout. Status: ${executeBeforeLogout.status}`);
    }

    // D. Logout / Revoke token
    const logoutRes = await fetch(`http://localhost:${TERMINAL_PORT}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${logoutToken}`
      },
      body: JSON.stringify({ refreshToken: logoutRefreshToken })
    });

    if (logoutRes.ok) {
      logPass('Logout API completed successfully, token blacklisted');
    } else {
      const errText = await logoutRes.text();
      logFail(`Logout API failed! Status: ${logoutRes.status}, Body: ${errText}`);
    }

    // E. Make request with same token (should be blocked with 401)
    const executeAfterLogout = await fetch(`http://localhost:${TERMINAL_PORT}/api/zayvora/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${logoutToken}`
      },
      body: JSON.stringify({ prompt: 'test' })
    });

    if (executeAfterLogout.status === 401) {
      logPass('Revoked token blocked correctly: returned 401 Unauthorized after logout');
    } else {
      logFail(`Security bypass! Revoked token accessed endpoint after logout with status ${executeAfterLogout.status}`);
    }

    // -------------------------------------------------------------
    // 5. Test LogicHub Sovereign Server Endpoints
    // -------------------------------------------------------------
    logStep('Testing LogicHub Sovereign Server Endpoint Security (Port 17001)...');

    const logichubEndpoints = [
      '/api/zayvora/plan',
      '/api/zayvora/synthesize',
      '/api/zayvora/verify',
      '/v1/vibecode'
    ];

    for (const endpoint of logichubEndpoints) {
      const requestBody = JSON.stringify({ prompt: 'test', intent: 'test' });

      // A. Unauthenticated Request
      const resUnauth = await fetch(`http://localhost:${LOGICHUB_PORT}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody
      });

      if (resUnauth.status === 401) {
        logPass(`Unauthenticated request blocked correctly for ${endpoint} (401)`);
      } else {
        logFail(`Security bypass! Unauthenticated request to ${endpoint} returned status ${resUnauth.status}`);
      }

      // B. Invalid Token Request
      const resInvalid = await fetch(`http://localhost:${LOGICHUB_PORT}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${invalidToken}`
        },
        body: requestBody
      });

      if (resInvalid.status === 401) {
        logPass(`Invalid token request blocked correctly for ${endpoint} (401)`);
      } else {
        logFail(`Security bypass! Invalid token request to ${endpoint} returned status ${resInvalid.status}`);
      }

      // C. Valid Token Request (Auth validation verification only - since services might not be online, check that we get past 401)
      const resValid = await fetch(`http://localhost:${LOGICHUB_PORT}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenA}`
        },
        body: requestBody
      });

      if (resValid.status !== 401) {
        logPass(`Authentication verified: Authorized token for ${endpoint} bypassed 401 gate (Status: ${resValid.status})`);
      } else {
        logFail(`Authentication failed: Valid token returned 401 on ${endpoint}`);
      }
    }

  } catch (error) {
    console.error('Test Execution Error:', error);
    passed = false;
  } finally {
    logStep('Tearing down test server instances...');
    terminalProcess.kill();
    logichubProcess.kill();
    await waitMs(500);
    console.log('\nServers shut down successfully.');
  }

  if (passed) {
    console.log(`\n${colors.green}${colors.bold}✔ ALL SECURITY ASSERTS PASSED SUCCESSFULLY!${colors.reset}\n`);
  } else {
    logFail('Some assertions failed.');
  }
}

runSuite().catch(console.error);
