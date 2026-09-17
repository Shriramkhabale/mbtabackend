const express = require('express');
const router = express.Router();
const PanCardApplication = require('../models/PanCardApplication');
const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const path = require('path');
const { cloudinary } = require('../cloudinaryConfig');
const { notifyAdmin, notifyRetailer } = require('../socket/notificationService');

const emitNotificationSafely = (notificationPromise) => {
  notificationPromise.catch(error => console.error('Notification delivery error:', error));
};

const uploadPanAsset = async (asset, folder, publicId) => {
  if (!asset || !asset.startsWith('data:')) return asset || '';

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  }

  const result = await cloudinary.uploader.upload(asset, {
    folder,
    public_id: publicId,
    resource_type: 'auto',
    // Auto-compress & auto-format to reduce file size
    quality: 'auto',
    fetch_format: 'auto'
  });

  return result.secure_url;
};

const migrateLegacyPanDocuments = async (application) => {
  let changed = false;
  const details = application.details && typeof application.details === 'object'
    ? { ...application.details }
    : {};

  const photoUrl = await uploadPanAsset(
    application.photoUrl || details.photoUrl,
    'mb_mitra/pan-applications',
    `${application.ackNumber}_photo`
  );
  if (photoUrl && photoUrl !== application.photoUrl) {
    application.photoUrl = photoUrl;
    details.photoUrl = photoUrl;
    changed = true;
  }

  const signatureUrl = await uploadPanAsset(
    application.signatureUrl || details.signatureUrl,
    'mb_mitra/pan-applications',
    `${application.ackNumber}_signature`
  );
  if (signatureUrl && signatureUrl !== application.signatureUrl) {
    application.signatureUrl = signatureUrl;
    details.signatureUrl = signatureUrl;
    changed = true;
  }

  const documents = Array.isArray(application.additionalDocuments)
    ? application.additionalDocuments
    : [];
  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];
    if (document.dataUrl && document.dataUrl.startsWith('data:')) {
      document.dataUrl = await uploadPanAsset(
        document.dataUrl,
        'mb_mitra/pan-applications/additional-documents',
        `${application.ackNumber}_${index}_${Date.now()}`
      );
      changed = true;
    }
  }

  if (changed) {
    application.details = details;
    application.markModified('details');
    application.markModified('additionalDocuments');
    await application.save();
  }

  return application;
};

const fs = require('fs');
const panConfigFile = path.join(__dirname, '..', 'panTabsConfig.json');

const defaultPanTabsConfig = [
  {
    id: 'manual_new_pan',
    label: 'Manual New PAN',
    icon: '📄',
    fee: 107,
    badge: 'Form 49A Physical',
    description: 'Detailed manual PAN Application with Photo & Signature Upload support.',
    fields: [
      { name: 'category', label: 'CATEGORY OF APPLICANT', type: 'select', options: ['INDIVIDUAL', 'FIRM', 'BODY OF INDIVIDUALS', 'TRUST', 'ASSOCIATION OF PERSONS', 'LOCAL AUTHORITY', 'COMPANY', 'HINDU UNDIVIDED FAMILY', 'LIMITED LIABILITY PARTNERSHIP', 'ARTIFICIAL JURIDICAL PERSON', 'GOVERNMENT'], required: true, hidden: false, formType: 'Both' },
      { name: 'aadhaarNumber', label: 'AADHAAR NO', type: 'text', placeholder: '12 DIGITS UID NO', required: true, hidden: false, formType: 'Form 93' },
      { name: 'proofOfDob', label: 'PROOF OF DOB', type: 'select', options: ['ABHA HEALTH GOVT ID CARD (CENTRAL GOVT)', 'AADHAAR CARD ISSUED BY UIDAI', 'BIRTH CERTIFICATE ISSUED BY MUNICIPALITY', 'MATRICULATION / 10TH PASSING CERTIFICATE', 'PASSPORT', 'DRIVING LICENSE'], required: true, hidden: false, formType: 'Form 93' },
      { name: 'title', label: 'TITLE', type: 'select', options: ['SELECT', 'SHRI', 'SMT', 'KUMARI'], required: true, hidden: false, formType: 'Form 93' },
      { name: 'lastName', label: 'LAST NAME / SURNAME', type: 'text', placeholder: 'LAST NAME / SURNAME', required: true, hidden: false, formType: 'Form 93' },
      { name: 'firstName', label: 'FIRST NAME', type: 'text', placeholder: 'FIRST NAME', required: false, hidden: false, formType: 'Form 93' },
      { name: 'middleName', label: 'MIDDLE NAME', type: 'text', placeholder: 'MIDDLE NAME', required: false, hidden: false, formType: 'Form 93' },
      { name: 'isSingleParent', label: 'WHETHER MOTHER/FATHER IS A SINGLE PARENT', type: 'select', options: ['NO', 'YES'], required: true, hidden: false, formType: 'Form 93' },
      { name: 'fatherLastName', label: "FATHER'S LAST NAME", type: 'text', placeholder: 'FATHER LAST NAME', required: false, hidden: false, formType: 'Form 93' },
      { name: 'fatherFirstName', label: "FATHER'S FIRST NAME", type: 'text', placeholder: 'FATHER FIRST NAME', required: false, hidden: false, formType: 'Form 93' },
      { name: 'fatherMiddleName', label: "FATHER'S MIDDLE NAME", type: 'text', placeholder: 'FATHER MIDDLE NAME', required: false, hidden: false, formType: 'Form 93' },
      { name: 'motherLastName', label: "MOTHER'S LAST NAME", type: 'text', placeholder: 'MOTHER LAST NAME', required: false, hidden: false, formType: 'Form 93' },
      { name: 'motherFirstName', label: "MOTHER'S FIRST NAME", type: 'text', placeholder: 'MOTHER FIRST NAME', required: false, hidden: false, formType: 'Form 93' },
      { name: 'motherMiddleName', label: "MOTHER'S MIDDLE NAME", type: 'text', placeholder: 'MOTHER MIDDLE NAME', required: false, hidden: false, formType: 'Form 93' },
      { name: 'nameAsPerAadhaar', label: 'NAME AS PER AADHAAR', type: 'text', placeholder: 'NAME AS PER AADHAAR', required: true, hidden: false, formType: 'Form 93' },
      { name: 'gender', label: 'GENDER', type: 'select', options: ['SELECT', 'MALE', 'FEMALE', 'TRANSGENDER'], required: true, hidden: false, formType: 'Form 93' },
      { name: 'dob', label: 'DATE OF BIRTH', type: 'date', required: true, hidden: false, formType: 'Form 93' },
      { name: 'mobileNumber', label: 'MOBILE NO.', type: 'tel', placeholder: 'MOBILE NO.', required: true, hidden: false, formType: 'Both' },
      { name: 'email', label: 'EMAIL ID', type: 'email', placeholder: 'EMAIL ID', required: true, hidden: false, formType: 'Both' },
      { name: 'flatNo', label: 'FLAT/DOOR/BLOCK NO', type: 'text', placeholder: 'FLAT/DOOR/BLOCK NO', required: true, hidden: false, formType: 'Form 93' },
      { name: 'premises', label: 'PREMISES/BUILDING/VILLAGE', type: 'text', placeholder: 'PREMISES/BUILDING/VILLAGE', required: true, hidden: false, formType: 'Form 93' },
      { name: 'roadStreet', label: 'ROAD/STREET/POST OFFICE', type: 'text', placeholder: 'ROAD/STREET/LANE/POST OFFICE', required: true, hidden: false, formType: 'Form 93' },
      { name: 'areaTaluka', label: 'AREA/TALUKA/SUB DIVISION', type: 'text', placeholder: 'AREA/TALUKA/SUB DIVISION', required: true, hidden: false, formType: 'Form 93' },
      { name: 'state', label: 'STATE', type: 'select', options: ['PLEASE SELECT', 'MAHARASHTRA', 'KARNATAKA', 'GUJARAT', 'DELHI', 'UTTAR PRADESH', 'MADHYA PRADESH', 'TAMIL NADU'], required: true, hidden: false, formType: 'Form 93' },
      { name: 'district', label: 'TOWN/DISTRICT', type: 'select', options: ['SELECT', 'MUMBAI', 'PUNE', 'NAGPUR', 'THANE', 'BANGALORE', 'KOLHAPUR'], required: true, hidden: false, formType: 'Form 93' },
      { name: 'pincode', label: 'PINCODE', type: 'text', placeholder: 'PINCODE', required: true, hidden: false, formType: 'Form 93' },
      { name: 'proofOfIdentity', label: 'PROOF OF IDENTITY', type: 'select', options: ['AADHAAR CARD ISSUED BY THE UNIQUE IDENTIFICATION AUTHORITY OF INDIA', 'VOTER ID CARD', 'PASSPORT', 'DRIVING LICENSE'], required: true, hidden: false, formType: 'Form 93' },
      { name: 'proofOfAddress', label: 'PROOF OF ADDRESS', type: 'select', options: ['AADHAAR CARD ISSUED BY THE UNIQUE IDENTIFICATION AUTHORITY OF INDIA', 'VOTER ID CARD', 'PASSPORT', 'ELECTRICITY BILL'], required: true, hidden: false, formType: 'Form 93' },
      { name: 'photoUrl', label: 'Upload Applicant Photo', type: 'file', required: false, hidden: false, formType: 'Form 93' },
      { name: 'signatureUrl', label: 'Upload Applicant Signature', type: 'file', required: false, hidden: false, formType: 'Form 93' },
      // Form 94 (Non-Individual / Other Entities) Fields
      { name: 'entityName', label: 'NAME OF FIRM / COMPANY / TRUST / ENTITY (FORM 94)', type: 'text', placeholder: 'NAME OF ENTITY / FIRM', required: false, hidden: false, formType: 'Form 94' },
      { name: 'dateOfIncorporation', label: 'DATE OF INCORPORATION / AGREEMENT / FORMATION (FORM 94)', type: 'date', required: false, hidden: false, formType: 'Form 94' },
      { name: 'registrationNumber', label: 'REGISTRATION NUMBER (IF ANY) (FORM 94)', type: 'text', placeholder: 'REGISTRATION NUMBER', required: false, hidden: false, formType: 'Form 94' },
      { name: 'incomeSource', label: 'SOURCE OF INCOME (FORM 94)', type: 'select', options: ['Income from Business/Profession', 'Salary', 'Capital Gains', 'Income from House Property', 'Income from Other Sources', 'No Income'], required: false, hidden: false, formType: 'Form 94' },
      { name: 'proofOfIncorporation', label: 'PROOF OF INCORPORATION / REGISTRATION (FORM 94)', type: 'select', options: ['CERTIFICATE OF INCORPORATION / REGISTRATION', 'PARTNERSHIP DEED', 'TRUST DEED / AGREEMENT', 'REGISTRATION CERTIFICATE'], required: false, hidden: false, formType: 'Form 94' },
      { name: 'commFlatNo', label: 'OFFICE FLAT/DOOR/BLOCK NO (FORM 94)', type: 'text', placeholder: 'OFFICE FLAT NO', required: false, hidden: false, formType: 'Form 94' },
      { name: 'commPremises', label: 'OFFICE PREMISES/BUILDING/VILLAGE (FORM 94)', type: 'text', placeholder: 'OFFICE PREMISES', required: false, hidden: false, formType: 'Form 94' },
      { name: 'commRoadStreet', label: 'OFFICE ROAD/STREET/POST OFFICE (FORM 94)', type: 'text', placeholder: 'OFFICE ROAD STREET', required: false, hidden: false, formType: 'Form 94' },
      { name: 'commAreaTaluka', label: 'OFFICE AREA/TALUKA/SUB DIVISION (FORM 94)', type: 'text', placeholder: 'OFFICE AREA TALUKA', required: false, hidden: false, formType: 'Form 94' },
      { name: 'commState', label: 'OFFICE STATE (FORM 94)', type: 'select', options: ['PLEASE SELECT', 'MAHARASHTRA', 'KARNATAKA', 'GUJARAT', 'DELHI', 'UTTAR PRADESH', 'MADHYA PRADESH', 'TAMIL NADU'], required: false, hidden: false, formType: 'Form 94' },
      { name: 'commDistrict', label: 'OFFICE TOWN/DISTRICT (FORM 94)', type: 'select', options: ['SELECT', 'MUMBAI', 'PUNE', 'NAGPUR', 'THANE', 'BANGALORE', 'KOLHAPUR'], required: false, hidden: false, formType: 'Form 94' },
      { name: 'commPincode', label: 'OFFICE PINCODE (FORM 94)', type: 'text', placeholder: 'OFFICE PINCODE', required: false, hidden: false, formType: 'Form 94' },
      { name: 'raTitle', label: 'REPRESENTATIVE ASSESSEE TITLE (FORM 94)', type: 'select', options: ['SHRI', 'SMT', 'KUMARI', 'M/S'], required: false, hidden: false, formType: 'Form 94' },
      { name: 'raFirstName', label: 'REPRESENTATIVE ASSESSEE FIRST NAME (FORM 94)', type: 'text', placeholder: 'RA FIRST NAME', required: false, hidden: false, formType: 'Form 94' },
      { name: 'raMiddleName', label: 'REPRESENTATIVE ASSESSEE MIDDLE NAME (FORM 94)', type: 'text', placeholder: 'RA MIDDLE NAME', required: false, hidden: false, formType: 'Form 94' },
      { name: 'raLastName', label: 'REPRESENTATIVE ASSESSEE LAST NAME (FORM 94)', type: 'text', placeholder: 'RA LAST NAME', required: false, hidden: false, formType: 'Form 94' },
      { name: 'raPanNumber', label: 'REPRESENTATIVE ASSESSEE PAN (FORM 94)', type: 'text', placeholder: 'RA PAN NUMBER', required: false, hidden: false, formType: 'Form 94' },
      { name: 'raAadhaarNumber', label: 'REPRESENTATIVE ASSESSEE AADHAAR NO (FORM 94)', type: 'text', placeholder: 'RA AADHAAR NO', required: false, hidden: false, formType: 'Form 94' },
      { name: 'raMobileNumber', label: 'REPRESENTATIVE ASSESSEE MOBILE NO (FORM 94)', type: 'text', placeholder: 'RA MOBILE NO', required: false, hidden: false, formType: 'Form 94' },
      { name: 'raEmail', label: 'REPRESENTATIVE ASSESSEE EMAIL ID (FORM 94)', type: 'email', placeholder: 'RA EMAIL ID', required: false, hidden: false, formType: 'Form 94' },
      { name: 'raFlatNo', label: 'REPRESENTATIVE ASSESSEE FLAT NO (FORM 94)', type: 'text', placeholder: 'RA FLAT NO', required: false, hidden: false, formType: 'Form 94' },
      { name: 'raRoadStreet', label: 'REPRESENTATIVE ASSESSEE ROAD/STREET (FORM 94)', type: 'text', placeholder: 'RA ROAD STREET', required: false, hidden: false, formType: 'Form 94' },
      { name: 'raAreaTaluka', label: 'REPRESENTATIVE ASSESSEE AREA/TALUKA (FORM 94)', type: 'text', placeholder: 'RA AREA TALUKA', required: false, hidden: false, formType: 'Form 94' },
      { name: 'raDistrict', label: 'REPRESENTATIVE ASSESSEE DISTRICT (FORM 94)', type: 'select', options: ['SELECT', 'MUMBAI', 'PUNE', 'NAGPUR', 'THANE', 'BANGALORE', 'KOLHAPUR'], required: false, hidden: false, formType: 'Form 94' },
      { name: 'raState', label: 'REPRESENTATIVE ASSESSEE STATE (FORM 94)', type: 'select', options: ['PLEASE SELECT', 'MAHARASHTRA', 'KARNATAKA', 'GUJARAT', 'DELHI', 'UTTAR PRADESH', 'MADHYA PRADESH', 'TAMIL NADU'], required: false, hidden: false, formType: 'Form 94' },
      { name: 'raPincode', label: 'REPRESENTATIVE ASSESSEE PINCODE (FORM 94)', type: 'text', placeholder: 'RA PINCODE', required: false, hidden: false, formType: 'Form 94' },
      { name: 'verifierName', label: 'VERIFIER NAME (FORM 94)', type: 'text', placeholder: 'VERIFIER NAME', required: false, hidden: false, formType: 'Form 94' },
      { name: 'verifierCapacity', label: 'VERIFIER CAPACITY (FORM 94)', type: 'select', options: ['PARTNER', 'DIRECTOR', 'TRUSTEE', 'AUTHORISED SIGNATORY', 'PROPRIETOR', 'KARTA'], required: false, hidden: false, formType: 'Form 94' },
      { name: 'verifierPlace', label: 'VERIFIER PLACE (FORM 94)', type: 'text', placeholder: 'VERIFIER PLACE', required: false, hidden: false, formType: 'Form 94' },
      { name: 'verifierDate', label: 'VERIFIER DATE (FORM 94)', type: 'date', required: false, hidden: false, formType: 'Form 94' }
    ]
  },
  {
    id: 'epan_kyc',
    label: 'Aadhaar OTP New PAN',
    icon: '📲',
    fee: 107,
    badge: 'Instant E-KYC Mode',
    description: 'Instant E-KYC application using Aadhaar OTP / Biometric verification.',
    fields: [
      { name: 'applicantName', label: 'Applicant Full Name (As per Aadhaar)', type: 'text', placeholder: 'Enter full name of applicant...', icon: '👤', required: true, hidden: false },
      { name: 'fatherName', label: "Father's Full Name", type: 'text', placeholder: "Enter father's full name...", icon: '👨‍👦', required: true, hidden: false },
      { name: 'dob', label: 'Date of Birth (DOB)', type: 'date', icon: '📅', required: true, hidden: false },
      { name: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Transgender'], icon: '🚻', required: true, hidden: false },
      { name: 'mobileNumber', label: 'Mobile Number', type: 'tel', placeholder: '10-digit mobile number...', icon: '📱', required: true, hidden: false },
      { name: 'email', label: 'Email Address', type: 'email', placeholder: 'Enter email for e-PAN soft copy...', icon: '📧', required: true, hidden: false },
      { name: 'aadhaarNumber', label: '12-Digit Aadhaar Number', type: 'text', placeholder: '12-digit Aadhaar number...', icon: '🆔', required: true, hidden: false }
    ]
  },
  {
    id: 'epan_correction',
    label: 'Already PAN / Correction',
    icon: '📝',
    fee: 107,
    badge: 'PAN Update Service',
    description: 'Update or correct personal details on your existing PAN Card record.',
    fields: [
      { name: 'panNumber', label: 'EXISTING PAN NUMBER', type: 'text', placeholder: 'e.g. ABCDE1234F', required: true, hidden: false },
      { name: 'aadhaarNumber', label: 'AADHAAR NO', type: 'text', placeholder: '12 DIGITS UID NO', required: true, hidden: false },
      { name: 'firstName', label: 'FIRST NAME', type: 'text', placeholder: 'FIRST NAME', required: true, hidden: false },
      { name: 'middleName', label: 'MIDDLE NAME', type: 'text', placeholder: 'MIDDLE NAME', required: false, hidden: false },
      { name: 'lastName', label: 'LAST NAME / SURNAME', type: 'text', placeholder: 'LAST NAME / SURNAME', required: true, hidden: false },
      { name: 'nameAsPerAadhaar', label: 'NAME AS PER AADHAAR', type: 'text', placeholder: 'NAME AS PER AADHAAR', required: true, hidden: false },
      { name: 'gender', label: 'GENDER', type: 'select', options: ['SELECT', 'MALE', 'FEMALE', 'TRANSGENDER'], required: true, hidden: false },
      { name: 'dob', label: 'DATE OF BIRTH', type: 'date', required: true, hidden: false },
      { name: 'mobileNumber', label: 'MOBILE NO.', type: 'tel', placeholder: 'MOBILE NO.', required: true, hidden: false },
      { name: 'email', label: 'EMAIL ID', type: 'email', placeholder: 'EMAIL ID', required: true, hidden: false },
      { name: 'flatNo', label: 'FLAT / DOOR / BLOCK NO', type: 'text', placeholder: 'FLAT / DOOR / BLOCK NO', required: true, hidden: false },
      { name: 'premises', label: 'PREMISES / BUILDING / VILLAGE', type: 'text', placeholder: 'PREMISES / BUILDING / VILLAGE', required: true, hidden: false },
      { name: 'roadStreet', label: 'ROAD / STREET / POST OFFICE', type: 'text', placeholder: 'ROAD / STREET / POST OFFICE', required: true, hidden: false },
      { name: 'areaTaluka', label: 'AREA / TALUKA / SUB DIVISION', type: 'text', placeholder: 'AREA / TALUKA / SUB DIVISION', required: true, hidden: false },
      { name: 'state', label: 'STATE / UNION TERRITORY', type: 'select', options: ['PLEASE SELECT', 'MAHARASHTRA', 'KARNATAKA', 'GUJARAT', 'DELHI', 'UTTAR PRADESH', 'MADHYA PRADESH', 'TAMIL NADU'], required: true, hidden: false },
      { name: 'district', label: 'TOWN / DISTRICT', type: 'select', options: ['SELECT', 'MUMBAI', 'PUNE', 'NAGPUR', 'THANE', 'BANGALORE', 'KOLHAPUR'], required: true, hidden: false },
      { name: 'pincode', label: 'PINCODE', type: 'text', placeholder: 'PINCODE', required: true, hidden: false },
      { name: 'parentToPrint', label: 'PARENT NAME TO PRINT ON PAN CARD', type: 'select', options: ['Father', 'Mother'], required: true, hidden: false },
      { name: 'fatherFirstName', label: "FATHER'S FIRST NAME", type: 'text', placeholder: "FATHER'S FIRST NAME", required: true, hidden: false },
      { name: 'fatherMiddleName', label: "FATHER'S MIDDLE NAME", type: 'text', placeholder: "FATHER'S MIDDLE NAME", required: false, hidden: false },
      { name: 'fatherLastName', label: "FATHER'S LAST NAME", type: 'text', placeholder: "FATHER'S LAST NAME", required: true, hidden: false },
      { name: 'motherFirstName', label: "MOTHER'S FIRST NAME", type: 'text', placeholder: "MOTHER'S FIRST NAME", required: false, hidden: false },
      { name: 'motherMiddleName', label: "MOTHER'S MIDDLE NAME", type: 'text', placeholder: "MOTHER'S MIDDLE NAME", required: false, hidden: false },
      { name: 'motherLastName', label: "MOTHER'S LAST NAME", type: 'text', placeholder: "MOTHER'S LAST NAME", required: false, hidden: false },
      { name: 'proofOfIdentity', label: 'PROOF OF IDENTITY', type: 'select', options: ['AADHAAR CARD', 'VOTER ID CARD', 'PASSPORT', 'DRIVING LICENSE'], required: true, hidden: false },
      { name: 'proofOfAddress', label: 'PROOF OF ADDRESS', type: 'select', options: ['AADHAAR CARD', 'VOTER ID CARD', 'PASSPORT', 'UTILITY BILL'], required: true, hidden: false },
      { name: 'proofOfDob', label: 'PROOF OF DATE OF BIRTH', type: 'select', options: ['AADHAAR CARD', 'BIRTH CERTIFICATE', '10TH CERTIFICATE', 'PASSPORT'], required: true, hidden: false },
      { name: 'passportNumber', label: 'PASSPORT NUMBER (IF APPLICABLE)', type: 'text', placeholder: 'PASSPORT NUMBER', required: false, hidden: false },
      { name: 'photoUrl', label: 'UPLOAD APPLICANT PHOTO', type: 'file', required: false, hidden: false },
      { name: 'signatureUrl', label: 'UPLOAD APPLICANT SIGNATURE', type: 'file', required: false, hidden: false }
    ]
  }
];

let panTabsConfig = defaultPanTabsConfig;
try {
  if (fs.existsSync(panConfigFile)) {
    const raw = fs.readFileSync(panConfigFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      panTabsConfig = parsed.map(tab => {
        const def = defaultPanTabsConfig.find(d => d.id === tab.id);
        // If epan_correction only had 5 fields previously, upgrade it to the full 30 fields
        if (tab.id === 'epan_correction' && (!tab.fields || tab.fields.length <= 5)) {
          return { ...tab, fields: def ? def.fields : [] };
        }
        return tab;
      });
    }
  }
} catch (e) {
  console.error('Error loading panTabsConfig.json:', e);
}

// GET dynamic PAN Card service sub-tabs configuration
router.get('/tabs', (req, res) => {
  const sanitized = panTabsConfig.map(tab => ({
    ...tab,
    fields: (tab.fields || []).map(f => {
      if (f.name === 'state') return { ...f, label: (f.label && f.label !== 'state') ? f.label : 'STATE' };
      if (f.name === 'district') return { ...f, label: (f.label && f.label !== 'district') ? f.label : 'TOWN/DISTRICT' };
      return f;
    })
  }));
  res.json(sanitized);
});

// Official PAN correction form supplied with this project. The browser uses it
// as the immutable background when creating a completed two-page PAN CR PDF.
router.get('/correction-template', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'PAN CR individual.pdf'));
});

// POST & PUT update dynamic PAN Card service sub-tabs & form fields configuration (Admin)
const handleSaveTabs = (req, res) => {
  try {
    const listToSave = Array.isArray(req.body)
      ? req.body
      : (req.body && (req.body.tabs || req.body.panTabsConfigList)) || null;

    if (Array.isArray(listToSave)) {
      panTabsConfig = listToSave;
      try {
        fs.writeFileSync(panConfigFile, JSON.stringify(panTabsConfig, null, 2), 'utf8');
      } catch (err) {
        console.error('Error writing panTabsConfig.json:', err);
      }
      return res.json({ success: true, message: 'PAN Forms configuration updated successfully!', tabs: panTabsConfig });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid payload. Expected an array of tab configurations.' });
    }
  } catch (err) {
    console.error('Error updating PAN tabs config:', err);
    res.status(500).json({ success: false, message: 'Failed to update PAN forms config' });
  }
};

router.post('/tabs', handleSaveTabs);
router.put('/tabs', handleSaveTabs);


// POST submit a new PAN card application
router.post('/submit', async (req, res) => {
  try {
    const {
      userId,
      applicationType,
      applicantName,
      fatherName,
      dob,
      gender,
      mobileNumber,
      email,
      aadhaarNumber,
      panNumber,
      panType,
      photoUrl,
      signatureUrl,
      remarks
    } = req.body;

    if (!userId || !applicationType || !applicantName || !mobileNumber || !email) {
      return res.status(400).json({ success: false, message: 'Please fill in all mandatory fields.' });
    }

    if (applicationType === 'E-PAN Correction' && !panNumber) {
      return res.status(400).json({ success: false, message: 'Existing PAN card number is required for correction.' });
    }

    // Validate application type — accept both built-in and any dynamically created tab labels
    const validBuiltInTypes = ['E-PAN KYC', 'Manual New PAN', 'Aadhaar OTP New PAN', 'E-PAN Correction', 'E-PAN Signature & Photo', 'Already PAN'];
    const dynamicTabLabels = panTabsConfig.map(t => t.label);
    const allValidTypes = [...new Set([...validBuiltInTypes, ...dynamicTabLabels])];
    if (!allValidTypes.includes(applicationType)) {
      return res.status(400).json({ success: false, message: 'Invalid PAN application type.' });
    }

    // Resolve fee from tab config — find matching tab by label or id
    const matchedTab = panTabsConfig.find(t =>
      t.label === applicationType ||
      t.id === applicationType ||
      (t.id === 'manual_new_pan' && applicationType === 'Manual New PAN') ||
      (t.id === 'epan_kyc' && (applicationType === 'Aadhaar OTP New PAN' || applicationType === 'E-PAN KYC')) ||
      (t.id === 'epan_correction' && (applicationType === 'Already PAN' || applicationType === 'E-PAN Correction'))
    );
    const feeAmount = (matchedTab && typeof matchedTab.fee === 'number') ? matchedTab.fee : 107;

    // Check user balance
    const user = await User.findOne({ userId: { $regex: new RegExp(`^${userId}$`, 'i') } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }

    if (user.walletBalance < feeAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Fee ₹${feeAmount} required. Current balance: ₹${user.walletBalance.toFixed(2)}`
      });
    }

    // Generate Acknowledgement Number (e.g. MBM2026090212345)
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const ackNumber = `MBM${dateStr}${randomDigits}`;

    // Store hosted URLs instead of keeping the browser's base64 data in MongoDB.
    const uploadedPhotoUrl = await uploadPanAsset(
      photoUrl,
      'mb_mitra/pan-applications',
      `${ackNumber}_photo`
    );
    const uploadedSignatureUrl = await uploadPanAsset(
      signatureUrl,
      'mb_mitra/pan-applications',
      `${ackNumber}_signature`
    );
    const applicationDetails = {
      ...(req.body.details || req.body.manualData || {}),
      ...(uploadedPhotoUrl ? { photoUrl: uploadedPhotoUrl } : {}),
      ...(uploadedSignatureUrl ? { signatureUrl: uploadedSignatureUrl } : {})
    };

    // Deduct fee from user wallet
    const balanceBefore = user.walletBalance;
    user.walletBalance -= feeAmount;
    await user.save();

    // Log wallet debit transaction
    const newTx = new WalletTransaction({
      userId: user.userId,
      transactionType: 'Debit',
      amount: feeAmount,
      balanceBefore,
      balanceAfter: user.walletBalance,
      description: `PAN Application Fee - ${applicationType} (Ack: ${ackNumber})`,
      referenceNumber: ackNumber,
      status: 'Success'
    });
    await newTx.save();

    // Save PAN application
    const application = new PanCardApplication({
      userId: user.userId,
      applicationType,
      applicantName,
      fatherName: fatherName || '',
      dob: dob || '',
      gender: gender || 'Male',
      mobileNumber,
      email,
      aadhaarNumber: aadhaarNumber || '',
      panNumber: panNumber || '',
      panType: panType || 'Physical PAN Card & e-PAN',
      photoUrl: uploadedPhotoUrl,
      signatureUrl: uploadedSignatureUrl,
      feeAmount,
      ackNumber,
      status: 'Submitted',
      remarks: remarks || '',
      details: applicationDetails
    });

    await application.save();

    emitNotificationSafely(notifyAdmin(req.app.get('io'), {
      type: 'pan_application_submitted',
      title: 'New PAN application received',
      message: `${application.userId} submitted a ${application.applicationType} application.`,
      data: { applicationId: application._id, userId: application.userId, ackNumber: application.ackNumber }
    }));

    res.status(201).json({
      success: true,
      message: `PAN Application (${applicationType}) submitted successfully!`,
      ackNumber,
      feeDeducted: feeAmount,
      walletBalance: user.walletBalance,
      application
    });

  } catch (error) {
    console.error('PAN Application Submit Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error submitting application.' });
  }
});

// GET all PAN applications analytics & retailer submission stats for SuperAdmin
router.get('/stats', async (req, res) => {
  try {
    const applications = await PanCardApplication.find().sort({ createdAt: -1 });
    const totalApplications = applications.length;

    const uniqueRetailersMap = {};
    let submittedCount = 0;
    let inProgressCount = 0;
    let approvedCount = 0;
    let completedCount = 0;
    let rejectedCount = 0;

    applications.forEach(app => {
      const uId = app.userId || 'Unknown Retailer';
      if (!uniqueRetailersMap[uId]) {
        uniqueRetailersMap[uId] = {
          userId: uId,
          totalCount: 0,
          manualCount: 0,
          ekycCount: 0,
          correctionCount: 0,
          latestSubmission: app.createdAt,
          statuses: { Submitted: 0, 'In Progress': 0, Approved: 0, Completed: 0, Rejected: 0 }
        };
      }

      uniqueRetailersMap[uId].totalCount += 1;
      
      const type = (app.applicationType || '').toLowerCase();
      if (type.includes('manual')) uniqueRetailersMap[uId].manualCount += 1;
      else if (type.includes('correction') || type.includes('already')) uniqueRetailersMap[uId].correctionCount += 1;
      else uniqueRetailersMap[uId].ekycCount += 1;

      const st = app.status || 'Submitted';
      if (uniqueRetailersMap[uId].statuses[st] !== undefined) {
        uniqueRetailersMap[uId].statuses[st] += 1;
      } else {
        uniqueRetailersMap[uId].statuses[st] = 1;
      }

      if (st.toLowerCase() === 'submitted') submittedCount++;
      else if (st.toLowerCase() === 'in progress') inProgressCount++;
      else if (st.toLowerCase() === 'approved') approvedCount++;
      else if (st.toLowerCase() === 'completed') completedCount++;
      else if (st.toLowerCase() === 'rejected') rejectedCount++;
    });

    const retailerList = Object.values(uniqueRetailersMap);

    res.json({
      success: true,
      totalApplications,
      uniqueRetailersCount: retailerList.length,
      statusCounts: {
        Submitted: submittedCount,
        InProgress: inProgressCount,
        Approved: approvedCount,
        Completed: completedCount,
        Rejected: rejectedCount
      },
      retailers: retailerList,
      applications
    });
  } catch (error) {
    console.error('Error fetching PAN stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET all PAN applications for Admin
router.get('/all', async (req, res) => {
  try {
    const applications = await PanCardApplication.find().sort({ createdAt: -1 });
    res.json({ success: true, applications });
  } catch (error) {
    console.error('Error fetching all PAN applications:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update status, remarks and receipt of a PAN application (Admin)
router.put('/status/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminRemarks, receiptUrl, actorRole } = req.body;

    const application = await PanCardApplication.findById(id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'PAN application not found.' });
    }

    if (status) application.status = status;
    if (adminRemarks !== undefined) application.adminRemarks = adminRemarks;

    if (receiptUrl) {
      let finalReceipt = receiptUrl;
      if (receiptUrl.startsWith('data:')) {
        finalReceipt = await uploadPanAsset(receiptUrl, 'mb_mitra/pan-receipts', `${application.ackNumber}_approved_receipt`);
      }
      application.receiptUrl = finalReceipt;
    }

    await application.save();

    if (String(actorRole || '').toLowerCase() === 'retailer') {
      emitNotificationSafely(notifyAdmin(req.app.get('io'), {
        type: 'pan_application_status_updated_by_retailer',
        title: 'Retailer updated PAN application',
        message: `${application.userId} updated PAN application ${application.ackNumber} to ${application.status}.`,
        data: { applicationId: application._id, userId: application.userId, status: application.status, adminRemarks: application.adminRemarks }
      }));
    } else {
      emitNotificationSafely(notifyRetailer(req.app.get('io'), application.userId, {
        type: 'pan_application_status_updated',
        title: 'PAN application updated',
        message: `Your PAN application ${application.ackNumber} status is '${application.status}'${application.receiptUrl ? ' and approved receipt is available.' : '.'}`,
        data: { applicationId: application._id, status: application.status, adminRemarks: application.adminRemarks, receiptUrl: application.receiptUrl }
      }));
    }

    res.json({
      success: true,
      message: `PAN Application status updated to '${application.status}' successfully!`,
      application
    });
  } catch (error) {
    console.error('Error updating PAN application status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST upload approved receipt PDF/Image for a PAN application (Admin)
router.post('/upload-receipt/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { receiptUrl } = req.body;

    if (!receiptUrl) {
      return res.status(400).json({ success: false, message: 'Receipt data/URL is required.' });
    }

    const application = await PanCardApplication.findById(id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'PAN application not found.' });
    }

    let finalReceipt = receiptUrl;
    if (receiptUrl.startsWith('data:')) {
      finalReceipt = await uploadPanAsset(receiptUrl, 'mb_mitra/pan-receipts', `${application.ackNumber}_approved_receipt`);
    }
    application.receiptUrl = finalReceipt;
    application.status = 'Approved';
    await application.save();

    emitNotificationSafely(notifyRetailer(req.app.get('io'), application.userId, {
      type: 'pan_approved_receipt_uploaded',
      title: '📄 Approved PAN Application Receipt Uploaded!',
      message: `Admin uploaded approved receipt for PAN application ${application.ackNumber}.`,
      data: { applicationId: application._id, ackNumber: application.ackNumber, receiptUrl: finalReceipt }
    }));

    res.json({
      success: true,
      message: 'Approved PAN Application Receipt uploaded and sent to retailer successfully!',
      application
    });
  } catch (error) {
    console.error('Error uploading approved PAN receipt:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT update full details of a PAN application (Admin Direct Editing)
router.put('/update-application/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      applicantName,
      fatherName,
      dob,
      gender,
      mobileNumber,
      email,
      aadhaarNumber,
      panNumber,
      details
    } = req.body;

    const application = await PanCardApplication.findById(id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'PAN application not found.' });
    }

    if (applicantName !== undefined) application.applicantName = applicantName;
    if (fatherName !== undefined) application.fatherName = fatherName;
    if (dob !== undefined) application.dob = dob;
    if (gender !== undefined) application.gender = gender;
    if (mobileNumber !== undefined) application.mobileNumber = mobileNumber;
    if (email !== undefined) application.email = email;
    if (aadhaarNumber !== undefined) application.aadhaarNumber = aadhaarNumber;
    if (panNumber !== undefined) application.panNumber = panNumber;

    if (details && typeof details === 'object') {
      if (details.photoUrl) application.photoUrl = details.photoUrl;
      if (details.signatureUrl) application.signatureUrl = details.signatureUrl;
      application.details = { ...(application.details || {}), ...details };
      application.markModified('details');
    }

    await application.save();

    emitNotificationSafely(notifyRetailer(req.app.get('io'), application.userId, {
      type: 'pan_application_details_updated',
      title: 'PAN application details changed',
      message: `An admin updated the details of PAN application ${application.ackNumber}.`,
      data: { applicationId: application._id, ackNumber: application.ackNumber }
    }));

    res.json({
      success: true,
      message: 'PAN Application details updated successfully!',
      application
    });
  } catch (error) {
    console.error('Error updating PAN application details:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET the latest PAN application, including Cloudinary document URLs.
router.get('/application/:id', async (req, res) => {
  try {
    const application = await PanCardApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'PAN application not found.' });
    }

    const applicationWithHostedDocuments = await migrateLegacyPanDocuments(application);
    res.json({ success: true, application: applicationWithHostedDocuments });
  } catch (error) {
    console.error('Error fetching PAN application:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Serve a PAN document inline with a browser-compatible content type.
router.get('/application/:id/document/:documentKey', async (req, res) => {
  try {
    const application = await PanCardApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'PAN application not found.' });
    }

    const details = application.details && typeof application.details === 'object'
      ? application.details
      : {};
    let documentUrl = '';
    if (req.params.documentKey === 'photo') {
      documentUrl = application.photoUrl || details.photoUrl;
    } else if (req.params.documentKey === 'signature') {
      documentUrl = application.signatureUrl || details.signatureUrl;
    } else {
      const document = application.additionalDocuments.id(req.params.documentKey);
      documentUrl = document?.dataUrl || '';
    }

    if (!documentUrl) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    if (documentUrl.startsWith('data:')) {
      const match = documentUrl.match(/^data:([^;]+);base64,(.*)$/s);
      if (!match) return res.status(400).json({ success: false, message: 'Invalid document data.' });
      res.set('Content-Type', match[1]);
      res.set('Content-Disposition', 'inline');
      return res.send(Buffer.from(match[2], 'base64'));
    }

    const cloudinaryResponse = await fetch(documentUrl);
    if (!cloudinaryResponse.ok) {
      return res.status(502).json({ success: false, message: 'Unable to fetch document from Cloudinary.' });
    }

    const lowerDocumentUrl = documentUrl.toLowerCase();
    const responseContentType = cloudinaryResponse.headers.get('content-type') || '';
    const isPdf = lowerDocumentUrl.includes('.pdf') || lowerDocumentUrl.includes('/raw/');
    const contentType = isPdf
      ? 'application/pdf'
      : (responseContentType || 'image/jpeg');
    const documentBuffer = Buffer.from(await cloudinaryResponse.arrayBuffer());
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', 'inline');
    return res.send(documentBuffer);
  } catch (error) {
    console.error('Error serving PAN document:', error);
    res.status(500).json({ success: false, message: error.message || 'Unable to load document.' });
  }
});

// Add a follow-up document to an existing application. This does not create a
// new application or deduct from the retailer's wallet.
router.put('/:id/documents', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, name, document } = req.body;

    if (!userId || !document || typeof document !== 'string') {
      return res.status(400).json({ success: false, message: 'A document and retailer ID are required.' });
    }

    if (!document.startsWith('data:')) {
      return res.status(400).json({ success: false, message: 'Please upload a valid PDF or image file.' });
    }

    const application = await PanCardApplication.findById(id);
    if (!application) {
      return res.status(404).json({ success: false, message: 'PAN application not found.' });
    }

    if (application.userId.toLowerCase() !== String(userId).toLowerCase()) {
      return res.status(403).json({ success: false, message: 'You can only add documents to your own applications.' });
    }

    const documentUrl = await uploadPanAsset(
      document,
      'mb_mitra/pan-applications/additional-documents',
      `${application.ackNumber}_${Date.now()}`
    );

    application.additionalDocuments = Array.isArray(application.additionalDocuments)
      ? application.additionalDocuments
      : [];
    application.additionalDocuments.push({
      name: (name || 'Additional document').trim().slice(0, 100),
      dataUrl: documentUrl,
      uploadedBy: application.userId
    });
    await application.save();

    res.json({ success: true, message: 'Document added to the application.', application });
  } catch (error) {
    console.error('Error adding PAN application document:', error);
    res.status(500).json({ success: false, message: error.message || 'Unable to add document.' });
  }
});

// GET applications history for user
router.get('/applications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const applications = await PanCardApplication.find({
      userId: { $regex: new RegExp(`^${userId}$`, 'i') }
    }).sort({ createdAt: -1 });

    res.json({ success: true, applications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
