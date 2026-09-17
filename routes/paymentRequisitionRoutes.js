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
        const previousApprovedAmount = Number(requisition.approvedAmount) || 0;
        let newStatus = req.body.status || requisition.status;
        let approvedAmount = req.body.approvedAmount !== undefined 
            ? Number(req.body.approvedAmount) 
            : previousApprovedAmount;

        // Validation: Approved amount cannot exceed requested amount
        if (newStatus === 'Approved' || newStatus === 'Partially Approved') {
            if (approvedAmount > requisition.amount) {
                return res.status(400).json({ 
                    message: `Approved amount (₹${approvedAmount}) cannot exceed requested amount (₹${requisition.amount}).` 
                });
            }
            if (approvedAmount <= 0) {
                return res.status(400).json({ 
                    message: 'Approved amount must be greater than 0.' 
                });
            }
            if (approvedAmount < requisition.amount) {
                newStatus = 'Partially Approved';
            } else {
                newStatus = 'Approved';
            }
        } else if (newStatus === 'Rejected' || newStatus === 'Pending') {
            approvedAmount = 0;
        }

        if (req.body.remarks !== undefined) {
            requisition.remarks = req.body.remarks;
        }

        requisition.status = newStatus;
        requisition.approvedAmount = approvedAmount;
        await requisition.save();

        // If requisition has an associated user, adjust wallet balance accordingly
        const User = require('../models/User');
        const WalletTransaction = require('../models/WalletTransaction');
        
        const user = await User.findOne({ userId: { $regex: new RegExp(`^${requisition.userId}$`, 'i') } });
        if (user) {
            let balanceDiff = 0;
            const wasApproved = previousStatus === 'Approved' || previousStatus === 'Partially Approved';
            const isApproved = newStatus === 'Approved' || newStatus === 'Partially Approved';

            if (!wasApproved && isApproved) {
                // Was Pending/Rejected, now Approved
                balanceDiff = approvedAmount;
            } else if (wasApproved && !isApproved) {
                // Was Approved, now Rejected/Pending
                balanceDiff = -previousApprovedAmount;
            } else if (wasApproved && isApproved) {
                // Was Approved, still Approved, but amount changed
                balanceDiff = approvedAmount - previousApprovedAmount;
            }

            if (balanceDiff !== 0) {
                const balanceBefore = user.walletBalance;
                user.walletBalance = Math.max(0, user.walletBalance + balanceDiff);
                await user.save();

                const newTx = new WalletTransaction({
                    userId: user.userId,
                    transactionType: balanceDiff > 0 ? 'Credit' : 'Debit',
                    amount: Math.abs(balanceDiff),
                    balanceBefore,
                    balanceAfter: user.walletBalance,
                    description: balanceDiff > 0 && !wasApproved
                        ? (requisition.remarks || 'Admin Requisition Approved')
                        : `Admin Requisition Edit: ₹${previousApprovedAmount} -> ₹${approvedAmount}`,
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
