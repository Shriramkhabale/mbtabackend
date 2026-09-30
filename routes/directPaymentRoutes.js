const express = require('express');
const router = express.Router();
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const UPIConfig = require('../models/UPIConfig');
const {
    getPartnerId,
    getBaseUrl,
    getHeaders,
    decryptPayload,
    encryptPayload
} = require('../utils/paysprint');

// In-memory ring buffer for recent callback logs (for live status inspection)
const recentCallbackLogs = [];
const recordCallbackLog = (logEntry) => {
    recentCallbackLogs.unshift({
        timestamp: new Date().toISOString(),
        ...logEntry
    });
    if (recentCallbackLogs.length > 100) {
        recentCallbackLogs.pop();
    }
};

/**
 * Query status from PaySprint Live / Sandbox API
 */
const queryPaySprintStatus = async (txnId) => {
    try {
        const partnerId = getPartnerId();
        const baseUrl = getBaseUrl();
        const headers = getHeaders('WALLET');

        const endpoints = [
            {
                url: `${baseUrl}/api/v1/service/upi/cashout/txn_status`,
                body: { merchant_code: partnerId, refid: txnId }
            },
            {
                url: `${baseUrl}/api/v1/service/upi/status`,
                body: { txnid: txnId, referenceid: txnId }
            },
            {
                url: `${baseUrl}/service-api/api/v1/service/upi/upiqr/status`,
                body: { txnid: txnId, referenceid: txnId }
            }
        ];

        for (const ep of endpoints) {
            try {
                const paysprintRes = await fetch(ep.url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(ep.body)
                });

                if (paysprintRes.ok) {
                    const data = await paysprintRes.json();
                    console.log(`[PaySprint Status Query ${ep.url}] Response:`, data);
                    
                    const isSuccess = data && (
                        data.status === true || 
                        data.response_code === 1 || 
                        (data.txn_status && (String(data.txn_status).toUpperCase() === 'SUCCESS' || data.txn_status === 1 || data.txn_status === '1')) ||
                        (data.data && (
                            data.data.status === 'success' || 
                            data.data.status === 'SUCCESS' || 
                            data.data.response_code === 1 ||
                            data.data.txn_status === '1' ||
                            data.data.txn_status === 1
                        ))
                    );

                    if (isSuccess) {
                        return {
                            isVerified: true,
                            data: data,
                            message: data.message || 'Transaction confirmed by PaySprint'
                        };
                    }
                }
            } catch (innerErr) {
                // Try next endpoint
            }
        }

        return {
            isVerified: false,
            message: 'Payment awaiting confirmation. Please complete payment in your UPI app.'
        };
    } catch (err) {
        console.error('[PaySprint Status Query] Exception:', err);
        return { isVerified: false, message: 'Payment verification pending' };
    }
};

/**
 * POST /api/direct-payment/initiate
 * Called when user requests top-up. Generates PaySprint Dynamic QR Code.
 */
router.post('/initiate', async (req, res) => {
    const { userId, amount, paymentMethod } = req.body || {};

    if (!userId || amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid payment parameters' });
    }

    try {
        const user = await User.findOne({ userId: { $regex: new RegExp(`^${userId}$`, 'i') } });
        if (!user) {
            return res.status(404).json({ success: false, message: `User '${userId}' not found.` });
        }

        // COMPULSORY ONBOARDING CHECK
        if (!user.isPaySprintOnboarded) {
            return res.status(403).json({ 
                success: false, 
                message: 'ONBOARDING_REQUIRED',
                description: 'Please complete your PaySprint Onboarding KYC before adding funds to your wallet.' 
            });
        }

        // Generate a unique PaySprint transaction reference ID
        const txnId = 'PS' + Date.now() + Math.floor(1000 + Math.random() * 9000);

        // Save a pending wallet transaction record
        const pendingTx = new WalletTransaction({
            userId: user.userId,
            transactionType: 'Credit',
            amount: Number(amount),
            balanceBefore: user.walletBalance,
            balanceAfter: user.walletBalance,
            description: `Wallet Top-Up via PaySprint Live UPI QR (Ref: ${txnId})`,
            referenceNumber: txnId,
            status: 'Pending'
        });
        await pendingTx.save();

        // 1. Generate Static PaySprint UPI Collection QR
        const UPIConfig = require('../models/UPIConfig');
        const upiConfig = await UPIConfig.findOne();
        
        // If the admin hasn't set their UPI ID in the DB, fallback to their PaySprint VPA (can be added to .env)
        const merchantUpiId = (upiConfig && upiConfig.upiId) ? upiConfig.upiId : (process.env.PAYSPRINT_UPI_ID || 'mbmitra@icici');

        // Create the UPI Intent Link
        const upiLink = `upi://pay?pa=${merchantUpiId}&pn=MB%20MITRA&am=${Number(amount).toFixed(2)}&tr=${txnId}&tn=Wallet%20TopUp&cu=INR`;
        
        // Generate QR Image using a public API
        const qrData = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(upiLink)}`;
        const checkoutUrl = '';

        res.json({
            success: true,
            txnId,
            amount: Number(amount),
            userId: user.userId,
            paymentMethod: paymentMethod || 'UPI',
            qrCodeUrl: qrData,
            upiLink: upiLink,
            checkoutUrl: checkoutUrl,
            gateway: 'PaySprint Live PG',
            message: 'PaySprint Payment QR generated. Scan with any UPI app to complete top-up.'
        });
    } catch (error) {
        console.error('[Direct Payment Initiate] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Handle Status Check (Polling & Manual Button)
 */
const handleStatusCheck = async (req, res) => {
    const txnId = req.params?.txnId || req.body?.txnId || req.query?.txnId;

    if (!txnId) {
        return res.status(400).json({ success: false, message: 'Missing transaction ID' });
    }

    try {
        let tx = await WalletTransaction.findOne({ referenceNumber: txnId });
        if (!tx) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        const user = await User.findOne({ userId: tx.userId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // If already marked success, return immediately
        if (tx.status === 'Success') {
            return res.json({
                success: true,
                status: 'Success',
                message: 'Payment verified and credited to wallet.',
                walletBalance: user.walletBalance,
                amount: tx.amount,
                transaction: tx
            });
        }

        // Query status from PaySprint Live API
        const statusResult = await queryPaySprintStatus(txnId);

        if (statusResult.isVerified) {
            const creditAmount = Number(tx.amount);
            const balanceBefore = user.walletBalance;
            user.walletBalance = parseFloat((user.walletBalance + creditAmount).toFixed(2));
            await user.save();

            tx.status = 'Success';
            tx.balanceBefore = balanceBefore;
            tx.balanceAfter = user.walletBalance;
            tx.description = `Wallet Top-Up via PaySprint Live UPI`;
            if (statusResult.data) {
                tx.paysprintResponse = statusResult.data;
            }
            await tx.save();

            // Emit socket update
            const io = req.app.get('io');
            if (io) {
                io.emit('wallet_balance_updated', {
                    userId: user.userId,
                    walletBalance: user.walletBalance,
                    amount: creditAmount,
                    type: 'Credit',
                    txnId: txnId
                });
                io.emit('payment_success', {
                    userId: user.userId,
                    walletBalance: user.walletBalance,
                    amount: creditAmount,
                    txnId: txnId
                });
            }

            return res.json({
                success: true,
                status: 'Success',
                message: `Payment verified! ₹${creditAmount.toFixed(2)} credited to your wallet.`,
                walletBalance: user.walletBalance,
                amount: creditAmount,
                transaction: tx
            });
        } else {
            return res.json({
                success: false,
                status: 'Pending',
                message: statusResult.message || 'Payment is awaiting completion.',
                walletBalance: user.walletBalance
            });
        }
    } catch (error) {
        console.error('[Direct Payment Status Check] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

router.get('/check-status/:txnId', handleStatusCheck);
router.post('/check-status', handleStatusCheck);
router.post('/check-status/:txnId', handleStatusCheck);
router.post('/confirm', handleStatusCheck);

/**
 * Real-time PaySprint Callback Webhook Handler
 */
const handlePaySprintCallback = async (req, res) => {
    const rawBody = req.body || {};
    const rawQuery = req.query || {};
    console.log('[PaySprint PG Callback] Received payload:', JSON.stringify(rawBody), 'Query:', JSON.stringify(rawQuery));

    let payload = { ...rawQuery, ...rawBody };

    // Decrypt if AES encrypted
    if (payload.data || payload.encdata || payload.response) {
        const encryptedStr = payload.data || payload.encdata || payload.response;
        const decrypted = decryptPayload(encryptedStr);
        if (decrypted) {
            console.log('[PaySprint PG Callback] Decrypted payload:', decrypted);
            payload = { ...payload, ...decrypted };
        }
    }

    // Resolve transaction ID across PaySprint field variants
    const targetTxnId = payload.txnid || payload.refno || payload.referenceid || payload.merchant_txn_id || payload.client_txn_id || payload.order_id || payload.txnId || payload.prn || payload.refid;

    // Resolve payment status
    const statusVal = payload.status !== undefined ? payload.status : payload.txn_status !== undefined ? payload.txn_status : payload.response_code;
    const isSuccess = statusVal === 1 || statusVal === '1' || statusVal === true || statusVal === 'true' ||
        String(statusVal).toUpperCase() === 'SUCCESS' || String(statusVal).toUpperCase() === 'TXN_SUCCESS';

    const utr = payload.bank_ref_num || payload.rrn || payload.utr || payload.bank_txn_id || payload.ackno || '';
    const payerVpa = payload.payer_vpa || payload.vpa || payload.payerVpa || '';

    recordCallbackLog({
        targetTxnId,
        statusVal,
        isSuccess,
        utr,
        payerVpa,
        payload
    });

    if (!targetTxnId) {
        console.warn('[PaySprint PG Callback] Missing transaction ID in callback payload');
        return res.status(400).json({ status: 'failed', message: 'Missing transaction reference in callback' });
    }

    if (!isSuccess) {
        console.log(`[PaySprint PG Callback] Transaction ${targetTxnId} status is not success (${statusVal})`);
        return res.json({ status: 'ignored', message: 'Transaction status is not success' });
    }

    try {
        let tx = await WalletTransaction.findOne({ referenceNumber: targetTxnId });
        if (!tx) {
            console.warn(`[PaySprint PG Callback] Transaction not found for Ref: ${targetTxnId}`);
            return res.status(404).json({ status: 'failed', message: `Transaction '${targetTxnId}' not found` });
        }

        const user = await User.findOne({ userId: tx.userId });
        if (!user) {
            return res.status(404).json({ status: 'failed', message: `User '${tx.userId}' not found` });
        }

        // If already credited, return immediately
        if (tx.status === 'Success') {
            return res.json({ status: 'success', message: 'Transaction already credited to wallet' });
        }

        const creditAmount = Number(payload.amount) || tx.amount;
        const balanceBefore = user.walletBalance;
        user.walletBalance = parseFloat((user.walletBalance + creditAmount).toFixed(2));
        await user.save();

        tx.status = 'Success';
        tx.balanceBefore = balanceBefore;
        tx.balanceAfter = user.walletBalance;
        tx.description = `Wallet Top-Up via PaySprint UPI Callback${utr ? ` (UTR: ${utr})` : ''}`;
        tx.paysprintTxnId = utr || targetTxnId;
        tx.paysprintResponse = payload;
        await tx.save();

        // Emit real-time WebSocket event
        const io = req.app.get('io');
        if (io) {
            io.emit('wallet_balance_updated', {
                userId: user.userId,
                walletBalance: user.walletBalance,
                amount: creditAmount,
                type: 'Credit',
                txnId: targetTxnId,
                utr: utr,
                status: 'Success'
            });
            io.emit('payment_success', {
                userId: user.userId,
                walletBalance: user.walletBalance,
                amount: creditAmount,
                txnId: targetTxnId
            });
        }

        console.log(`[PaySprint PG Callback] Successfully credited ₹${creditAmount} to user ${user.userId} (Ref: ${targetTxnId})`);
        res.json({ status: 'success', message: 'Callback processed, wallet credited in real-time' });
    } catch (error) {
        console.error('[PaySprint PG Callback] Error processing callback:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
};

router.post('/callback', handlePaySprintCallback);
router.get('/callback', handlePaySprintCallback);

// Callback debug logs
router.get('/callback-logs', (req, res) => {
    res.json({
        total: recentCallbackLogs.length,
        logs: recentCallbackLogs
    });
});

/**
 * GET /api/direct-payment/debug-paysprint
 * Diagnostic endpoint — tests PaySprint credentials and shows raw API response.
 * REMOVE this route before going to production.
 */
router.get('/debug-paysprint', async (req, res) => {
    try {
        const partnerId = getPartnerId();
        const baseUrl = getBaseUrl();
        const headers = getHeaders('WALLET');
        const testTxnId = 'PSTEST' + Date.now();

        const results = {};

        // Show what credentials are being used
        results.config = {
            partnerId,
            baseUrl,
            environment: process.env.ENVIRONMENT,
            jwtKeyPresent: !!process.env.JWT_KEY,
            authorisedKeyPresent: !!process.env.AUTHORISED_KEY,
            headers: { ...headers, Token: headers.Token ? headers.Token.substring(0, 30) + '...' : 'MISSING' }
        };

        // Test QR generation endpoints and Onboarding
        const qrEndpoints = [
            `${baseUrl}/service-api/api/v1/service/upi/cashout/get_token`,
            `${baseUrl}/api/v1/service/onboard/onboard/getonboardurl`
        ];

        const qrBody = {
            merchantcode: partnerId,
            mobile: '9999999999',
            is_new: '1',
            email: 'test@mbmitra.com',
            firm: 'Debug Test',
            callback: 'https://api.mbmitra.in/api/paysprint/onboard/callback'
        };

        results.qrTests = [];
        
        // Helper to test a specific JWT token
        const testJwt = async (name, testToken) => {
            try {
                const psRes = await fetch(`${baseUrl}/api/v1/service/onboard/onboard/getonboardurl`, {
                    method: 'POST',
                    headers: {
                        'Token': testToken,
                        'accept': 'application/json',
                        'content-type': 'application/json',
                        'User-Agent': partnerId,
                        'Authorisedkey': process.env.AUTHORISED_KEY || ''
                    },
                    body: JSON.stringify(qrBody)
                });
                const text = await psRes.text();
                let parsed;
                try { parsed = JSON.parse(text); } catch { parsed = text; }
                results.qrTests.push({ name, response: parsed });
            } catch (e) {
                results.qrTests.push({ name, error: e.message });
            }
        };

        const crypto = require('crypto');
        const base64url = (str) => str.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        
        const generateTestToken = (secret) => {
            const headerB64 = base64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })));
            const payloadB64 = base64url(Buffer.from(JSON.stringify({
                iss: 'PAYSPRINT', timestamp: Math.floor(Date.now() / 1000), partnerId: partnerId, product: 'ONBOARDING', reqid: '123456'
            })));
            const signatureInput = `${headerB64}.${payloadB64}`;
            const signature = crypto.createHmac('sha256', secret).update(signatureInput).digest();
            return `${signatureInput}.${base64url(signature)}`;
        };

        const jwtKeyStr = process.env.JWT_KEY || '';
        const jwtKeyBuf = Buffer.from(jwtKeyStr, 'base64');
        const jwtKeyDecodedStr = jwtKeyBuf.toString('utf8');
        const jwtSecretPart = jwtKeyDecodedStr.replace(partnerId, ''); // Just the secret part

        await testJwt('Variant 1 (Raw Base64 String)', generateTestToken(jwtKeyStr));
        await testJwt('Variant 2 (Base64 Buffer)', generateTestToken(jwtKeyBuf));
        await testJwt('Variant 3 (Decoded String)', generateTestToken(jwtKeyDecodedStr));
        if (jwtSecretPart) {
            await testJwt('Variant 4 (Just Secret Part)', generateTestToken(jwtSecretPart));
        }

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Balance query helper
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
module.exports.handlePaySprintCallback = handlePaySprintCallback;
