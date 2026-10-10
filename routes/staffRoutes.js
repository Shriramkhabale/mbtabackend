const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const { Counter, getNextEmployeeUid, getNextEmployeeUidWithSeq, rollbackEmployeeUid } = require('../models/Counter');

// GET next available Employee UID
router.get('/next-uid', async (req, res) => {
    try {
        const staffWithUids = await Staff.find({ username: /^MBTAE\d+$/i }).select('username');
        let maxStaffSeq = 10100;
        for (const s of staffWithUids) {
            const match = s.username.match(/^MBTAE0*(\d+)$/i);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxStaffSeq) {
                    maxStaffSeq = num;
                }
            }
        }
        const nextNum = maxStaffSeq + 1;
        const nextUid = `MBTAE${String(nextNum).padStart(9, '0')}`;
        res.status(200).json({ success: true, nextUid });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Staff Login (supports Username / UID, Email, or Mobile)
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const queryTerm = (username || '').trim();
        const cleanPass = (password || '').trim();

        if (!queryTerm || !cleanPass) {
            return res.status(400).json({ success: false, message: 'Email / Username and password are required' });
        }

        const escapedQuery = queryTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cleanMobile = queryTerm.replace(/^\+91/, '').replace(/^0/, '');

        const orConditions = [
            { username: { $regex: new RegExp(`^${escapedQuery}$`, 'i') } },
            { email: { $regex: new RegExp(`^${escapedQuery}$`, 'i') } },
            { mobile: queryTerm }
        ];

        if (cleanMobile && cleanMobile !== queryTerm) {
            orConditions.push({ mobile: cleanMobile });
        }

        const staff = await Staff.findOne({ $or: orConditions });

        if (!staff) {
            return res.status(401).json({ success: false, message: 'Invalid Staff Email, Username or Password' });
        }

        if (staff.isActive === false) {
            return res.status(403).json({ success: false, message: 'Staff account is deactivated. Contact Admin.' });
        }

        if (staff.password !== cleanPass) {
            return res.status(401).json({ success: false, message: 'Invalid Staff Email, Username or Password' });
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

// GET staff member profile & live permissions (for active session sync)
router.get('/profile/:username', async (req, res) => {
    try {
        const queryTerm = String(req.params.username || '').trim();
        const escapedQuery = queryTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cleanMobile = queryTerm.replace(/^\+91/, '').replace(/^0/, '');

        const orConditions = [
            { username: { $regex: new RegExp(`^${escapedQuery}$`, 'i') } },
            { email: { $regex: new RegExp(`^${escapedQuery}$`, 'i') } },
            { mobile: queryTerm }
        ];

        if (cleanMobile && cleanMobile !== queryTerm) {
            orConditions.push({ mobile: cleanMobile });
        }

        const staff = await Staff.findOne({ $or: orConditions });
        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }
        res.json({
            success: true,
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
    let allocatedSeq = null;
    try {
        const { name, username, password, email, mobile, permissions, isActive } = req.body;

        const cleanName = String(name || '').trim();
        const cleanPassword = String(password || '').trim();

        if (!cleanName || !cleanPassword) {
            return res.status(400).json({ success: false, message: 'Name and Password are required' });
        }

        // Auto-generate sequential Employee UID (starts at MBTAE000010101 in ALL CAPITAL LETTERS)
        const counterRes = await getNextEmployeeUidWithSeq(10101);
        let cleanUser = counterRes.uid.toUpperCase();
        allocatedSeq = counterRes.seq;

        const newStaff = new Staff({
            name: String(name).trim(),
            username: cleanUser,
            password: String(password).trim(),
            email: email ? String(email).trim() : '',
            mobile: mobile ? String(mobile).trim() : '',
            permissions: Array.isArray(permissions) ? Array.from(new Set(permissions)) : [],
            isActive: isActive !== undefined ? Boolean(isActive) : true
        });

        const saved = await newStaff.save();
        allocatedSeq = null; // Successfully saved, do not rollback!
        res.status(201).json({ 
            success: true, 
            staff: saved, 
            message: `Staff member created successfully with UID ${cleanUser}` 
        });
    } catch (error) {
        if (allocatedSeq) {
            await rollbackEmployeeUid(allocatedSeq);
        }
        console.error('Create Staff Error:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Staff username already exists. Choose a different one.' });
        }
        res.status(500).json({ success: false, message: error.message || 'Failed to create staff member' });
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

        if (name) staff.name = String(name).trim();
        if (username) {
            const cleanUser = String(username).trim();
            const finalUsername = cleanUser.toUpperCase();
            if (finalUsername !== staff.username) {
                const escapedUser = finalUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const existing = await Staff.findOne({ 
                    _id: { $ne: staff._id },
                    username: { $regex: new RegExp(`^${escapedUser}$`, 'i') } 
                });
                if (existing) {
                    return res.status(400).json({ success: false, message: 'Staff username already in use by another account' });
                }
                staff.username = finalUsername;
            }
        }
        if (password && String(password).trim()) staff.password = String(password).trim();
        if (email !== undefined) staff.email = email ? String(email).trim() : '';
        if (mobile !== undefined) staff.mobile = mobile ? String(mobile).trim() : '';
        if (permissions !== undefined && Array.isArray(permissions)) staff.permissions = Array.from(new Set(permissions));
        if (isActive !== undefined) staff.isActive = Boolean(isActive);

        const updated = await staff.save();
        res.json({ success: true, staff: updated, message: 'Staff member updated successfully' });
    } catch (error) {
        console.error('Update Staff Error:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Staff username already in use by another account' });
        }
        res.status(500).json({ success: false, message: error.message || 'Failed to update staff member' });
    }
});

// DELETE staff member
router.delete('/:id', async (req, res) => {
    try {
        const staff = await Staff.findByIdAndDelete(req.params.id);
        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }

        // If an employee with auto-generated UID was deleted, synchronize counter with remaining staff
        if (staff.username && /^MBTAE\d+$/i.test(staff.username)) {
            const remaining = await Staff.find({ username: /^MBTAE\d+$/i }).select('username');
            let maxSeq = 10100;
            for (const s of remaining) {
                const match = s.username.match(/^MBTAE0*(\d+)$/i);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxSeq) maxSeq = num;
                }
            }
            await Counter.findByIdAndUpdate('employee_uid', { seq: maxSeq }, { upsert: true });
        }

        res.json({ success: true, message: 'Staff member deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
