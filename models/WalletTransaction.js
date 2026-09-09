const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    transactionType: { type: String, enum: ['Credit', 'Debit'], required: true },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    description: { type: String, required: true },
    referenceNumber: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Success', 'Failed'], default: 'Success' },
    paysprintTxnId: { type: String },
    paysprintResponse: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
