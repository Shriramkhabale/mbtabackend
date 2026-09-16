const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');

// Staff Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }

        const cleanUser = username.trim().toLowerCase();
        const staff = await Staff.findOne({ username: cleanUser });

        if (!staff) {
            return res.status(401).json({ success: false, message: 'Invalid Staff Username or Password' });
        }

        if (staff.isActive === false) {
            return res.status(403).json({ success: false, message: 'Staff account is deactivated. Contact Admin.' });
        }

        if (staff.password !== password) {
            return res.status(401).json({ success: false, message: 'Invalid Staff Username or Password' });
        }

        res.json({
            success: true,
            message: 'Staff login successful',
            staff: {
                id: staff._id,
                name: staff.name,
                username: staff.username,
                email: staff.email,
                mobile: staff.mobile,
                permissions: staff.permissions || [],
                isActive: staff.isActive
            }
        });
    } catch (error) {
        console.error('Staff Login Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET all staff members (for Admin)
router.get('/', async (req, res) => {
    try {
        const staffList = await Staff.find().sort({ createdAt: -1 });
        res.json({ success: true, staff: staffList });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST create new staff member
router.post('/', async (req, res) => {
    try {
        const { name, username, password, email, mobile, permissions, isActive } = req.body;

        if (!name || !username || !password) {
            return res.status(400).json({ success: false, message: 'Name, Username, and Password are required' });
        }

        const cleanUser = username.trim().toLowerCase();
        const existing = await Staff.findOne({ username: cleanUser });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Staff username already exists. Choose a different one.' });
        }

        const newStaff = new Staff({
            name: name.trim(),
            username: cleanUser,
            password: password.trim(),
            email: email ? email.trim() : '',
            mobile: mobile ? mobile.trim() : '',
            permissions: Array.isArray(permissions) ? permissions : [],
            isActive: isActive !== undefined ? isActive : true
        });

        const saved = await newStaff.save();
        res.status(201).json({ success: true, staff: saved, message: 'Staff member created successfully' });
    } catch (error) {
        console.error('Create Staff Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT update staff member
router.put('/:id', async (req, res) => {
    try {
        const { name, username, password, email, mobile, permissions, isActive } = req.body;
        const staff = await Staff.findById(req.params.id);

        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }

        if (name) staff.name = name.trim();
        if (username) {
            const cleanUser = username.trim().toLowerCase();
            if (cleanUser !== staff.username) {
                const existing = await Staff.findOne({ username: cleanUser });
                if (existing) {
                    return res.status(400).json({ success: false, message: 'Staff username already in use by another account' });
                }
                staff.username = cleanUser;
            }
        }
        if (password && password.trim()) staff.password = password.trim();
        if (email !== undefined) staff.email = email.trim();
        if (mobile !== undefined) staff.mobile = mobile.trim();
        if (permissions !== undefined && Array.isArray(permissions)) staff.permissions = permissions;
        if (isActive !== undefined) staff.isActive = isActive;

        const updated = await staff.save();
        res.json({ success: true, staff: updated, message: 'Staff member updated successfully' });
    } catch (error) {
        console.error('Update Staff Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE staff member
router.delete('/:id', async (req, res) => {
    try {
        const staff = await Staff.findByIdAndDelete(req.params.id);
        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }
        res.json({ success: true, message: 'Staff member deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
