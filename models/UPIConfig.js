const mongoose = require('mongoose');

const upiConfigSchema = new mongoose.Schema({
    qrCodeImg: { type: String, default: '' },
    upiId: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('UPIConfig', upiConfigSchema);
