const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    // WAHA event type (e.g. 'message', 'message.any', 'message.ack', 'session.status')
    event: {
      type: String,
      default: 'message',
      index: true,
    },
    // WAHA session name (e.g. 'default')
    session: {
      type: String,
      default: 'default',
      index: true,
    },
    // WhatsApp message ID (e.g. 'false_1234567890@c.us_3EB0...')
    messageId: {
      type: String,
      index: true,
    },
    // Sender phone / chat ID (e.g. '919876543210@c.us' or group ID)
    from: {
      type: String,
      index: true,
    },
    // Receiver phone / chat ID
    to: {
      type: String,
    },
    // True if message was sent by the bot/user account itself
    fromMe: {
      type: Boolean,
      default: false,
    },
    // Message text body
    body: {
      type: String,
      default: '',
    },
    // True if attachment/media is present (image, voice, document, video, etc.)
    hasMedia: {
      type: Boolean,
      default: false,
    },
    // Media details if available
    media: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // WhatsApp timestamp (in epoch seconds/ms if provided by WAHA)
    messageTimestamp: {
      type: Number,
    },
    // Full raw JSON payload received from WAHA (so nothing is ever lost)
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Indexes for fast lookup
messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
