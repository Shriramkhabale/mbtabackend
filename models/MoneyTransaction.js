const mongoose = require('mongoose');

const moneyTransactionSchema = new mongoose.Schema({
  transactionId: {
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
  transactionDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerMobile: {
    type: String,
    required: true,
    trim: true
  },
  customerUid: {
    type: String,
    default: '',
    trim: true
  },
  transactionType: {
    type: String,
    enum: ['Cash to Online Transfer', 'Online to Cash', 'Deposit', 'Withdrawal', 'Other'],
    default: 'Cash to Online Transfer'
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'Online', 'Cash to Online', 'Online to Cash'],
    default: 'Cash to Online'
  },
  cashAmount: {
    type: Number,
    required: true,
    min: 0
  },
  onlineAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  netCashAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  commissionType: {
    type: String,
    enum: ['Fixed', 'Percentage'],
    default: 'Fixed'
  },
  commissionValue: {
    type: Number,
    default: 0,
    min: 0
  },
  commissionAmount: {
    type: Number,
    required: true,
    min: 0
  },
  netOnlineAmount: {
    type: Number,
    required: true,
    min: 0
  },
  bankAccountId: {
    type: String,
    default: '',
    trim: true
  },
  bankName: {
    type: String,
    default: '',
    trim: true
  },
  bankAccountNumberMasked: {
    type: String,
    default: '',
    trim: true
  },
  customerAccountOrUpi: {
    type: String,
    default: '',
    trim: true
  },
  referenceNumber: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Successful', 'Failed'],
    default: 'Successful',
    index: true
  },
  remarks: {
    type: String,
    default: '',
    trim: true
  },
  createdByRole: {
    type: String,
    enum: ['retailer', 'employee', 'admin'],
    default: 'retailer'
  },
  createdByName: {
    type: String,
    default: 'Retailer',
    trim: true
  },
  createdByUid: {
    type: String,
    default: '',
    trim: true
  },
  updatedByRole: {
    type: String,
    default: '',
    trim: true
  },
  updatedByName: {
    type: String,
    default: '',
    trim: true
  },
  updatedByUid: {
    type: String,
    default: '',
    trim: true
  }
}, {
  timestamps: true
});

const MoneyTransaction = mongoose.models.MoneyTransaction || mongoose.model('MoneyTransaction', moneyTransactionSchema);
module.exports = MoneyTransaction;
