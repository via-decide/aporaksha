const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { createClient } = require('redis');
require('dotenv').config();

const razorpayRoutes = require('./routes/razorpay');
const authRoutes = require('../auth/login');
const { authMiddleware } = require('../auth/middleware');

const app = express();
const port = process.env.PORT || 3000;

const isProduction = process.env.NODE_ENV === 'production';

const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
  },
});

redisClient.on('error', (error) => {
  console.error('Redis rate-limit store error:', error.message);
});

redisClient.connect().catch((error) => {
  console.error('Redis connection failed, falling back to memory store:', error.message);
});

const generalLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:general:',
  }),
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later',
});

const authLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
    prefix: 'rl:auth:',
  }),
  standardHeaders: true,
  legacyHeaders: false,
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts, please try again later',
});

app.use((req, res, next) => {
  if (isProduction && req.header('x-forwarded-proto') !== 'https') {
    return res.redirect(301, `https://${req.header('host')}${req.url}`);
  }

  return next();
});

app.use(express.json());
app.use('/api', generalLimiter);
app.use('/api/auth/login', authLimiter);
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
