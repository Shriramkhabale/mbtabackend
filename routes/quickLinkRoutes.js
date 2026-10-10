const express = require('express');
const router = express.Router();
const QuickLink = require('../models/QuickLink');
const { upload } = require('../cloudinaryConfig');

// GET all quick links
router.get('/', async (req, res) => {
    try {
        const links = await QuickLink.find().sort({ order: 1, createdAt: -1 });
        res.json(links);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST a new quick link (with optional image upload)
router.post('/', upload.single('image'), async (req, res) => {
    try {
        const { title, url, icon, category, isActive, order } = req.body;
        let img = '';

        if (req.file) {
            img = req.file.path;
        } else if (req.body.img) {
            img = req.body.img;
        }

        const newLink = new QuickLink({
            title: (title || '').trim(),
            url: (url || '').trim(),
            img,
            icon: icon || '🔗',
            category: category || 'link',
            isActive: isActive === undefined ? true : (isActive === 'true' || isActive === true),
            order: Number(order) || 0
        });

        await newLink.save();
        res.status(201).json(newLink);
    } catch (error) {
        console.error('Error saving quick link:', error);
        res.status(400).json({ message: error.message });
    }
});

// PUT (update) an existing quick link
router.put('/:id', upload.single('image'), async (req, res) => {
    try {
        const { title, url, icon, category, isActive, order } = req.body;
        const link = await QuickLink.findById(req.params.id);
        if (!link) return res.status(404).json({ message: 'Quick link not found' });

        if (title !== undefined) link.title = String(title).trim();
        if (url !== undefined) link.url = String(url).trim();
        if (icon !== undefined) link.icon = icon;
        if (category !== undefined) link.category = category;
        if (isActive !== undefined) link.isActive = (isActive === 'true' || isActive === true);
        if (order !== undefined) link.order = Number(order) || 0;

        if (req.file) {
            link.img = req.file.path;
        } else if (req.body.img !== undefined) {
            link.img = req.body.img;
        }

        await link.save();
        res.json(link);
    } catch (error) {
        console.error('Error updating quick link:', error);
        res.status(400).json({ message: error.message });
    }
});

// DELETE a quick link
router.delete('/:id', async (req, res) => {
    try {
        await QuickLink.findByIdAndDelete(req.params.id);
        res.json({ message: 'Quick link deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST reorder quick links
router.post('/reorder', async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (Array.isArray(orderedIds)) {
            for (let i = 0; i < orderedIds.length; i++) {
                await QuickLink.findByIdAndUpdate(orderedIds[i], { order: i });
            }
        }
        res.json({ message: 'Reordered successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
