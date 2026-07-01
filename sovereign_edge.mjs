import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import dns from 'dns';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const lastHits = new Map(); // ip -> timestamp
const ipReputation = new Map(); // ip -> threat_score

function hashIP(ip) {
    if (!ip) return 'unknown';
    return crypto.createHash('sha256').update(ip + 'zv-salt').digest('hex').substring(0, 12);
}

function tarpitResponse(res, status, payload) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = status;
    setTimeout(() => {
        res.end(JSON.stringify(payload));
    }, 12000);
}

function logThreatEvent(rootDir, event) {
    const logPath = path.join(rootDir, 'logs/security_events.json');
    try {
        if (!fs.existsSync(path.dirname(logPath))) {
            fs.mkdirSync(path.dirname(logPath), { recursive: true });
        }
        let existing = [];
        if (fs.existsSync(logPath)) {
            try {
                const raw = fs.readFileSync(logPath, 'utf8');
                existing = raw ? JSON.parse(raw) : [];
            } catch {
                existing = [];
            }
        }
        existing.push(event);
        fs.writeFileSync(logPath, JSON.stringify(existing, null, 2), 'utf8');
    } catch (err) {
        console.error(`[SECURITY] Local threat logging failure: ${err.message}`);
    }
}

async function verifySearchBot(ip, userAgent) {
    const ua = (userAgent || '').toLowerCase();
    const isGoogle = ua.includes('googlebot');
    const isBing = ua.includes('bingbot');
    const isYandex = ua.includes('yandexbot');
    const isBaidu = ua.includes('baiduspider');
    if (!isGoogle && !isBing && !isYandex && !isBaidu) return true;
    return new Promise((resolve) => {
        dns.reverse(ip, (err, hostnames) => {
            if (err || !hostnames || hostnames.length === 0) return resolve(false);
            const host = hostnames[0].toLowerCase();
            let isValid = false;
            if (isGoogle && (host.endsWith('.googlebot.com') || host.endsWith('.google.com'))) isValid = true;
            if (isBing && host.endsWith('.search.msn.com')) isValid = true;
            if (isYandex && (host.endsWith('.yandex.ru') || host.endsWith('.yandex.net') || host.endsWith('.yandex.com'))) isValid = true;
            if (isBaidu && (host.endsWith('.baidu.com') || host.endsWith('.baidu.jp'))) isValid = true;
            if (!isValid) return resolve(false);
            dns.lookup(hostnames[0], (lookupErr, resolvedIp) => {
                if (lookupErr || resolvedIp !== ip) return resolve(false);
                resolve(true);
            });
        });
    });
}

// Load environment variables for local emulator
if (fs.existsSync(path.join(__dirname, '.env.production'))) {
    dotenv.config({ path: path.join(__dirname, '.env.production') });
} else if (fs.existsSync(path.join(__dirname, '.env'))) {
    dotenv.config({ path: path.join(__dirname, '.env') });
}

process.env.SOVEREIGN_EDGE = 'true';



const app = express();
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Ecosystem-Uid');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));
app.use(express.urlencoded({
    extended: true,
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));

app.use(async (req, res, next) => {
    const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
    const ua = req.headers['user-agent'] || '';
    let risk = 0;
    const headlessKeywords = [/headless/i, /puppeteer/i, /selenium/i, /playwright/i, /phantomjs/i];
    if (headlessKeywords.some(p => p.test(ua))) risk += 0.6;
    const criticalHeaders = ['accept', 'accept-encoding', 'accept-language'];
    criticalHeaders.forEach(h => {
        if (!req.headers[h]) risk += 0.15;
    });
    const botLibs = [/python-requests/i, /curl/i, /scrapy/i, /axios/i, /got/i];
    if (botLibs.some(p => p.test(ua))) risk += 0.4;
    const isClaimsBrowser = /mozilla|chrome|safari|firefox/i.test(ua);
    const hasSecFetch = !!(req.headers['sec-fetch-site'] || req.headers['sec-fetch-mode']);
    if (isClaimsBrowser && !hasSecFetch && !/bot|crawler|spider/i.test(ua)) risk += 0.45;
    if (req.httpVersion === '1.0') risk += 0.3;
    const isBotVerified = await verifySearchBot(ip, ua);
    if (!isBotVerified) risk = 1.0;
    let currentReputation = ipReputation.get(ip) || 0;
    if (risk > 0.4) {
        currentReputation = Math.min(1.0, currentReputation + 0.25);
    } else {
        currentReputation = Math.max(0, currentReputation - 0.02);
    }
    ipReputation.set(ip, currentReputation);
    let timeDelta = null;
    const now = Date.now();
    if (lastHits.has(ip)) timeDelta = now - lastHits.get(ip);
    lastHits.set(ip, now);
    if (lastHits.size > 1000) lastHits.delete(lastHits.keys().next().value);
    if (risk > 0.1 || currentReputation > 0.3) {
        logThreatEvent(__dirname, {
            timestamp: new Date().toISOString(),
            ip: ip,
            threat_score: parseFloat(risk.toFixed(2)),
            reputation_score: parseFloat(currentReputation.toFixed(2)),
            classification: risk > 0.5 ? 'malicious' : 'suspicious',
            path_accessed: req.path,
            agent: ua,
            headers_keys: Object.keys(req.headers || {}),
            cf_country: req.headers['cf-ipcountry'] || null,
            cf_ray: req.headers['cf-ray'] || null,
            cf_ja3: req.headers['cf-ja3-sig'] || null,
            http_version: req.httpVersion || null,
            time_delta_ms: timeDelta
        });
    }
    if (risk > 0.5 || currentReputation > 0.7) {
        const pathname = req.path.toLowerCase();
        let status = 403;
        let payload = {
            error: "Access Restriction",
            reason: "Anomalous footprint detected.",
            trace_id: Math.random().toString(36).substring(7)
        };
        if (pathname.includes('models') || pathname.includes('internal') || pathname.includes('env') || pathname.includes('config')) {
            status = 200;
            payload = { cpu_load: "31.2%", memory: "1024MB", status: "degraded_mirror", decoy_active: true };
        }
        return tarpitResponse(res, status, payload);
    }
    next();
});

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Dynamic Vercel Serverless Function Emulator
app.use('/api', async (req, res) => {
    const country = req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || 'US';
    req.headers['x-pricing-region'] = country === 'IN' ? 'IN' : 'GLOBAL';
    
    let reqPath = req.path;
    
    // Support dynamic parameter mapping for /api/invoices/:invoice_id
    const invoiceMatch = req.path.match(/^\/invoices\/([a-zA-Z0-9_.-]+)$/);
    if (invoiceMatch) {
        reqPath = '/invoices';
        req.query = { ...req.query, invoice_id: invoiceMatch[1] };
    }

    let funcPath = path.join(__dirname, 'api', reqPath);
    
    if (fs.existsSync(funcPath) && fs.statSync(funcPath).isDirectory()) {
        funcPath = path.join(funcPath, 'index.js');
    } else if (!funcPath.endsWith('.js')) {
        funcPath += '.js';
    }

    if (fs.existsSync(funcPath)) {
        try {
            // Bypass Node's module cache for dynamic dev reload (optional)
            const cacheBust = `?update=${Date.now()}`;
            const module = await import('file://' + funcPath + cacheBust);
            const handler = module.default || module;
            
            // Execute the serverless handler
            await handler(req, res);
        } catch (e) {
            console.error(`[API ERROR] ${req.path}:`, e);
            res.status(500).json({ error: 'Internal Server Error', details: e.message });
        }
    } else {
        res.status(404).json({ error: 'Function not found' });
    }
});

// Fallback for SPA routing (React/Next.js client-side routing)
app.use((req, res) => {
    if (fs.existsSync(path.join(__dirname, 'index.html'))) {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else {
        res.status(404).send('Not Found');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`[SOVEREIGN EDGE] Running autonomously on port ${PORT}`);
});
