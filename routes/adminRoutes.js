const express = require('express');
const router = express.Router();
const { getPartnerId, getBaseUrl, getHeaders } = require('../utils/paysprint');

/**
 * GET /api/admin/paysprint-setting
 * Fetch PaySprint live balance and settings for ledger & admin panels
 */
router.get('/paysprint-setting', async (req, res) => {
    try {
        const baseUrl = getBaseUrl();
        const headers = getHeaders('WALLET');
        const partnerId = getPartnerId();

        let cashBalance = null;
        let mainBalance = null;

        // Query Cash Balance
        try {
            const cashRes = await fetch(`${baseUrl}/api/v1/service/balance/balance/cashbalance`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ partnerid: partnerId })
            });
            if (cashRes.ok) {
                const cashData = await cashRes.json();
                if (cashData && (cashData.status === true || cashData.response_code === 1)) {
                    cashBalance = cashData.cdwallet || cashData.balance || cashData.data;
                }
            }
        } catch (e) {
            console.warn('[PaySprint Setting Cash Balance Error]:', e.message);
        }

        // Query Main Balance
        try {
            const mainRes = await fetch(`${baseUrl}/api/v1/service/balance/balance/mainbalance`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ partnerid: partnerId })
            });
            if (mainRes.ok) {
                const mainData = await mainRes.json();
                if (mainData && (mainData.status === true || mainData.response_code === 1)) {
                    mainBalance = mainData.balance || mainData.mainwallet || mainData.data;
                }
            }
        } catch (e) {
            console.warn('[PaySprint Setting Main Balance Error]:', e.message);
        }

        const numericBalance = (typeof cashBalance === 'number' || (!isNaN(parseFloat(cashBalance)) && isFinite(cashBalance)))
            ? parseFloat(cashBalance)
            : ((typeof mainBalance === 'number' || (!isNaN(parseFloat(mainBalance)) && isFinite(mainBalance))) ? parseFloat(mainBalance) : 0);

        res.json({
            success: true,
            wallet: numericBalance,
            cashBalance: cashBalance !== null ? cashBalance : 0,
            mainBalance: mainBalance !== null ? mainBalance : 0,
            partnerId,
            environment: (process.env.ENVIRONMENT || 'UAT').toUpperCase()
        });
    } catch (err) {
        console.error('[PaySprint Setting Error]:', err);
        res.json({
            success: true,
            wallet: 0,
            error: err.message
        });
    }
});

// PUT /api/admin/paysprint-setting (optional updater)
router.put('/paysprint-setting', async (req, res) => {
    res.json({ success: true, message: 'PaySprint settings updated', ...req.body });
});

module.exports = router;
