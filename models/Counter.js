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

module.exports = {
    Counter,
    getNextRetailerUid,
    getNextRetailerUidWithSeq,
    rollbackRetailerUid,
    getNextEmployeeUid,
    getNextEmployeeUidWithSeq,
    rollbackEmployeeUid,
    rollbackSequence
};
