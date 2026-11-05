const express = require('express');
const axios = require('axios');
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
    const claimedTx = await WalletTransaction.findOneAndUpdate(
        { _id: tx._id, status: 'Pending' },
        {
            $set: {
                status: 'Success',
                gatewayTxnId: providerTxnId,
                description: `Wallet Top-Up via EkQR${providerTxnId ? ` (UTR: ${providerTxnId})` : ''}`
            }
        },
        { new: true }
    );

    if (!claimedTx) {
        const currentTx = await WalletTransaction.findById(tx._id);
        if (currentTx && currentTx.status === 'Success') {
            const user = await User.findOne({ userId: currentTx.userId });
            return {
                success: true,
                status: 'Success',
                message: 'Payment already credited.',
                walletBalance: user ? user.walletBalance : currentTx.balanceAfter,
                amount: currentTx.amount
            };
        }
        return { success: false, status: currentTx ? currentTx.status : 'Pending', message: 'Payment is not confirmed.' };
    }

    const user = await User.findOneAndUpdate(
        { userId: claimedTx.userId },
        [{
            $set: {
                walletBalance: {
                    $round: [
                        { $add: [{ $ifNull: ['$walletBalance', 0] }, Number(claimedTx.amount)] },
                        2
                    ]
                }
            }
        }],
        { new: true }
    );

    if (!user) {
        await WalletTransaction.updateOne(
            { _id: claimedTx._id, status: 'Success' },
            { $set: { status: 'Pending' } }
        );
        throw new Error(`Wallet owner not found for transaction ${claimedTx.referenceNumber}`);
    }

    const balanceAfter = Number(Number(user.walletBalance).toFixed(2));
    const balanceBefore = Number((balanceAfter - Number(claimedTx.amount)).toFixed(2));

    claimedTx.balanceBefore = balanceBefore;
    claimedTx.balanceAfter = balanceAfter;
    await claimedTx.save();

    const io = req.app.get('io');
    if (io) {
        const event = {
            userId: user.userId,
            walletBalance: balanceAfter,
            amount: claimedTx.amount,
            type: 'Credit',
            txnId: claimedTx.referenceNumber,
            status: 'Success'
        };
        io.emit('wallet_balance_updated', event);
        io.emit('payment_success', event);
    }

    return {
        success: true,
        status: 'Success',
        message: `Payment verified. ₹${Number(claimedTx.amount).toFixed(2)} credited to your wallet.`,
        walletBalance: balanceAfter,
        amount: claimedTx.amount
    };
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

        if (tx.status === 'Success' || tx.status === 'Failed') {
            const user = await User.findOne({ userId: tx.userId });
            return res.json({
                success: tx.status === 'Success',
                status: tx.status,
                walletBalance: user ? user.walletBalance : tx.balanceAfter,
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
