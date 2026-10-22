const mongoose = require('mongoose');

const offlineWorkApplicationSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    applicationType: { type: String, required: true },
    tabId: { type: String, default: '' },
    applicantName: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    email: { type: String, default: '' },
    feeAmount: { type: Number, default: 0 },
    ackNumber: { type: String, required: true, unique: true },
    status: { 
        type: String, 
        enum: ['Submitted', 'In Process', 'Completed', 'Rejected'], 
        default: 'Submitted' 
    },
    remarks: { type: String, default: '' },
    adminRemarks: { type: String, default: '' },
    receiptUrl: { type: String, default: '' },
    isRefunded: { type: Boolean, default: false },
    refundAmount: { type: Number, default: 0 },
    additionalDocuments: [{
        name: { type: String, required: true },
        dataUrl: { type: String, required: true },
        uploadedBy: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now }
    }],
    details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('OfflineWorkApplication', offlineWorkApplicationSchema);
