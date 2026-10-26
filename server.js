require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const Message = require('./models/Message');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/waha_whatsapp';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

// Security Middlewares
app.use(helmet()); // Sets secure HTTP headers
app.use(cors());

// Rate Limiter: General routes (200 requests per 15 minutes)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(generalLimiter);

// Rate Limiter: Webhook endpoint (Allows up to 150 messages per minute from WAHA)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Webhook rate limit exceeded.' },
});

// Support large payloads (in case WAHA forwards base64 audio/media)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// -------------------------------------------------------------
// AUTHENTICATION MIDDLEWARES
// -------------------------------------------------------------

// 1. Verify Webhook Secret (Ensures only your WAHA server can post data)
const verifyWebhookSecret = (req, res, next) => {
  if (!WEBHOOK_SECRET) {
    // If user hasn't set WEBHOOK_SECRET yet, allow request with a warning
    return next();
  }

  const incomingSecret =
    req.headers['x-api-key'] ||
    (req.headers['authorization'] && req.headers['authorization'].replace('Bearer ', '')) ||
    req.query.secret;

  if (incomingSecret !== WEBHOOK_SECRET) {
    console.warn('⛔ Unauthorized webhook attempt blocked!');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing webhook secret token.',
    });
  }

  next();
};

// 2. Verify Admin API Key (Ensures only you can view stored messages)
const verifyAdminKey = (req, res, next) => {
  if (!ADMIN_API_KEY) {
    // If user hasn't set ADMIN_API_KEY yet, allow request with a warning
    return next();
  }

  const incomingKey =
    req.headers['x-api-key'] ||
    req.query.apiKey ||
    req.query.key;

  if (incomingKey !== ADMIN_API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing admin API key. Provide ?key=YOUR_KEY or x-api-key header.',
    });
  }

  next();
};


// MongoDB Connection
let isMongoConnected = false;

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isMongoConnected = true;
    console.log('✅ Connected to MongoDB successfully');
  } catch (err) {
    isMongoConnected = false;
    console.error('❌ MongoDB connection error:', err.message);
    console.log('⚠️ Server is running. Will retry connecting to MongoDB in 10s...');
    setTimeout(connectDB, 10000);
  }
};

mongoose.connection.on('disconnected', () => {
  isMongoConnected = false;
  console.warn('⚠️ MongoDB disconnected.');
});

mongoose.connection.on('connected', () => {
  isMongoConnected = true;
  console.log('✅ MongoDB connected/reconnected.');
});

// Start DB connection
connectDB();

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

// Root Endpoint - Quick status & documentation
app.get('/', (req, res) => {
  res.json({
    name: 'WAHA WhatsApp Webhook API',
    status: 'online',
    healthCheck: '/health',
    webhookEndpoint: '/webhook',
    recentMessages: '/messages',
    timestamp: new Date().toISOString(),
  });
});

// 1. Health Check Endpoint (Required for Render & Monitoring)
app.get(['/health', '/api/health'], (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const isHealthy = dbState === 1;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatusMap[dbState] || 'unknown',
      isConnected: isHealthy,
    },
    timestamp: new Date().toISOString(),
  });
});

// 2. Webhook GET check (helpful when testing endpoint in browser)
app.get(['/webhook', '/api/webhook'], (req, res) => {
  res.json({
    status: 'active',
    message: 'Webhook endpoint is active! Send WAHA POST requests here.',
    method: 'POST',
    endpoint: '/webhook',
  });
});

// Helper to extract clean phone number
const extractPhone = (payload) => {
  // 1. WhatsApp phone number in remoteJidAlt (e.g. 916204878067@s.whatsapp.net)
  const alt = payload?._data?.key?.remoteJidAlt;
  if (alt && typeof alt === 'string' && alt.includes('@')) {
    return alt.split('@')[0];
  }

  // 2. Standard WhatsApp ID (e.g. 916204878067@c.us)
  const from = payload?.from || payload?._data?.key?.remoteJid || '';
  if (from && typeof from === 'string' && !from.endsWith('@lid') && from.includes('@')) {
    return from.split('@')[0];
  }

  if (alt) return String(alt).replace(/[^0-9]/g, '');
  if (from) return String(from).split('@')[0];
  return 'unknown';
};

// Helper to extract message text
const extractMessageText = (payload) => {
  return (
    payload?.body ||
    payload?.text ||
    payload?._data?.message?.conversation ||
    payload?._data?.message?.extendedTextMessage?.text ||
    ''
  );
};

// 3. Webhook POST Endpoint - Receives messages from WAHA (Protected with Rate Limit & Webhook Secret)
app.post(['/webhook', '/api/webhook'], webhookLimiter, verifyWebhookSecret, async (req, res) => {
  // Acknowledge receipt to WAHA immediately
  res.status(200).json({ success: true, message: 'Webhook received' });

  try {
    const raw = req.body || {};
    const event = raw.event || 'message';

    // Ignore delivery status / ack events (only save actual messages)
    if (event === 'message.ack') {
      return;
    }

    const payload = raw.payload || raw;

    // Extract ONLY important & clean fields
    const senderPhone = extractPhone(payload);
    const senderName = payload?._data?.pushName || payload?.pushName || '';
    const message = extractMessageText(payload);
    const fromMe = Boolean(payload?.fromMe);
    const hasMedia = Boolean(payload?.hasMedia || payload?.media);
    const mediaUrl = payload?.media?.url || null;
    const messageId = payload?._data?.key?.id || payload?.id || '';
    const sentAt = payload?.timestamp ? new Date(payload.timestamp * 1000) : new Date();

    console.log(`📩 [WAHA] Message from ${senderName} (${senderPhone}): "${message || '[Media]'}"`);

    // Save only clean fields to MongoDB
    if (mongoose.connection.readyState === 1) {
      const savedDoc = await Message.create({
        senderPhone,
        senderName,
        message,
        fromMe,
        hasMedia,
        mediaUrl,
        messageId,
        sentAt,
      });

      console.log(`💾 Saved in DB (ID: ${savedDoc._id})`);
    } else {
      console.warn('⚠️ MongoDB is not connected yet.');
    }
  } catch (error) {
    console.error('❌ Error processing WAHA webhook event:', error.message);
  }
});

// 4. View Recent Messages Endpoint (Protected with Admin API Key)
app.get(['/messages', '/api/messages'], verifyAdminKey, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'Database is not connected. Check MONGODB_URI.',
      });
    }

    const limit = parseInt(req.query.limit, 10) || 50;
    const page = parseInt(req.query.page, 10) || 1;
    const skip = (page - 1) * limit;

    const messages = await Message.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Message.countDocuments();

    res.json({
      success: true,
      count: messages.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      messages,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WAHA Webhook Server running on port ${PORT}`);
  console.log(`📍 Health Check: http://localhost:${PORT}/health`);
  console.log(`📍 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`📍 View Messages: http://localhost:${PORT}/messages`);
});
