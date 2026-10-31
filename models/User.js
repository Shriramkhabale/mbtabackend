const mongoose = require('mongoose');

// Default all permissions for all users
const DEFAULT_ALL_USER_PERMISSIONS = [
    // Offline Work
    'offlineWork',
    'offlineWork.view',
    'offlineWork.submit',
    'offlineWork.history',

    // PAN Card
    'panCard',
    'pan.manualNew',
    'pan.epanKyc',
    'pan.epanCorrectionOtp',
    'pan.epanSignPhoto',
    'pan.epanCorrectionSignPhoto',
    'pan.correction',
    'pan.findPan',
    'pan.merger',
    'pan.submissions',

    // Tools & AI Utilities
    'toolsModule',
    'tools.view',
    'tools.aadharCutter',
    'tools.allIdCutter',
    'tools.bgRemover',
    'tools.signValidation',
    'tools.autoCrop',
    'tools.ocrConverter',
    'tools.imageEnhancer',
    'tools.rationCutter',
    'tools.panCutter',
    'tools.voterCutter',
    'tools.pdf2Html',
    'tools.ayushmanCutter',

    // Dynamic Menus
    'dynamicMenus',
    'dyn.servicesLink',
    'dyn.jobLinks',
    'dyn.admitCard',
    'dyn.formLinks',
    'dyn.vedioLink',
    'dyn.trainingLinks',
    'dyn.productLinks',
    'dyn.govtLinks',
    'dyn.print',
    'dyn.schorshipLinks',

    // Quick Links
    'quickLinksModule',
    'quickLinks.view',
    'quickLinks.open',
    'quickLinks.search',

    // Wallet
    'walletModule',
    'wallet.balance',
    'wallet.upiPayment',
    'wallet.payout',
    'wallet.requisition',
    'wallet.history',

    // Ledger
    'ledgerModule',
    'ledger.view',
    'ledger.filter',
    'ledger.exportPdf',

    // Dashboard Navigation
    'dashboardNavModule',
    'dashboard.actionCards',
    'dashboard.topTabs',
    'dashboard.banners',

    // Profile & Account
    'profileModule',
    'profile.view',
    'profile.receipts',
    'profile.certificate',
    'profile.password'
];

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
    },
    permissions: {
        type: [String],
        default: () => [...DEFAULT_ALL_USER_PERMISSIONS]
    }
}, { 
    timestamps: true 
});

// Create and export the model
const User = mongoose.model('User', userSchema);
User.DEFAULT_ALL_PERMISSIONS = DEFAULT_ALL_USER_PERMISSIONS;
module.exports = User;
