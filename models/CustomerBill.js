const mongoose = require('mongoose');

const customerBillSchema = new mongoose.Schema({
  billNumber: {
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
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerMobile: {
    type: String,
    default: ''
  },
  customerEmail: {
    type: String,
    default: ''
  },
  workId: {
    type: String,
    required: true
  },
  workDescription: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  billDate: {
    type: Date,
    default: Date.now
  },
  pdfUrl: {
    type: String,
    default: ''
  },
  companyDetails: {
    name: {
      type: String,
      default: 'MB MITRA (MBTA Athani)'
    },
    tagline: {
      type: String,
      default: 'Multi-Services & Retailer Digital Portal'
    },
    address: {
      type: String,
      default: 'Main Road, Athani, Belagavi, Karnataka - 591304'
    },
    contact: {
      type: String,
      default: '+91 98765 43210 / support@mbmitra.com'
    }
  },
  createdBy: {
    type: String,
    default: 'system'
  },
  createdByRole: {
    type: String,
    enum: ['retailer', 'employee', 'admin', 'system'],
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
  }
}, {
  timestamps: true
});

const CustomerBill = mongoose.models.CustomerBill || mongoose.model('CustomerBill', customerBillSchema);
module.exports = CustomerBill;
