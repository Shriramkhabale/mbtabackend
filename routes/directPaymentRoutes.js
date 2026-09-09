const express = require('express');
const router = express.Router();
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const UPIConfig = require('../models/UPIConfig');
const crypto = require('crypto');

// Generate JWT token for PaySprint API
const generatePaySprintToken = (jwtKey) => {
    const base64url = (str) => {
        return str.toString('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    };

    let partnerId = 'PS00121758';
    try {
        const decoded = Buffer.from(jwtKey, 'base64').toString('utf8');
        if (decoded && decoded.startsWith('PS')) {
            const match = decoded.match(/^(PS\d+)/);
            if (match) {
                partnerId = match[1];
            }
        }
    } catch (e) {
        console.error("Error decoding JWT_KEY for partnerId:", e);
    }

    const header = { typ: 'JWT', alg: 'HS256' };
    const payload = {
        iss: 'PAYSPRINT',
        timestamp: Math.floor(Date.now() / 1000),
        partnerId: partnerId,
        product: 'WALLET',
        reqid: String(Math.floor(100000 + Math.random() * 900000))
    };

    const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
    const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
    const signatureInput = `${headerB64}.${payloadB64}`;
    
    const signature = crypto.createHmac('sha256', jwtKey)
        .update(signatureInput)
        .digest();
    const signatureB64 = base64url(signature);
    return `${signatureInput}.${signatureB64}`;
};

// POST /api/direct-payment/initiate
// Called when retailer submits checkout, creates a pending transaction and initiates PG or UPI QR
router.post('/initiate', async (req, res) => {
    const { userId, amount, paymentMethod } = req.body;

    if (!userId || amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid payment parameters' });
    }

    try {
        const user = await User.findOne({ userId: { $regex: new RegExp(`^${userId}$`, 'i') } });
        if (!user) {
            return res.status(404).json({ success: false, message: `User '${userId}' not found. Please check your account.` });
        }

        // Generate a unique transaction ID
        const txnId = 'PG' + Date.now() + Math.floor(Math.random() * 10000);

        // Save a pending wallet transaction record
        const pendingTx = new WalletTransaction({
            userId: user.userId,
            transactionType: 'Credit',
            amount: Number(amount),
            balanceBefore: user.walletBalance,
            balanceAfter: user.walletBalance,
            description: `Wallet Top-Up via ${paymentMethod || 'Payment Gateway'} (Pending)`,
            referenceNumber: txnId,
            status: 'Pending'
        });
        await pendingTx.save();

        // Check if PaySprint credentials are set up for live/sandbox UPI Collection API
        const jwtKey = process.env.JWT_KEY;
        const authorisedKey = process.env.AUTHORISED_KEY;

        let qrData = null;
        let upiLink = '';

        if (paymentMethod === 'UPI' && jwtKey && authorisedKey) {
            try {
                const token = generatePaySprintToken(jwtKey);
                const environment = process.env.ENVIRONMENT || 'UAT';
                const url = environment === 'UAT'
                    ? 'https://uat.paysprint.in/service-api/api/v1/service/upi/upiqr/generate'
                    : 'https://api.paysprint.in/service-api/api/v1/service/upi/upiqr/generate';

                const bodyData = {
                    amount: String(amount),
                    txnid: txnId,
                    mobile: user.mobile || '8766020070',
                    email: user.email || 'customer@gmail.com',
                    name: user.name || 'Retailer',
                    remarks: 'Wallet TopUp'
                };

                const paysprintRes = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorisedkey': authorisedKey,
                        'Token': token,
                        'accept': 'application/json',
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify(bodyData)
                });

                if (paysprintRes.ok) {
                    const data = await paysprintRes.json();
                    if (data && (data.status === true || data.response_code === 1)) {
                        qrData = data.qr_url || data.qrCode || data.qr_code;
                        upiLink = data.upi_link || data.upiLink || '';
                    }
                }
            } catch (err) {
                console.error("PaySprint UPI QR generation failed, falling back to merchant direct QR:", err.message);
            }
        }

        // If PaySprint PG failed or wasn't used, construct a direct merchant UPI QR code
        if (!qrData) {
            const upiConfig = await UPIConfig.findOne();
            const merchantUpiId = upiConfig && upiConfig.upiId ? upiConfig.upiId : 'paysprint@ybl';
            upiLink = `upi://pay?pa=${merchantUpiId}&pn=MB%20MITRA&am=${amount}&tr=${txnId}&tn=Wallet%20TopUp&cu=INR`;
            qrData = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiLink)}`;
        }

        // Return the order metadata and generated QR details for frontend checkout display
        res.json({
            success: true,
            txnId,
            amount: Number(amount),
            userId: user.userId,
            paymentMethod: paymentMethod || 'UPI',
            qrCodeUrl: qrData,
            upiLink: upiLink,
            message: 'Payment initiated. Proceed to checkout.'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/direct-payment/confirm
// Called after client-side successful payment – verifies and credits wallet
router.post('/confirm', async (req, res) => {
    const { userId, amount, txnId, paymentMethod } = req.body;

    if (!userId || !txnId || amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Missing or invalid required fields' });
    }

    try {
        const user = await User.findOne({ userId: { $regex: new RegExp(`^${userId}$`, 'i') } });
        if (!user) {
            return res.status(404).json({ success: false, message: `User '${userId}' not found` });
        }

        // Find the transaction record in our database
        let tx = await WalletTransaction.findOne({ referenceNumber: txnId });
        
        // If already success, just return success
        if (tx && tx.status === 'Success') {
            return res.json({
                success: true,
                message: 'Payment already confirmed.',
                walletBalance: user.walletBalance,
                transaction: tx
            });
        }

        const jwtKey = process.env.JWT_KEY;
        const authorisedKey = process.env.AUTHORISED_KEY;
        let isVerified = false;
        let gatewayResponseMsg = '';

        // If credentials exist and it is a UPI gateway transaction, perform API verification
        if (paymentMethod === 'UPI' && jwtKey && authorisedKey) {
            try {
                const token = generatePaySprintToken(jwtKey);
                const environment = process.env.ENVIRONMENT || 'UAT';
                const url = environment === 'UAT'
                    ? 'https://uat.paysprint.in/service-api/api/v1/service/upi/upiqr/status'
                    : 'https://api.paysprint.in/service-api/api/v1/service/upi/upiqr/status';

                console.log(`[Confirm Verification] Querying status for txnId: ${txnId} from PaySprint UAT...`);
                const paysprintRes = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorisedkey': authorisedKey,
                        'Token': token,
                        'accept': 'application/json',
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({ txnid: txnId })
                });

                if (paysprintRes.ok) {
                    const data = await paysprintRes.json();
                    console.log('[Confirm Verification] PaySprint response:', data);
                    
                    // If PaySprint confirms it is a successful transaction
                    const isSuccess = data && (
                        data.status === true || 
                        data.response_code === 1 || 
                        (data.txn_status && String(data.txn_status).toLowerCase() === 'success') ||
                        (data.data && data.data.status === 'success')
                    );
                    
                    if (isSuccess) {
                        isVerified = true;
                        gatewayResponseMsg = data.message || 'Verified successfully';
                    } else {
                        gatewayResponseMsg = data.message || 'Payment pending or not found on PaySprint';
                    }
                } else {
                    gatewayResponseMsg = `HTTP Error ${paysprintRes.status}`;
                }
            } catch (err) {
                console.error("[Confirm Verification] PaySprint API status check error:", err);
                gatewayResponseMsg = `Status API unreachable: ${err.message}`;
            }
        } else {
            // For fallback mode (no credentials) or cards/netbanking (simulated processing in demo)
            console.log(`[Confirm Verification] Bypass validation: No PaySprint credentials or non-UPI method. Auto-verifying transaction ${txnId}.`);
            isVerified = true;
            gatewayResponseMsg = 'Simulated Verification Success';
        }

        if (!isVerified) {
            return res.status(400).json({
                success: false,
                message: `Payment verification failed: ${gatewayResponseMsg}. Wallet not credited.`
            });
        }

        // Credit the wallet
        const creditAmount = Number(amount);
        const balanceBefore = user.walletBalance;
        user.walletBalance = parseFloat((user.walletBalance + creditAmount).toFixed(2));
        await user.save();

        if (tx) {
            tx.status = 'Success';
            tx.balanceBefore = balanceBefore;
            tx.balanceAfter = user.walletBalance;
            tx.description = `Wallet Top-Up via ${paymentMethod || 'Payment Gateway'}`;
            await tx.save();
        } else {
            // Create a new success record if it didn't exist
            tx = new WalletTransaction({
                userId: user.userId,
                transactionType: 'Credit',
                amount: creditAmount,
                balanceBefore,
                balanceAfter: user.walletBalance,
                description: `Wallet Top-Up via ${paymentMethod || 'Payment Gateway'}`,
                referenceNumber: txnId,
                status: 'Success'
            });
            await tx.save();
        }

        res.json({
            success: true,
            message: 'Payment verified and confirmed. Wallet credited.',
            walletBalance: user.walletBalance,
            transaction: tx
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/direct-payment/callback
// Handles webhook callback from PaySprint to dynamically credit wallet
router.post('/callback', async (req, res) => {
    console.log('[PG Webhook Callback] Received payload:', req.body);
    
    // IP Security check
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (clientIp && clientIp.includes(',')) {
        clientIp = clientIp.split(',')[0].trim();
    }
    if (clientIp && clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.substring(7);
    }

    const allowedIpsStr = process.env.ALLOWED_IP || '';
    const allowedIps = allowedIpsStr.split(',').map(ip => ip.trim()).filter(Boolean);
    const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === 'localhost';
    const isUAT = process.env.ENVIRONMENT === 'UAT';

    if (allowedIps.length > 0 && !allowedIps.includes(clientIp)) {
        if (isUAT && isLocalhost) {
            console.log(`[PG Webhook Callback] Bypassing IP check for localhost in UAT mode (Client IP: ${clientIp})`);
        } else {
            console.warn(`[PG Webhook Callback] Forbidden access attempt from IP: ${clientIp}`);
            return res.status(403).json({ status: 'failed', message: 'Forbidden: Unauthorized IP' });
        }
    }

    const { status, txnid, amount, refno } = req.body;

    const isSuccess = status === 1 || status === '1' || status === 'success' || status === 'Success' || status === true;
    if (!isSuccess) {
        return res.json({ status: 'ignored', message: 'Transaction status is not success' });
    }

    try {
        const targetTxnId = txnid || refno;
        const tx = await WalletTransaction.findOne({ referenceNumber: targetTxnId, status: 'Pending' });
        if (!tx) {
            return res.status(404).json({ status: 'failed', message: 'Pending transaction not found' });
        }

        const user = await User.findOne({ userId: tx.userId });
        if (!user) {
            return res.status(404).json({ status: 'failed', message: 'User not found' });
        }

        // Verify if payment amount matches
        if (amount && Number(amount) !== tx.amount) {
            console.warn(`[PG Webhook Callback] Amount mismatch: expected ₹${tx.amount}, got ₹${amount}. Crediting the requested amount ₹${tx.amount}.`);
        }

        const creditAmount = tx.amount;
        const balanceBefore = user.walletBalance;
        user.walletBalance = parseFloat((user.walletBalance + creditAmount).toFixed(2));
        await user.save();

        tx.status = 'Success';
        tx.balanceBefore = balanceBefore;
        tx.balanceAfter = user.walletBalance;
        tx.description = `Wallet Top-Up via PaySprint PG Webhook`;
        await tx.save();

        console.log(`[PG Webhook Callback] Successfully credited ₹${creditAmount} to user ${user.userId}`);
        res.json({ status: 'success', message: 'Callback processed, wallet credited' });
    } catch (error) {
        console.error('[PG Webhook Callback] Error processing callback:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// GET /api/direct-payment/balance/:userId
// Fetch wallet balance for a user
router.get('/balance/:userId', async (req, res) => {
    try {
        const user = await User.findOne({
            userId: { $regex: new RegExp(`^${req.params.userId}$`, 'i') }
        });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ walletBalance: user.walletBalance });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
