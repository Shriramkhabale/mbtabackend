const mongoose = require('mongoose');

const customerFieldSchema = new mongoose.Schema({
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

const DEFAULT_CUSTOMER_FIELDS = [
  {
    name: 'customerName',
    label: 'Customer Name',
    type: 'text',
    required: true,
    hidden: false,
    placeholder: 'Enter customer full name',
    icon: '👤',
    order: 0,
    isSystem: true
  },
  {
    name: 'mobileNumber',
    label: 'Mobile Number',
    type: 'tel',
    required: true,
    hidden: false,
    placeholder: 'Enter 10-digit mobile number',
    icon: '📱',
    order: 1,
    isSystem: true
  },
  {
    name: 'email',
    label: 'Email Address',
    type: 'email',
    required: false,
    hidden: false,
    placeholder: 'name@example.com',
    icon: '📧',
    order: 2,
    isSystem: true
  },
  {
    name: 'address',
    label: 'Address',
    type: 'textarea',
    required: false,
    hidden: false,
    placeholder: 'Street, building, area',
    icon: '🏠',
    order: 3,
    isSystem: true
  },
  {
    name: 'city',
    label: 'City',
    type: 'text',
    required: false,
    hidden: false,
    placeholder: 'Enter city',
    icon: '🏙️',
    order: 4,
    isSystem: true
  },
  {
    name: 'state',
    label: 'State',
    type: 'text',
    required: false,
    hidden: false,
    placeholder: 'Enter state',
    icon: '📍',
    order: 5,
    isSystem: true
  },
  {
    name: 'pincode',
    label: 'PIN Code',
    type: 'number',
    required: false,
    hidden: false,
    placeholder: '6-digit PIN code',
    icon: '📮',
    order: 6,
    isSystem: true
  }
];

// Helper to auto-seed default fields if collection is empty
customerFieldSchema.statics.seedDefaultFieldsIfEmpty = async function() {
  const count = await this.countDocuments();
  if (count === 0) {
    await this.insertMany(DEFAULT_CUSTOMER_FIELDS);
    console.log('Default customer form fields seeded (7 fields).');
  }
};

const CustomerField = mongoose.models.CustomerField || mongoose.model('CustomerField', customerFieldSchema);
module.exports = CustomerField;
