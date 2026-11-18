const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  employeeUid: {
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
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  mobileNumber: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    default: ''
  },
  dob: {
    type: String,
    default: ''
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other', ''],
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
  pinCode: {
    type: String,
    default: ''
  },
  joiningDate: {
    type: Date,
    default: Date.now
  },
  designation: {
    type: String,
    default: ''
  },
  department: {
    type: String,
    default: ''
  },
  photo: {
    type: String,
    default: ''
  },
  emergencyContact: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
    index: true
  },
  password: {
    type: String,
    required: true,
    default: '123456'
  },
  permissions: {
    type: [String],
    default: []
  },
  dynamicFields: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  loginEnabled: {
    type: Boolean,
    default: true
  },
  lastLoginAt: {
    type: Date
  },
  createdBy: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Compound index for fast retailer-scoped lookup
employeeSchema.index({ retailerId: 1, mobileNumber: 1 });
employeeSchema.index({ retailerId: 1, status: 1 });

employeeSchema.methods.toSafeObject = function() {
  const obj = this.toObject ? this.toObject() : { ...this };
  delete obj.password;
  return obj;
};

const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);
module.exports = Employee;
