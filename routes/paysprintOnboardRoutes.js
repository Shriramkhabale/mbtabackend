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
 */
router.post('/callback', async (req, res) => {
    try {
        const body = req.body || {};
        console.log('[PaySprint Onboarding Callback] Received:', body);

        // If the merchant is successfully onboarded, update their status in the DB
        if (body.merchantcode && (body.status === 'Active' || body.bank6_status === 'Active')) {
            const user = await User.findOne({
                $or: [{ retailerId: body.merchantcode }, { userId: body.merchantcode }]
            });

            if (user) {
                user.isPaySprintOnboarded = true;
                await user.save();
                console.log(`[PaySprint Onboarding] User ${user.userId} successfully marked as onboarded.`);
            }
        }

        res.status(200).json({ status: 200, message: 'Webhook received' });
    } catch (error) {
        console.error('[PaySprint Onboarding Callback Error]:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
