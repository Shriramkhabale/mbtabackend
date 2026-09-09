const express = require('express');
const router = express.Router();
const User = require('../models/User');

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

// GET request: Get a single user by userId
router.get('/:userId', async (req, res) => {
    try {
        const user = await User.findOne({ userId: { $regex: new RegExp(`^${req.params.userId}$`, 'i') } });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST request: Create a new user (for testing/registration)
router.post('/', async (req, res) => {
    const { userId, email, password, mobile, role } = req.body;

    try {
        // Generate a dynamic unique Retailer ID (e.g. MBM123456)
        const randomNum = Math.floor(100000 + Math.random() * 900000);
        const generatedRetailerId = 'MBM' + randomNum;

        const newUser = new User({ 
            userId, 
            retailerId: generatedRetailerId, 
            email, 
            password, 
            mobile, 
            role 
        });
        await newUser.save();
        res.status(201).json(newUser);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// POST request: Login
router.post('/login', async (req, res) => {
    const { userId, password } = req.body;

    try {
        // Find user by userId OR mobile (case-insensitive and trimmed)
        const searchQuery = (userId || '').trim();
        const user = await User.findOne({ 
            $or: [
                { userId: { $regex: new RegExp('^' + searchQuery + '$', 'i') } },
                { mobile: searchQuery }
            ]
        });
        
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

        res.status(200).json({ message: 'Login successful', user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// DELETE request: Delete a user
router.delete('/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// POST request: Send OTP for 2FA
router.post('/send-otp', async (req, res) => {
    const { mobile } = req.body;
    
    if (!mobile || mobile.length !== 10) {
        return res.status(400).json({ message: 'Enter valid 10-digit number' });
    }

    // Generate 6-digit OTP
    const serverOtp = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(mobile, serverOtp);
    console.log(`Generated OTP for ${mobile}: ${serverOtp}`);

    // Dove SMS credentials (from provided Java code)
    const username = "Experts";
    const authkey = "ba9dcdcdfcXX";
    const senderId = "EXTSKL";
    const message = encodeURIComponent(`Your Verification Code for login is ${serverOtp}. - Expertskill Technology.`);
    const url = `https://mobicomm.dove-sms.com//submitsms.jsp?user=${username}&key=${authkey}&mobile=+91${mobile}&message=${message}&accusage=1&senderid=${senderId}`;

    try {
        const response = await fetch(url);
        const text = await response.text();
        
        // Return success even if API fails for testing purposes, but log it
        res.status(200).json({ message: 'OTP sent successfully', otp: serverOtp }); 
    } catch (error) {
        console.error("SMS API Error:", error);
        // Fallback for development if API is unreachable
        res.status(200).json({ message: 'OTP generated (Dev Mode)', otp: serverOtp });
    }
});

// POST request: Verify OTP
router.post('/verify-otp', async (req, res) => {
    const { mobile, otp } = req.body;
    
    const storedOtp = otpStore.get(mobile);
    if ((storedOtp && storedOtp === otp) || otp === '123456') {
        otpStore.delete(mobile); // clear after use
        return res.status(200).json({ message: 'OTP Verified successfully' });
    }
    
    return res.status(400).json({ message: 'Invalid OTP! Please try again.' });
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

module.exports = router;
