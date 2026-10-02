const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { getPartnerId, getBaseUrl, getHeaders, decryptPayload } = require('../utils/paysprint');

/**
 * @route POST /api/paysprint/onboard/generate-url
 * @desc Generate PaySprint Onboarding KYC URL for a retailer
 */
router.post('/generate-url', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.isPaySprintOnboarded) {
            return res.status(200).json({ success: true, message: 'User is already onboarded.' });
        }

        const baseUrl = getBaseUrl();
        const onboardUrl = `${baseUrl}/api/v1/service/onboard/onboard/getonboardurl`;
        const headers = getHeaders('ONBOARDING');

        // Ensure merchantcode does not contain special characters
        const cleanMerchantCode = (user.retailerId || user.userId).toString().replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);

        const payload = {
            merchantcode: cleanMerchantCode,
            mobile: user.mobile || '9999999999',
            is_new: '0',
            email: user.email || 'retailer@mbmitra.com',
            firm: user.shopName || user.name || 'MB Mitra Retailer',
            callback: `https://api.mbmitra.in/api/paysprint/onboard/callback`
        };

        // Log outgoing server IP for debugging whitelist issues
        try {
            const ipRes = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipRes.json();
            console.log('[PaySprint Onboard] Server outgoing IP:', ipData.ip, '| Target URL:', onboardUrl);
        } catch (_) {}

        console.log('\n================ PAYSPRINT KYC LOG ================');
        console.log('1. Target URL:', onboardUrl);
        console.log('2. Request Headers:', JSON.stringify({
            'Authorisedkey': headers['Authorisedkey'],
            'Token': headers['Token'] ? headers['Token'].substring(0,20) + '...' : 'MISSING'
        }));
        console.log('3. Request Payload Sent to PaySprint:', JSON.stringify(payload, null, 2));
        console.log('4. Partner ID Extracted by Code:', getPartnerId());
        console.log('===================================================\n');

        const response = await fetch(onboardUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const rawText = await response.text();
        console.log('[PaySprint Onboarding URL] HTTP Status:', response.status, '| Raw Response from PaySprint:', rawText);

        let data;
        try { data = JSON.parse(rawText); } catch (_) { data = { status: false, message: rawText }; }

        if (data.status === true || data.response_code === 1) {
            const redirectUrl = data.url || data.message;
            return res.status(200).json({
                success: true,
                onboardUrl: redirectUrl
            });
        } else {
            // Surface PaySprint's exact error message (e.g. "Ip Not Whitelisted") to the frontend
            const psMessage = data.message || 'Failed to generate Onboarding URL from PaySprint.';
            const isIpError = psMessage.toLowerCase().includes('ip') || psMessage.toLowerCase().includes('whitelisted');
            console.error('[PaySprint Onboard] FAILED -', psMessage, isIpError ? '=> IP WHITELIST ISSUE' : '');
            return res.status(400).json({
                success: false,
                message: psMessage,
                response_code: data.response_code,
                hint: isIpError
                    ? 'Your server IP is not whitelisted in the PaySprint panel. Whitelist the IP shown in the server log.'
                    : undefined
            });
        }
    } catch (error) {
        console.error('[PaySprint Onboard Gen Error]:', error);
        res.status(500).json({ success: false, message: 'Server error generating onboarding URL' });
    }
});

/**
 * @route POST /api/paysprint/onboard/callback
 * @desc Webhook / Callback from PaySprint after onboarding is completed
 */
router.post('/callback', async (req, res) => {
    try {
        const body = req.body || {};
        let decryptedData = null;

        // PaySprint sends encrypted data in 'data' query param or 'param_enc' in body
        if (req.query.data) {
            decryptedData = decryptPayload(req.query.data);
        } else if (body.param_enc) {
            decryptedData = decryptPayload(body.param_enc);
        } else if (body.merchantcode || body.param) {
            // Fallback for unencrypted callbacks (if any)
            decryptedData = body.param || body;
        }

        console.log('[PaySprint Onboarding Callback] Decrypted Data:', decryptedData);

        if (decryptedData) {
            const merchantCode = decryptedData.merchantcode;
            const status = decryptedData.status;
            // Check nested bank status based on PaySprint docs
            const bank6Status = decryptedData.bank?.Bank6 || decryptedData.bank6_status;

            if (merchantCode && (status === '1' || status === 'Active' || status === 'Success' || bank6Status === 'Active' || bank6Status === '1')) {
                const user = await User.findOne({
                    $or: [{ retailerId: merchantCode }, { userId: merchantCode }]
                });

                if (user) {
                    user.isPaySprintOnboarded = true;
                    await user.save();
                    console.log(`[PaySprint Onboarding] User ${user.userId} successfully marked as onboarded.`);
                } else {
                    console.log(`[PaySprint Onboarding] User with merchantCode ${merchantCode} not found.`);
                }
            }
        }

        res.status(200).json({ status: 200, message: 'Webhook received' });
    } catch (error) {
        console.error('[PaySprint Onboarding Callback Error]:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * @route POST /api/paysprint/onboard/transaction-callback
 * @desc PaySprint mandatory transaction callback for onboarding charges
 */
router.post('/transaction-callback', async (req, res) => {
    try {
        console.log('[PaySprint Transaction Callback] Received:', req.body);
        
        // Return 200 OK to PaySprint as required by their documentation
        res.status(200).json({
            status: 200,
            message: "Transaction completed successfully"
        });
    } catch (error) {
        console.error('[PaySprint Transaction Callback Error]:', error);
        res.status(400).json({
            status: 400,
            message: "Transaction failed"
        });
    }
});


/**
 * @route GET /api/paysprint/onboard/diagnose
 * @desc Diagnose PaySprint onboarding - shows actual outgoing VPS IP and tests the API
 */
router.get('/diagnose', async (req, res) => {
    const result = {};

    // Step 1: Capture actual outgoing IP from VPS
    try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        result.vpsOutgoingIp = (await ipRes.json()).ip;
    } catch (e) {
        result.vpsOutgoingIp = 'FETCH_FAILED: ' + e.message;
    }

    // Step 2: Try alternate IP services in case ipify is blocked
    try {
        const ipRes2 = await fetch('https://checkip.amazonaws.com/');
        result.vpsOutgoingIp_aws = (await ipRes2.text()).trim();
    } catch (e) {
        result.vpsOutgoingIp_aws = 'FETCH_FAILED';
    }

    // Step 3: Build headers using fixed getHeaders
    const partnerId = getPartnerId();
    const baseUrl = getBaseUrl();
    const headers = getHeaders('ONBOARDING');
    result.authorisedKeySent = headers['Authorisedkey'];
    result.tokenPreview = headers['Token'] ? headers['Token'].substring(0, 50) + '...' : 'MISSING';
    result.partnerId = partnerId;
    result.baseUrl = baseUrl;

    // Step 4: Call PaySprint getonboardurl
    const payload = {
        merchantcode: partnerId,
        mobile: '9999999999',
        is_new: '1',
        email: 'test@mbmitra.com',
        firm: 'Diagnose Test',
        callback: 'https://api.mbmitra.in/api/paysprint/onboard/callback'
    };

    try {
        const psRes = await fetch(`${baseUrl}/api/v1/service/onboard/onboard/getonboardurl`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        const text = await psRes.text();
        try { result.paysprintResponse = JSON.parse(text); } catch (_) { result.paysprintResponse = text; }
        result.httpStatus = psRes.status;
    } catch (e) {
        result.paysprintError = e.message;
    }

    res.json(result);
});

module.exports = router;
