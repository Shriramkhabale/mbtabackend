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
        // The Onboarding API usually requires the general API environment URL
        const onboardUrl = `${baseUrl}/api/v1/service/onboard/onboard/getonboardurl`;
        const headers = getHeaders('ONBOARDING'); // You can pass product code if required

        const payload = {
            merchantcode: user.retailerId || user.userId, // Unique ID for the merchant
            mobile: user.mobile || '9999999999',
            is_new: '0', // '0' for existing, '1' for new. Use '0' if they might be partially onboarded
            email: user.email || 'retailer@mbmitra.com',
            firm: user.shopName || user.name || 'MB Mitra Retailer',
            callback: `https://api.mbmitra.in/api/paysprint/onboard/callback` // Webhook/Redirect URL
        };

        const response = await fetch(onboardUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('[PaySprint Onboarding URL] Response:', data);

        if (data.status === true || data.response_code === 1) {
            // URL is returned in data.message or data.url depending on response structure
            const redirectUrl = data.url || data.message;
            return res.status(200).json({
                success: true,
                onboardUrl: redirectUrl
            });
        } else {
            return res.status(500).json({
                success: false,
                message: data.message || 'Failed to generate Onboarding URL from PaySprint.'
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
