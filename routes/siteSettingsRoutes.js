const express = require('express');
const router = express.Router();
const SiteSettings = require('../models/SiteSettings');

// GET a setting by key
router.get('/:key', async (req, res) => {
  try {
    const setting = await SiteSettings.findOne({ key: req.params.key });
    res.json({ success: true, value: setting ? setting.value : '' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT (upsert) a setting by key
router.put('/:key', async (req, res) => {
  try {
    const { value } = req.body;
    const setting = await SiteSettings.findOneAndUpdate(
      { key: req.params.key },
      { value, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, setting });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
