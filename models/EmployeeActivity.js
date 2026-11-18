const mongoose = require('mongoose');

const employeeActivitySchema = new mongoose.Schema({
  employeeUid: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  employeeName: {
    type: String,
    required: true,
    trim: true
  },
  retailerId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  serviceName: {
    type: String,
    required: true,
    trim: true
  },
  moduleName: {
    type: String,
    required: true,
    trim: true
  },
  action: {
    type: String,
    required: true,
    trim: true
  },
  recordId: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['Success', 'Failed', 'Pending'],
    default: 'Success',
    index: true
  },
  details: {
    type: String,
    default: ''
  },
  activityDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  ipAddress: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Indexes for fast retailer-scoped filtering
employeeActivitySchema.index({ retailerId: 1, activityDate: -1 });
employeeActivitySchema.index({ retailerId: 1, employeeUid: 1, activityDate: -1 });

const EmployeeActivity = mongoose.models.EmployeeActivity || mongoose.model('EmployeeActivity', employeeActivitySchema);

async function logEmployeeActivity({
  employeeUid,
  employeeName,
  retailerId,
  serviceName,
  moduleName,
  action,
  recordId = '',
  status = 'Success',
  details = '',
  req = null
}) {
  try {
    if (!employeeUid || !retailerId) return null;
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') : '';
    const activity = new EmployeeActivity({
      employeeUid,
      employeeName: employeeName || employeeUid,
      retailerId,
      serviceName: serviceName || 'General',
      moduleName: moduleName || 'General',
      action: action || 'Activity',
      recordId: String(recordId || ''),
      status,
      details: String(details || ''),
      ipAddress: String(ipAddress).slice(0, 45)
    });
    return await activity.save();
  } catch (err) {
    console.error('Error logging employee activity:', err);
    return null;
  }
}

module.exports = {
  EmployeeActivity,
  logEmployeeActivity
};
