const mongoose = require('mongoose');

const crmCardSchema = new mongoose.Schema({
    cardId: {
        type: String,
        required: true,
        trim: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    subtitle: {
        type: String,
        trim: true,
        default: ''
    },
    icon: {
        type: String,
        default: '📋'
    },
    badge: {
        type: String,
        trim: true,
        default: ''
    },
    color: {
        type: String,
        default: '#ea580c'
    },
    url: {
        type: String,
        trim: true,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('CrmCard', crmCardSchema);
