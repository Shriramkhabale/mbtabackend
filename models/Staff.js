const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    password: {
        type: String,
        required: true
    },
    email: {
        type: String,
        trim: true,
        default: ''
    },
    mobile: {
        type: String,
        trim: true,
        default: ''
    },
    permissions: {
        type: [String],
        default: []
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Staff', staffSchema);
