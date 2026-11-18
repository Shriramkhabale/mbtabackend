const mongoose = require('mongoose');

const employeeFieldSchema = new mongoose.Schema({
  retailerId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
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
    enum: ['text', 'number', 'email', 'mobile', 'date', 'select', 'radio', 'checkbox', 'textarea', 'file'],
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
    default: '📝'
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

// Ensure a retailer cannot have duplicate field names
employeeFieldSchema.index({ retailerId: 1, name: 1 }, { unique: true });

const DEFAULT_EMPLOYEE_FIELDS = [
  {
    name: 'fullName',
    label: 'Employee Full Name',
    type: 'text',
    required: true,
    hidden: false,
    placeholder: 'Enter employee full name',
    icon: '👤',
    order: 0,
    isSystem: true
  },
  {
    name: 'mobileNumber',
    label: 'Mobile Number',
    type: 'mobile',
    required: true,
    hidden: false,
    placeholder: '10-digit mobile number for login',
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
    placeholder: 'employee@example.com',
    icon: '📧',
    order: 2,
    isSystem: false
  },
  {
    name: 'dob',
    label: 'Date of Birth',
    type: 'date',
    required: false,
    hidden: false,
    placeholder: 'YYYY-MM-DD',
    icon: '🎂',
    order: 3,
    isSystem: false
  },
  {
    name: 'gender',
    label: 'Gender',
    type: 'select',
    required: false,
    hidden: false,
    options: ['Male', 'Female', 'Other'],
    placeholder: 'Select gender',
    icon: '🚻',
    order: 4,
    isSystem: false
  },
  {
    name: 'address',
    label: 'Address',
    type: 'textarea',
    required: false,
    hidden: false,
    placeholder: 'Full residential address',
    icon: '🏠',
    order: 5,
    isSystem: false
  },
  {
    name: 'city',
    label: 'City',
    type: 'text',
    required: false,
    hidden: false,
    placeholder: 'City / Village',
    icon: '🏙️',
    order: 6,
    isSystem: false
  },
  {
    name: 'state',
    label: 'State',
    type: 'text',
    required: false,
    hidden: false,
    placeholder: 'e.g. Maharashtra, Karnataka',
    icon: '📍',
    order: 7,
    isSystem: false
  },
  {
    name: 'pinCode',
    label: 'PIN Code',
    type: 'number',
    required: false,
    hidden: false,
    placeholder: '6-digit postal PIN code',
    icon: '📮',
    order: 8,
    isSystem: false
  },
  {
    name: 'joiningDate',
    label: 'Joining Date',
    type: 'date',
    required: false,
    hidden: false,
    placeholder: 'Date of employment',
    icon: '📅',
    order: 9,
    isSystem: false
  },
  {
    name: 'designation',
    label: 'Designation',
    type: 'text',
    required: false,
    hidden: false,
    placeholder: 'e.g. Operator, Counter Assistant, Account Executive',
    icon: '💼',
    order: 10,
    isSystem: false
  },
  {
    name: 'department',
    label: 'Department',
    type: 'text',
    required: false,
    hidden: false,
    placeholder: 'e.g. PAN Operations, Customer Service, Billing',
    icon: '🏢',
    order: 11,
    isSystem: false
  },
  {
    name: 'emergencyContact',
    label: 'Emergency Contact Number',
    type: 'mobile',
    required: false,
    hidden: false,
    placeholder: 'Family or guardian mobile number',
    icon: '🚨',
    order: 12,
    isSystem: false
  },
  {
    name: 'photo',
    label: 'Employee Photo',
    type: 'file',
    required: false,
    hidden: false,
    placeholder: 'Upload passport photo (JPG/PNG)',
    icon: '📷',
    order: 13,
    isSystem: false
  },
  {
    name: 'status',
    label: 'Employee Status',
    type: 'select',
    required: true,
    hidden: false,
    options: ['Active', 'Inactive'],
    placeholder: 'Select status',
    icon: '⚡',
    order: 14,
    isSystem: true
  }
];

const EmployeeField = mongoose.models.EmployeeField || mongoose.model('EmployeeField', employeeFieldSchema);
EmployeeField.DEFAULT_EMPLOYEE_FIELDS = DEFAULT_EMPLOYEE_FIELDS;

module.exports = EmployeeField;
