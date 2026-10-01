const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { getPartnerId, getBaseUrl, getHeaders } = require('../utils/paysprint');

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

        const payload = {
            merchantcode: user.retailerId || user.userId,
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

        const response = await fetch(onboardUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const rawText = await response.text();
        console.log('[PaySprint Onboarding URL] HTTP Status:', response.status, '| Raw Response:', rawText);

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
 *
 * PaySprint sends this after merchant completes KYC on their page.
 * Possible body fields (varies by PaySprint version):
 *   - merchantcode: the merchant code we sent in the onboarding request
 *   - status: "Active" | "Pending" | "Rejected"
 *   - bank6_status: "Active" (specific to UPI Cashout / Bank 6)
 *   - onboard_status: "Active"
 *   - response_code: 1 (success)
 */
router.post('/callback', async (req, res) => {
    try {
        const body = req.body || {};
        console.log('[PaySprint Onboarding Callback] RAW body:', JSON.stringify(body));

        const merchantCode = body.merchantcode || body.merchant_code || body.merchantCode;

        // Accept multiple possible success status field names from PaySprint
        const statusFields = [body.status, body.bank6_status, body.onboard_status, body.kyc_status];
        const isActive = statusFields.some(s => s === 'Active' || s === 'active' || s === 'ACTIVE');
        const isResponseSuccess = body.response_code === 1 || body.response_code === '1';

        console.log(`[PaySprint Onboarding Callback] merchantCode=${merchantCode} isActive=${isActive} responseSuccess=${isResponseSuccess}`);

        if (merchantCode && (isActive || isResponseSuccess)) {
            const user = await User.findOne({
                $or: [{ retailerId: merchantCode }, { userId: merchantCode }]
            });

            if (user) {
                user.isPaySprintOnboarded = true;
                await user.save();
                console.log(`[PaySprint Onboarding Callback] ✅ User ${user.userId} marked as ONBOARDED`);
            } else {
                console.warn(`[PaySprint Onboarding Callback] ⚠️ No user found for merchantCode: ${merchantCode}`);
            }
        }

        // Always return 200 so PaySprint doesn't retry
        res.status(200).json({ status: 200, message: 'Callback received' });
    } catch (error) {
        console.error('[PaySprint Onboarding Callback Error]:', error);
        res.status(200).json({ status: 200, message: 'Callback received with error' }); // still 200 to prevent retries
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
