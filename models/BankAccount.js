const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
  accountId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  retailerId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  bankName: {
    type: String,
    required: true,
    trim: true
  },
  accountHolderName: {
    type: String,
    required: true,
    trim: true
  },
  accountNumber: {
    type: String,
    required: true,
    trim: true
  },
  ifscCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  branchName: {
    type: String,
    default: '',
    trim: true
  },
  accountType: {
    type: String,
    enum: ['Savings', 'Current', 'Other'],
    default: 'Savings'
  },
  upiId: {
    type: String,
    default: '',
    trim: true
  },
  accountNickname: {
    type: String,
    default: '',
    trim: true
  },
  dynamicData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Helper to mask account number: e.g. "•••• •••• 1234"
bankAccountSchema.methods.getMaskedAccountNumber = function() {
  const num = (this.accountNumber || '').trim();
  if (num.length <= 4) return num;
  const last4 = num.slice(-4);
  return `•••• •••• ${last4}`;
};

// Safe JSON serialization
bankAccountSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  obj.maskedAccountNumber = this.getMaskedAccountNumber();
  return obj;
};

const BankAccount = mongoose.models.BankAccount || mongoose.model('BankAccount', bankAccountSchema);
module.exports = BankAccount;
