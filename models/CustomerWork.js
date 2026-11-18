const mongoose = require('mongoose');

const customerWorkSchema = new mongoose.Schema({
  workId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  customerUid: {
    type: String,
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    default: 0
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed'],
    default: 'Pending'
  },
  billed: {
    type: Boolean,
    default: false
  },
  billNumber: {
    type: String,
    default: null
  },
  createdBy: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true
});

const CustomerWork = mongoose.models.CustomerWork || mongoose.model('CustomerWork', customerWorkSchema);
module.exports = CustomerWork;
