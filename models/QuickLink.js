const mongoose = require('mongoose');

const quickLinkSchema = new mongoose.Schema({
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
    videoFile: {
        type: String,
        default: ''
    },
    videoSource: {
        type: String,
        default: 'url'
    },
    img: {
        type: String,
        default: ''
    },
    icon: {
        type: String,
        default: '🔗'
    },
    category: {
        type: String,
        default: 'link'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    },
    fee: {
        type: Number,
        default: 0
    },
    menuKey: {
        type: String,
        default: 'quickLinks'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('QuickLink', quickLinkSchema);
