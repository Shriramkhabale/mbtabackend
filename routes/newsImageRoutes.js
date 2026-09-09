const express = require('express');
const router = express.Router();
const NewsImage = require('../models/NewsImage');
const { upload } = require('../cloudinaryConfig');

router.get('/', async (req, res) => {
    try { const items = await NewsImage.find(); res.json(items); }
    catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', upload.single('image'), async (req, res) => {
    try { 
        let img = '';
        if (req.file) {
            img = req.file.path;
        }
        if (!img) return res.status(400).json({ message: "No image provided" });

        const newItem = new NewsImage({ img }); 
        await newItem.save(); 
        res.status(201).json(newItem); 
    }
    catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try { await NewsImage.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
    catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
