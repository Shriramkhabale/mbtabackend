const mongoose = require('mongoose');

const quickLinkSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    url: {
        type: String,
        required: true,
        trim: true
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
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('QuickLink', quickLinkSchema);
