const mongoose = require('mongoose');

// Define the User schema
const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    retailerId: {
        type: String,
        unique: true,
        sparse: true // allows it to be unique but optional for older docs
    },
    name: {
        type: String,
        required: false
    },
    shopName: {
        type: String,
        required: false
    },
    businessAddress: {
        type: String,
        required: false
    },
    email: {
        type: String,
        required: false,
        sparse: true
    },
    password: {
        type: String,
        required: false
    },
    mobile: {
        type: String,
        required: false // Not all old accounts have it yet
    },
    role: {
        type: String,
        enum: ['admin', 'retailer', 'customer'],
        default: 'customer'
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Approved' // Existing accounts default to Approved
    },
    isPaySprintOnboarded: {
        type: Boolean,
        default: false
    },
    walletBalance: {
        type: Number,
        default: 0.00
    }
}, { 
    timestamps: true 
});

// Create and export the model
const User = mongoose.model('User', userSchema);
module.exports = User;
