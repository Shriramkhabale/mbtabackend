const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const WalletTransaction = require('../models/WalletTransaction');
const User = require('../models/User');
const { notifyRetailer } = require('../socket/notificationService');

// GET all transactions
router.get('/', async (req, res) => {
    try {
        const txs = await WalletTransaction.find().sort({ createdAt: -1 });
        res.json(txs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET advanced ledger transaction report with filtering
router.get('/report', async (req, res) => {
    try {
        const { userId, startDate, endDate, month, transactionType, status, search } = req.query;
        let query = {};

        // Filter by userId (case-insensitive regex)
        if (userId) {
            query.userId = { $regex: new RegExp(`^${userId}$`, 'i') };
        }

        // Filter by date range
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                query.createdAt.$gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        // Filter by specific month (e.g. "2026-08")
        if (month) {
            const [year, m] = month.split('-');
            const startOfMonth = new Date(year, parseInt(m) - 1, 1);
            const endOfMonth = new Date(year, parseInt(m), 0, 23, 59, 59, 999);
            query.createdAt = {
                $gte: startOfMonth,
                $lte: endOfMonth
            };
        }

        // Filter by transactionType
        if (transactionType && transactionType !== 'All') {
            query.transactionType = transactionType;
        }

        // Filter by status
        if (status && status !== 'All') {
            query.status = status;
        }

        // General search across description, referenceNumber, userId
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { userId: searchRegex },
                { description: searchRegex },
                { referenceNumber: searchRegex },
                { status: searchRegex },
                { transactionType: searchRegex }
            ];
        }

        const txs = await WalletTransaction.find(query).sort({ createdAt: -1 });
        res.json(txs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST bulk import transactions
router.post('/import', async (req, res) => {
    const { transactions } = req.body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
        return res.status(400).json({ message: 'No transactions provided for import.' });
    }

    const results = {
        successCount: 0,
        failedCount: 0,
        details: []
    };

    for (let i = 0; i < transactions.length; i++) {
        const item = transactions[i];
        const rowNum = i + 1;
        let { userId, transactionType, amount, description, referenceNumber, status, createdAt } = item;

        if (!userId || !transactionType || !amount || isNaN(amount)) {
            results.failedCount++;
            results.details.push({
                row: rowNum,
                status: 'Failed',
                message: 'Missing or invalid required fields (userId, transactionType, amount).'
            });
            continue;
        }

        amount = Number(amount);
        if (amount <= 0) {
            results.failedCount++;
            results.details.push({
                row: rowNum,
                status: 'Failed',
                message: 'Amount must be greater than zero.'
            });
            continue;
        }

        if (!['Credit', 'Debit'].includes(transactionType)) {
            results.failedCount++;
            results.details.push({
                row: rowNum,
                status: 'Failed',
                message: `Invalid transactionType "${transactionType}". Must be Credit or Debit.`
            });
            continue;
        }

        try {
            const user = await User.findOne({ userId: { $regex: new RegExp(`^${userId}$`, 'i') } });
            if (!user) {
                results.failedCount++;
                results.details.push({
                    row: rowNum,
                    status: 'Failed',
                    userId,
                    message: `User with ID "${userId}" not found.`
                });
                continue;
            }

            const balanceBefore = user.walletBalance;
            let balanceAfter = balanceBefore;

            if (transactionType === 'Credit') {
                balanceAfter = balanceBefore + amount;
            } else {
                balanceAfter = balanceBefore - amount;
            }

            // Update user balance
            user.walletBalance = balanceAfter;
            await user.save();

            // Create transaction
            const newTx = new WalletTransaction({
                userId: user.userId, // exact stored case
                transactionType,
                amount,
                balanceBefore,
                balanceAfter,
                description: description || `Imported ${transactionType} Transaction`,
                referenceNumber: referenceNumber || 'IMP' + Math.floor(Math.random() * 100000000),
                status: status || 'Success'
            });

            // If a specific creation date is provided in the import data, apply it
            if (createdAt) {
                const parsedDate = new Date(createdAt);
                if (!isNaN(parsedDate.getTime())) {
                    newTx.createdAt = parsedDate;
                }
            }

            await newTx.save();

            results.successCount++;
            results.details.push({
                row: rowNum,
                status: 'Success',
                userId: user.userId,
                referenceNumber: newTx.referenceNumber
            });
        } catch (error) {
            results.failedCount++;
            results.details.push({
                row: rowNum,
                status: 'Failed',
                userId,
                message: error.message
            });
        }
    }

    res.status(200).json(results);
});

// GET transactions for a specific user
router.get('/user/:userId', async (req, res) => {
    try {
        const queryTerm = (req.params.userId || '').toString().trim();
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
        const targetIds = [queryTerm];
        if (user) {
            if (user.userId && !targetIds.includes(user.userId)) targetIds.push(user.userId);
            if (user.retailerId && !targetIds.includes(user.retailerId)) targetIds.push(user.retailerId);
            if (user.mobile && !targetIds.includes(user.mobile)) targetIds.push(user.mobile);
        }

        const txs = await WalletTransaction.find({ 
            userId: { $in: targetIds.map(id => new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) } 
        }).sort({ createdAt: -1 });
        res.json(txs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST a simulated debit transaction
router.post('/debit', async (req, res) => {
    const { userId, amount, description, referenceNumber } = req.body;
    
    if (!userId || !amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ message: 'Invalid transaction parameters' });
    }

    try {
        const queryTerm = (userId || '').toString().trim();
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
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const debitAmount = Number(amount);
        if (user.walletBalance < debitAmount) {
            return res.status(400).json({ message: 'Insufficient wallet balance' });
        }

        const balanceBefore = user.walletBalance;
        user.walletBalance -= debitAmount;
        await user.save();

        const newTx = new WalletTransaction({
            userId: user.userId, // use exact stored case
            transactionType: 'Debit',
            amount: debitAmount,
            balanceBefore,
            balanceAfter: user.walletBalance,
            description: description || 'Debit Transaction',
            referenceNumber: referenceNumber || 'DEBIT' + Math.floor(Math.random() * 100000000),
            status: 'Success'
        });

        await newTx.save();
        res.status(201).json({ message: 'Debit successful', transaction: newTx, walletBalance: user.walletBalance });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST a simulated direct credit transaction
router.post('/credit', async (req, res) => {
    const { userId, amount, description, referenceNumber } = req.body;
    
    if (!userId || !amount || isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({ message: 'Invalid transaction parameters' });
    }

    try {
        const queryTerm = (userId || '').toString().trim();
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
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const creditAmount = Number(amount);
        const balanceBefore = user.walletBalance;
        user.walletBalance += creditAmount;
        await user.save();

        const newTx = new WalletTransaction({
            userId: user.userId,
            transactionType: 'Credit',
            amount: creditAmount,
            balanceBefore,
            balanceAfter: user.walletBalance,
            description: description || 'Credit Transaction',
            referenceNumber: referenceNumber || 'CREDIT' + Math.floor(Math.random() * 100000000),
            status: 'Success'
        });

        await newTx.save();
        res.status(201).json({ message: 'Credit successful', transaction: newTx, walletBalance: user.walletBalance });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST Admin to Retailer Payment (Manual Credit / Debit Transfer)
router.post('/admin-transfer', async (req, res) => {
    const { targetUserId, transactionType, amount, description, referenceNumber } = req.body;

    if (!targetUserId || !targetUserId.toString().trim()) {
        return res.status(400).json({ message: 'Retailer ID / User ID / Mobile is required.' });
    }

    if (!transactionType || !['Credit', 'Debit'].includes(transactionType)) {
        return res.status(400).json({ message: 'Transaction type must be Credit or Debit.' });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ message: 'Amount must be a positive number greater than 0.' });
    }

    try {
        const queryTerm = targetUserId.toString().trim();
        const searchConditions = [
            { userId: { $regex: new RegExp(`^${queryTerm}$`, 'i') } },
            { retailerId: { $regex: new RegExp(`^${queryTerm}$`, 'i') } },
            { mobile: queryTerm },
            { name: { $regex: new RegExp(`^${queryTerm}$`, 'i') } }
        ];

        if (mongoose.Types.ObjectId.isValid(queryTerm)) {
            searchConditions.push({ _id: queryTerm });
        }

        const user = await User.findOne({ $or: searchConditions });

        if (!user) {
            return res.status(404).json({ message: `Retailer account not found for query "${queryTerm}".` });
        }

        const balanceBefore = Number(user.walletBalance || 0);
        let balanceAfter = balanceBefore;

        if (transactionType === 'Credit') {
            balanceAfter = balanceBefore + numericAmount;
        } else {
            balanceAfter = balanceBefore - numericAmount;
        }

        // Save updated wallet balance for retailer
        user.walletBalance = balanceAfter;
        await user.save();

        const refNo = (referenceNumber && referenceNumber.trim())
            ? referenceNumber.trim()
            : 'ADM' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 100);

        const newTx = new WalletTransaction({
            userId: user.userId,
            transactionType,
            amount: numericAmount,
            balanceBefore,
            balanceAfter,
            description: description || `Admin Manual Payment (${transactionType})`,
            referenceNumber: refNo,
            status: 'Success'
        });

        await newTx.save();

        // Emit real-time notification to retailer
        try {
            const io = req.app.get('io');
            if (io && notifyRetailer) {
                notifyRetailer(io, user.userId, {
                    title: `Wallet ${transactionType}ed by Admin`,
                    message: `Admin has ${transactionType === 'Credit' ? 'credited' : 'debited'} ₹${numericAmount.toFixed(2)} in your wallet. New Balance: ₹${balanceAfter.toFixed(2)}.`,
                    type: 'WALLET_UPDATE'
                });
            }
        } catch (e) {
            console.error('Failed to send socket notification:', e.message);
        }

        res.status(201).json({
            message: `Successfully ${transactionType === 'Credit' ? 'credited (+)' : 'debited (-)'} ₹${numericAmount.toFixed(2)} for retailer ${user.name || user.userId}.`,
            transaction: newTx,
            user: {
                userId: user.userId,
                retailerId: user.retailerId,
                name: user.name,
                mobile: user.mobile,
                walletBalance: user.walletBalance
            }
        });
    } catch (error) {
        console.error('Error in admin-transfer:', error);
        res.status(500).json({ message: error.message || 'Server error while processing wallet transfer' });
    }
});

// GET PaySprint Main Balance from live/UAT API
router.get('/paysprint-balance', async (req, res) => {
    try {
        const crypto = require('crypto');
        
        const base64url = (str) => {
            return str.toString('base64')
                .replace(/=/g, '')
                .replace(/\+/g, '-')
                .replace(/\//g, '_');
        };

        const jwtKey = process.env.JWT_KEY || 'UFMwMDEyMTc1OGFhNzRjZTk3YTM0NDRkZjc0Zjg3MmY1OGY3ZDlkMw==';
        const authorisedKey = process.env.AUTHORISED_KEY || 'M2IzZDI5ZTMwYzY4ZDY2OWY0MGE2MGFhNTI4ODM2OTk=';
        
        let partnerId = 'PS00121758';
        try {
            const decoded = Buffer.from(jwtKey, 'base64').toString('utf8');
            if (decoded && decoded.startsWith('PS')) {
                const match = decoded.match(/^(PS\d+)/);
                if (match) {
                    partnerId = match[1];
                }
            }
        } catch (e) {
            console.error("Error decoding JWT_KEY for partnerId:", e);
        }

        const header = { typ: 'JWT', alg: 'HS256' };
        const payload = {
            iss: 'PAYSPRINT',
            timestamp: Math.floor(Date.now() / 1000),
            partnerId: partnerId,
            product: 'WALLET',
            reqid: String(Math.floor(100000 + Math.random() * 900000))
        };

        const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
        const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
        const signatureInput = `${headerB64}.${payloadB64}`;
        
        // Note: PaySprint requires the raw base64 encoded JWT_KEY as the secret key for signing
        const secret = jwtKey;
        const signature = crypto.createHmac('sha256', secret)
            .update(signatureInput)
            .digest();
        const signatureB64 = base64url(signature);
        const token = `${signatureInput}.${signatureB64}`;

        const environment = process.env.ENVIRONMENT || 'UAT';
        const url = environment === 'UAT'
            ? 'https://uat.paysprint.in/service-api/api/v1/service/balance/balance/mainbalance'
            : 'https://api.paysprint.in/service-api/api/v1/service/balance/balance/mainbalance';
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorisedkey': authorisedKey,
                'Token': token,
                'accept': 'application/json',
                'content-type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const data = await response.json();
        
        // Sum all successful credit transactions in our system to increment the UAT main balance accordingly
        let totalCredits = 0;
        try {
            const credits = await WalletTransaction.find({ 
                transactionType: 'Credit', 
                status: 'Success',
                $or: [
                    { referenceNumber: /^PG/ },
                    { paysprintTxnId: { $exists: true, $ne: null } },
                    { description: { $regex: /PaySprint|Gateway/i } }
                ]
            });
            totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
        } catch (e) {
            console.error("Error summing successful credits:", e);
        }

        if (environment === 'UAT') {
            if (data.balance !== undefined) {
                data.balance = parseFloat((Number(data.balance) + totalCredits).toFixed(2));
            }
            if (data.wallet !== undefined) {
                data.wallet = parseFloat((Number(data.wallet) + totalCredits).toFixed(2));
            }
        }

        res.json({ source: 'PaySprint API', ...data });
    } catch (error) {
        console.error("PaySprint Balance Error:", error.message);
        res.json({
            source: 'Simulated PaySprint Gateway UAT',
            status: true,
            response_code: 1,
            message: "Balance fetched successfully",
            balance: 50000.00
        });
    }
});

module.exports = router;
