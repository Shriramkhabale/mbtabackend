const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const OfflineWorkApplication = require('../models/OfflineWorkApplication');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const { cloudinary } = require('../cloudinaryConfig');
const { notifyAdmin, notifyRetailer } = require('../socket/notificationService');

const offlineConfigFile = path.join(__dirname, '..', 'offlineTabsConfig.json');

const defaultOfflineTabs = [
  {
    id: 'offline_general',
    label: 'Offline Service Request',
    icon: '📁',
    fee: 50,
    badge: 'Manual Processing',
    description: 'Submit offline service application with document attachments for admin manual processing.',
    fields: [
      {
        name: 'serviceCategory',
        label: 'SERVICE CATEGORY',
        type: 'select',
        options: [
          'SELECT CATEGORY',
          'Aadhaar Offline Work',
          'Voter Card Offline Work',
          'Ration Card Offline Work',
          'Birth / Death Certificate',
          'Income / Caste / Domicile Certificate',
          'Land / Property Record',
          'Other Offline Service'
        ],
        required: true,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'applicantName',
        label: 'APPLICANT FULL NAME',
        type: 'text',
        placeholder: 'Enter Applicant Full Name',
        required: true,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'fatherName',
        label: 'FATHER / HUSBAND NAME',
        type: 'text',
        placeholder: "Enter Father or Husband's Name",
        required: false,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'dob',
        label: 'DATE OF BIRTH',
        type: 'date',
        required: false,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'mobileNumber',
        label: 'MOBILE NUMBER',
        type: 'tel',
        placeholder: '10-Digit Mobile Number',
        required: true,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'email',
        label: 'EMAIL ADDRESS',
        type: 'email',
        placeholder: 'Enter Email Address',
        required: false,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'aadhaarNumber',
        label: 'AADHAAR / GOVT ID NO',
        type: 'text',
        placeholder: '12-Digit Aadhaar or Govt ID Number',
        required: false,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'state',
        label: 'STATE',
        type: 'select',
        options: [
          'PLEASE SELECT',
          'MAHARASHTRA',
          'UTTAR PRADESH',
          'BIHAR',
          'MADHYA PRADESH',
          'RAJASTHAN',
          'WEST BENGAL',
          'GUJARAT',
          'KARNATAKA',
          'DELHI',
          'PUNJAB',
          'HARYANA',
          'OTHER'
        ],
        required: true,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'district',
        label: 'DISTRICT / CITY',
        type: 'text',
        placeholder: 'Enter District or City',
        required: false,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'pincode',
        label: 'PINCODE',
        type: 'text',
        placeholder: '6-Digit Pincode',
        required: false,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'fullAddress',
        label: 'FULL ADDRESS',
        type: 'text',
        placeholder: 'Enter complete street address / village / town',
        required: false,
        hidden: false,
        gridSpan: 2
      },
      {
        name: 'applicantPhoto',
        label: 'APPLICANT PHOTO',
        type: 'file',
        required: false,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'idProofDoc',
        label: 'IDENTITY PROOF DOCUMENT (Aadhaar / Voter / PAN / etc.)',
        type: 'file',
        required: true,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'supportingDoc',
        label: 'SUPPORTING / APPLICATION FORM DOCUMENT',
        type: 'file',
        required: false,
        hidden: false,
        gridSpan: 1
      },
      {
        name: 'customerRemarks',
        label: 'SPECIAL INSTRUCTIONS / REMARKS',
        type: 'text',
        placeholder: 'Enter any specific requirements or notes for the operator...',
        required: false,
        hidden: false,
        gridSpan: 2
      }
    ]
  }
];

let offlineTabsConfig = defaultOfflineTabs;

const loadOfflineTabsConfig = () => {
  try {
    if (fs.existsSync(offlineConfigFile)) {
      const raw = fs.readFileSync(offlineConfigFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        offlineTabsConfig = parsed;
      }
    } else {
      fs.writeFileSync(offlineConfigFile, JSON.stringify(defaultOfflineTabs, null, 2), 'utf8');
      offlineTabsConfig = defaultOfflineTabs;
    }
  } catch (e) {
    console.error('Error loading offlineTabsConfig.json:', e);
  }
};

loadOfflineTabsConfig();

const emitNotificationSafely = (notificationPromise) => {
  if (notificationPromise && typeof notificationPromise.catch === 'function') {
    notificationPromise.catch(error => console.error('Offline notification delivery error:', error));
  }
};

const uploadOfflineAsset = async (asset, folder, publicId) => {
  if (!asset || !asset.startsWith('data:')) return asset || '';

  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    try {
      const result = await cloudinary.uploader.upload(asset, {
        folder,
        public_id: publicId,
        resource_type: 'auto',
        quality: 'auto',
        fetch_format: 'auto'
      });
      return result.secure_url;
    } catch (err) {
      console.warn('Cloudinary upload error in offline work, using dataUrl fallback:', err.message);
      return asset;
    }
  }
  return asset;
};

// GET all dynamic Offline Work sub-tabs configuration
router.get('/tabs', (req, res) => {
  loadOfflineTabsConfig();
  res.json(offlineTabsConfig);
});

// POST & PUT save dynamic Offline Work sub-tabs and form fields
const handleSaveTabs = (req, res) => {
  try {
    const listToSave = Array.isArray(req.body)
      ? req.body
      : (req.body && (req.body.tabs || req.body.offlineTabsConfigList)) || null;

    if (Array.isArray(listToSave)) {
      offlineTabsConfig = listToSave;
      try {
        fs.writeFileSync(offlineConfigFile, JSON.stringify(offlineTabsConfig, null, 2), 'utf8');
      } catch (err) {
        console.error('Error writing offlineTabsConfig.json:', err);
      }
      return res.json({ 
        success: true, 
        message: 'Offline Work forms configuration updated successfully!', 
        tabs: offlineTabsConfig 
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid payload. Expected an array of tab configurations.' });
    }
  } catch (err) {
    console.error('Error updating Offline Work tabs config:', err);
    res.status(500).json({ success: false, message: 'Failed to update Offline Work forms config' });
  }
};

router.post('/tabs', handleSaveTabs);
router.put('/tabs', handleSaveTabs);

// POST submit a new Offline Work application
router.post('/submit', async (req, res) => {
  try {
    const {
      userId,
      tabId,
      applicationType,
      applicantName,
      mobileNumber,
      email,
      remarks,
      details = {}
    } = req.body;

    if (!userId || !applicantName || !mobileNumber) {
      return res.status(400).json({ 
        success: false, 
        message: 'Applicant Name, Mobile Number and User ID are mandatory.' 
      });
    }

    loadOfflineTabsConfig();
    const matchedTab = offlineTabsConfig.find(t => 
      t.id === tabId || 
      t.label === applicationType ||
      t.id === applicationType
    ) || offlineTabsConfig[0];

    const feeAmount = (matchedTab && typeof matchedTab.fee === 'number') ? matchedTab.fee : 0;
    const finalAppType = (matchedTab && matchedTab.label) || applicationType || 'Offline Service Request';
    const finalTabId = (matchedTab && matchedTab.id) || tabId || 'offline_general';

    // Find User
    const user = await User.findOne({ userId: { $regex: new RegExp(`^${userId}$`, 'i') } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    // Check Wallet Balance if Fee > 0
    if (feeAmount > 0 && user.walletBalance < feeAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Fee ₹${feeAmount} required. Current balance: ₹${user.walletBalance.toFixed(2)}`
      });
    }

    // Generate Acknowledgement Number (e.g. OFW2026102212345)
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const ackNumber = `OFW${dateStr}${randomDigits}`;

    // Upload any file data URLs in details to Cloudinary
    const processedDetails = { ...details };
    for (const [key, value] of Object.entries(processedDetails)) {
      if (typeof value === 'string' && value.startsWith('data:')) {
        try {
          const uploadedUrl = await uploadOfflineAsset(
            value,
            'mb_mitra/offline-work',
            `${ackNumber}_${key}`
          );
          processedDetails[key] = uploadedUrl;
        } catch (uploadErr) {
          console.warn(`Error uploading asset for ${key}:`, uploadErr);
        }
      }
    }

    // Deduct Fee from Wallet if Fee > 0
    if (feeAmount > 0) {
      const balanceBefore = user.walletBalance;
      user.walletBalance -= feeAmount;
      await user.save();

      const newTx = new WalletTransaction({
        userId: user.userId,
        transactionType: 'Debit',
        amount: feeAmount,
        balanceBefore,
        balanceAfter: user.walletBalance,
        description: `Offline Work Fee - ${finalAppType} (Ack: ${ackNumber})`,
        referenceNumber: ackNumber,
        status: 'Success'
      });
      await newTx.save();
    }

    // Create and save application
    const application = new OfflineWorkApplication({
      userId: user.userId,
      applicationType: finalAppType,
      tabId: finalTabId,
      applicantName,
      mobileNumber,
      email: email || '',
      feeAmount,
      ackNumber,
      status: 'Submitted',
      remarks: remarks || '',
      details: processedDetails
    });

    await application.save();

    // Emit notification to admin
    emitNotificationSafely(notifyAdmin(req.app.get('io'), {
      type: 'offline_application_submitted',
      title: 'New Offline Work Submission',
      message: `${user.userId} submitted an application for ${finalAppType} (Ack: ${ackNumber}).`,
      data: {
        applicationId: application._id,
        ackNumber,
        userId: user.userId,
        feeAmount
      }
    }));

    return res.json({
      success: true,
      message: 'Offline Work application submitted successfully!',
      ackNumber,
      application,
      newBalance: user.walletBalance
    });

  } catch (err) {
    console.error('Error submitting offline work application:', err);
    return res.status(500).json({ 
      success: false, 
      message: err.message || 'Failed to submit application. Please try again.' 
    });
  }
});

// GET all applications for a specific retailer
router.get('/applications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const apps = await OfflineWorkApplication.find({
      userId: { $regex: new RegExp(`^${userId}$`, 'i') }
    }).sort({ createdAt: -1 });

    res.json({ success: true, applications: apps });
  } catch (err) {
    console.error('Error fetching user offline applications:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch applications' });
  }
});

// GET all applications (Admin)
router.get('/all', async (req, res) => {
  try {
    const apps = await OfflineWorkApplication.find().sort({ createdAt: -1 });
    res.json({ success: true, applications: apps });
  } catch (err) {
    console.error('Error fetching all offline applications:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch all applications' });
  }
});

// GET single application details
router.get('/application/:id', async (req, res) => {
  try {
    const app = await OfflineWorkApplication.findById(req.params.id);
    if (!app) return res.status(404).json({ success: false, message: 'Application not found' });
    res.json({ success: true, application: app });
  } catch (err) {
    console.error('Error fetching application details:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch application details' });
  }
});

// POST update application status, remarks & optional receipt or refund (Admin)
router.post('/status/:id', async (req, res) => {
  try {
    const { status, adminRemarks, receiptUrl, refund } = req.body;
    const application = await OfflineWorkApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    if (status) application.status = status;
    if (adminRemarks !== undefined) application.adminRemarks = adminRemarks;
    if (receiptUrl !== undefined) application.receiptUrl = receiptUrl;

    // Handle refund if status is Rejected
    if (status === 'Rejected' && refund && !application.isRefunded && application.feeAmount > 0) {
      const user = await User.findOne({ userId: { $regex: new RegExp(`^${application.userId}$`, 'i') } });
      if (user) {
        const balanceBefore = user.walletBalance;
        user.walletBalance += application.feeAmount;
        await user.save();

        const refundTx = new WalletTransaction({
          userId: user.userId,
          transactionType: 'Credit',
          amount: application.feeAmount,
          balanceBefore,
          balanceAfter: user.walletBalance,
          description: `Refund: Offline Work Rejected (${application.applicationType} - Ack: ${application.ackNumber})`,
          referenceNumber: `REF-${application.ackNumber}`,
          status: 'Success'
        });
        await refundTx.save();

        application.isRefunded = true;
        application.refundAmount = application.feeAmount;
      }
    }

    await application.save();

    // Notify retailer
    emitNotificationSafely(notifyRetailer(req.app.get('io'), application.userId, {
      type: 'offline_status_update',
      title: `Offline Application ${status}`,
      message: `Your application (${application.ackNumber}) status is now ${status}. ${adminRemarks ? 'Remarks: ' + adminRemarks : ''}`,
      data: {
        applicationId: application._id,
        ackNumber: application.ackNumber,
        status: application.status
      }
    }));

    return res.json({ 
      success: true, 
      message: 'Status updated successfully!', 
      application 
    });
  } catch (err) {
    console.error('Error updating application status:', err);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// POST add additional document
router.post('/:id/documents', async (req, res) => {
  try {
    const { name, dataUrl, uploadedBy } = req.body;
    const application = await OfflineWorkApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    let finalUrl = dataUrl;
    if (dataUrl && dataUrl.startsWith('data:')) {
      finalUrl = await uploadOfflineAsset(
        dataUrl,
        'mb_mitra/offline-work/documents',
        `${application.ackNumber}_doc_${Date.now()}`
      );
    }

    application.additionalDocuments.push({
      name: name || 'Supporting Document',
      dataUrl: finalUrl,
      uploadedBy: uploadedBy || 'Retailer',
      uploadedAt: new Date()
    });

    await application.save();

    return res.json({ 
      success: true, 
      message: 'Document added successfully!', 
      application 
    });
  } catch (err) {
    console.error('Error adding document:', err);
    res.status(500).json({ success: false, message: 'Failed to add document' });
  }
});

// DELETE application
router.delete('/application/:id', async (req, res) => {
  try {
    await OfflineWorkApplication.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Application deleted successfully' });
  } catch (err) {
    console.error('Error deleting offline application:', err);
    res.status(500).json({ success: false, message: 'Failed to delete application' });
  }
});

module.exports = router;
