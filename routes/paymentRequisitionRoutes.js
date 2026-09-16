const express = require('express');
const router = express.Router();
const PaymentRequisition = require('../models/PaymentRequisition');

// GET all requisitions (for Admin Panel)
router.get('/', async (req, res) => {
    try {
        const requisitions = await PaymentRequisition.find().sort({ createdAt: -1 });
        res.json(requisitions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET requisitions for a specific user
router.get('/user/:userId', async (req, res) => {
    try {
        const requisitions = await PaymentRequisition.find({ 
            userId: { $regex: new RegExp(`^${req.params.userId}$`, 'i') } 
        }).sort({ createdAt: -1 });
        res.json(requisitions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST a new requisition (from Dashboard)
router.post('/', async (req, res) => {
    try {
        const newReq = new PaymentRequisition(req.body);
        await newReq.save();
        res.status(201).json(newReq);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update status (Admin Panel)
router.put('/:id', async (req, res) => {
    try {
        const requisition = await PaymentRequisition.findById(req.params.id);
        if (!requisition) {
            return res.status(404).json({ message: 'Requisition not found' });
        }

        const role = req.headers['x-user-role'];
        if (role === 'staff' && req.body.status === 'Partially Approved') {
            return res.status(403).json({ message: 'Staff members are only allowed to fully approve or reject requisitions.' });
        }

        const previousStatus = requisition.status;
        const newStatus = req.body.status;
        const approvedAmount = req.body.approvedAmount || 0;

        requisition.status = newStatus;
        requisition.approvedAmount = approvedAmount;
        await requisition.save();

        // If it was Pending and is now Approved/Partially Approved, update user's wallet
        if (previousStatus === 'Pending' && (newStatus === 'Approved' || newStatus === 'Partially Approved')) {
            const User = require('../models/User');
            const WalletTransaction = require('../models/WalletTransaction');
            
            const user = await User.findOne({ userId: { $regex: new RegExp(`^${requisition.userId}$`, 'i') } });
            if (user) {
                const balanceBefore = user.walletBalance;
                user.walletBalance += Number(approvedAmount);
                await user.save();

                // Create WalletTransaction record
                const newTx = new WalletTransaction({
                    userId: user.userId,
                    transactionType: 'Credit',
                    amount: Number(approvedAmount),
                    balanceBefore,
                    balanceAfter: user.walletBalance,
                    description: requisition.remarks || (requisition.referenceNumber.startsWith('TXN') ? 'PaySprint Gateway - Auto Add' : 'Admin Requisition Approved'),
                    referenceNumber: requisition.referenceNumber,
                    status: 'Success'
                });
                await newTx.save();
            }
        }

        res.json(requisition);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;
