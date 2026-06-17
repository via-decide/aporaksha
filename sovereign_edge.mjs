import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables for local emulator
if (fs.existsSync(path.join(__dirname, '.env.production'))) {
    dotenv.config({ path: path.join(__dirname, '.env.production') });
} else if (fs.existsSync(path.join(__dirname, '.env'))) {
    dotenv.config({ path: path.join(__dirname, '.env') });
}

process.env.SOVEREIGN_EDGE = 'true';



const app = express();
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

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Dynamic Vercel Serverless Function Emulator
app.use('/api', async (req, res) => {
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
