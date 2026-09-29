const mongoose = require('mongoose');

const beneficiarySchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    beneId: {
        type: String,
        required: true,
        index: true
    },
    merchantCode: {
        type: String,
        required: true
    },
    bankName: {
        type: String,
        required: true
    },
    accountNumber: {
        type: String,
        required: true
    },
    ifsc: {
        type: String,
        required: true
    },
    beneficiaryName: {
        type: String,
        required: true
    },
    accountType: {
        type: String,
        enum: ['PRIMARY', 'RELATIVE'],
        default: 'PRIMARY'
    },
    pipe: {
        type: String,
        default: 'bank2'
    },
    verified: {
        type: Boolean,
        default: true
    },
    status: {
        type: String,
        default: 'Active'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Beneficiary', beneficiarySchema);
