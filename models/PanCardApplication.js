const mongoose = require('mongoose');

const panCardApplicationSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    applicationType: { 
        type: String, 
        required: true
    },
    applicantName: { type: String, required: true },
    fatherName: { type: String, default: '' },
    dob: { type: String, default: '' },
    gender: { type: String, default: 'Male' },
    mobileNumber: { type: String, required: true },
    email: { type: String, required: true },
    aadhaarNumber: { type: String, default: '' },
    panNumber: { type: String, default: '' },
    panType: { type: String, default: 'Physical PAN Card & e-PAN' },
    photoUrl: { type: String, default: '' },
    signatureUrl: { type: String, default: '' },
    feeAmount: { type: Number, default: 107 },
    ackNumber: { type: String, required: true },
    status: { type: String, default: 'Submitted' },
    remarks: { type: String, default: '' },
    adminRemarks: { type: String, default: '' },
    nsdlReceiptNumber: { type: String, default: '' },
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

module.exports = mongoose.model('PanCardApplication', panCardApplicationSchema);
