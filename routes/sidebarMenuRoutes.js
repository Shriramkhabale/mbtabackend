const express = require('express');
const router = express.Router();
const SidebarMenu = require('../models/SidebarMenu');

router.get('/', async (req, res) => {
    try { const items = await SidebarMenu.find().sort({ order: 1 }); res.json(items); }
    catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', async (req, res) => {
    try { const newItem = new SidebarMenu(req.body); await newItem.save(); res.status(201).json(newItem); }
    catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/:id', async (req, res) => {
    try {
        const updated = await SidebarMenu.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        res.json(updated);
    } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try { await SidebarMenu.findByIdAndDelete(req.params.id); res.json({ message: 'Deleted' }); }
    catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/reorder', async (req, res) => {
    try {
        const { orderedIds } = req.body;
        for (let i = 0; i < orderedIds.length; i++) {
            await SidebarMenu.findByIdAndUpdate(orderedIds[i], { order: i });
        }
        res.json({ message: 'Reordered' });
    } catch (error) { res.status(500).json({ message: error.message }); }
});

module.exports = router;
