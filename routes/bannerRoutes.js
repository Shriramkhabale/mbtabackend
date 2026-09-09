const express = require('express');
const router = express.Router();
const Banner = require('../models/Banner');
const { upload } = require('../cloudinaryConfig');
router.get('/', async (req, res) => {
    try { const items = await Banner.find(); res.json(items); }
    catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', upload.single('image'), async (req, res) => {
    try { 
        const { alt, fallbackIcon, fallbackPerson } = req.body;
        let img = '';
        if (req.file) {
            img = req.file.path;
        } else {
            img = req.body.img;
        }

        const newItem = new Banner({ img, alt, fallbackIcon, fallbackPerson }); 
        await newItem.save(); 
        res.status(201).json(newItem); 
    }
    catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try { await Banner.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
    catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
