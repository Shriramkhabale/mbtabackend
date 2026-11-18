const mongoose = require('mongoose');

const businessExpenseSchema = new mongoose.Schema({
  expenseId: {
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
  title: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['Shop Rent', 'Electricity', 'Internet / Phone', 'Stationery', 'Tea / Refreshments', 'Salaries', 'Maintenance', 'Other'],
    default: 'Other',
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  expenseDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'Bank Account', 'UPI'],
    default: 'Cash'
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
  remarks: {
    type: String,
    default: '',
    trim: true
  }
}, {
  timestamps: true
});

const BusinessExpense = mongoose.models.BusinessExpense || mongoose.model('BusinessExpense', businessExpenseSchema);
module.exports = BusinessExpense;
