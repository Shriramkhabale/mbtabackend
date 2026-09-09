const express = require('express');
const router = express.Router();
const ActionCard = require('../models/ActionCard');
const { upload } = require('../cloudinaryConfig');
// GET all action cards
router.get('/', async (req, res) => {
    try {
        const cards = await ActionCard.find().sort({ order: 1 });
        res.json(cards);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST reorder action cards
router.post('/reorder', async (req, res) => {
    try {
        const { orderedIds } = req.body;
        for (let i = 0; i < orderedIds.length; i++) {
            await ActionCard.findByIdAndUpdate(orderedIds[i], { order: i });
        }
        res.json({ message: 'Reordered successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST a new action card (with image upload)
router.post('/', upload.single('image'), async (req, res) => {
    console.log("POST /api/action-cards hit!");
    console.log("Body:", req.body);
    console.log("File:", req.file);

    const { title, icon, isAeps, url } = req.body;
    let img = '';
    
    // If a file was uploaded, use the new path, otherwise fallback to the body's img if provided
    if (req.file) {
        img = req.file.path;
    } else {
        img = req.body.img; // For backwards compatibility if they don't upload a file
    }

    try {
        const newCard = new ActionCard({ title, icon, img, isAeps: isAeps === 'true', url });
        await newCard.save();
        res.status(201).json(newCard);
    } catch (error) {
        console.error("Error saving action card:", error);
        res.status(400).json({ message: error.message });
    }
});

// PUT (update) an action card
router.put('/:id', upload.single('image'), async (req, res) => {
    const { title, icon, isAeps, url } = req.body;
    
    try {
        const card = await ActionCard.findById(req.params.id);
        if (!card) return res.status(404).json({ message: 'Not found' });
        
        if (title !== undefined) card.title = title;
        if (icon !== undefined) card.icon = icon;
        if (isAeps !== undefined) card.isAeps = isAeps === 'true';
        if (url !== undefined) card.url = url;
        
        if (req.file) {
            card.img = req.file.path;
        } else if (req.body.img) {
            card.img = req.body.img;
        }

        await card.save();
        res.json(card);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// DELETE an action card
router.delete('/:id', async (req, res) => {
    try {
        await ActionCard.findByIdAndDelete(req.params.id);
        res.json({ message: 'Action card deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
