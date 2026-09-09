const mongoose = require('mongoose');

const paymentRequisitionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    amount: { type: Number, required: true },
    referenceNumber: { type: String, required: true },
    paymentDate: { type: Date, required: true },
    remarks: { type: String, default: '' },
    approvedAmount: { type: Number, default: 0 },
    status: { type: String, default: 'Pending' } 
}, { timestamps: true });

module.exports = mongoose.model('PaymentRequisition', paymentRequisitionSchema);
