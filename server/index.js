const path = require('path');
const express = require('express');
require('dotenv').config();

const razorpayRoutes = require('./routes/razorpay');
const authRoutes = require('../auth/login');
const { authMiddleware } = require('../auth/middleware');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', authRoutes);
app.use('/api', razorpayRoutes);

app.use('/api/protected', authMiddleware);
app.get('/api/protected/me', (req, res) => {
  res.json({ userId: req.userId });
});

app.get('/api/razorpay-config', (req, res) => {
  res.json({ keyId: process.env.RAZORPAY_KEY_ID || '' });
});

app.use(express.static(path.join(__dirname, '..')));

app.listen(port, () => {
  console.log('Aporaksha server running on port', port);
});
