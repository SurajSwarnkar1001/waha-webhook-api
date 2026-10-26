const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    // WhatsApp number of the sender (e.g. '916204878067')
    senderPhone: {
      type: String,
      required: true,
      index: true,
    },
    // Sender profile name (e.g. 'Anju_💝')
    senderName: {
      type: String,
      default: '',
    },
    // Actual message text (e.g. 'Hi')
    message: {
      type: String,
      default: '',
    },
    // True if sent by bot/self, false if received from customer
    fromMe: {
      type: Boolean,
      default: false,
    },
    // True if user sent image/audio/document/video
    hasMedia: {
      type: Boolean,
      default: false,
    },
    // Media URL or mimetype only if media is present
    mediaUrl: {
      type: String,
      default: null,
    },
    // WhatsApp message ID
    messageId: {
      type: String,
      index: true,
    },
    // Time when the message was sent on WhatsApp
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // manages createdAt and updatedAt
  }
);

module.exports = mongoose.model('Message', messageSchema);

