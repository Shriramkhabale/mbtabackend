const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const CrmCard = require('../models/CrmCard');
const Customer = require('../models/Customer');
const CustomerField = require('../models/CustomerField');
const CustomerWork = require('../models/CustomerWork');
const CustomerBill = require('../models/CustomerBill');
const BankAccount = require('../models/BankAccount');
const BankField = require('../models/BankField');
const MoneyTransaction = require('../models/MoneyTransaction');
const BusinessExpense = require('../models/BusinessExpense');
const { getNextCustomerUid, getNextBillNumber, getNextMoneyTransactionId, getNextExpenseId } = require('../models/Counter');
const { generateCustomerBillPdf } = require('../utils/customerBillPdf');
const CustomerOtp = require('../models/CustomerOtp');
const Staff = require('../models/Staff');
const { sendCustomerOtpSms } = require('../utils/customerSms');
const { createSessionToken, verifySessionToken } = require('../utils/sessionToken');

// Ensure upload folders exist
const DOCS_DIR = path.join(__dirname, '..', 'uploads', 'customer_documents');
const BILLS_DIR = path.join(__dirname, '..', 'uploads', 'customer_bills');
[DOCS_DIR, BILLS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure Multer for document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DOCS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const unique = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `${safeBase}_${unique}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, JPG, JPEG, and PNG files are supported for customer documents.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit per file
});

// ======================================================================
// 1. CRM CARDS MANAGEMENT (From Previous Step - Kept Intact)
// ======================================================================

const DEFAULT_CRM_CARDS = [
  {
    cardId: 'task',
    title: 'Task',
    subtitle: 'Organize daily to-dos, assignments, and follow-ups.',
    icon: '📋',
    badge: 'Tasks',
    color: '#3b82f6',
    url: '/crm/task',
    isActive: true,
    order: 0
  },
  {
    cardId: 'pending_work',
    title: 'Pending Work',
    subtitle: 'Monitor, track, and clear customer pending applications.',
    icon: '⏳',
    badge: 'Pending',
    color: '#f59e0b',
    url: '/crm/pending-work',
    isActive: true,
    order: 1
  },
  {
    cardId: 'my_bill_book',
    title: 'My Bill Book',
    subtitle: 'Digital billing, invoice records, and ledger management.',
    icon: '📖',
    badge: 'Billing',
    color: '#10b981',
    url: '/crm/my-bill-book',
    isActive: true,
    order: 2
  },
  {
    cardId: 'customer_management',
    title: 'Customer Management',
    subtitle: 'Customer directory, contact details, and client profiles.',
    icon: '👥',
    badge: 'Clients',
    color: '#8b5cf6',
    url: '/crm/customer-management',
    isActive: true,
    order: 3
  },
  {
    cardId: 'bank_account_details',
    title: 'Bank Account Details',
    subtitle: 'Manage bank accounts and account information.',
    icon: '🏦',
    badge: 'Banking',
    color: '#0284c7',
    url: '/crm/bank-accounts',
    isActive: true,
    order: 4
  },
  {
    cardId: 'money_transaction',
    title: 'Money Transaction',
    subtitle: 'Manage cash, online payments, commissions, and financial transactions.',
    icon: '💸',
    badge: 'Transactions',
    color: '#059669',
    url: '/crm/money-transactions',
    isActive: true,
    order: 5
  },
  {
    cardId: 'employee_management',
    title: 'Employee Management',
    subtitle: 'Manage employees, assign service permissions, provide login access, and track employee activities.',
    icon: '👔',
    badge: 'Employees',
    color: '#6366f1',
    url: '/crm/employee-management',
    isActive: true,
    order: 6
  }
];

async function seedDefaultCardsIfEmpty() {
  for (const defCard of DEFAULT_CRM_CARDS) {
    const exists = await CrmCard.findOne({ cardId: defCard.cardId });
    if (!exists) {
      await CrmCard.create(defCard);
    }
  }
}

router.get('/cards', async (req, res) => {
  try {
    await seedDefaultCardsIfEmpty();
    const cards = await CrmCard.find().sort({ order: 1, createdAt: 1 });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/cards', async (req, res) => {
  try {
    const { title, subtitle, icon, badge, color, url, isActive, order } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Card title is required.' });
    }

    const count = await CrmCard.countDocuments();
    const autoCardId = (req.body.cardId && req.body.cardId.trim()) 
      ? req.body.cardId.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
      : `card_${Date.now()}`;

    const newCard = new CrmCard({
      cardId: autoCardId,
      title: title.trim(),
      subtitle: (subtitle || '').trim(),
      icon: (icon || '📋').trim(),
      badge: (badge || '').trim(),
      color: color || '#ea580c',
      url: (url || '').trim(),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      order: order !== undefined ? Number(order) : count
    });

    await newCard.save();
    res.status(201).json({ success: true, card: newCard });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/cards/:id', async (req, res) => {
  try {
    const updated = await CrmCard.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'CRM card not found.' });
    }
    res.json({ success: true, card: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.patch('/cards/:id/toggle', async (req, res) => {
  try {
    const card = await CrmCard.findById(req.params.id);
    if (!card) {
      return res.status(404).json({ success: false, message: 'CRM card not found.' });
    }
    card.isActive = !card.isActive;
    await card.save();
    res.json({ success: true, card });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/cards/:id', async (req, res) => {
  try {
    const deleted = await CrmCard.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'CRM card not found.' });
    }
    res.json({ success: true, message: 'CRM card deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/cards/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (Array.isArray(orderedIds)) {
      for (let i = 0; i < orderedIds.length; i++) {
        await CrmCard.findByIdAndUpdate(orderedIds[i], { order: i });
      }
    }
    res.json({ success: true, message: 'CRM cards reordered successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 2. DYNAMIC CUSTOMER FORM FIELDS (Admin Panel Managed)
// ======================================================================

// GET /api/crm/fields - Get all fields with auto-seed
router.get('/fields', async (req, res) => {
  try {
    await CustomerField.seedDefaultFieldsIfEmpty();
    const fields = await CustomerField.find().sort({ order: 1, createdAt: 1 });
    res.json({ success: true, fields });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/fields - Add new custom field
router.post('/fields', async (req, res) => {
  try {
    const { label, type, required, hidden, options, placeholder, icon, order } = req.body;
    if (!label || !label.trim()) {
      return res.status(400).json({ success: false, message: 'Field label is required.' });
    }

    // Generate unique programmatic name from label or custom key
    let fieldName = (req.body.name || '').trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (!fieldName) {
      fieldName = label.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '');
      // camelCase conversion
      fieldName = fieldName.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    }

    // Check if name already exists
    let existing = await CustomerField.findOne({ name: fieldName });
    if (existing) {
      fieldName = `${fieldName}_${Date.now()}`;
    }

    const count = await CustomerField.countDocuments();
    const newField = new CustomerField({
      name: fieldName,
      label: label.trim(),
      type: type || 'text',
      required: Boolean(required),
      hidden: Boolean(hidden),
      options: Array.isArray(options) ? options : (typeof options === 'string' ? options.split(',').map(s => s.trim()).filter(Boolean) : []),
      placeholder: (placeholder || '').trim(),
      icon: (icon || '📝').trim(),
      order: order !== undefined ? Number(order) : count,
      isSystem: false
    });

    await newField.save();
    res.status(201).json({ success: true, field: newField });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/crm/fields/:id - Update field properties
router.put('/fields/:id', async (req, res) => {
  try {
    const { label, type, required, hidden, options, placeholder, icon, order } = req.body;
    const field = await CustomerField.findById(req.params.id);
    if (!field) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }

    if (label !== undefined) field.label = label.trim();
    if (type !== undefined) field.type = type;
    if (required !== undefined) field.required = Boolean(required);
    if (hidden !== undefined) field.hidden = Boolean(hidden);
    if (placeholder !== undefined) field.placeholder = placeholder.trim();
    if (icon !== undefined) field.icon = icon.trim();
    if (order !== undefined) field.order = Number(order);
    if (options !== undefined) {
      field.options = Array.isArray(options) ? options : (typeof options === 'string' ? options.split(',').map(s => s.trim()).filter(Boolean) : []);
    }

    await field.save();
    res.json({ success: true, field });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /api/crm/fields/:id/toggle-visibility - Hide/Show field
router.patch('/fields/:id/toggle-visibility', async (req, res) => {
  try {
    const field = await CustomerField.findById(req.params.id);
    if (!field) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }
    field.hidden = !field.hidden;
    await field.save();
    res.json({ success: true, field });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/crm/fields/:id/toggle-required - Toggle mandatory/optional
router.patch('/fields/:id/toggle-required', async (req, res) => {
  try {
    const field = await CustomerField.findById(req.params.id);
    if (!field) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }
    field.required = !field.required;
    await field.save();
    res.json({ success: true, field });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/crm/fields/:id - Delete field from active configuration
router.delete('/fields/:id', async (req, res) => {
  try {
    const deleted = await CustomerField.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }
    res.json({ success: true, message: 'Form field removed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/fields/reorder - Reorder form fields
router.post('/fields/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (Array.isArray(orderedIds)) {
      for (let i = 0; i < orderedIds.length; i++) {
        await CustomerField.findByIdAndUpdate(orderedIds[i], { order: i });
      }
    }
    res.json({ success: true, message: 'Form fields reordered successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 3. CUSTOMER MANAGEMENT (UID, List, Add, Edit, Documents)
// ======================================================================

// GET /api/crm/customers - List customers with search & filter
router.get('/customers', async (req, res) => {
  try {
    const { search = '', status = '', limit = 100, skip = 0 } = req.query;
    const filter = { isDeleted: false };

    if (status && status !== 'ALL') {
      filter.workStatus = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { customerUid: { $regex: q, $options: 'i' } },
        { customerName: { $regex: q, $options: 'i' } },
        { mobileNumber: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { city: { $regex: q, $options: 'i' } }
      ];
    }

    const total = await Customer.countDocuments(filter);
    const customers = await Customer.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      customers
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/customers/:id/send-otp - Generate & Send OTP to customer's registered mobile
router.post('/customers/:id/send-otp', async (req, res) => {
  try {
    const id = req.params.id;
    const isUid = /^MBTAC\d+$/i.test(id);
    const customer = await Customer.findOne(isUid ? { customerUid: id } : { _id: id });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    const cleanMobile = String(customer.mobileNumber || '').trim().replace(/^\+91/, '').replace(/^0/, '');
    if (!cleanMobile || cleanMobile.length !== 10) {
      return res.status(400).json({
        success: false,
        message: 'Customer does not have a valid 10-digit mobile number on file.'
      });
    }

    // Check rate limit: minimum 30s between OTP generation requests
    const existingOtp = await CustomerOtp.findOne({ customerUid: customer.customerUid });
    if (existingOtp && existingOtp.expiresAt) {
      const timeSinceCreation = Date.now() - (existingOtp.expiresAt.getTime() - 5 * 60 * 1000);
      if (timeSinceCreation < 30 * 1000) {
        const waitSec = Math.ceil((30 * 1000 - timeSinceCreation) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${waitSec} second(s) before requesting another OTP.`
        });
      }
    }

    // Cryptographically secure 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');

    // Save hashed OTP in database with 5-minute expiry
    await CustomerOtp.findOneAndUpdate(
      { customerUid: customer.customerUid },
      {
        customerUid: customer.customerUid,
        mobileNumber: cleanMobile,
        otpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0,
        verified: false,
        verificationToken: null,
        sessionExpiresAt: null
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Send SMS via Dove SMS provider
    const smsResult = await sendCustomerOtpSms(cleanMobile, rawOtp);
    console.log(`[Customer OTP Verification] Generated OTP for customer ${customer.customerUid} (${cleanMobile}). SMS Dispatch:`, smsResult.success ? 'SUCCESS' : `FAILED (${smsResult.error})`);

    const last4 = cleanMobile.slice(-4);
    res.json({
      success: true,
      message: `OTP sent successfully to registered mobile ******${last4}`,
      maskedMobile: `******${last4}`,
      customerUid: customer.customerUid,
      customerName: customer.customerName,
      expiresInSeconds: 300,
      smsDispatched: smsResult.success
    });
  } catch (err) {
    console.error('Send Customer OTP Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/customers/:id/verify-otp - Verify customer OTP and generate session token
router.post('/customers/:id/verify-otp', async (req, res) => {
  try {
    const id = req.params.id;
    const isUid = /^MBTAC\d+$/i.test(id);
    const customer = await Customer.findOne(isUid ? { customerUid: id } : { _id: id });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    const { otp } = req.body;
    if (!otp || String(otp).trim().length !== 6) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 6-digit OTP.' });
    }

    const otpRecord = await CustomerOtp.findOne({ customerUid: customer.customerUid });
    if (!otpRecord || !otpRecord.expiresAt || otpRecord.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired or was not requested. Please request a new OTP.'
      });
    }

    if (otpRecord.attempts >= 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum verification attempts (5) exceeded. Please request a new OTP.'
      });
    }

    const inputHash = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
    if (inputHash !== otpRecord.otpHash) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      const remaining = Math.max(0, 5 - otpRecord.attempts);
      return res.status(400).json({
        success: false,
        message: `Invalid OTP! ${remaining} attempt(s) remaining.`
      });
    }

    // Generate single-use secure viewing session token (valid for 15 minutes)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    otpRecord.verified = true;
    otpRecord.verificationToken = verificationToken;
    otpRecord.sessionExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await otpRecord.save();

    res.json({
      success: true,
      message: 'OTP verified successfully!',
      verificationToken,
      customerUid: customer.customerUid
    });
  } catch (err) {
    console.error('Verify Customer OTP Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/customers/:id/invalidate-verification - Invalidate viewing session when modal closed
router.post('/customers/:id/invalidate-verification', async (req, res) => {
  try {
    const id = req.params.id;
    const isUid = /^MBTAC\d+$/i.test(id);
    const customer = await Customer.findOne(isUid ? { customerUid: id } : { _id: id });
    if (customer) {
      await CustomerOtp.deleteMany({ customerUid: customer.customerUid });
    }
    res.json({ success: true, message: 'Customer viewing session ended.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/admin/token - Authenticate Admin and issue signed JWT session token for Admin Customer Management
router.post('/admin/token', async (req, res) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();

    // Check against configured admin credentials (consistent with userRoutes.js)
    const isAdmin = (cleanEmail === 'mbtravels08@gmail.com' && password === '123456');

    // Also support active staff member if credentials provided
    let isStaff = false;
    let staffUser = null;
    if (!isAdmin && req.body.username && req.body.password) {
      const staff = await Staff.findOne({ username: req.body.username.toLowerCase(), isActive: true });
      if (staff && staff.password === req.body.password) {
        isStaff = true;
        staffUser = staff.username;
      }
    }

    if (!isAdmin && !isStaff) {
      return res.status(401).json({ success: false, message: 'Invalid Admin credentials.' });
    }

    const token = createSessionToken({
      userId: isAdmin ? 'admin' : staffUser,
      role: 'admin'
    });

    res.json({
      success: true,
      token,
      role: 'admin',
      userId: isAdmin ? 'admin' : staffUser
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/crm/customers/:id - Customer details profile with documents, work & bills
// Retailers require OTP verification; Authorized Admins view directly without OTP
router.get('/customers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const isUid = /^MBTAC\d+$/i.test(id);
    const customer = await Customer.findOne(isUid ? { customerUid: id } : { _id: id });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    // 1. Role-based check: Check if requester is an authorized Admin via Bearer token or x-admin-token
    const authHeader = req.headers['authorization'] || '';
    const adminToken = req.headers['x-admin-token'] || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);
    const adminSession = adminToken ? verifySessionToken(adminToken, ['admin']) : null;

    if (adminSession && adminSession.role === 'admin') {
      // Authorized Admin - direct OTP-free viewing!
      const workItems = await CustomerWork.find({ customerUid: customer.customerUid }).sort({ createdAt: -1 });
      const bills = await CustomerBill.find({ customerUid: customer.customerUid }).sort({ billDate: -1 });

      return res.json({
        success: true,
        customer,
        workItems,
        bills,
        isAdminView: true
      });
    }

    // 2. Retailer check: strictly require valid OTP verification token for this customer
    const verificationToken = req.headers['x-customer-verification-token'] || req.query.verificationToken;
    if (!verificationToken) {
      return res.status(403).json({
        success: false,
        message: 'OTP verification required to view customer details.'
      });
    }

    const validSession = await CustomerOtp.findOne({
      customerUid: customer.customerUid,
      verificationToken,
      verified: true,
      sessionExpiresAt: { $gt: new Date() }
    });

    if (!validSession) {
      return res.status(403).json({
        success: false,
        message: 'Customer verification session has expired or is invalid. Fresh OTP verification required.'
      });
    }

    // Fetch related work items and bills
    const workItems = await CustomerWork.find({ customerUid: customer.customerUid }).sort({ createdAt: -1 });
    const bills = await CustomerBill.find({ customerUid: customer.customerUid }).sort({ billDate: -1 });

    res.json({
      success: true,
      customer,
      workItems,
      bills
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/customers - Create new customer with automatic UID & optional documents
router.post('/customers', upload.array('documents', 10), async (req, res) => {
  try {
    // Parse body data (supporting JSON or FormData multipart)
    let bodyData = req.body;
    if (typeof bodyData.dynamicData === 'string') {
      try {
        bodyData.dynamicData = JSON.parse(bodyData.dynamicData);
      } catch (e) {
        bodyData.dynamicData = {};
      }
    }

    const customerName = (bodyData.customerName || '').trim();
    const mobileNumber = (bodyData.mobileNumber || '').trim();

    if (!customerName) {
      return res.status(400).json({ success: false, message: 'Customer Name is mandatory.' });
    }
    if (!mobileNumber) {
      return res.status(400).json({ success: false, message: 'Mobile Number is mandatory.' });
    }

    // Dynamic fields validation for active mandatory fields
    const activeFields = await CustomerField.find({ hidden: false });
    for (const field of activeFields) {
      if (field.required) {
        let val = bodyData[field.name];
        if (val === undefined && bodyData.dynamicData) {
          val = bodyData.dynamicData[field.name];
        }
        if (val === undefined || val === null || String(val).trim() === '') {
          return res.status(400).json({
            success: false,
            message: `Mandatory field "${field.label}" is missing or empty.`
          });
        }
      }
    }

    // Process uploaded documents
    const documentsList = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        documentsList.push({
          docId: `DOC_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          name: file.originalname,
          fileName: file.filename,
          fileUrl: `/uploads/customer_documents/${file.filename}`,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedAt: new Date()
        });
      }
    }

    // Extract dynamicData
    const coreKeys = ['customerName', 'mobileNumber', 'email', 'address', 'city', 'state', 'pincode', 'workStatus', 'createdBy'];
    const dynamicData = { ...(bodyData.dynamicData || {}) };
    Object.keys(bodyData).forEach(k => {
      if (!coreKeys.includes(k) && k !== 'documents' && k !== 'dynamicData') {
        dynamicData[k] = bodyData[k];
      }
    });

    // 1. Generate atomic sequential Customer UID (e.g. MBTAC000010101)
    const customerUid = await getNextCustomerUid(10101);

    const newCustomer = new Customer({
      customerUid,
      customerName,
      mobileNumber,
      email: (bodyData.email || '').trim(),
      address: (bodyData.address || '').trim(),
      city: (bodyData.city || '').trim(),
      state: (bodyData.state || '').trim(),
      pincode: (bodyData.pincode || '').trim(),
      workStatus: bodyData.workStatus || 'No Active Work',
      dynamicData,
      documents: documentsList,
      createdBy: (bodyData.createdBy && bodyData.createdBy !== 'user' && bodyData.createdBy !== 'system')
        ? bodyData.createdBy.trim()
        : ((req.user && (req.user.userId || req.user.retailerId || req.user.username)) || 'MBTAR000010101')
    });

    await newCustomer.save();

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully.',
      customer: newCustomer
    });
  } catch (err) {
    console.error('Error creating customer:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/crm/customers/:id - Update customer details (UID is immutable)
router.put('/customers/:id', upload.array('documents', 10), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    let bodyData = req.body;
    if (typeof bodyData.dynamicData === 'string') {
      try {
        bodyData.dynamicData = JSON.parse(bodyData.dynamicData);
      } catch (e) {
        // keep existing
      }
    }

    // Core fields update
    if (bodyData.customerName) customer.customerName = bodyData.customerName.trim();
    if (bodyData.mobileNumber) customer.mobileNumber = bodyData.mobileNumber.trim();
    if (bodyData.email !== undefined) customer.email = bodyData.email.trim();
    if (bodyData.address !== undefined) customer.address = bodyData.address.trim();
    if (bodyData.city !== undefined) customer.city = bodyData.city.trim();
    if (bodyData.state !== undefined) customer.state = bodyData.state.trim();
    if (bodyData.pincode !== undefined) customer.pincode = bodyData.pincode.trim();
    if (bodyData.workStatus !== undefined) customer.workStatus = bodyData.workStatus;

    // Merge dynamicData
    const existingDynamic = customer.dynamicData || {};
    const newDynamic = bodyData.dynamicData || {};
    const coreKeys = ['customerName', 'mobileNumber', 'email', 'address', 'city', 'state', 'pincode', 'workStatus', 'customerUid', '_id'];
    Object.keys(bodyData).forEach(k => {
      if (!coreKeys.includes(k) && k !== 'documents' && k !== 'dynamicData') {
        newDynamic[k] = bodyData[k];
      }
    });
    customer.dynamicData = { ...existingDynamic, ...newDynamic };

    // Append any newly uploaded documents
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        customer.documents.push({
          docId: `DOC_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          name: file.originalname,
          fileName: file.filename,
          fileUrl: `/uploads/customer_documents/${file.filename}`,
          fileSize: file.size,
          mimeType: file.mimetype,
          uploadedAt: new Date()
        });
      }
    }

    customer.updatedBy = bodyData.updatedBy || 'user';
    await customer.save();

    res.json({
      success: true,
      message: 'Customer information updated.',
      customer
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/crm/customers/:id - Remove customer (Does NOT rollback counter)
router.delete('/customers/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    // Permanent delete or mark deleted
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: `Customer ${customer.customerUid} removed successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/customers/:id/documents - Attach additional documents
router.post('/customers/:id/documents', upload.array('documents', 10), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No documents provided for upload.' });
    }

    const addedDocs = [];
    for (const file of req.files) {
      const docItem = {
        docId: `DOC_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        name: file.originalname,
        fileName: file.filename,
        fileUrl: `/uploads/customer_documents/${file.filename}`,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedAt: new Date()
      };
      customer.documents.push(docItem);
      addedDocs.push(docItem);
    }

    await customer.save();
    res.json({
      success: true,
      message: `${addedDocs.length} document(s) uploaded successfully.`,
      documents: customer.documents
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/crm/customers/:id/documents/:docId - Remove a document
router.delete('/customers/:id/documents/:docId', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const docIndex = customer.documents.findIndex(d => d.docId === req.params.docId);
    if (docIndex === -1) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    const removedDoc = customer.documents[docIndex];
    customer.documents.splice(docIndex, 1);
    await customer.save();

    // Optionally remove file from disk
    try {
      const diskPath = path.join(DOCS_DIR, removedDoc.fileName);
      if (fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
      }
    } catch (e) {
      console.warn('Could not delete disk file:', e.message);
    }

    res.json({
      success: true,
      message: 'Document removed successfully.',
      documents: customer.documents
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 4. CUSTOMER WORK MANAGEMENT
// ======================================================================

// GET /api/crm/customers/:customerUid/work - List work items
router.get('/customers/:customerUid/work', async (req, res) => {
  try {
    const workItems = await CustomerWork.find({ customerUid: req.params.customerUid }).sort({ createdAt: -1 });
    res.json({ success: true, workItems });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/customers/:customerUid/work - Add work record
router.post('/customers/:customerUid/work', async (req, res) => {
  try {
    const { description, amount, status } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Work description is required.' });
    }

    const numAmount = Number(amount || 0);
    const validStatus = ['Pending', 'In Progress', 'Completed'].includes(status) ? status : 'Pending';
    const workId = `CWK_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const work = new CustomerWork({
      workId,
      customerUid: req.params.customerUid,
      description: description.trim(),
      amount: numAmount,
      status: validStatus,
      createdBy: (req.body.createdBy && req.body.createdBy !== 'user')
        ? req.body.createdBy.trim()
        : ((req.user && (req.user.userId || req.user.retailerId || req.user.username)) || 'MBTAR000010101')
    });

    await work.save();

    // Update customer's overall workStatus
    await Customer.findOneAndUpdate(
      { customerUid: req.params.customerUid },
      { workStatus: validStatus }
    );

    res.status(201).json({ success: true, work });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PATCH /api/crm/customers/:customerUid/work/:workId - Update work status/details
router.patch('/customers/:customerUid/work/:workId', async (req, res) => {
  try {
    const { description, amount, status } = req.body;
    const work = await CustomerWork.findOne({
      customerUid: req.params.customerUid,
      workId: req.params.workId
    });

    if (!work) {
      return res.status(404).json({ success: false, message: 'Work record not found.' });
    }

    if (description !== undefined) work.description = description.trim();
    if (amount !== undefined) work.amount = Number(amount);
    if (status !== undefined && ['Pending', 'In Progress', 'Completed'].includes(status)) {
      work.status = status;
    }

    await work.save();

    // Sync latest status to customer
    await Customer.findOneAndUpdate(
      { customerUid: req.params.customerUid },
      { workStatus: work.status }
    );

    res.json({ success: true, work });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/crm/customers/:customerUid/work/:workId - Delete work item
router.delete('/customers/:customerUid/work/:workId', async (req, res) => {
  try {
    const deleted = await CustomerWork.findOneAndDelete({
      customerUid: req.params.customerUid,
      workId: req.params.workId
    });

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Work item not found.' });
    }

    // Refresh customer workStatus
    const remaining = await CustomerWork.find({ customerUid: req.params.customerUid }).sort({ createdAt: -1 });
    const latestStatus = remaining.length > 0 ? remaining[0].status : 'No Active Work';
    await Customer.findOneAndUpdate(
      { customerUid: req.params.customerUid },
      { workStatus: latestStatus }
    );

    res.json({ success: true, message: 'Work item removed.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 5. FINAL BILL GENERATION & DOWNLOAD
// ======================================================================

// POST /api/crm/customers/:customerUid/bills - Generate bill for completed work
router.post('/customers/:customerUid/bills', async (req, res) => {
  try {
    const { workId, amount } = req.body;
    if (!workId) {
      return res.status(400).json({ success: false, message: 'Please select a completed work item to generate bill.' });
    }

    const customer = await Customer.findOne({ customerUid: req.params.customerUid });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer record not found.' });
    }

    const work = await CustomerWork.findOne({
      customerUid: req.params.customerUid,
      workId: workId
    });

    if (!work) {
      return res.status(404).json({ success: false, message: 'Work record not found.' });
    }

    // The bill amount must be exactly the amount entered by user
    const billAmount = amount !== undefined && !isNaN(Number(amount)) ? Number(amount) : Number(work.amount || 0);

    // Generate unique sequential Bill Number
    const billNumber = await getNextBillNumber(10101);

    // Build PDF bill and save permanently to disk
    const pdfResult = await generateCustomerBillPdf({
      billNumber,
      customerUid: customer.customerUid,
      customerName: customer.customerName,
      customerMobile: customer.mobileNumber,
      customerEmail: customer.email,
      workDescription: work.description,
      amount: billAmount,
      totalAmount: billAmount,
      billDate: new Date(),
      companyDetails: {
        name: 'MB MITRA (MBTA Athani)',
        tagline: 'Multi-Services & Retailer Digital Portal',
        address: 'Main Road, Athani, Belagavi, Karnataka - 591304',
        contact: '+91 98765 43210 / support@mbmitra.com'
      }
    });

    const bill = new CustomerBill({
      billNumber,
      customerUid: customer.customerUid,
      customerName: customer.customerName,
      customerMobile: customer.mobileNumber,
      customerEmail: customer.email,
      workId: work.workId,
      workDescription: work.description,
      amount: billAmount,
      totalAmount: billAmount,
      billDate: new Date(),
      pdfUrl: pdfResult.relativeUrl,
      createdBy: (req.body.createdBy && req.body.createdBy !== 'user')
        ? req.body.createdBy.trim()
        : ((req.user && (req.user.userId || req.user.retailerId || req.user.username)) || 'MBTAR000010101')
    });

    await bill.save();

    // Mark work as billed
    work.billed = true;
    work.billNumber = billNumber;
    await work.save();

    res.status(201).json({
      success: true,
      message: `Bill ${billNumber} generated successfully.`,
      bill
    });
  } catch (err) {
    console.error('Bill generation error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/crm/customers/:customerUid/bills - List bills for customer
router.get('/customers/:customerUid/bills', async (req, res) => {
  try {
    const bills = await CustomerBill.find({ customerUid: req.params.customerUid }).sort({ billDate: -1 });
    res.json({ success: true, bills });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/crm/bills/:billNumber/pdf - View / Download preserved PDF bill
router.get('/bills/:billNumber/pdf', async (req, res) => {
  try {
    const bill = await CustomerBill.findOne({ billNumber: req.params.billNumber });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill record not found.' });
    }

    let filePath = path.join(__dirname, '..', bill.pdfUrl.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) {
      // Regenerate if file was pruned from disk
      const pdfResult = await generateCustomerBillPdf(bill);
      filePath = pdfResult.filePath;
    }

    const isDownload = req.query.download === 'true' || req.query.download === '1';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="Bill_${bill.billNumber}.pdf"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 4. MY BILL BOOK — REVENUE & BILLING MANAGEMENT MODULE
// ======================================================================

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// GET /api/crm/billbook/summary - Executive revenue KPIs & Monthly Analysis
router.get('/billbook/summary', async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // 1. Total Lifetime Revenue & Total Bills
    const lifetimeAgg = await CustomerBill.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          totalBills: { $sum: 1 }
        }
      }
    ]);
    const totalRevenue = lifetimeAgg[0]?.totalRevenue || 0;
    const totalBills = lifetimeAgg[0]?.totalBills || 0;

    // 2. This Month's Revenue & Bills
    const thisMonthAgg = await CustomerBill.aggregate([
      {
        $match: {
          billDate: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          thisMonthRevenue: { $sum: '$amount' },
          thisMonthBills: { $sum: 1 }
        }
      }
    ]);
    const thisMonthRevenue = thisMonthAgg[0]?.thisMonthRevenue || 0;
    const thisMonthBills = thisMonthAgg[0]?.thisMonthBills || 0;

    // 3. Total Unique Billed Customers
    const uniqueCustomers = await CustomerBill.distinct('customerUid');
    const totalCustomers = uniqueCustomers.length;

    // 4. Monthly Trend Analysis (All recorded months)
    const monthlyTrendAgg = await CustomerBill.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$billDate' },
            month: { $month: '$billDate' }
          },
          totalRevenue: { $sum: '$amount' },
          totalBills: { $sum: 1 },
          customerSet: { $addToSet: '$customerUid' }
        }
      },
      {
        $sort: { '_id.year': -1, '_id.month': -1 }
      }
    ]);

    const monthlyAnalysis = monthlyTrendAgg.map(item => {
      const year = item._id.year;
      const monthNum = item._id.month; // 1 to 12
      const monthName = MONTH_NAMES[monthNum - 1] || `Month ${monthNum}`;
      return {
        key: `${year}-${String(monthNum).padStart(2, '0')}`,
        year,
        month: monthNum,
        monthName,
        monthLabel: `${monthName.slice(0, 3)} ${year}`,
        fullLabel: `${monthName} ${year}`,
        totalRevenue: item.totalRevenue,
        totalBills: item.totalBills,
        totalCustomers: item.customerSet ? item.customerSet.length : 0,
        averageBill: item.totalBills > 0 ? Math.round(item.totalRevenue / item.totalBills) : 0
      };
    });

    res.json({
      success: true,
      summary: {
        totalRevenue,
        thisMonthRevenue,
        thisMonthBills,
        totalCustomers,
        totalBills,
        currentMonthName: MONTH_NAMES[now.getMonth()],
        currentYear: now.getFullYear()
      },
      monthlyAnalysis
    });
  } catch (err) {
    console.error('BillBook summary error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/crm/billbook/customers - Customer-wise Revenue Records
router.get('/billbook/customers', async (req, res) => {
  try {
    const { search } = req.query;

    const customerAgg = await CustomerBill.aggregate([
      {
        $group: {
          _id: '$customerUid',
          customerName: { $last: '$customerName' },
          customerMobile: { $last: '$customerMobile' },
          customerEmail: { $last: '$customerEmail' },
          totalBills: { $sum: 1 },
          totalRevenue: { $sum: '$amount' },
          worksSet: { $addToSet: '$workId' },
          firstBillDate: { $min: '$billDate' },
          lastBillDate: { $max: '$billDate' }
        }
      },
      {
        $project: {
          _id: 0,
          customerUid: '$_id',
          customerName: 1,
          customerMobile: 1,
          customerEmail: 1,
          totalBills: 1,
          totalRevenue: 1,
          totalWorks: { $size: '$worksSet' },
          firstBillDate: 1,
          lastWorkDate: '$lastBillDate',
          latestBillDate: '$lastBillDate'
        }
      },
      {
        $sort: { totalRevenue: -1 }
      }
    ]);

    // Enrich with latest customer profile details
    const uids = customerAgg.map(c => c.customerUid);
    const customerProfiles = await Customer.find({ customerUid: { $in: uids } }).lean();
    const profileMap = new Map();
    customerProfiles.forEach(p => profileMap.set(p.customerUid, p));

    let results = customerAgg.map(item => {
      const p = profileMap.get(item.customerUid);
      return {
        ...item,
        customerName: p?.customerName || item.customerName,
        mobileNumber: p?.mobileNumber || item.customerMobile,
        email: p?.email || item.customerEmail || ''
      };
    });

    // Optional search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      results = results.filter(c =>
        (c.customerUid || '').toLowerCase().includes(q) ||
        (c.customerName || '').toLowerCase().includes(q) ||
        (c.mobileNumber || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );
    }

    res.json({
      success: true,
      customers: results,
      totalCount: results.length
    });
  } catch (err) {
    console.error('BillBook customers error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/crm/billbook/customers/:customerUid - Individual Customer Revenue Details & History
router.get('/billbook/customers/:customerUid', async (req, res) => {
  try {
    const { customerUid } = req.params;

    let customer = await Customer.findOne({ customerUid }).lean();
    const bills = await CustomerBill.find({ customerUid }).sort({ billDate: -1 }).lean();

    if (!customer && bills.length > 0) {
      customer = {
        customerUid,
        customerName: bills[0].customerName,
        mobileNumber: bills[0].customerMobile,
        email: bills[0].customerEmail || ''
      };
    }

    if (!customer && bills.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer records not found.' });
    }

    const totalBills = bills.length;
    const totalRevenue = bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    const uniqueWorks = new Set(bills.map(b => b.workId));
    const totalWorks = uniqueWorks.size;
    const firstBillDate = bills.length > 0 ? bills[bills.length - 1].billDate : null;
    const latestBillDate = bills.length > 0 ? bills[0].billDate : null;

    res.json({
      success: true,
      customer: {
        customerUid: customer.customerUid,
        customerName: customer.customerName,
        mobileNumber: customer.mobileNumber,
        email: customer.email || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        totalWorks,
        totalBills,
        totalRevenue,
        firstBillDate,
        latestBillDate
      },
      bills: bills.map(b => ({
        billNumber: b.billNumber,
        billDate: b.billDate,
        workId: b.workId,
        workDescription: b.workDescription,
        amount: b.amount,
        totalAmount: b.totalAmount,
        status: 'Paid',
        pdfUrl: b.pdfUrl
      }))
    });
  } catch (err) {
    console.error('BillBook customer detail error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/crm/billbook/bills - All Bills Directory with Filtering
router.get('/billbook/bills', async (req, res) => {
  try {
    const { search, customerUid, year, month, startDate, endDate } = req.query;

    const filter = {};

    if (customerUid && customerUid.trim()) {
      filter.customerUid = customerUid.trim();
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { billNumber: regex },
        { customerUid: regex },
        { customerName: regex },
        { workDescription: regex },
        { customerMobile: regex }
      ];
    }

    if (startDate || endDate) {
      filter.billDate = {};
      if (startDate) {
        filter.billDate.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.billDate.$lte = end;
      }
    } else if (year && year !== 'ALL') {
      const y = parseInt(year, 10);
      filter.billDate = {};
      if (month && month !== 'ALL') {
        const m = parseInt(month, 10) - 1;
        filter.billDate.$gte = new Date(y, m, 1, 0, 0, 0, 0);
        filter.billDate.$lte = new Date(y, m + 1, 0, 23, 59, 59, 999);
      } else {
        filter.billDate.$gte = new Date(y, 0, 1, 0, 0, 0, 0);
        filter.billDate.$lte = new Date(y, 11, 31, 23, 59, 59, 999);
      }
    }

    const bills = await CustomerBill.find(filter).sort({ billDate: -1 }).lean();
    const totalAmount = bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    res.json({
      success: true,
      count: bills.length,
      totalAmount,
      bills: bills.map(b => ({
        billNumber: b.billNumber,
        billDate: b.billDate,
        customerUid: b.customerUid,
        customerName: b.customerName,
        customerMobile: b.customerMobile,
        workDescription: b.workDescription,
        amount: b.amount,
        totalAmount: b.totalAmount,
        status: 'Paid',
        pdfUrl: b.pdfUrl
      }))
    });
  } catch (err) {
    console.error('BillBook all bills error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 6. BANK ACCOUNT DETAILS, MONEY TRANSACTION & MY BILL BOOK INTEGRATION
// ======================================================================

function getReqRetailerId(req) {
  const fromHeader = req.headers['x-retailer-id'] || req.headers['x-user-id'];
  if (fromHeader && typeof fromHeader === 'string' && fromHeader.trim() && fromHeader.trim().toLowerCase() !== 'user') {
    return fromHeader.trim();
  }
  const fromQuery = req.query.retailerId || req.query.userId;
  if (fromQuery && typeof fromQuery === 'string' && fromQuery.trim() && fromQuery.trim().toLowerCase() !== 'user') {
    return fromQuery.trim();
  }
  const fromBody = req.body && (req.body.retailerId || req.body.userId);
  if (fromBody && typeof fromBody === 'string' && fromBody.trim() && fromBody.trim().toLowerCase() !== 'user') {
    return fromBody.trim();
  }
  if (req.user && (req.user.userId || req.user.retailerId)) {
    return (req.user.userId || req.user.retailerId).trim();
  }
  return 'MBTAR000010101';
}

function getReqActor(req) {
  const employeeUid = req.headers['x-employee-uid'] || (req.user && req.user.employeeUid) || (req.body && req.body.employeeUid);
  const employeeName = req.headers['x-employee-name'] || (req.user && req.user.employeeName) || (req.body && req.body.employeeName);
  if (employeeUid) {
    return {
      role: 'employee',
      uid: String(employeeUid).trim(),
      name: employeeName ? String(employeeName).trim() : String(employeeUid).trim()
    };
  }
  const retailerId = getReqRetailerId(req);
  return {
    role: 'retailer',
    uid: retailerId,
    name: 'Retailer'
  };
}

// ----------------------------------------------------------------------
// 6.1 BANK ACCOUNTS & DYNAMIC BANK FIELDS ENDPOINTS
// ----------------------------------------------------------------------

// GET /api/crm/bank-fields - Get all bank form fields with auto-seed
router.get('/bank-fields', async (req, res) => {
  try {
    await BankField.seedDefaultFieldsIfEmpty();
    const fields = await BankField.find().sort({ order: 1, createdAt: 1 });
    res.json({ success: true, fields });
  } catch (err) {
    console.error('Error fetching bank fields:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/bank-fields - Add new custom bank field
router.post('/bank-fields', async (req, res) => {
  try {
    const { label, type, required, hidden, options, placeholder, icon } = req.body;
    if (!label || !label.trim()) {
      return res.status(400).json({ success: false, message: 'Field label is required.' });
    }

    let fieldName = label
      .trim()
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    if (!fieldName) {
      fieldName = `field_${Date.now()}`;
    }

    let existing = await BankField.findOne({ name: fieldName });
    if (existing) {
      fieldName = `${fieldName}_${Date.now().toString().slice(-4)}`;
    }

    const count = await BankField.countDocuments();
    const newField = new BankField({
      name: fieldName,
      label: label.trim(),
      type: type || 'text',
      required: Boolean(required),
      hidden: Boolean(hidden),
      options: Array.isArray(options) ? options : [],
      placeholder: placeholder || '',
      icon: icon || '📝',
      order: count,
      isSystem: false
    });

    await newField.save();
    res.status(201).json({ success: true, field: newField });
  } catch (err) {
    console.error('Error adding bank field:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/crm/bank-fields/:id - Update bank field properties
router.put('/bank-fields/:id', async (req, res) => {
  try {
    const field = await BankField.findById(req.params.id);
    if (!field) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }

    const { label, type, required, hidden, options, placeholder, icon, order } = req.body;
    if (label !== undefined) field.label = label.trim();
    if (type !== undefined) field.type = type;
    if (required !== undefined) field.required = Boolean(required);
    if (hidden !== undefined) field.hidden = Boolean(hidden);
    if (options !== undefined) field.options = Array.isArray(options) ? options : [];
    if (placeholder !== undefined) field.placeholder = placeholder;
    if (icon !== undefined) field.icon = icon;
    if (order !== undefined) field.order = Number(order);

    await field.save();
    res.json({ success: true, field });
  } catch (err) {
    console.error('Error updating bank field:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/crm/bank-fields/:id/toggle-visibility - Hide/Show field
router.patch('/bank-fields/:id/toggle-visibility', async (req, res) => {
  try {
    const field = await BankField.findById(req.params.id);
    if (!field) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }
    field.hidden = !field.hidden;
    await field.save();
    res.json({ success: true, field });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/crm/bank-fields/:id/toggle-required - Toggle mandatory/optional
router.patch('/bank-fields/:id/toggle-required', async (req, res) => {
  try {
    const field = await BankField.findById(req.params.id);
    if (!field) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }
    field.required = !field.required;
    await field.save();
    res.json({ success: true, field });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/crm/bank-fields/:id - Delete bank field
router.delete('/bank-fields/:id', async (req, res) => {
  try {
    const deleted = await BankField.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Field not found.' });
    }
    res.json({ success: true, message: 'Bank form field removed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/bank-fields/reorder - Reorder bank form fields
router.post('/bank-fields/reorder', async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (Array.isArray(orderedIds)) {
      for (let i = 0; i < orderedIds.length; i++) {
        await BankField.findByIdAndUpdate(orderedIds[i], { order: i });
      }
    }
    res.json({ success: true, message: 'Bank form fields reordered successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/crm/bank-accounts - List all bank accounts for retailer
router.get('/bank-accounts', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const accounts = await BankAccount.find({
      retailerId,
      isDeleted: { $ne: true }
    }).sort({ isDefault: -1, createdAt: -1 });

    const safeAccounts = accounts.map(a => a.toSafeObject());
    res.json({
      success: true,
      count: safeAccounts.length,
      accounts: safeAccounts
    });
  } catch (err) {
    console.error('Error fetching bank accounts:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/bank-accounts - Add new bank account
router.post('/bank-accounts', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const {
      bankName,
      accountHolderName,
      accountNumber,
      confirmAccountNumber,
      ifscCode,
      branchName,
      accountType,
      upiId,
      accountNickname,
      isDefault
    } = req.body;

    // 1. Dynamic fields validation for active mandatory fields
    const activeFields = await BankField.find({ hidden: false });
    for (const field of activeFields) {
      if (field.required) {
        let val = req.body[field.name];
        if (val === undefined && req.body.dynamicData) {
          val = req.body.dynamicData[field.name];
        }
        if (val === undefined || val === null || String(val).trim() === '') {
          return res.status(400).json({
            success: false,
            message: `Mandatory field "${field.label}" is missing or empty.`
          });
        }
      }
    }

    const cleanAccNum = String(accountNumber || '').trim();
    if (cleanAccNum && !/^\d{8,22}$/.test(cleanAccNum)) {
      return res.status(400).json({ success: false, message: 'Account number must be 8 to 22 numeric digits.' });
    }
    if (confirmAccountNumber && String(confirmAccountNumber).trim() !== cleanAccNum) {
      return res.status(400).json({ success: false, message: 'Account number and confirm account number do not match.' });
    }

    const cleanIfsc = String(ifscCode || '').trim().toUpperCase();
    if (cleanIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      return res.status(400).json({ success: false, message: 'Invalid IFSC code format (e.g. SBIN0001234, HDFC0000123).' });
    }

    // 2. Duplicate Account Prevention per retailer
    if (cleanAccNum && cleanIfsc) {
      const duplicate = await BankAccount.findOne({
        retailerId,
        accountNumber: cleanAccNum,
        ifscCode: cleanIfsc,
        isDeleted: { $ne: true }
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: 'This bank account number and IFSC are already registered under your account.'
        });
      }
    }

    // 3. Extract dynamicData
    const coreKeys = ['bankName', 'accountHolderName', 'accountNumber', 'confirmAccountNumber', 'ifscCode', 'branchName', 'accountType', 'upiId', 'accountNickname', 'isDefault'];
    const dynamicData = { ...(req.body.dynamicData || {}) };
    Object.keys(req.body).forEach(k => {
      if (!coreKeys.includes(k) && k !== 'retailerId' && k !== 'dynamicData') {
        dynamicData[k] = req.body[k];
      }
    });

    // 4. Default account management
    const shouldBeDefault = Boolean(isDefault);
    if (shouldBeDefault) {
      await BankAccount.updateMany(
        { retailerId, isDeleted: { $ne: true } },
        { isDefault: false }
      );
    } else {
      // If this is the retailer's first account, make it default automatically
      const existingCount = await BankAccount.countDocuments({ retailerId, isDeleted: { $ne: true } });
      if (existingCount === 0) {
        req.body.isDefault = true;
      }
    }

    const accountId = `BNK_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const newAccount = new BankAccount({
      accountId,
      retailerId,
      bankName: (bankName || '').trim(),
      accountHolderName: (accountHolderName || '').trim(),
      accountNumber: cleanAccNum,
      ifscCode: cleanIfsc,
      branchName: (branchName || '').trim(),
      accountType: ['Savings', 'Current', 'Other'].includes(accountType) ? accountType : (accountType || 'Savings'),
      upiId: (upiId || '').trim(),
      accountNickname: (accountNickname || '').trim(),
      dynamicData,
      isDefault: Boolean(shouldBeDefault || req.body.isDefault),
      isActive: true,
      isDeleted: false
    });

    await newAccount.save();

    res.status(201).json({
      success: true,
      message: 'Bank account added successfully.',
      account: newAccount.toSafeObject()
    });
  } catch (err) {
    console.error('Error adding bank account:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/crm/bank-accounts/:id - Edit bank account details
router.put('/bank-accounts/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const account = await BankAccount.findOne({
      _id: req.params.id,
      retailerId,
      isDeleted: { $ne: true }
    });

    if (!account) {
      return res.status(404).json({ success: false, message: 'Bank account not found or access denied.' });
    }

    const {
      bankName,
      accountHolderName,
      accountNumber,
      ifscCode,
      branchName,
      accountType,
      upiId,
      accountNickname,
      isDefault
    } = req.body;

    if (bankName) account.bankName = bankName.trim();
    if (accountHolderName) account.accountHolderName = accountHolderName.trim();
    if (accountNumber) {
      const cleanAcc = String(accountNumber).trim();
      if (!/^\d{8,22}$/.test(cleanAcc)) {
        return res.status(400).json({ success: false, message: 'Account number must be 8 to 22 numeric digits.' });
      }
      account.accountNumber = cleanAcc;
    }
    if (ifscCode) {
      const cleanIfsc = String(ifscCode).trim().toUpperCase();
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
        return res.status(400).json({ success: false, message: 'Invalid IFSC code format.' });
      }
      account.ifscCode = cleanIfsc;
    }
    if (branchName !== undefined) account.branchName = branchName.trim();
    if (accountType && ['Savings', 'Current', 'Other'].includes(accountType)) {
      account.accountType = accountType;
    }
    if (upiId !== undefined) account.upiId = upiId.trim();
    if (accountNickname !== undefined) account.accountNickname = accountNickname.trim();

    // Extract & update custom dynamicData fields
    const coreKeys = ['bankName', 'accountHolderName', 'accountNumber', 'confirmAccountNumber', 'ifscCode', 'branchName', 'accountType', 'upiId', 'accountNickname', 'isDefault'];
    const updatedDynamic = { ...(account.dynamicData || {}) };
    let hasDynamicUpdates = false;
    Object.keys(req.body).forEach(k => {
      if (!coreKeys.includes(k) && k !== 'retailerId' && k !== 'dynamicData' && k !== '_id' && k !== 'accountId') {
        updatedDynamic[k] = req.body[k];
        hasDynamicUpdates = true;
      }
    });
    if (req.body.dynamicData && typeof req.body.dynamicData === 'object') {
      Object.assign(updatedDynamic, req.body.dynamicData);
      hasDynamicUpdates = true;
    }
    if (hasDynamicUpdates) {
      account.dynamicData = updatedDynamic;
      account.markModified('dynamicData');
    }

    if (isDefault !== undefined) {
      if (Boolean(isDefault)) {
        await BankAccount.updateMany(
          { retailerId, _id: { $ne: account._id }, isDeleted: { $ne: true } },
          { isDefault: false }
        );
        account.isDefault = true;
      } else {
        account.isDefault = false;
      }
    }

    await account.save();

    res.json({
      success: true,
      message: 'Bank account updated successfully.',
      account: account.toSafeObject()
    });
  } catch (err) {
    console.error('Error updating bank account:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/crm/bank-accounts/:id - Delete bank account (with transaction link verification)
router.delete('/bank-accounts/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const account = await BankAccount.findOne({
      _id: req.params.id,
      retailerId,
      isDeleted: { $ne: true }
    });

    if (!account) {
      return res.status(404).json({ success: false, message: 'Bank account not found or access denied.' });
    }

    // Check if account is linked to existing transactions
    const linkedTxnCount = await MoneyTransaction.countDocuments({
      $or: [
        { bankAccountId: account.accountId },
        { bankAccountId: account._id.toString() }
      ]
    });

    if (linkedTxnCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete "${account.bankName}" account because ${linkedTxnCount} financial transaction(s) are linked to it. Historical transaction and ledger records must remain intact.`
      });
    }

    account.isDeleted = true;
    account.isActive = false;
    await account.save();

    res.json({
      success: true,
      message: `Bank account "${account.bankName}" deleted successfully.`
    });
  } catch (err) {
    console.error('Error deleting bank account:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/crm/bank-accounts/:id/default - Set as default account
router.patch('/bank-accounts/:id/default', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const account = await BankAccount.findOne({
      _id: req.params.id,
      retailerId,
      isDeleted: { $ne: true }
    });

    if (!account) {
      return res.status(404).json({ success: false, message: 'Bank account not found.' });
    }

    await BankAccount.updateMany(
      { retailerId, isDeleted: { $ne: true } },
      { isDefault: false }
    );

    account.isDefault = true;
    await account.save();

    res.json({
      success: true,
      message: `${account.bankName} is now set as your default bank account.`,
      account: account.toSafeObject()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------------------------
// 6.2 MONEY TRANSACTION ENDPOINTS
// ----------------------------------------------------------------------

// GET /api/crm/money-transactions - List transactions with filters & stats
router.get('/money-transactions', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const { status, search, startDate, endDate, limit = 200, skip = 0 } = req.query;

    const filter = { retailerId };

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.transactionDate.$lte = end;
      }
    }

    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { transactionId: { $regex: q, $options: 'i' } },
        { customerName: { $regex: q, $options: 'i' } },
        { customerMobile: { $regex: q, $options: 'i' } },
        { customerUid: { $regex: q, $options: 'i' } },
        { bankName: { $regex: q, $options: 'i' } },
        { referenceNumber: { $regex: q, $options: 'i' } }
      ];
    }

    const total = await MoneyTransaction.countDocuments(filter);
    const transactions = await MoneyTransaction.find(filter)
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    // Summary calculations for retailer
    const allSuccessful = await MoneyTransaction.find({
      retailerId,
      status: 'Successful'
    }).lean();

    let totalCashReceived = 0;
    let totalOnlineTransferred = 0;
    let totalOnlineReceived = 0;
    let totalCashPaidOut = 0;
    let totalCommissionEarned = 0;

    for (const t of allSuccessful) {
      const comm = Number(t.commissionAmount) || 0;
      totalCommissionEarned += comm;

      if (t.transactionType === 'Online to Cash') {
        const onlineIn = Number(t.onlineAmount || t.netOnlineAmount) || 0;
        const cashOut = Number(t.netCashAmount || t.cashAmount) || 0;
        totalOnlineReceived += onlineIn;
        totalCashPaidOut += cashOut;
      } else {
        const cashIn = Number(t.cashAmount) || 0;
        const onlineOut = Number(t.netOnlineAmount) || 0;
        totalCashReceived += cashIn;
        totalOnlineTransferred += onlineOut;
      }
    }

    // Business expenses for net cash in hand
    const allExpenses = await BusinessExpense.find({ retailerId }).lean();
    const totalExpenses = allExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const successfulCount = allSuccessful.length;
    const pendingCount = await MoneyTransaction.countDocuments({ retailerId, status: 'Pending' });
    const failedCount = await MoneyTransaction.countDocuments({ retailerId, status: 'Failed' });

    res.json({
      success: true,
      total,
      transactions,
      summary: {
        totalCashReceived,
        totalOnlineTransferred,
        totalOnlineReceived,
        totalCashPaidOut,
        totalCommissionEarned,
        totalExpenses,
        cashBalance: totalCashReceived - totalCashPaidOut - totalExpenses,
        bankBalanceChange: totalOnlineReceived - totalOnlineTransferred,
        successfulCount,
        pendingCount,
        failedCount,
        totalTransactions: total
      }
    });
  } catch (err) {
    console.error('Error fetching money transactions:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/money-transactions - Create & confirm new money transaction
router.post('/money-transactions', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const {
      customerName,
      customerMobile,
      customerUid,
      transactionType = 'Cash to Online Transfer',
      commissionType = 'Fixed',
      commissionValue = 0,
      bankAccountId,
      customerAccountOrUpi,
      referenceNumber,
      status = 'Successful',
      remarks
    } = req.body;

    const isOnlineToCash = (transactionType === 'Online to Cash');
    const paymentMode = isOnlineToCash ? 'Online to Cash' : 'Cash to Online';

    // 1. Mandatory Validations
    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ success: false, message: 'Customer name is required.' });
    }
    if (!customerMobile || !customerMobile.trim()) {
      return res.status(400).json({ success: false, message: 'Customer mobile number is required.' });
    }

    // Input amount: accept amount, cashAmount or onlineAmount
    const inputAmount = Number(
      req.body.amount !== undefined && req.body.amount !== ''
        ? req.body.amount
        : (isOnlineToCash ? (req.body.onlineAmount || req.body.cashAmount) : req.body.cashAmount)
    );
    if (isNaN(inputAmount) || inputAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: isOnlineToCash
          ? 'Online amount received must be greater than 0.'
          : 'Cash amount received must be greater than 0.'
      });
    }

    const commVal = Number(commissionValue || 0);
    if (isNaN(commVal) || commVal < 0) {
      return res.status(400).json({ success: false, message: 'Commission value cannot be negative.' });
    }

    // 2. Accurate Commission & Net Calculation
    let commissionAmount = 0;
    if (commissionType === 'Percentage') {
      if (commVal > 100) {
        return res.status(400).json({ success: false, message: 'Commission percentage cannot exceed 100%.' });
      }
      commissionAmount = Math.round(((inputAmount * commVal) / 100) * 100) / 100;
    } else {
      commissionAmount = Math.round(commVal * 100) / 100;
    }

    if (commissionAmount > inputAmount) {
      return res.status(400).json({
        success: false,
        message: 'Commission amount cannot exceed the received amount.'
      });
    }

    const netAmount = Math.round((inputAmount - commissionAmount) * 100) / 100;

    let cashAmountVal = 0;
    let netOnlineAmountVal = 0;
    let onlineAmountVal = 0;
    let netCashAmountVal = 0;

    if (isOnlineToCash) {
      // Customer pays online. Retailer retains commission. Customer gets cash.
      onlineAmountVal = inputAmount;
      netCashAmountVal = netAmount;
      cashAmountVal = netAmount;
      netOnlineAmountVal = inputAmount;
    } else {
      // Customer gives cash. Retailer retains commission. Customer target gets online transfer.
      cashAmountVal = inputAmount;
      netOnlineAmountVal = netAmount;
      onlineAmountVal = netAmount;
      netCashAmountVal = 0;
    }

    // Target account validation: required for Cash to Online Transfer
    if (!isOnlineToCash && (!customerAccountOrUpi || !customerAccountOrUpi.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Customer target bank account number or UPI ID is required for Cash to Online Transfer.'
      });
    }

    // 3. Bank Account Validation & Snapshot
    let bankName = '';
    let bankAccountNumberMasked = '';
    if (bankAccountId) {
      const bank = await BankAccount.findOne({
        $or: [{ _id: bankAccountId }, { accountId: bankAccountId }],
        retailerId
      });
      if (bank) {
        bankName = bank.bankName;
        bankAccountNumberMasked = bank.getMaskedAccountNumber();
      }
    }

    if (!bankName && req.body.bankName) {
      bankName = req.body.bankName.trim();
    }

    // 4. Generate Atomic Sequential Transaction ID (e.g. MTXN-10101)
    const transactionId = await getNextMoneyTransactionId(10101);

    const validStatus = ['Successful', 'Pending', 'Failed'].includes(status) ? status : 'Successful';

    const actor = getReqActor(req);
    const createdByRole = actor.role;
    const createdByName = actor.role === 'employee' ? `Employee ${actor.uid} – ${actor.name}` : 'Retailer';
    const createdByUid = actor.uid;

    const newTxn = new MoneyTransaction({
      transactionId,
      retailerId,
      transactionDate: req.body.transactionDate ? new Date(req.body.transactionDate) : new Date(),
      customerName: customerName.trim(),
      customerMobile: customerMobile.trim(),
      customerUid: (customerUid || '').trim(),
      transactionType: isOnlineToCash ? 'Online to Cash' : 'Cash to Online Transfer',
      paymentMode,
      cashAmount: cashAmountVal,
      onlineAmount: onlineAmountVal,
      netCashAmount: netCashAmountVal,
      commissionType: commissionType === 'Percentage' ? 'Percentage' : 'Fixed',
      commissionValue: commVal,
      commissionAmount,
      netOnlineAmount: netOnlineAmountVal,
      bankAccountId: bankAccountId || '',
      bankName: bankName || 'Direct Account',
      bankAccountNumberMasked,
      customerAccountOrUpi: (customerAccountOrUpi || '').trim(),
      referenceNumber: (referenceNumber || '').trim(),
      status: validStatus,
      remarks: (remarks || '').trim(),
      createdByRole,
      createdByName,
      createdByUid
    });

    await newTxn.save();

    // Log Activity if action performed by employee
    if (actor.role === 'employee') {
      const { logEmployeeActivity } = require('../models/EmployeeActivity');
      await logEmployeeActivity({
        employeeUid: actor.uid,
        employeeName: actor.name,
        retailerId,
        serviceName: 'CRM',
        moduleName: 'Money Transaction',
        action: `Recorded ${newTxn.transactionType}`,
        recordId: transactionId,
        status: 'Success',
        details: `Amount: ₹${inputAmount}, Commission: ₹${commissionAmount}`,
        req
      });
    }

    res.status(201).json({
      success: true,
      message: 'Transaction recorded successfully.',
      transaction: newTxn
    });
  } catch (err) {
    console.error('Error creating money transaction:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/crm/money-transactions/:id - Update transaction status / reference
router.put('/money-transactions/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const actor = getReqActor(req);

    const txn = await MoneyTransaction.findOne({
      _id: req.params.id,
      retailerId
    });

    if (!txn) {
      return res.status(404).json({ success: false, message: 'Transaction not found or access denied.' });
    }

    const { status, referenceNumber, remarks } = req.body;
    if (status && ['Successful', 'Pending', 'Failed'].includes(status)) {
      txn.status = status;
    }
    if (referenceNumber !== undefined) {
      txn.referenceNumber = referenceNumber.trim();
    }
    if (remarks !== undefined) {
      txn.remarks = remarks.trim();
    }

    txn.updatedByRole = actor.role;
    txn.updatedByName = actor.role === 'employee' ? `Employee ${actor.uid} – ${actor.name}` : 'Retailer';
    txn.updatedByUid = actor.uid;

    await txn.save();

    if (actor.role === 'employee') {
      const { logEmployeeActivity } = require('../models/EmployeeActivity');
      await logEmployeeActivity({
        employeeUid: actor.uid,
        employeeName: actor.name,
        retailerId,
        serviceName: 'CRM',
        moduleName: 'Money Transaction',
        action: `Updated Status to ${txn.status}`,
        recordId: txn.transactionId,
        status: 'Success',
        details: `UTR: ${txn.referenceNumber || 'N/A'}`,
        req
      });
    }

    res.json({
      success: true,
      message: 'Transaction updated successfully.',
      transaction: txn
    });
  } catch (err) {
    console.error('Error updating money transaction:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------------------------
// 6.3 BUSINESS EXPENSES ENDPOINTS (Supporting Accurate Profit & Loss)
// ----------------------------------------------------------------------

// GET /api/crm/expenses - List expenses
router.get('/expenses', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const { startDate, endDate, category } = req.query;

    const filter = { retailerId };
    if (category && category !== 'ALL') {
      filter.category = category;
    }
    if (startDate || endDate) {
      filter.expenseDate = {};
      if (startDate) filter.expenseDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.expenseDate.$lte = end;
      }
    }

    const expenses = await BusinessExpense.find(filter).sort({ expenseDate: -1 }).lean();
    const totalAmount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    res.json({
      success: true,
      count: expenses.length,
      totalAmount,
      expenses
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/crm/expenses - Record business expense
router.post('/expenses', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const { title, category, amount, expenseDate, paymentMode, remarks } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Expense title/description is required.' });
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Expense amount must be greater than 0.' });
    }

    const expenseId = await getNextExpenseId(10101);

    const expense = new BusinessExpense({
      expenseId,
      retailerId,
      title: title.trim(),
      category: category || 'Other',
      amount: numAmount,
      expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
      paymentMode: paymentMode || 'Cash',
      remarks: (remarks || '').trim()
    });

    await expense.save();

    res.status(201).json({
      success: true,
      message: 'Business expense recorded successfully.',
      expense
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/crm/expenses/:id - Delete business expense
router.delete('/expenses/:id', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const expense = await BusinessExpense.findOneAndDelete({
      _id: req.params.id,
      retailerId
    });

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense record not found.' });
    }

    res.json({ success: true, message: 'Expense record deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ----------------------------------------------------------------------
// 6.4 ENHANCED MY BILL BOOK: FINANCIAL TRANSACTIONS & PROFIT/LOSS
// ----------------------------------------------------------------------

// GET /api/crm/billbook/transactions - 16 Required Columns Table Data
router.get('/billbook/transactions', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const { search, status, startDate, endDate, limit = 200 } = req.query;

    const filter = { retailerId };
    if (status && status !== 'ALL') {
      filter.status = status;
    }
    if (startDate || endDate) {
      filter.transactionDate = {};
      if (startDate) filter.transactionDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.transactionDate.$lte = end;
      }
    }
    if (search && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { transactionId: { $regex: q, $options: 'i' } },
        { customerName: { $regex: q, $options: 'i' } },
        { customerMobile: { $regex: q, $options: 'i' } },
        { customerUid: { $regex: q, $options: 'i' } },
        { bankName: { $regex: q, $options: 'i' } },
        { referenceNumber: { $regex: q, $options: 'i' } }
      ];
    }

    const transactions = await MoneyTransaction.find(filter)
      .sort({ transactionDate: -1, createdAt: -1 })
      .limit(Number(limit))
      .lean();

    // Map exact 16 columns required by specification
    const records = transactions.map(t => {
      const isSuccessful = t.status === 'Successful';
      const isOnlineToCash = (t.transactionType === 'Online to Cash');

      const cashIn = isOnlineToCash ? 0 : (Number(t.cashAmount) || 0);
      const cashOut = isOnlineToCash ? (Number(t.netCashAmount || t.cashAmount) || 0) : 0;
      const onlineIn = isOnlineToCash ? (Number(t.onlineAmount || t.netOnlineAmount) || 0) : 0;
      const onlineOut = isOnlineToCash ? 0 : (Number(t.netOnlineAmount) || 0);

      return {
        _id: t._id,
        transactionId: t.transactionId,
        date: t.transactionDate,
        customerUid: t.customerUid || '—',
        customerName: t.customerName,
        mobileNumber: t.customerMobile,
        bankName: t.bankName || 'Direct',
        transactionType: t.transactionType || 'Cash to Online Transfer',
        paymentMode: t.paymentMode || (isOnlineToCash ? 'Online to Cash' : 'Cash to Online'),
        cashReceived: isOnlineToCash ? 0 : t.cashAmount,
        amountDebited: isSuccessful ? (isOnlineToCash ? cashOut : onlineOut) : 0,
        amountCredited: isSuccessful ? (isOnlineToCash ? onlineIn : cashIn) : 0,
        commission: t.commissionAmount,
        netAmount: isOnlineToCash ? (t.netCashAmount || t.cashAmount) : t.netOnlineAmount,
        transactionStatus: t.status,
        referenceNumber: t.referenceNumber || '—',
        remarks: t.remarks || '',
        createdByRole: t.createdByRole || 'retailer',
        createdByName: t.createdByName || 'Retailer',
        createdByUid: t.createdByUid || ''
      };
    });

    // Accounting movements summary
    const successful = transactions.filter(t => t.status === 'Successful');
    let totalCashReceived = 0;
    let totalAmountDebited = 0;
    let totalAmountCredited = 0;
    let totalCommission = 0;
    let netAmountTotal = 0;
    let totalCashPaidOut = 0;
    let totalOnlineReceived = 0;
    let totalOnlineTransferred = 0;

    for (const t of successful) {
      totalCommission += (Number(t.commissionAmount) || 0);
      if (t.transactionType === 'Online to Cash') {
        const onlineIn = Number(t.onlineAmount || t.netOnlineAmount) || 0;
        const cashOut = Number(t.netCashAmount || t.cashAmount) || 0;
        totalOnlineReceived += onlineIn;
        totalCashPaidOut += cashOut;
        totalAmountDebited += cashOut;
        totalAmountCredited += onlineIn;
        netAmountTotal += cashOut;
      } else {
        const cashIn = Number(t.cashAmount) || 0;
        const onlineOut = Number(t.netOnlineAmount) || 0;
        totalCashReceived += cashIn;
        totalOnlineTransferred += onlineOut;
        totalAmountDebited += onlineOut;
        totalAmountCredited += cashIn;
        netAmountTotal += onlineOut;
      }
    }

    res.json({
      success: true,
      count: records.length,
      records,
      ledger: {
        totalCashReceived,
        totalAmountDebited,
        totalAmountCredited,
        totalCommission,
        netAmountTotal,
        cashBalanceChange: totalCashReceived - totalCashPaidOut,
        bankBalanceChange: totalOnlineReceived - totalOnlineTransferred
      }
    });
  } catch (err) {
    console.error('Error fetching billbook transactions:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/crm/billbook/profit-loss - Day-Wise & Month-Wise Profit & Loss Pie Chart Data
router.get('/billbook/profit-loss', async (req, res) => {
  try {
    const retailerId = getReqRetailerId(req);
    const { mode = 'day', date, year, month } = req.query;

    let startDate, endDate;
    let periodLabel = '';

    if (mode === 'day') {
      const targetDate = date ? new Date(date) : new Date();
      startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
      endDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
      periodLabel = startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } else {
      // Month-wise
      const now = new Date();
      const y = year ? parseInt(year, 10) : now.getFullYear();
      const m = month ? parseInt(month, 10) : (now.getMonth() + 1); // 1-12
      startDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
      endDate = new Date(y, m, 0, 23, 59, 59, 999);
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      periodLabel = `${monthNames[m - 1]} ${y}`;
    }

    // 1. Commission Income from Successful Money Transactions in range
    const transactions = await MoneyTransaction.find({
      retailerId,
      status: 'Successful',
      transactionDate: { $gte: startDate, $lte: endDate }
    }).lean();

    const commissionIncome = transactions.reduce((sum, t) => sum + (Number(t.commissionAmount) || 0), 0);

    // 2. Revenue from issued customer bills in range (created by this retailer)
    const bills = await CustomerBill.find({
      createdBy: retailerId,
      billDate: { $gte: startDate, $lte: endDate }
    }).lean();

    const billingRevenue = bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    // Total Income = Commission Earnings + Billing Revenue
    const totalIncome = Math.round((commissionIncome + billingRevenue) * 100) / 100;

    // 3. Business Expenses in range
    const expenses = await BusinessExpense.find({
      retailerId,
      expenseDate: { $gte: startDate, $lte: endDate }
    }).lean();

    const totalExpenses = Math.round(expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) * 100) / 100;

    // 4. Net Profit / Loss Calculation
    let netProfit = 0;
    let netLoss = 0;
    let profitPercentage = 0;
    let lossPercentage = 0;

    if (totalIncome >= totalExpenses) {
      netProfit = Math.round((totalIncome - totalExpenses) * 100) / 100;
      netLoss = 0;
      profitPercentage = totalIncome > 0 ? Math.round((netProfit / totalIncome) * 1000) / 10 : (totalExpenses === 0 ? 0 : 0);
      lossPercentage = 0;
    } else {
      netProfit = 0;
      netLoss = Math.round((totalExpenses - totalIncome) * 100) / 100;
      profitPercentage = 0;
      lossPercentage = totalExpenses > 0 ? Math.round((netLoss / totalExpenses) * 1000) / 10 : 0;
    }

    const hasData = totalIncome > 0 || totalExpenses > 0;

    res.json({
      success: true,
      mode,
      periodLabel,
      startDate,
      endDate,
      hasData,
      summary: {
        totalIncome,
        commissionIncome,
        billingRevenue,
        totalExpenses,
        netProfit,
        netLoss,
        profitPercentage,
        lossPercentage,
        transactionsCount: transactions.length,
        billsCount: bills.length,
        expensesCount: expenses.length
      },
      incomeBreakdown: {
        commissionCount: transactions.length,
        commissionAmount: commissionIncome,
        billsCount: bills.length,
        billsAmount: billingRevenue,
        items: [
          ...transactions.map(t => ({
            id: t.transactionId,
            type: 'Commission',
            title: `Commission (${t.customerName})`,
            amount: t.commissionAmount,
            date: t.transactionDate
          })),
          ...bills.map(b => ({
            id: b.billNumber,
            type: 'Bill',
            title: `Bill ${b.billNumber} (${b.customerName})`,
            amount: b.amount,
            date: b.billDate
          }))
        ]
      },
      expensesBreakdown: {
        count: expenses.length,
        amount: totalExpenses,
        items: expenses.map(e => ({
          id: e.expenseId,
          title: e.title,
          category: e.category,
          amount: e.amount,
          date: e.expenseDate
        }))
      }
    });
  } catch (err) {
    console.error('Error calculating profit & loss:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ======================================================================
// 7. EMPLOYEE MANAGEMENT MODULE ROUTER (Retailer-Wise Private)
// ======================================================================
const employeeRoutes = require('./employeeRoutes');
router.use('/employees', employeeRoutes);
router.use('/employee-fields', (req, res, next) => {
  req.url = '/fields' + req.url;
  employeeRoutes(req, res, next);
});
router.use('/employee-activities', (req, res, next) => {
  req.url = '/activities' + req.url;
  employeeRoutes(req, res, next);
});

// ======================================================================
// 8. TASK MANAGEMENT MODULE ROUTER (Retailer-Wise Private)
// ======================================================================
const taskRoutes = require('./taskRoutes');
router.use('/tasks', taskRoutes);

module.exports = router;
