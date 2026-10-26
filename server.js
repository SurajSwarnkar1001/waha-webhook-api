require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Message = require('./models/Message');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/waha_whatsapp';

// Middlewares
app.use(cors());
// Support large payloads (in case WAHA forwards base64 audio/media)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

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

// 3. Webhook POST Endpoint - Receives messages & events from WAHA
app.post(['/webhook', '/api/webhook'], async (req, res) => {
  // Acknowledge receipt to WAHA immediately with 200 OK
  // This prevents WAHA from retrying due to timeouts
  res.status(200).json({ success: true, message: 'Webhook received' });

  try {
    const raw = req.body || {};

    // WAHA usually wraps the data in: { event: "...", session: "...", payload: { ... } }
    // Or sometimes directly passes payload depending on engine/version.
    const event = raw.event || 'message';
    const session = raw.session || 'default';
    const payload = raw.payload || raw;

    console.log(`📩 [WAHA Webhook] Received Event: "${event}" (Session: "${session}")`);

    // Extract message fields gracefully
    const messageId = payload.id || (payload._data && payload._data.id) || null;
    const from = payload.from || (payload._data && payload._data.from) || null;
    const to = payload.to || (payload._data && payload._data.to) || null;
    const fromMe = Boolean(payload.fromMe);
    const body = payload.body || payload.text || '';
    const hasMedia = Boolean(payload.hasMedia || payload.media);
    const media = payload.media || null;
    const messageTimestamp = payload.timestamp || Math.floor(Date.now() / 1000);

    // Filter or log
    if (body) {
      console.log(`💬 Message from ${from}: "${body}"`);
    } else if (hasMedia) {
      console.log(`📎 Media message from ${from}`);
    }

    // Save to MongoDB if database is connected
    if (mongoose.connection.readyState === 1) {
      const savedDoc = await Message.create({
        event,
        session,
        messageId,
        from,
        to,
        fromMe,
        body,
        hasMedia,
        media,
        messageTimestamp,
        rawPayload: raw,
      });

      console.log(`💾 Stored message in MongoDB (Doc ID: ${savedDoc._id})`);
    } else {
      console.warn('⚠️ MongoDB is not connected yet. Message was not saved to DB.');
    }
  } catch (error) {
    console.error('❌ Error processing WAHA webhook event:', error.message);
  }
});

// 4. View Recent Messages Endpoint (For testing & debugging)
app.get(['/messages', '/api/messages'], async (req, res) => {
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
