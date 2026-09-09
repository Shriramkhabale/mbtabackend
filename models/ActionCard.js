const mongoose = require('mongoose');

const actionCardSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    icon: {
        type: String,
        default: ''
    },
    img: {
        type: String,
        required: true
    },
    isAeps: {
        type: Boolean,
        default: false
    },
    url: {
        type: String,
        default: ''
    },
    order: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('ActionCard', actionCardSchema);
