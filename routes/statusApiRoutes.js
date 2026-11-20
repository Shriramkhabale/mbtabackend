const axios = require('axios');
const express = require('express');
const qs = require('qs');
const User = require('../models/User');
const verifyRetailer = require('../middleware/verifyRetailer');

const router = express.Router();

const STATUS_API_SERVICES = {
  aadhar_card_details_by_otp_api: {
    label: 'Aadhaar Card Details by OTP',
    url: 'https://api.dhboss.com/apicall/aadhar_card_details_by_otp_api/'
  },
  advance_pan_verification: {
    label: 'Advance PAN Verification',
    url: 'https://api.dhboss.com/apicall/advance_pan_verification/'
  },
  offline_aadhar_kyc: {
    label: 'Aadhaar Paperless Offline e-KYC',
    url: 'https://api.dhboss.com/apicall/offline_aadhar_kyc/'
  },
  pan_link_status: {
    label: 'PAN-Aadhaar Link Status',
    url: 'https://api.dhboss.com/apicall/pan_link_status/'
  },
  indiapost: {
    label: 'India Post Tracking',
    url: 'https://api.dhboss.com/apicall/indiapost/'
  },
  mobile_number_plans: {
    label: 'Mobile Number Recharge Plans',
    url: 'https://api.dhboss.com/apicall/mobile_number_plans/'
  },
  pro_pan_verification: {
    label: 'Pro PAN Verification by PAN Number',
    url: 'https://api.dhboss.com/apicall/pro_pan_verification/'
  }
};

const DYNAMIC_PERMISSION_IDS = [
  'dyn.servicesLink',
  'dyn.jobLinks',
  'dyn.admitCard',
  'dyn.formLinks',
  'dyn.vedioLink',
  'dyn.trainingLinks',
  'dyn.productLinks',
  'dyn.govtLinks',
  'dyn.print',
  'dyn.schorshipLinks',
  'dyn.statusApi'
];

const hasStatusApiPermission = (permissions) => {
  if (!Array.isArray(permissions)) return false;
  if (permissions.includes('none')) return false;
  if (permissions.includes('dyn.statusApi') || permissions.length === 0) return true;

  const hasDynamicMenuPermission = permissions.includes('dynamicMenus');
  const hasGranularDynamicPermission = permissions.some(permission =>
    DYNAMIC_PERMISSION_IDS.includes(permission)
  );
  return hasDynamicMenuPermission && !hasGranularDynamicPermission;
};

const redactProviderData = (value, apiKey) => {
  if (typeof value === 'string') {
    return apiKey ? value.split(apiKey).join('[redacted]') : value;
  }
  if (Array.isArray(value)) {
    return value.map(item => redactProviderData(item, apiKey));
  }
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    /status.?api|api.?key|secret|token/i.test(key)
      ? '[redacted]'
      : redactProviderData(child, apiKey)
  ]));
};

const requireStatusApiPermission = async (req, res, next) => {
  try {
    const user = await User.findOne({
      userId: req.retailer.userId,
      role: 'retailer',
      status: 'Approved'
    }).select('permissions');

    if (!user || !hasStatusApiPermission(user.permissions)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to use Status API.'
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

const validateParameters = (parameters) => {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    return 'Request parameters must be a JSON object.';
  }

  for (const [key, value] of Object.entries(parameters)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/.test(key)) {
      return 'Request parameter names may only contain letters, numbers, underscores, and hyphens.';
    }
    if (key.toLowerCase() === 'apikeyfill') {
      return 'Do not include the provider API key; the server adds it securely.';
    }
    if (!['string', 'number', 'boolean'].includes(typeof value) ||
        (typeof value === 'string' && value.length > 5000)) {
      return `Request parameter "${key}" must be a string, number, or boolean no longer than 5000 characters.`;
    }
  }

  if (Buffer.byteLength(JSON.stringify(parameters), 'utf8') > 16 * 1024) {
    return 'Request parameters exceed the 16 KB limit.';
  }

  return '';
};

router.post('/run', verifyRetailer, requireStatusApiPermission, async (req, res) => {
  const { serviceId, parameters } = req.body || {};
  const normalizedServiceId = String(serviceId || '');
  if (!Object.prototype.hasOwnProperty.call(STATUS_API_SERVICES, normalizedServiceId)) {
    return res.status(400).json({ success: false, message: 'Select one of the available Status APIs.' });
  }
  const service = STATUS_API_SERVICES[normalizedServiceId];

  const parameterError = validateParameters(parameters);
  if (parameterError) {
    return res.status(400).json({ success: false, message: parameterError });
  }

  const apiKey = String(process.env.StatusAPI || '').trim();
  if (!apiKey) {
    return res.status(503).json({ success: false, message: 'Status API is not configured on the server.' });
  }

  try {
    const response = await axios.post(
      service.url,
      qs.stringify({ ...parameters, apikeyfill: apiKey }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20000,
        maxRedirects: 0,
        maxContentLength: 2 * 1024 * 1024,
        maxBodyLength: 16 * 1024
      }
    );

    return res.json({
      success: true,
      service: service.label,
      data: redactProviderData(response.data, apiKey)
    });
  } catch (error) {
    if (error.response) {
      return res.status(502).json({
        success: false,
        message: 'The provider could not complete the Status API request.',
        data: redactProviderData(error.response.data, apiKey)
      });
    }

    console.error('[Status API] Provider request failed:', error.message);
    return res.status(502).json({
      success: false,
      message: 'Could not reach the Status API provider. Please try again.'
    });
  }
});

module.exports = {
  router,
  STATUS_API_SERVICES,
  hasStatusApiPermission,
  validateParameters,
  redactProviderData
};
