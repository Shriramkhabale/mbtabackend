const mongoose = require('mongoose');

const documentItemSchema = new mongoose.Schema({
  docId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    default: 0
  },
  mimeType: {
    type: String,
    default: ''
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const customerSchema = new mongoose.Schema({
  customerUid: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  mobileNumber: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  email: {
    type: String,
    trim: true,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    default: ''
  },
  state: {
    type: String,
    default: ''
  },
  pincode: {
    type: String,
    default: ''
  },
  workStatus: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'No Active Work'],
    default: 'No Active Work'
  },
  dynamicData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  documents: {
    type: [documentItemSchema],
    default: []
  },
  createdBy: {
    type: String,
    default: 'system'
  },
  updatedBy: {
    type: String,
    default: ''
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
module.exports = Customer;
