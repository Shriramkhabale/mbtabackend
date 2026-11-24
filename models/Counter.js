const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, required: true }
}, {
    timestamps: true
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/**
 * Atomically increments and returns the next sequence formatted with prefix and 9-digit zero-padding.
 * @param {string} id - The counter document ID ('retailer_uid' or 'employee_uid')
 * @param {string} prefix - The UID prefix ('MBTAR' or 'MBTAE')
 * @param {number} startVal - The starting sequence number
 * @returns {Promise<{uid: string, seq: number}>} e.g. { uid: 'MBTAR000010101', seq: 10101 }
 */
async function getNextSequence(id, prefix, startVal = 10101) {
    let res = await Counter.findOneAndUpdate(
        { _id: id },
        { $inc: { seq: 1 } },
        { returnDocument: 'after' }
    );

    if (!res) {
        try {
            res = await Counter.create({ _id: id, seq: startVal });
        } catch (err) {
            // Race condition fallback if created simultaneously
            res = await Counter.findOneAndUpdate(
                { _id: id },
                { $inc: { seq: 1 } },
                { returnDocument: 'after' }
            );
        }
    }

    const padded = String(res.seq).padStart(9, '0');
    return { uid: `${prefix}${padded}`, seq: res.seq };
}

/**
 * Safely roll back sequence if a registration or user creation failed after incrementing
 * @param {string} id - The counter document ID ('retailer_uid' or 'employee_uid')
 * @param {number} seq - The sequence number that was allocated
 */
async function rollbackSequence(id, seq) {
    if (!seq) return;
    try {
        await Counter.findOneAndUpdate(
            { _id: id, seq: seq },
            { $inc: { seq: -1 } }
        );
    } catch (err) {
        console.error(`Error rolling back counter ${id}:`, err);
    }
}

async function getNextRetailerUidWithSeq(startVal = 10101) {
    let maxRetailerSeq = startVal - 1; // 10100 default so first is 10101
    try {
        const User = mongoose.models.User || require('./User');
        const usersWithUids = await User.find({
            $or: [
                { userId: /^MBTAR\d+$/i },
                { retailerId: /^MBTAR\d+$/i }
            ]
        }).select('userId retailerId');
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
    } catch (err) {
        console.error('Error finding max retailer UID from User:', err);
    }

    // Always synchronize counter to actual highest sequence present in User
    // This prevents sequence jumping if an add failed or a user was deleted
    await Counter.findByIdAndUpdate(
        'retailer_uid',
        { seq: maxRetailerSeq },
        { upsert: true }
    );

    return await getNextSequence('retailer_uid', 'MBTAR', startVal);
}

async function getNextRetailerUid(startVal = 10101) {
    const res = await getNextRetailerUidWithSeq(startVal);
    return res.uid;
}

async function rollbackRetailerUid(seq) {
    await rollbackSequence('retailer_uid', seq);
}

async function getNextEmployeeUidWithSeq(startVal = 10101) {
    let maxStaffSeq = startVal - 1; // 10100 default so first is 10101
    try {
        const Staff = mongoose.models.Staff || require('./Staff');
        const staffWithUids = await Staff.find({ username: /^MBTAE\d+$/i }).select('username');
        for (const s of staffWithUids) {
            const match = s.username.match(/^MBTAE0*(\d+)$/i);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxStaffSeq) {
                    maxStaffSeq = num;
                }
            }
        }
    } catch (err) {
        console.error('Error finding max employee UID from Staff:', err);
    }

    // Always synchronize counter to actual highest sequence present in Staff
    // This prevents sequence jumping if an add failed or a staff was deleted
    await Counter.findByIdAndUpdate(
        'employee_uid',
        { seq: maxStaffSeq },
        { upsert: true }
    );

    return await getNextSequence('employee_uid', 'MBTAE', startVal);
}

async function getNextEmployeeUid(startVal = 10101) {
    const res = await getNextEmployeeUidWithSeq(startVal);
    return res.uid;
}

async function rollbackEmployeeUid(seq) {
    await rollbackSequence('employee_uid', seq);
}

/**
 * Customer UID Generation
 * Format: MBTAC000010101 (First customer), then MBTAC000010102, etc.
 * Deleting a customer will never reuse an old UID.
 */
async function getNextCustomerUidWithSeq(startVal = 10101) {
    let maxCustomerSeq = startVal - 1; // 10100 default so first is 10101
    try {
        const Customer = mongoose.models.Customer || require('./Customer');
        const customers = await Customer.find({ customerUid: /^MBTAC\d+$/i }).select('customerUid');
        for (const c of customers) {
            const match = c.customerUid && c.customerUid.match(/^MBTAC0*(\d+)$/i);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxCustomerSeq) {
                    maxCustomerSeq = num;
                }
            }
        }
    } catch (err) {
        // Customer model not yet initialized or table empty
    }

    const currentCounter = await Counter.findById('customer_uid');
    if (!currentCounter) {
        // Initialize with maxCustomerSeq (at least 10100) so first $inc gives 10101
        const initSeq = maxCustomerSeq >= 10101 ? maxCustomerSeq : (startVal - 1);
        await Counter.findByIdAndUpdate(
            'customer_uid',
            { $setOnInsert: { seq: initSeq } },
            { upsert: true }
        );
    } else if (maxCustomerSeq > currentCounter.seq) {
        // Advance counter forward only if database has higher UIDs, never decrement on delete
        await Counter.findByIdAndUpdate(
            'customer_uid',
            { seq: maxCustomerSeq }
        );
    }

    const res = await Counter.findOneAndUpdate(
        { _id: 'customer_uid' },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
    );

    const padded = String(res.seq).padStart(9, '0');
    return { uid: `MBTAC${padded}`, seq: res.seq };
}

async function getNextCustomerUid(startVal = 10101) {
    const res = await getNextCustomerUidWithSeq(startVal);
    return res.uid;
}

/**
 * Sequential Bill Number Generator
 * Format: MBTAB-10101, MBTAB-10102, etc.
 */
async function getNextBillNumber(startVal = 10101) {
    let res = await Counter.findOneAndUpdate(
        { _id: 'bill_number' },
        { $inc: { seq: 1 } },
        { returnDocument: 'after' }
    );

    if (!res) {
        try {
            res = await Counter.create({ _id: 'bill_number', seq: startVal });
        } catch (err) {
            res = await Counter.findOneAndUpdate(
                { _id: 'bill_number' },
                { $inc: { seq: 1 } },
                { returnDocument: 'after' }
            );
        }
    }

    return `MBTAB-${res.seq}`;
}

/**
 * Sequential Money Transaction ID Generator
 * Format: MTXN-10101, MTXN-10102, etc.
 */
async function getNextMoneyTransactionId(startVal = 10101) {
    let res = await Counter.findOneAndUpdate(
        { _id: 'money_txn_number' },
        { $inc: { seq: 1 } },
        { returnDocument: 'after' }
    );

    if (!res) {
        try {
            res = await Counter.create({ _id: 'money_txn_number', seq: startVal });
        } catch (err) {
            res = await Counter.findOneAndUpdate(
                { _id: 'money_txn_number' },
                { $inc: { seq: 1 } },
                { returnDocument: 'after' }
            );
        }
    }

    return `MTXN-${res.seq}`;
}

/**
 * Sequential Expense ID Generator
 * Format: EXP-10101, EXP-10102, etc.
 */
async function getNextExpenseId(startVal = 10101) {
    let res = await Counter.findOneAndUpdate(
        { _id: 'expense_number' },
        { $inc: { seq: 1 } },
        { returnDocument: 'after' }
    );

    if (!res) {
        try {
            res = await Counter.create({ _id: 'expense_number', seq: startVal });
        } catch (err) {
            res = await Counter.findOneAndUpdate(
                { _id: 'expense_number' },
                { $inc: { seq: 1 } },
                { returnDocument: 'after' }
            );
        }
    }

    return `EXP-${res.seq}`;
}

/**
 * Sequential Retailer-Wise Employee UID Generator
 * Format: {RetailerUID}-EMP001, {RetailerUID}-EMP002, etc.
 * Example: MBTAR000010101-EMP001
 * Each retailer has an independent atomic employee counter starting from 1.
 */
async function getNextRetailerEmployeeUid(retailerId) {
    const cleanId = String(retailerId || 'MBTAR000010101').trim();
    const counterId = `emp_uid_${cleanId}`;

    // Find highest existing sequence for this retailer in DB to prevent duplicates
    let maxSeq = 0;
    try {
        const Employee = mongoose.models.Employee || require('./Employee');
        const existingEmployees = await Employee.find({ retailerId: cleanId }).select('employeeUid');
        for (const emp of existingEmployees) {
            const match = emp.employeeUid && emp.employeeUid.match(/-EMP(\d+)$/i);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxSeq) {
                    maxSeq = num;
                }
            }
        }
    } catch (err) {
        // Employee model not yet registered or collection empty
    }

    const currentCounter = await Counter.findById(counterId);
    if (!currentCounter) {
        await Counter.findByIdAndUpdate(
            counterId,
            { $setOnInsert: { seq: maxSeq } },
            { upsert: true }
        );
    } else if (maxSeq > currentCounter.seq) {
        await Counter.findByIdAndUpdate(
            counterId,
            { seq: maxSeq }
        );
    }

    const res = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
    );

    const padded = String(res.seq).padStart(3, '0');
    return `${cleanId}-EMP${padded}`;
}

/**
 * Generates an atomic sequential Task ID per retailer: e.g. MBTAR000010101-TSK0001
 * Synchronizes with highest existing taskId in database if present.
 */
async function getNextTaskId(retailerId = 'MBTAR000010101') {
    const cleanId = String(retailerId || 'MBTAR000010101').trim();
    const counterId = `task_id_${cleanId}`;

    let maxSeq = 0;
    try {
        const Task = mongoose.models.Task || require('./Task');
        const tasks = await Task.find({ retailerId: cleanId }).select('taskId').lean();
        const regex = new RegExp(`^${cleanId}-TSK(\\d+)$`, 'i');
        for (const t of tasks) {
            const match = t.taskId && t.taskId.match(regex);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxSeq) maxSeq = num;
            }
        }
    } catch (err) {
        // Task model not yet registered or collection empty
    }

    const currentCounter = await Counter.findById(counterId);
    if (!currentCounter) {
        await Counter.findByIdAndUpdate(
            counterId,
            { $setOnInsert: { seq: maxSeq } },
            { upsert: true }
        );
    } else if (maxSeq > currentCounter.seq) {
        await Counter.findByIdAndUpdate(
            counterId,
            { seq: maxSeq }
        );
    }

    const res = await Counter.findOneAndUpdate(
        { _id: counterId },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
    );

    const padded = String(res.seq).padStart(4, '0');
    return `${cleanId}-TSK${padded}`;
}

module.exports = {
    Counter,
    getNextRetailerUid,
    getNextRetailerUidWithSeq,
    rollbackRetailerUid,
    getNextEmployeeUid,
    getNextEmployeeUidWithSeq,
    rollbackEmployeeUid,
    getNextCustomerUid,
    getNextCustomerUidWithSeq,
    getNextBillNumber,
    getNextMoneyTransactionId,
    getNextExpenseId,
    getNextRetailerEmployeeUid,
    getNextTaskId,
    rollbackSequence
};
