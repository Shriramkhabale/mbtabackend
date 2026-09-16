require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./db');

const app = express();
const httpServer = http.createServer(app);
const initializeSocket = require('./socket');
const io = initializeSocket(httpServer);
app.set('io', io);

// Connect to Database
connectDB();

// Routes
const userRoutes = require('./routes/userRoutes');
const actionCardRoutes = require('./routes/actionCardRoutes');
const topTabRoutes = require('./routes/topTabRoutes');
const sidebarMenuRoutes = require('./routes/sidebarMenuRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const newsImageRoutes = require('./routes/newsImageRoutes');
const upiRoutes = require('./routes/upiRoutes');
const paymentRequisitionRoutes = require('./routes/paymentRequisitionRoutes');
const walletTransactionRoutes = require('./routes/walletTransactionRoutes');
const directPaymentRoutes = require('./routes/directPaymentRoutes');
const panCardRoutes = require('./routes/panCardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const staffRoutes = require('./routes/staffRoutes');

const path = require('path');

// Middleware
app.use(cors());
// PAN photos and follow-up documents are submitted as data URLs.
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));
// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/action-cards', actionCardRoutes);
app.use('/api/top-tabs', topTabRoutes);
app.use('/api/sidebar-menus', sidebarMenuRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/news-images', newsImageRoutes);
app.use('/api/upi-config', upiRoutes);
app.use('/api/payment-requisitions', paymentRequisitionRoutes);
app.use('/api/wallet-transactions', walletTransactionRoutes);
app.use('/api/direct-payment', directPaymentRoutes);
app.use('/api/pancard', panCardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/staff', staffRoutes);

// Callback forwarder for PaySprint's configured URL
app.post('/UpiCollectionCallback.aspx', (req, res) => {
    res.redirect(307, '/api/direct-payment/callback');
});

// Basic Route
app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use((err, req, res, next) => {
    console.error('GLOBAL ERROR:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
});

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
