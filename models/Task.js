const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  taskId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  retailerId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  category: {
    type: String,
    default: 'General',
    trim: true
  },
  startDate: {
    type: String, // YYYY-MM-DD
    required: true,
    trim: true,
    index: true
  },
  dueDate: {
    type: String, // YYYY-MM-DD
    required: true,
    trim: true,
    index: true
  },
  startTime: {
    type: String, // HH:MM
    default: '',
    trim: true
  },
  dueTime: {
    type: String, // HH:MM
    default: '',
    trim: true
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium',
    index: true
  },
  workStatus: {
    type: String,
    enum: ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'],
    default: 'Not Started',
    index: true
  },
  assignmentType: {
    type: String,
    enum: ['myself', 'employee', 'retailer'],
    default: 'myself'
  },
  assignedEmployees: [
    {
      employeeUid: { type: String, trim: true },
      employeeName: { type: String, trim: true },
      assignedAt: { type: Date, default: Date.now }
    }
  ],
  assignedToName: {
    type: String,
    default: 'Myself',
    trim: true
  },
  assignedToUid: {
    type: String,
    default: '',
    trim: true,
    index: true
  },
  notes: {
    type: String,
    default: '',
    trim: true
  },
  reminderDateTime: {
    type: String,
    default: '',
    trim: true
  },
  attachments: [
    {
      name: { type: String, trim: true },
      url: { type: String, trim: true },
      uploadedAt: { type: Date, default: Date.now }
    }
  ],
  createdBy: {
    uid: { type: String, default: '' },
    name: { type: String, default: '' },
    role: { type: String, default: 'retailer' } // 'retailer' | 'employee'
  },
  createdByName: {
    type: String,
    default: 'Retailer',
    trim: true
  },
  createdByRole: {
    type: String,
    default: 'retailer',
    trim: true
  },
  createdByUid: {
    type: String,
    default: '',
    trim: true
  },
  completedAt: {
    type: Date,
    default: null
  },
  completedBy: {
    uid: { type: String, default: '' },
    name: { type: String, default: '' }
  },
  completedByName: {
    type: String,
    default: '',
    trim: true
  },
  completedByUid: {
    type: String,
    default: '',
    trim: true
  },
  completionRemarks: {
    type: String,
    default: '',
    trim: true
  },
  statusHistory: [
    {
      fromStatus: { type: String, trim: true },
      toStatus: { type: String, trim: true },
      changedAt: { type: Date, default: Date.now },
      changedByUid: { type: String, trim: true },
      changedByName: { type: String, trim: true },
      changedByRole: { type: String, trim: true },
      remarks: { type: String, default: '', trim: true }
    }
  ],
  assignmentHistory: [
    {
      fromAssignee: { type: String, trim: true },
      toAssignee: { type: String, trim: true },
      reassignedAt: { type: Date, default: Date.now },
      reassignedBy: { type: String, trim: true }
    }
  ]
}, {
  timestamps: true
});

// Compound indexes for optimal performance
TaskSchema.index({ retailerId: 1, workStatus: 1 });
TaskSchema.index({ retailerId: 1, dueDate: 1 });
TaskSchema.index({ retailerId: 1, startDate: 1 });
TaskSchema.index({ retailerId: 1, priority: 1 });
TaskSchema.index({ 'assignedEmployees.employeeUid': 1 });

module.exports = mongoose.model('Task', TaskSchema);
