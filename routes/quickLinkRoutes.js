const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const QuickLink = require('../models/QuickLink');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const { cloudinary } = require('../cloudinaryConfig');

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, '../uploads');
const videosDir = path.join(__dirname, '../uploads/videos');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === 'videoFile' || (file.mimetype && file.mimetype.startsWith('video/'))) {
            cb(null, videosDir);
        } else {
            cb(null, uploadsDir);
        }
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
        cb(null, `${file.fieldname}-${safeBase}-${uniqueSuffix}${ext}`);
    }
});

const quickLinkUpload = multer({
    storage: diskStorage,
    limits: {
        fileSize: 300 * 1024 * 1024 // 300 MB limit
    }
}).fields([
    { name: 'image', maxCount: 1 },
    { name: 'videoFile', maxCount: 1 }
]);

// GET all quick links (optionally filtered by menuKey)
router.get('/', async (req, res) => {
    try {
        const { menuKey } = req.query;
        let filter = {};
        if (menuKey) {
            if (menuKey === 'quickLinks') {
                filter = { $or: [{ menuKey: 'quickLinks' }, { menuKey: { $exists: false } }, { menuKey: '' }, { menuKey: null }] };
            } else {
                filter = { menuKey };
            }
        }
        const links = await QuickLink.find(filter).sort({ order: 1, createdAt: -1 });
        res.json(links);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET successful paid quick-link visits from the existing wallet ledger
router.get('/logs', async (req, res) => {
    try {
        const transactions = await WalletTransaction.find({
            description: /Visiting Fee/i
        }).sort({ createdAt: -1 });
        res.json(transactions);
    } catch (error) {
        console.error('Error fetching quick-link service logs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch quick-link service logs' });
    }
});

// POST a new quick link (with optional image and/or device video upload)
router.post('/', quickLinkUpload, async (req, res) => {
    try {
        const { title, url, icon, category, isActive, order, fee, menuKey, videoSource } = req.body;
        let img = '';

        if (req.files && req.files.image && req.files.image[0]) {
            const imgFile = req.files.image[0];
            try {
                const result = await cloudinary.uploader.upload(imgFile.path, {
                    folder: 'samples/mb_mitra',
                    transformation: [{ quality: 'auto', fetch_format: 'auto' }]
                });
                img = result.secure_url;
                try { fs.unlinkSync(imgFile.path); } catch (e) {}
            } catch (cloudErr) {
                console.warn('Cloudinary image upload failed, using local fallback:', cloudErr.message);
                img = '/uploads/' + imgFile.filename;
            }
        } else if (req.body.img) {
            img = req.body.img;
        }

        let videoFilePath = '';
        if (req.files && req.files.videoFile && req.files.videoFile[0]) {
            videoFilePath = '/uploads/videos/' + req.files.videoFile[0].filename;
        } else if (req.body.videoFile) {
            videoFilePath = req.body.videoFile;
        }

        let finalUrl = (url || '').trim();
        if (!finalUrl && videoFilePath) {
            finalUrl = videoFilePath;
        }

        const newLink = new QuickLink({
            title: (title || '').trim(),
            url: finalUrl,
            videoFile: videoFilePath,
            videoSource: videoSource || (videoFilePath ? 'device' : 'url'),
            img,
            icon: icon || '🔗',
            category: category || (menuKey === 'vedioLink' ? 'video' : 'link'),
            isActive: isActive === undefined ? true : (isActive === 'true' || isActive === true),
            order: Number(order) || 0,
            fee: Number(fee) >= 0 ? Number(fee) : 0,
            menuKey: (menuKey || 'quickLinks').trim()
        });

        await newLink.save();
        res.status(201).json(newLink);
    } catch (error) {
        console.error('Error saving quick link:', error);
        res.status(400).json({ message: error.message });
    }
});

// PUT (update) an existing quick link
router.put('/:id', quickLinkUpload, async (req, res) => {
    try {
        const { title, url, icon, category, isActive, order, fee, menuKey, videoSource } = req.body;
        const link = await QuickLink.findById(req.params.id);
        if (!link) return res.status(404).json({ message: 'Quick link not found' });

        if (title !== undefined) link.title = String(title).trim();
        if (icon !== undefined) link.icon = icon;
        if (category !== undefined) link.category = category;
        if (isActive !== undefined) link.isActive = (isActive === 'true' || isActive === true);
        if (order !== undefined) link.order = Number(order) || 0;
        if (fee !== undefined) link.fee = Number(fee) >= 0 ? Number(fee) : 0;
        if (menuKey !== undefined) link.menuKey = String(menuKey).trim();
        if (videoSource !== undefined) link.videoSource = videoSource;

        if (req.files && req.files.image && req.files.image[0]) {
            const imgFile = req.files.image[0];
            try {
                const result = await cloudinary.uploader.upload(imgFile.path, {
                    folder: 'samples/mb_mitra',
                    transformation: [{ quality: 'auto', fetch_format: 'auto' }]
                });
                link.img = result.secure_url;
                try { fs.unlinkSync(imgFile.path); } catch (e) {}
            } catch (cloudErr) {
                console.warn('Cloudinary image upload failed, using local fallback:', cloudErr.message);
                link.img = '/uploads/' + imgFile.filename;
            }
        } else if (req.body.img !== undefined) {
            link.img = req.body.img;
        }

        if (req.files && req.files.videoFile && req.files.videoFile[0]) {
            // Remove previous local video file if existed
            if (link.videoFile && link.videoFile.startsWith('/uploads/videos/')) {
                const oldVid = path.join(__dirname, '..', link.videoFile);
                if (fs.existsSync(oldVid)) {
                    try { fs.unlinkSync(oldVid); } catch (e) {}
                }
            }
            link.videoFile = '/uploads/videos/' + req.files.videoFile[0].filename;
            if (!url || url === 'device-video' || url === link.url) {
                link.url = link.videoFile;
            }
        } else if (req.body.videoFile !== undefined) {
            link.videoFile = req.body.videoFile;
        }

        if (url !== undefined && url !== 'device-video') {
            link.url = String(url).trim();
        } else if (!link.url && link.videoFile) {
            link.url = link.videoFile;
        }

        await link.save();
        res.json(link);
    } catch (error) {
        console.error('Error updating quick link:', error);
        res.status(400).json({ message: error.message });
    }
});

// POST visit quick link & deduct fee from user wallet
router.post('/visit/:id', async (req, res) => {
    try {
        const { userId } = req.body;
        const link = await QuickLink.findById(req.params.id);
        if (!link) {
            return res.status(404).json({ success: false, message: 'Quick link not found' });
        }

        const feeAmount = Number(link.fee) || 0;
        // If free, no fee deduction is required
        if (feeAmount <= 0) {
            return res.json({ 
                success: true, 
                url: link.url, 
                videoFile: link.videoFile, 
                videoSource: link.videoSource, 
                fee: 0, 
                message: 'Free link accessed' 
            });
        }

        if (!userId) {
            return res.status(400).json({ success: false, message: 'User identifier is required to access paid links' });
        }

        const queryTerm = String(userId).trim();
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
            return res.status(404).json({ success: false, message: 'User account not found' });
        }

        if ((user.walletBalance || 0) < feeAmount) {
            return res.status(400).json({
                success: false,
                message: `Insufficient wallet balance. Fee ₹${feeAmount} required. Current balance: ₹${(user.walletBalance || 0).toFixed(2)}`,
                walletBalance: user.walletBalance
            });
        }

        const balanceBefore = user.walletBalance || 0;
        user.walletBalance = parseFloat((balanceBefore - feeAmount).toFixed(2));
        await user.save();

        const randomRef = 'QLINK' + Date.now() + Math.floor(100 + Math.random() * 900);
        const menuLabelMap = {
            servicesLink: 'SERVICES LINK',
            jobLinks: 'JOB LINKS',
            admitCard: 'ADMIT CARD',
            formLinks: 'FORM LINKS',
            vedioLink: 'VEDIO LINK',
            trainingLinks: 'TRAINING LINKS',
            productLinks: 'PRODUCT LINKS',
            govtLinks: 'GOVT LINKS',
            print: 'PRINT',
            schorshipLinks: 'SCHORSHIP LINKS',
            quickLinks: 'Quick Link'
        };
        const menuDisplayName = menuLabelMap[link.menuKey] || 'Quick Link';

        const newTx = new WalletTransaction({
            userId: user.userId,
            transactionType: 'Debit',
            amount: feeAmount,
            balanceBefore,
            balanceAfter: user.walletBalance,
            description: `${menuDisplayName} Visiting Fee - ${link.title}`,
            referenceNumber: randomRef,
            status: 'Success'
        });
        await newTx.save();

        return res.json({
            success: true,
            url: link.url,
            videoFile: link.videoFile,
            videoSource: link.videoSource,
            fee: feeAmount,
            walletBalance: user.walletBalance,
            message: `₹${feeAmount} deducted from wallet successfully.`
        });
    } catch (error) {
        console.error('Error processing quick link visit:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE a quick link
router.delete('/:id', async (req, res) => {
    try {
        const link = await QuickLink.findById(req.params.id);
        if (link && link.videoFile && link.videoFile.startsWith('/uploads/videos/')) {
            const localVideo = path.join(__dirname, '..', link.videoFile);
            if (fs.existsSync(localVideo)) {
                try { fs.unlinkSync(localVideo); } catch (e) {}
            }
        }
        await QuickLink.findByIdAndDelete(req.params.id);
        res.json({ message: 'Quick link deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST reorder quick links
router.post('/reorder', async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (Array.isArray(orderedIds)) {
            for (let i = 0; i < orderedIds.length; i++) {
                await QuickLink.findByIdAndUpdate(orderedIds[i], { order: i });
            }
        }
        res.json({ message: 'Reordered successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
