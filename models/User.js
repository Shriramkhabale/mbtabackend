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
    email: {
        type: String,
        required: true,
        unique: true
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
