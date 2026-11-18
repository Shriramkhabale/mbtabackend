const mongoose = require('mongoose');

const bankFieldSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  label: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['text', 'number', 'email', 'tel', 'textarea', 'date', 'select', 'file'],
    default: 'text'
  },
  required: {
    type: Boolean,
    default: false
  },
  hidden: {
    type: Boolean,
    default: false
  },
  options: {
    type: [String],
    default: []
  },
  placeholder: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: ''
  },
  order: {
    type: Number,
    default: 0
  },
  isSystem: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const DEFAULT_BANK_FIELDS = [
  {
    name: 'bankName',
    label: 'Bank Name',
    type: 'text',
    required: true,
    hidden: false,
    placeholder: 'e.g. State Bank of India, HDFC Bank, ICICI Bank',
    icon: '🏦',
    order: 0,
    isSystem: true
  },
  {
    name: 'accountHolderName',
    label: 'Account Holder Name',
    type: 'text',
    required: true,
    hidden: false,
    placeholder: 'Exact name as in bank passbook / statement',
    icon: '👤',
    order: 1,
    isSystem: true
  },
  {
    name: 'accountNumber',
    label: 'Account Number',
    type: 'text',
    required: true,
    hidden: false,
    placeholder: 'Enter 8 to 22 digit account number',
    icon: '🔢',
    order: 2,
    isSystem: true
  },
  {
    name: 'ifscCode',
    label: 'IFSC Code',
    type: 'text',
    required: true,
    hidden: false,
    placeholder: 'e.g. SBIN0001234',
    icon: '🏛️',
    order: 3,
    isSystem: true
  },
  {
    name: 'accountType',
    label: 'Account Type',
    type: 'select',
    options: ['Savings', 'Current', 'Other'],
    required: false,
    hidden: false,
    placeholder: 'Select Account Type',
    icon: '💳',
    order: 4,
    isSystem: true
  },
  {
    name: 'branchName',
    label: 'Branch Name',
    type: 'text',
    required: false,
    hidden: false,
    placeholder: 'e.g. Athani City Branch',
    icon: '📍',
    order: 5,
    isSystem: true
  },
  {
    name: 'upiId',
    label: 'UPI ID',
    type: 'text',
    required: false,
    hidden: false,
    placeholder: 'e.g. shopname@okaxis',
    icon: '⚡',
    order: 6,
    isSystem: true
  },
  {
    name: 'accountNickname',
    label: 'Account Nickname',
    type: 'text',
    required: false,
    hidden: false,
    placeholder: 'e.g. Shop Primary Cash Account / Settlement Account',
    icon: '🏷️',
    order: 7,
    isSystem: true
  }
];

// Helper to auto-seed default fields if collection is empty
bankFieldSchema.statics.seedDefaultFieldsIfEmpty = async function() {
  const count = await this.countDocuments();
  if (count === 0) {
    await this.insertMany(DEFAULT_BANK_FIELDS);
    console.log('Default bank account form fields seeded (8 fields).');
  }
};

const BankField = mongoose.models.BankField || mongoose.model('BankField', bankFieldSchema);
module.exports = BankField;
