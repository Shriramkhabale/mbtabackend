const mongoose = require('mongoose');

const customerOtpSchema = new mongoose.Schema({
  customerUid: {
    type: String,
    required: true,
    index: true
  },
  mobileNumber: {
    type: String,
    required: true
  },
  otpHash: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  verified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    default: null,
    index: true
  },
  sessionExpiresAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 1800 // MongoDB TTL index: automatically deletes document after 30 minutes
  }
});

const CustomerOtp = mongoose.models.CustomerOtp || mongoose.model('CustomerOtp', customerOtpSchema);
module.exports = CustomerOtp;
