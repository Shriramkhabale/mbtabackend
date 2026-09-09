const mongoose = require('mongoose');

const topTabSchema = new mongoose.Schema({
    label: { type: String, required: true },
    url: { type: String, default: '' },
    order: { type: Number, default: 0 }
});

module.exports = mongoose.model('TopTab', topTabSchema);
