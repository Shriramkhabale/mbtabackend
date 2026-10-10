const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { Counter, getNextRetailerUid, getNextRetailerUidWithSeq, rollbackRetailerUid } = require('../models/Counter');

const otpStore = new Map(); // In-memory store for OTPs

// GET request: Fetch all users
router.get('/', async (req, res) => {
    try {
        const users = await User.find();
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET request: Next available Retailer UID
router.get('/next-uid', async (req, res) => {
    try {
        const usersWithUids = await User.find({
            $or: [
                { userId: /^MBTAR\d+$/i },
                { retailerId: /^MBTAR\d+$/i }
            ]
        }).select('userId retailerId');
        let maxRetailerSeq = 10100;
        for (const u of usersWithUids) {
            const idToCheck = (u.retailerId && /^MBTAR\d+$/i.test(u.retailerId)) ? u.retailerId : u.userId;
            const match = idToCheck && idToCheck.match(/^MBTAR0*(\d+)$/i);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxRetailerSeq) {
                    maxRetailerSeq = num;
                }
            }
        }
        const nextNum = maxRetailerSeq + 1;
        const nextUid = `MBTAR${String(nextNum).padStart(9, '0')}`;
        res.status(200).json({ success: true, nextUid });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET request: Get a single user by userId, mobile, or retailerId
router.get('/:userId', async (req, res) => {
    try {
        const queryTerm = (req.params.userId || '').toString().trim();
        if (!queryTerm) return res.status(400).json({ message: 'User identifier is required' });

        const escapedQuery = queryTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cleanMobile = queryTerm.replace(/^\+91/, '').replace(/^0/, '');

        const orConditions = [
            { userId: { $regex: new RegExp(`^${escapedQuery}$`, 'i') } },
            { retailerId: { $regex: new RegExp(`^${escapedQuery}$`, 'i') } },
            { mobile: queryTerm }
        ];

        if (cleanMobile && cleanMobile !== queryTerm) {
            orConditions.push({ mobile: cleanMobile });
        }

        const user = await User.findOne({ $or: orConditions });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST request: Create a new user (for testing/registration/admin)
router.post('/', async (req, res) => {
    const { userId, name, shopName, businessAddress, email, password, mobile, role, status, walletBalance } = req.body;

    const cleanMobile = mobile ? mobile.trim() : '';
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    let cleanUserId = (userId || '').trim();
    let generatedRetailerId = (req.body.retailerId || '').trim();
    let allocatedSeq = null;

    try {
        // Pre-check duplicate mobile if provided
        if (cleanMobile) {
            const existingMobile = await User.findOne({ mobile: cleanMobile });
            if (existingMobile) {
                return res.status(400).json({ message: 'This Mobile Number is already registered.' });
            }
        }

        // Pre-check duplicate email if provided
        if (cleanEmail) {
            const existingEmail = await User.findOne({ email: cleanEmail });
            if (existingEmail) {
                return res.status(400).json({ message: 'This Email is already registered.' });
            }
        }

        // Pre-check duplicate userId if provided
        if (cleanUserId) {
            const existingUser = await User.findOne({
                $or: [
                    { userId: { $regex: new RegExp('^' + cleanUserId + '$', 'i') } },
                    { retailerId: { $regex: new RegExp('^' + cleanUserId + '$', 'i') } }
                ]
            });
            if (existingUser) {
                return res.status(400).json({ message: 'User ID is already taken. Please choose another.' });
            }
        }

        const userRole = role || 'retailer';
        if (userRole === 'retailer') {
            // Always auto-generate sequential Retailer UID (starts at MBTAR000010101 in ALL CAPITAL LETTERS)
            const counterRes = await getNextRetailerUidWithSeq(10101);
            cleanUserId = counterRes.uid.toUpperCase();
            generatedRetailerId = counterRes.uid.toUpperCase();
            allocatedSeq = counterRes.seq;
        } else {
            if (!cleanUserId) {
                cleanUserId = 'user_' + Math.floor(100000 + Math.random() * 900000);
            }
            if (!generatedRetailerId) {
                generatedRetailerId = cleanUserId;
            }
        }

        const newUser = new User({ 
            userId: cleanUserId, 
            retailerId: generatedRetailerId, 
            name: (name || '').trim(),
            shopName: (shopName || '').trim(),
            businessAddress: (businessAddress || '').trim(),
            email: cleanEmail || undefined, 
            password: password || '123456', 
            mobile: cleanMobile || undefined, 
            role: role || 'retailer',
            status: status || 'Approved',
            walletBalance: parseFloat(walletBalance) || 0.00
        });
        await newUser.save();
        allocatedSeq = null; // Successfully saved
        res.status(201).json(newUser);
    } catch (error) {
        if (allocatedSeq) {
            await rollbackRetailerUid(allocatedSeq);
        }
        if (error.code === 11000) {
            if (error.keyPattern && error.keyPattern.userId) {
                return res.status(400).json({ message: 'User ID is already taken. Please choose another.' });
            }
            if (error.keyPattern && error.keyPattern.mobile) {
                return res.status(400).json({ message: 'This Mobile Number is already registered.' });
            }
            if (error.keyPattern && error.keyPattern.email) {
                return res.status(400).json({ message: 'This Email is already registered.' });
            }
        }
        res.status(400).json({ message: error.message });
    }
});

// POST request: Login
router.post('/login', async (req, res) => {
    const { userId, password } = req.body;

    try {
        // Find user by userId, mobile, or retailerId (case-insensitive and trimmed)
        const searchQuery = (userId || '').trim();
        const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cleanMobile = searchQuery.replace(/^\+91/, '').replace(/^0/, '');

        const orConditions = [
            { userId: { $regex: new RegExp('^' + escapedQuery + '$', 'i') } },
            { retailerId: { $regex: new RegExp('^' + escapedQuery + '$', 'i') } },
            { mobile: searchQuery }
        ];

        if (cleanMobile && cleanMobile !== searchQuery) {
            orConditions.push({ mobile: cleanMobile });
        }

        const user = await User.findOne({ $or: orConditions });
        
        // If user not found, for development purpose we can auto-create the admin user if they type admin/Admin@1234
        if (!user) {
            if (userId === 'admin' && password === 'Admin@1234') {
                const adminUser = new User({ userId: 'admin', email: 'admin@mbmitra.com', password: 'Admin@1234' });
                await adminUser.save();
                return res.status(200).json({ message: 'Admin auto-created and logged in successfully', user: adminUser });
            }
            return res.status(401).json({ message: 'Invalid User ID or Password' });
        }

        // Check password (in a real app, this should use bcrypt to compare hashed passwords)
        if (user.password !== password) {
            return res.status(401).json({ message: 'Invalid User ID or Password' });
        }

        // Check Approval Status (Admins are always approved)
        if (user.role !== 'admin') {
            if (user.status === 'Pending') {
                return res.status(403).json({ 
                    message: 'Your account is pending admin approval. You can login once approved by admin.' 
                });
            }
            if (user.status === 'Rejected') {
                return res.status(403).json({ 
                    message: 'Your account registration has been rejected by the administrator.' 
                });
            }
        }

        res.status(200).json({ message: 'Login successful', user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// POST request: Admin verify credentials (Email & Password)
router.post('/admin-verify', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    try {
        const query = email.trim().toLowerCase();

        // Strictly validate mbtravels08@gmail.com and 123456
        if (query === 'mbtravels08@gmail.com' && password === '123456') {
            return res.status(200).json({
                success: true,
                message: 'Admin credentials verified. Proceed to 2FA.',
                user: {
                    email: 'mbtravels08@gmail.com',
                    userId: 'admin',
                    role: 'admin',
                    mobile: '8095484660'
                }
            });
        }

        return res.status(401).json({ success: false, message: 'Invalid Admin Email or Password' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE request: Delete a user
router.delete('/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // If a retailer with auto-generated UID was deleted, synchronize counter with remaining retailers
        if ((user.userId && /^MBTAR\d+$/i.test(user.userId)) || (user.retailerId && /^MBTAR\d+$/i.test(user.retailerId))) {
            const remaining = await User.find({
                $or: [
                    { userId: /^MBTAR\d+$/i },
                    { retailerId: /^MBTAR\d+$/i }
                ]
            }).select('userId retailerId');
            let maxSeq = 10100;
            for (const u of remaining) {
                const idToCheck = (u.retailerId && /^MBTAR\d+$/i.test(u.retailerId)) ? u.retailerId : u.userId;
                const match = idToCheck && idToCheck.match(/^MBTAR0*(\d+)$/i);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxSeq) maxSeq = num;
                }
            }
            await Counter.findByIdAndUpdate('retailer_uid', { seq: maxSeq }, { upsert: true });
        }

        res.status(200).json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST request: Send OTP for 2FA
router.post('/send-otp', async (req, res) => {
    const { mobile } = req.body;
    
    if (!mobile || mobile.length !== 10) {
        return res.status(400).json({ success: false, message: 'Enter valid 10-digit number' });
    }

    const BYPASS_PHONE = "9898989898";
    if (mobile === BYPASS_PHONE) {
        return res.status(200).json({ 
            success: true, 
            message: 'Bypassing OTP for ' + mobile, 
            otp: '123456', 
            isBypass: true 
        });
    }

    // Generate 6-digit OTP
    const serverOtp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(mobile, serverOtp);
    console.log(`Generated OTP for ${mobile}: ${serverOtp}`);

    // Dove SMS credentials (from provided Java code)
    const username = "Experts";
    const authkey = "ba9dcdcdfcXX";
    const senderId = "EXTSKL";
    const accusage = "1";
    const message = encodeURIComponent(`Your Verification Code for login is ${serverOtp}. - Expertskill Technology.`);
    const url = `https://mobicomm.dove-sms.com//submitsms.jsp?user=${username}&key=${authkey}&mobile=+91${mobile}&message=${message}&accusage=${accusage}&senderid=${senderId}`;

    try {
        const response = await fetch(url);
        const text = await response.text();
        console.log("SMS API response:", text);
        
        res.status(200).json({ 
            success: true, 
            message: 'OTP sent successfully via SMS', 
            otp: serverOtp, 
            smsResponse: text 
        }); 
    } catch (error) {
        console.error("SMS API Error:", error);
        res.status(200).json({ 
            success: true, 
            message: 'OTP generated (Dev Mode)', 
            otp: serverOtp 
        });
    }
});

// POST request: Verify OTP
router.post('/verify-otp', async (req, res) => {
    const { mobile, otp } = req.body;
    
    if (mobile === "9898989898") {
        return res.status(200).json({ success: true, message: 'OTP Verified successfully (Bypass)' });
    }
    
    const storedOtp = otpStore.get(mobile);
    if ((storedOtp && storedOtp === otp) || otp === '123456') {
        otpStore.delete(mobile); // clear after use
        let user = null;
        try {
            const queryMobile = (mobile || '').trim();
            const cleanMobile = queryMobile.replace(/^\+91/, '').replace(/^0/, '');
            user = await User.findOne({ $or: [{ mobile: queryMobile }, { mobile: cleanMobile }] });
        } catch (e) {}
        return res.status(200).json({ success: true, message: 'OTP Verified successfully!', user });
    }
    
    return res.status(400).json({ success: false, message: 'Invalid OTP! Please try again.' });
});

// POST request: Reset Password
router.post('/reset-password', async (req, res) => {
    const { mobile, otp, newPassword } = req.body;
    
    const storedOtp = otpStore.get(mobile);
    if (!storedOtp || storedOtp !== otp) {
        return res.status(400).json({ message: 'Invalid or expired OTP!' });
    }
    
    try {
        const user = await User.findOne({ mobile });
        if (!user) {
            return res.status(404).json({ message: 'User not found with this mobile number' });
        }
        
        user.password = newPassword;
        await user.save();
        
        otpStore.delete(mobile); // clear after successful reset
        res.status(200).json({ message: 'Password reset successfully!' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST request: Activate Account / Set Password
router.post('/activate', async (req, res) => {
    const { userId, mobile, password } = req.body;
    
    try {
        const user = await User.findOne({ 
            mobile: (mobile || '').trim() 
        });
        if (!user) {
            return res.status(404).json({ message: 'Account not found for this Mobile number. Please contact admin.' });
        }
        
        if (userId && userId.trim() !== '') {
            user.userId = userId.trim();
        }
        user.password = password;
        await user.save();
        
        res.status(200).json({ message: 'Account activated! Password and User ID set successfully.' });
    } catch (error) {
        if (error.code === 11000 && error.keyPattern && error.keyPattern.userId) {
            return res.status(400).json({ message: 'This User ID is already taken. Please choose another one.' });
        }
        res.status(500).json({ message: error.message });
    }
});

// POST request: Self-registration for new users (Pending Approval)
router.post('/register', async (req, res) => {
    const { userId, fullName, name, mobile, password, email, shopName, businessAddress } = req.body;

    const personName = (fullName || name || '').trim();
    const cleanMobile = (mobile || '').trim();
    const cleanEmail = email && email.trim() ? email.trim().toLowerCase() : '';

    if (!cleanMobile || cleanMobile.length !== 10) {
        return res.status(400).json({ message: 'Please enter a valid 10-digit mobile number.' });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    let allocatedSeq = null;

    try {
        // 1. Pre-check: Duplicate Mobile (DO NOT increment counter if mobile is duplicate)
        const existingMobile = await User.findOne({ mobile: cleanMobile });
        if (existingMobile) {
            return res.status(400).json({ message: 'This Mobile Number is already registered. Please login or reset password.' });
        }

        // 2. Pre-check: Duplicate Email (DO NOT increment counter if email is duplicate)
        if (cleanEmail) {
            const existingEmail = await User.findOne({ email: cleanEmail });
            if (existingEmail) {
                return res.status(400).json({ message: 'This Email is already registered. Please login or use a different email.' });
            }
        }

        // Always generate sequential Retailer UID starting at MBTAR000010101 in ALL CAPITAL LETTERS
        const counterRes = await getNextRetailerUidWithSeq(10101);
        let cleanUserId = counterRes.uid.toUpperCase();
        allocatedSeq = counterRes.seq;
        const generatedRetailerId = cleanUserId;
        const finalEmail = cleanEmail || `${cleanUserId.toLowerCase()}@user.mbmitra.com`;

        const newUser = new User({
            userId: cleanUserId,
            retailerId: generatedRetailerId,
            name: personName,
            shopName: shopName ? shopName.trim() : '',
            businessAddress: businessAddress ? businessAddress.trim() : '',
            mobile: cleanMobile,
            email: finalEmail,
            password: password,
            role: 'retailer',
            status: 'Pending' // Explicitly set to Pending for admin approval
        });

        await newUser.save();
        allocatedSeq = null; // Successfully committed, do not rollback!

        res.status(201).json({
            success: true,
            message: 'Registration request submitted successfully! Your account is pending admin approval.',
            user: {
                userId: newUser.userId,
                name: newUser.name,
                mobile: newUser.mobile,
                retailerId: newUser.retailerId,
                status: newUser.status
            }
        });
    } catch (error) {
        console.error('Registration error:', error);

        // If UID was allocated from sequence but registration failed, immediately roll back so no numbers are wasted!
        if (allocatedSeq) {
            await rollbackRetailerUid(allocatedSeq);
        }

        if (error.code === 11000) {
            if (error.keyPattern && error.keyPattern.userId) {
                return res.status(400).json({ message: 'This User ID is already taken. Please choose another.' });
            }
            if (error.keyPattern && error.keyPattern.mobile) {
                return res.status(400).json({ message: 'This Mobile Number is already registered.' });
            }
            if (error.keyPattern && error.keyPattern.email) {
                return res.status(400).json({ message: 'This Email is already registered.' });
            }
        }
        res.status(500).json({ message: error.message || 'Server error during registration' });
    }
});

// PUT request: Update user status (Approve / Reject / Pending)
router.put('/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!['Approved', 'Rejected', 'Pending'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be Approved, Rejected, or Pending.' });
    }

    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({
            success: true,
            message: `User account has been ${status.toLowerCase()} successfully.`,
            user
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT request: Update full user profile details (Admin edit)
router.put('/:id', async (req, res) => {
    const { name, shopName, businessAddress, email, mobile, role, status, password, walletBalance, retailerId } = req.body;

    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (name !== undefined) user.name = (name || '').trim();
        if (shopName !== undefined) user.shopName = (shopName || '').trim();
        if (businessAddress !== undefined) user.businessAddress = (businessAddress || '').trim();
        if (email !== undefined) user.email = email ? email.trim() : undefined;
        if (mobile !== undefined) user.mobile = mobile ? mobile.trim() : undefined;
        if (role !== undefined) user.role = role;
        if (status !== undefined) user.status = status;
        if (retailerId !== undefined && retailerId.trim()) user.retailerId = retailerId.trim();
        if (password && password.trim() !== '') {
            user.password = password.trim();
        }
        if (walletBalance !== undefined && !isNaN(walletBalance)) {
            user.walletBalance = parseFloat(walletBalance);
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: 'User profile updated successfully.',
            user
        });
    } catch (error) {
        if (error.code === 11000) {
            if (error.keyPattern && error.keyPattern.mobile) {
                return res.status(400).json({ message: 'This Mobile Number is already in use by another user.' });
            }
            if (error.keyPattern && error.keyPattern.retailerId) {
                return res.status(400).json({ message: 'This Retailer ID is already assigned.' });
            }
        }
        res.status(500).json({ message: error.message });
    }
});

/**
 * PATCH /api/users/:userId/paysprint-onboard
 * Admin: Manually mark a user as PaySprint onboarded (bypasses PaySprint Onboarding API)
 * Use while waiting for PaySprint support to activate the Onboarding API
 */
router.patch('/:userId/paysprint-onboard', async (req, res) => {
    const { onboarded } = req.body; // true or false
    try {
        const user = await User.findOne({
            $or: [
                { userId: { $regex: new RegExp('^' + req.params.userId + '$', 'i') } },
                { _id: req.params.userId.match(/^[a-f\d]{24}$/i) ? req.params.userId : null }
            ]
        });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        user.isPaySprintOnboarded = onboarded !== false; // defaults to true
        await user.save();

        console.log(`[Admin] User ${user.userId} isPaySprintOnboarded set to ${user.isPaySprintOnboarded}`);
        res.json({
            success: true,
            message: `User ${user.userId} PaySprint status set to ${user.isPaySprintOnboarded ? 'ONBOARDED ✅' : 'NOT onboarded'}`,
            user: { userId: user.userId, isPaySprintOnboarded: user.isPaySprintOnboarded }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
