const mongoose = require('mongoose');

const etdsTransactionSchema = new mongoose.Schema({
  public_ref: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  tid: {
    type: String,
    required: true,
    unique: true,
    match: /^\d{1,10}$/
  },
  userId: { type: String, required: true, index: true },
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PanCardApplication',
    required: true
  },
  walletDebited: {
    type: Boolean,
    // Existing transactions were charged during submission; new ones explicitly start false.
    default: true
  },
  serviceType: { type: String, required: true },
  providerMessage: { type: String, default: '' },
  status: {
    type: String,
    enum: ['initiated', 'pending', 'success', 'failed', 'unknown'],
    default: 'initiated',
    index: true
  }
}, { timestamps: true });

module.exports = mongoose.model('EtdsTransaction', etdsTransactionSchema);
