const path = require('path');
const express = require('express');
require('dotenv').config();

const razorpayRoutes = require('./routes/razorpay');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', razorpayRoutes);

app.get('/api/razorpay-config', (req, res) => {
  res.json({ keyId: process.env.RAZORPAY_KEY_ID || '' });
});

app.use(express.static(path.join(__dirname, '..')));

app.listen(port, () => {
  console.log('Aporaksha server running on port', port);
});
