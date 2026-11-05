const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');

const router = express.Router();
const CREATE_ORDER_URL = 'https://api.ekqr.in/api/create_order';
const CHECK_ORDER_STATUS_URL = 'https://api.ekqr.in/api/check_order_status';

const getApiKey = () => process.env.Qr_api && process.env.Qr_api.trim();

const formatTxnDate = (date) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.day}-${values.month}-${values.year}`;
};

const parseTxnDate = (date) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const [year, month, day] = date.split('-');
    return `${day}-${month}-${year}`;
};

const findTransaction = (txnId) =>
    WalletTransaction.findOne({ referenceNumber: txnId, paymentGateway: 'EkQR' });

const queryOrderStatus = async (tx, txnDate = tx.gatewayTxnDate) => {
    const apiKey = getApiKey();
    if (!apiKey) {
        const error = new Error('QR payment API key is not configured on the server.');
        error.statusCode = 503;
        throw error;
    }

    const response = await axios.post(CHECK_ORDER_STATUS_URL, {
        key: apiKey,
        client_txn_id: tx.referenceNumber,
        txn_date: txnDate || formatTxnDate(tx.createdAt || new Date())
    }, { timeout: 15000 });

    return response.data;
};

const creditVerifiedOrder = async (req, tx, providerData) => {
    const providerAmount = Number(providerData.amount);
    if (!Number.isFinite(providerAmount) || providerAmount.toFixed(2) !== Number(tx.amount).toFixed(2)) {
        console.error(`[EkQR] Amount mismatch for transaction ${tx.referenceNumber}`);
        return { success: false, status: 'Pending', message: 'Provider amount does not match the requested amount.' };
    }

    const providerTxnId = providerData.upi_txn_id || String(providerData.id || '');
    const session = await mongoose.startSession();
    let result;
    let walletEvent;

    try {
        await session.withTransaction(async () => {
            const currentTx = await WalletTransaction.findById(tx._id).session(session);
            if (!currentTx) {
                throw new Error(`Wallet transaction not found: ${tx.referenceNumber}`);
            }

            const user = await User.findOne({ userId: currentTx.userId }).session(session);
            if (!user) {
                throw new Error(`Wallet owner not found for transaction ${currentTx.referenceNumber}`);
            }

            const recordedCredit = Number(currentTx.balanceAfter) - Number(currentTx.balanceBefore);
            if (
                currentTx.status === 'Success' &&
                Math.abs(recordedCredit - Number(currentTx.amount)) < 0.005
            ) {
                result = {
                    success: true,
                    status: 'Success',
                    message: 'Payment already credited.',
                    walletBalance: Number(user.walletBalance || 0),
                    amount: currentTx.amount
                };
                walletEvent = null;
                return;
            }

            if (currentTx.status !== 'Pending' && currentTx.status !== 'Success') {
                result = {
                    success: false,
                    status: currentTx.status,
                    message: 'Payment is not pending.'
                };
                walletEvent = null;
                return;
            }

            const creditAmount = Number(currentTx.amount);
            const balanceBefore = Number(user.walletBalance || 0);
            user.walletBalance = Number((balanceBefore + creditAmount).toFixed(2));
            await user.save({ session });

            currentTx.status = 'Success';
            currentTx.gatewayTxnId = providerTxnId;
            currentTx.description = `Wallet Top-Up via EkQR${providerTxnId ? ` (UTR: ${providerTxnId})` : ''}`;
            currentTx.balanceBefore = balanceBefore;
            currentTx.balanceAfter = user.walletBalance;
            await currentTx.save({ session });

            result = {
                success: true,
                status: 'Success',
                message: `Payment verified. ₹${creditAmount.toFixed(2)} credited to your wallet.`,
                walletBalance: user.walletBalance,
                amount: creditAmount
            };
            walletEvent = {
                userId: user.userId,
                walletBalance: user.walletBalance,
                amount: creditAmount,
                type: 'Credit',
                txnId: currentTx.referenceNumber,
                status: 'Success'
            };
        });
    } finally {
        await session.endSession();
    }

    const io = req.app.get('io');
    if (io && walletEvent) {
        io.emit('wallet_balance_updated', walletEvent);
        io.emit('payment_success', walletEvent);
    }

    return result;
};

const checkTransactionStatus = async (req, res, txnId, txnDate) => {
    if (!txnId) {
        return res.status(400).json({ success: false, message: 'Missing transaction ID.' });
    }

    try {
        const tx = await findTransaction(txnId);
        if (!tx) {
            return res.status(404).json({ success: false, message: 'QR payment transaction not found.' });
        }

        if (tx.status === 'Success') {
            const user = await User.findOne({ userId: tx.userId });
            const recordedCredit = Number(tx.balanceAfter) - Number(tx.balanceBefore);
            if (Math.abs(recordedCredit - Number(tx.amount)) < 0.005) {
                return res.json({
                    success: true,
                    status: 'Success',
                    walletBalance: user ? user.walletBalance : tx.balanceAfter,
                    amount: tx.amount
                });
            }
        } else if (tx.status === 'Failed') {
            return res.json({
                success: false,
                status: 'Failed',
                amount: tx.amount
            });
        }

        const providerResponse = await queryOrderStatus(tx, txnDate || tx.gatewayTxnDate);
        const providerData = providerResponse && providerResponse.data;
        const providerStatus = String(providerData && providerData.status || '').toLowerCase();

        if (providerResponse && providerResponse.status === true && providerStatus === 'success') {
            const result = await creditVerifiedOrder(req, tx, providerData);
            return res.json(result);
        }

        if (providerResponse && providerResponse.status === true && providerStatus === 'failure') {
            await WalletTransaction.updateOne(
                { _id: tx._id, status: 'Pending' },
                { $set: { status: 'Failed', gatewayTxnId: String(providerData.upi_txn_id || '') } }
            );
            return res.json({ success: false, status: 'Failed', message: 'The QR payment was not completed.' });
        }

        return res.json({
            success: false,
            status: 'Pending',
            message: providerResponse && providerResponse.msg || 'Payment is awaiting provider confirmation.'
        });
    } catch (error) {
        console.error('[EkQR status check] Error:', error.message);
        return res.status(error.statusCode || 502).json({
            success: false,
            message: error.statusCode ? error.message : 'Unable to verify QR payment status with the provider.'
        });
    }
};

router.post('/initiate', async (req, res) => {
    const { userId, amount } = req.body || {};
    const numericAmount = Number(amount);

    if (!userId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Enter a valid user and payment amount.' });
    }

    const apiKey = getApiKey();
    if (!apiKey) {
        return res.status(503).json({ success: false, message: 'QR payment API key is not configured on the server.' });
    }

    try {
        const user = await User.findOne({ userId: String(userId).trim() });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Wallet user not found.' });
        }

        const customerName = String(user.name || user.shopName || '').trim();
        const customerEmail = String(user.email || '').trim();
        const customerMobile = String(user.mobile || '').trim();
        if (!customerName || !customerEmail || !customerMobile) {
            return res.status(400).json({
                success: false,
                message: 'Add your name, email, and mobile number to your profile before using QR Code Add Funds.'
            });
        }

        const redirectValue = process.env.FRONTEND_URL;
        let redirectUrl;
        try {
            const parsedRedirectUrl = new URL(redirectValue);
            if (!['http:', 'https:'].includes(parsedRedirectUrl.protocol)) throw new Error('Invalid protocol');
            redirectUrl = new URL('/wallet', parsedRedirectUrl.origin).toString();
        } catch (error) {
            return res.status(503).json({
                success: false,
                message: 'Configure FRONTEND_URL for QR payment redirects.'
            });
        }

        const txnId = `QR${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
        const txnDate = formatTxnDate(new Date());
        const pendingTx = new WalletTransaction({
            userId: user.userId,
            transactionType: 'Credit',
            amount: Number(numericAmount.toFixed(2)),
            balanceBefore: user.walletBalance,
            balanceAfter: user.walletBalance,
            description: `Wallet Top-Up via EkQR (Ref: ${txnId})`,
            referenceNumber: txnId,
            status: 'Pending',
            paymentGateway: 'EkQR',
            gatewayTxnDate: txnDate
        });
        await pendingTx.save();

        try {
            const providerResponse = await axios.post(CREATE_ORDER_URL, {
                key: apiKey,
                client_txn_id: txnId,
                amount: numericAmount.toFixed(2),
                p_info: 'Wallet Add Funds',
                customer_name: customerName,
                customer_email: customerEmail,
                customer_mobile: customerMobile,
                redirect_url: redirectUrl,
                udf1: user.userId.slice(0, 25),
                udf2: '',
                udf3: ''
            }, { timeout: 15000 });

            const orderData = providerResponse.data && providerResponse.data.data;
            if (providerResponse.data && providerResponse.data.status === true && orderData && orderData.payment_url) {
                return res.json({
                    success: true,
                    txnId,
                    amount: pendingTx.amount,
                    checkoutUrl: orderData.payment_url,
                    upiIntent: orderData.upi_intent || {},
                    gateway: 'EkQR',
                    message: 'QR payment order created. Complete payment on the provider checkout page.'
                });
            }

            await WalletTransaction.updateOne(
                { _id: pendingTx._id, status: 'Pending' },
                { $set: { status: 'Failed' } }
            );
            return res.status(502).json({
                success: false,
                message: providerResponse.data && providerResponse.data.msg || 'The QR provider could not create the payment order.'
            });
        } catch (error) {
            console.error(`[EkQR order creation] Request failed for ${txnId}:`, error.message);
            return res.status(502).json({
                success: false,
                message: 'Could not reach the QR payment provider. If an order was created, it will remain uncredited until provider verification succeeds.'
            });
        }
    } catch (error) {
        console.error('[EkQR order creation] Error:', error.message);
        return res.status(500).json({ success: false, message: 'Unable to create the QR payment order.' });
    }
});

router.get('/check-status/:txnId', (req, res) =>
    checkTransactionStatus(req, res, req.params.txnId)
);

router.post('/reconcile/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.params.userId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Wallet user not found.' });
        }

        const successfulQrTransactions = await WalletTransaction.find({
            userId: user.userId,
            paymentGateway: 'EkQR',
            status: 'Success'
        }).sort({ createdAt: -1 }).limit(20);

        let reconciledCount = 0;
        for (const tx of successfulQrTransactions) {
            const recordedCredit = Number(tx.balanceAfter) - Number(tx.balanceBefore);
            if (Math.abs(recordedCredit - Number(tx.amount)) < 0.005) continue;

            const providerResponse = await queryOrderStatus(tx);
            const providerData = providerResponse && providerResponse.data;
            if (
                providerResponse &&
                providerResponse.status === true &&
                String(providerData && providerData.status).toLowerCase() === 'success'
            ) {
                const result = await creditVerifiedOrder(req, tx, providerData);
                if (result.success && result.status === 'Success') reconciledCount += 1;
            }
        }

        const updatedUser = await User.findOne({ userId: user.userId });
        return res.json({
            success: true,
            walletBalance: Number(updatedUser.walletBalance || 0),
            reconciledCount
        });
    } catch (error) {
        console.error('[EkQR wallet reconciliation] Error:', error.message);
        return res.status(error.statusCode || 502).json({
            success: false,
            message: error.statusCode ? error.message : 'Unable to reconcile verified QR payments.'
        });
    }
});

router.post('/callback', async (req, res) => {
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    const txnId = payload.client_txn_id;
    if (!txnId) {
        return res.status(400).json({ status: 'failed', message: 'Missing client transaction ID.' });
    }

    try {
        const tx = await findTransaction(txnId);
        if (!tx) {
            return res.status(404).json({ status: 'failed', message: 'QR payment transaction not found.' });
        }

        const callbackDate = parseTxnDate(payload.txnAt);
        const result = await checkTransactionStatus(req, res, txnId, callbackDate);
        if (res.headersSent) return result;
        return result;
    } catch (error) {
        console.error(`[EkQR callback] Verification failed for ${txnId}:`, error.message);
        return res.status(502).json({ status: 'failed', message: 'Could not verify the payment callback.' });
    }
});

module.exports = router;
