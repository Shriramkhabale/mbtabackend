const express = require('express');
const router = express.Router();
const UPIConfig = require('../models/UPIConfig');
const { upload } = require('../cloudinaryConfig');

// Get current UPI config
router.get('/', async (req, res) => {
    try {
        let config = await UPIConfig.findOne();
        if (!config) {
            config = await UPIConfig.create({ upiId: '', qrCodeImg: '' });
        }
        res.json(config);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update UPI config
router.put('/', upload.single('qrCodeImg'), async (req, res) => {
    try {
        let config = await UPIConfig.findOne();
        if (!config) {
            config = new UPIConfig();
        }
        
        if (req.body.upiId !== undefined) {
            config.upiId = req.body.upiId;
        }

        if (req.file) {
            config.qrCodeImg = req.file.path;
        }

        await config.save();
        res.json(config);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;
