const mongoose = require('mongoose');

const toolSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    url: {
        type: String,
        trim: true,
        default: ''
    },
    apiUrl: {
        type: String,
        trim: true,
        default: ''
    },
    apiKey: {
        type: String,
        trim: true,
        default: ''
    },
    icon: {
        type: String,
        default: '⚡'
    },
    category: {
        type: String,
        default: 'AI Tool'
    },
    badge: {
        type: String,
        default: 'AI API'
    },
    description: {
        type: String,
        default: ''
    },
    fee: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    },
    usageCount: {
        type: Number,
        default: 0
    },
    successCount: {
        type: Number,
        default: 0
    },
    failureCount: {
        type: Number,
        default: 0
    },
    subTools: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Tool', toolSchema);
