const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const router = express.Router();
const User = require('../models/User');
const PanCardApplication = require('../models/PanCardApplication');
const EtdsTransaction = require('../models/EtdsTransaction');
const WalletTransaction = require('../models/WalletTransaction');
const verifyRetailer = require('../middleware/verifyRetailer');

const AUTH_CODE_URL = 'https://emsapi.ieiletds.com/api/v1/Auth/GetAuthCode';
const AUTHORIZER_URL = 'https://www.idmsonline.in/ETDS/Auth/Authorizernew.aspx';
const CALLBACK_RATE_WINDOW_MS = 60 * 1000;
const CALLBACK_RATE_LIMIT = 60;
const callbackRequests = new Map();
const callbackFormParser = express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 5 });
const jsonParser = express.json({ limit: '32kb' });

const getEtdsConfig = () => ({
  clientId: process.env.Client_ID,
  clientSecret: process.env.Client_Secret,
  aesKey: process.env.Key,
  agentId: process.env.Agent_ID,
  subagentId: process.env.subagent_ID,
  scope: process.env.ETDS_SCOPE || process.env.SCOPE,
  redirectUrl: process.env.ETDS_REDIRECT_URL,
  frontendResultUrl: process.env.ETDS_FRONTEND_RESULT_URL
});

const getMissingConfig = (config) => Object.entries({
  Client_ID: config.clientId,
  Client_Secret: config.clientSecret,
  Key: config.aesKey,
  Agent_ID: config.agentId,
  subagent_ID: config.subagentId,
  ETDS_SCOPE: config.scope,
  ETDS_REDIRECT_URL: config.redirectUrl,
  ETDS_FRONTEND_RESULT_URL: config.frontendResultUrl
}).filter(([, value]) => !String(value || '').trim()).map(([name]) => name);

const validateHttpsUrl = (value, requiredPath) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !/paysprint/i.test(url.hostname + url.pathname) &&
      (!requiredPath || url.pathname.replace(/\/$/, '') === requiredPath);
  } catch {
    return false;
  }
};

const isLiveMode = () => /^(live|production|prod)$/i.test(String(process.env.ENVIRONMENT || '').trim()) ||
  String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

const validateLiveEtdsConfig = () => {
  if (!isLiveMode()) return;

  const config = getEtdsConfig();
  const missing = getMissingConfig(config);
  if (!validateHttpsUrl(config.redirectUrl, '/api/etds/callback')) {
    missing.push('ETDS_REDIRECT_URL (must be HTTPS and point to /api/etds/callback, not PaySprint)');
  }
  if (!validateHttpsUrl(config.frontendResultUrl, '/etds-result')) {
    missing.push('ETDS_FRONTEND_RESULT_URL (must be HTTPS and point to /etds-result)');
  }
  if (Buffer.byteLength(String(config.aesKey || ''), 'utf8') !== 32) {
    missing.push('Key (must be exactly 32 UTF-8 bytes for AES-256)');
  }
  if (!process.env.JWT_KEY) missing.push('JWT_KEY');

  if (missing.length) {
    throw new Error(`ETDS live configuration is incomplete: ${[...new Set(missing)].join(', ')}`);
  }
};

const encodeUrlSafe = (buffer) => buffer
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const decodeUrlSafe = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized + '='.repeat((4 - normalized.length % 4) % 4), 'base64');
};

const encryptProviderValue = (value, aesKey) => {
  const iv = Buffer.from('0000000000000000', 'utf8');
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(aesKey, 'utf8'), iv);
  return encodeUrlSafe(Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]));
};

const decryptCallbackPayload = (value, aesKey) => {
  const encrypted = decodeUrlSafe(value);
  if (!encrypted.length || encrypted.length % 16 !== 0) {
    throw new Error('Invalid ETDS callback ciphertext.');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(aesKey, 'utf8'),
    Buffer.from('0000000000000000', 'utf8')
  );
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

const postForAuthCode = (clientId, clientSecret) => new Promise((resolve, reject) => {
  const target = new URL(AUTH_CODE_URL);
  const request = require('https').request(target, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': '0'
    },
    timeout: 15000
  }, (response) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', chunk => {
      body += chunk;
      if (body.length > 64 * 1024) request.destroy(new Error('ETDS authentication response exceeded the size limit.'));
    });
    response.on('end', () => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return reject(new Error(`ETDS authentication request failed with HTTP ${response.statusCode}.`));
      }
      try {
        const data = JSON.parse(body);
        const status = String(data.Status || data.StatusCode || '').toUpperCase();
        if ((status === 'SUCCESS' || status === '200') && data.AuthCode) {
          return resolve(String(data.AuthCode));
        }
        // Log full response for debugging
        console.error('[ETDS auth] Provider response:', body);
        return reject(new Error(data.Message || data.message || `ETDS provider did not return an authentication code. Response: ${body.slice(0, 200)}`));
      } catch (error) {
        console.error('[ETDS auth] Raw response:', body);
        reject(new Error(`ETDS authentication response was invalid: ${error.message}. Raw: ${body.slice(0, 200)}`));
      }
    });
  });

  request.on('timeout', () => request.destroy(new Error('ETDS authentication request timed out.')));
  request.on('error', reject);
  request.end();
});

const safeStatusFromPayload = (payload) => {
  const values = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    Object.entries(value).forEach(([key, child]) => {
      if (/^(status|statuscode|applicationstatus|requeststatus)$/i.test(key) && typeof child === 'string') {
        values.push(child.trim().toLowerCase().replace(/[\s_-]/g, ''));
      } else if (child && typeof child === 'object') {
        visit(child);
      }
    });
  };
  visit(payload);
  if (values.some(value => ['success', 'successful', 'completed', 'approved', '200'].includes(value))) return 'success';
  if (values.some(value => ['failed', 'failure', 'rejected', 'error', '405'].includes(value))) return 'failed';
  if (values.some(value => ['pending', 'inprogress', 'processing'].includes(value))) return 'pending';
  return 'unknown';
};

const callbackRedirect = (status, publicRef) => {
  const target = new URL(getEtdsConfig().frontendResultUrl);
  if (publicRef) target.searchParams.set('ref', publicRef);
  else target.searchParams.set('error', 'callback_failed');
  return target.toString();
};

const applyCallbackRateLimit = (req, res, next) => {
  const now = Date.now();
  const key = req.socket.remoteAddress || 'unknown';
  const entry = callbackRequests.get(key);
  if (!entry || now - entry.startedAt >= CALLBACK_RATE_WINDOW_MS) {
    callbackRequests.set(key, { startedAt: now, count: 1 });
    return next();
  }
  if (entry.count >= CALLBACK_RATE_LIMIT) {
    return res.status(429).type('text/plain').send('Too many callback requests.');
  }
  entry.count += 1;
  if (callbackRequests.size > 10000) {
    for (const [remoteAddress, requestInfo] of callbackRequests) {
      if (now - requestInfo.startedAt >= CALLBACK_RATE_WINDOW_MS) callbackRequests.delete(remoteAddress);
    }
  }
  return next();
};

const respondWithCallbackRedirect = (res, status, publicRef, startedAt) => {
  const elapsedMs = Date.now() - startedAt;
  console.info(`[ETDS callback] ref=${publicRef || 'none'} status=${status} elapsedMs=${elapsedMs}`);
  return res.redirect(303, callbackRedirect(status, publicRef));
};

const retailerCors = (req, res, next) => {
  const resultUrl = process.env.ETDS_FRONTEND_RESULT_URL;
  let allowedOrigin;
  try {
    allowedOrigin = resultUrl ? new URL(resultUrl).origin : null;
  } catch {
    allowedOrigin = null;
  }
  return cors({
    origin: (origin, callback) => callback(null, Boolean(origin && origin === allowedOrigin)),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type']
  })(req, res, next);
};

const correctionFormFee = () => {
  const configPath = path.join(__dirname, '..', 'panTabsConfig.json');
  const tabs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const correctionTab = tabs.find(tab => tab.id === 'epan_correction_otp');
  return Number(correctionTab && correctionTab.fee) || 107;
};

router.options('/start', (req, res, next) => retailerCors(req, res, next));

router.post('/start', (req, res, next) => retailerCors(req, res, next), jsonParser, verifyRetailer, async (req, res) => {
  const config = getEtdsConfig();
  const missing = getMissingConfig(config);
  if (missing.length || !validateHttpsUrl(config.redirectUrl, '/api/etds/callback') ||
      !validateHttpsUrl(config.frontendResultUrl, '/etds-result') ||
      Buffer.byteLength(String(config.aesKey || ''), 'utf8') !== 32) {
    return res.status(503).json({
      success: false,
      message: 'The PAN correction provider is not fully configured. No provider request was sent and no wallet fee was deducted.'
    });
  }

  const input = req.body || {};
  const title = String(input.title || '').trim();
  const firstName = String(input.firstName || '').trim();
  const middleName = String(input.middleName || '').trim();
  const lastName = String(input.lastName || '').trim();
  const panNumber = String(input.panNumber || '').trim().toUpperCase();
  const dob = String(input.dob || '').trim();
  const mobileNumber = String(input.mobileNumber || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const nameFields = { firstName, middleName, lastName };
  const missingFields = Object.entries({
    title,
    firstName,
    lastName,
    panNumber,
    dob,
    mobileNumber,
    email
  }).filter(([, value]) => !value).map(([name]) => name);

  if (missingFields.length) {
    return res.status(400).json({ success: false, message: `Required fields are missing: ${missingFields.join(', ')}.` });
  }
  if (!['1', '2', '3'].includes(title)) {
    return res.status(400).json({ success: false, message: 'Please select a valid title.' });
  }
  if (Object.values(nameFields).some(value => value.length > 25)) {
    return res.status(400).json({ success: false, message: 'Name fields cannot exceed 25 characters.' });
  }
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid PAN number.' });
  }
  const dobParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!dobParts) return res.status(400).json({ success: false, message: 'Please provide a valid date of birth.' });
  const date = new Date(Date.UTC(Number(dobParts[1]), Number(dobParts[2]) - 1, Number(dobParts[3])));
  if (date.getUTCFullYear() !== Number(dobParts[1]) ||
      date.getUTCMonth() !== Number(dobParts[2]) - 1 ||
      date.getUTCDate() !== Number(dobParts[3])) {
    return res.status(400).json({ success: false, message: 'Please provide a valid date of birth.' });
  }
  if (!/^\d{10}$/.test(mobileNumber)) {
    return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits.' });
  }
  if (email.length > 75 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address (maximum 75 characters).' });
  }

  const [year, month, day] = dobParts.slice(1);
  const providerDob = `${day}/${month}/${year}`;
  const feeAmount = correctionFormFee();
  let user;
  let authCode;
  try {
    user = await User.findOne({ userId: req.retailer.userId, role: 'retailer', status: 'Approved' });
    if (!user) return res.status(403).json({ success: false, message: 'An approved retailer account is required.' });
    if (user.walletBalance < feeAmount) {
      return res.status(400).json({ success: false, message: `Insufficient wallet balance. Fee ₹${feeAmount} required.` });
    }
    authCode = await postForAuthCode(config.clientId, config.clientSecret);
  } catch (error) {
    console.error('[ETDS start] Provider preparation failed:', error.message);
    return res.status(502).json({
      success: false,
      message: `Could not prepare the PAN provider request: ${error.message}`
    });
  }

  const transactionId = `${Date.now().toString().slice(-7)}${crypto.randomInt(0, 1000).toString().padStart(3, '0')}`;
  const publicRef = crypto.randomUUID();
  const acknowledgementNumber = `MBM${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${crypto.randomInt(10000, 100000)}`;
  const providerToken = encryptProviderValue(
    Buffer.from(`${config.clientId}:${authCode}`, 'utf8').toString('base64'),
    config.aesKey
  );
  const providerPayload = {
    transaction: {
      tid: transactionId,
      agentid: config.agentId,
      subagentid: config.subagentId,
      scope: config.scope,
      redirecturl: config.redirectUrl,
      title,
      lastname: lastName,
      firstname: firstName,
      middlename: middleName,
      dateofbirth: providerDob,
      mobileno: mobileNumber,
      emailid: email,
      pan: panNumber
    }
  };
  const encryptedPayload = encryptProviderValue(JSON.stringify(providerPayload), config.aesKey);
  const providerForm = {
    token: providerToken,
    payload: encryptedPayload,
    authkey: config.agentId
  };

  let application;
  let etdsTransaction;
  let walletTransaction;
  let balanceDebited = false;
  try {
    application = new PanCardApplication({
      userId: user.userId,
      applicationType: 'E-PAN Correction',
      applicantName: [firstName, middleName, lastName].filter(Boolean).join(' '),
      dob,
      gender: 'N/A',
      mobileNumber,
      email,
      panNumber,
      feeAmount,
      ackNumber: acknowledgementNumber,
      status: 'Submitted',
      details: {
        title,
        firstName,
        middleName,
        lastName,
        firstname: firstName,
        middlename: middleName,
        lastname: lastName,
        pan: panNumber,
        dateofbirth: providerDob,
        mobileno: mobileNumber,
        emailid: email
      }
    });
    await application.save();

    etdsTransaction = new EtdsTransaction({
      public_ref: publicRef,
      tid: transactionId,
      userId: user.userId,
      applicationId: application._id,
      serviceType: 'E-PAN Correction',
      status: 'initiated'
    });
    await etdsTransaction.save();

    const balanceBefore = user.walletBalance;
    user.walletBalance -= feeAmount;
    await user.save();
    balanceDebited = true;

    walletTransaction = new WalletTransaction({
      userId: user.userId,
      transactionType: 'Debit',
      amount: feeAmount,
      balanceBefore,
      balanceAfter: user.walletBalance,
      description: `PAN Application Fee - E-PAN Correction (Ack: ${acknowledgementNumber})`,
      referenceNumber: acknowledgementNumber,
      status: 'Success'
    });
    await walletTransaction.save();
  } catch (error) {
    if (walletTransaction) await WalletTransaction.deleteOne({ _id: walletTransaction._id });
    if (etdsTransaction) await EtdsTransaction.deleteOne({ _id: etdsTransaction._id });
    if (application) await PanCardApplication.deleteOne({ _id: application._id });
    if (balanceDebited) {
      user.walletBalance += feeAmount;
      await user.save();
    }
    console.error('[ETDS start] Could not save provider transaction:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Could not save the PAN correction request. No provider request was sent.'
    });
  }

  return res.status(201).json({
    success: true,
    actionUrl: AUTHORIZER_URL,
    providerForm
  });
});

router.options('/result/:ref', retailerCors);
router.get('/result/:ref', retailerCors, verifyRetailer, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.ref)) {
    return res.status(404).json({ success: false, message: 'Transaction not found.' });
  }
  try {
    const transaction = await EtdsTransaction.findOne({
      public_ref: req.params.ref,
      userId: req.retailer.userId
    }).select('public_ref userId serviceType status createdAt updatedAt');

    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found.' });

    const messages = {
      initiated: 'Your request was submitted and is waiting for the provider.',
      pending: 'The provider is processing your request. Check again shortly.',
      success: 'The provider has completed your request.',
      failed: 'The provider could not complete your request. Contact support for assistance.',
      unknown: 'The provider response is being reviewed. Contact support if this message continues.'
    };
    return res.json({
      status: transaction.status,
      serviceType: transaction.serviceType,
      message: messages[transaction.status] || messages.unknown,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt
    });
  } catch (error) {
    console.error('[ETDS result] Failed to load transaction status:', error.message);
    return res.status(500).json({ success: false, message: 'Could not load the transaction status.' });
  }
});

router.post('/callback', applyCallbackRateLimit, (req, res, next) => {
  if (!req.is('application/x-www-form-urlencoded')) {
    return res.status(415).type('text/plain').send('Unsupported callback content type.');
  }
  callbackFormParser(req, res, (error) => {
    if (!error) return next();
    const status = error.status === 413 ? 413 : 400;
    return res.status(status).type('text/plain').send(status === 413 ? 'Callback request is too large.' : 'Invalid callback request.');
  });
}, async (req, res) => {
  const startedAt = Date.now();
  const config = getEtdsConfig();
  let callbackData;
  try {
    if (typeof req.body?.resdata === 'string') callbackData = JSON.parse(req.body.resdata);
    else if (req.body?.resdata && typeof req.body.resdata === 'object') callbackData = req.body.resdata;
  } catch {
    return respondWithCallbackRedirect(res, 'unmatched', null, startedAt);
  }

  const tid = String(callbackData?.AgentTid || '');
  const authkey = String(callbackData?.authkey || '');
  if (!/^\d{1,10}$/.test(tid) || authkey !== String(config.agentId || '')) {
    return respondWithCallbackRedirect(res, 'unmatched', null, startedAt);
  }

  let transaction;
  try {
    transaction = await EtdsTransaction.findOne({ tid });
  } catch {
    return respondWithCallbackRedirect(res, 'unmatched', null, startedAt);
  }
  if (!transaction) return respondWithCallbackRedirect(res, 'unmatched', null, startedAt);

  let callbackStatus = 'pending';
  try {
    const plaintext = decryptCallbackPayload(callbackData.payload, config.aesKey);
    const decodedPayload = JSON.parse(plaintext);
    callbackStatus = safeStatusFromPayload(decodedPayload);
  } catch {
    callbackStatus = 'pending';
  }

  try {
    if (transaction.status === 'initiated' || transaction.status === 'pending') {
      transaction.status = callbackStatus;
      await transaction.save();

      const applicationStatus = callbackStatus === 'success'
        ? 'Completed'
        : callbackStatus === 'failed'
          ? 'Rejected'
          : 'In Progress';
      await PanCardApplication.findByIdAndUpdate(transaction.applicationId, { status: applicationStatus });
    }
    return respondWithCallbackRedirect(res, transaction.status, transaction.public_ref, startedAt);
  } catch {
    return respondWithCallbackRedirect(res, 'pending', transaction.public_ref, startedAt);
  }
});

// GET /api/etds/ping-provider — temporary diagnostic only, remove after testing
router.get('/ping-provider', async (req, res) => {
  const config = getEtdsConfig();
  const missing = getMissingConfig(config);
  if (missing.length) {
    return res.json({ success: false, stage: 'config', missing });
  }
  try {
    const authCode = await postForAuthCode(config.clientId, config.clientSecret);
    return res.json({ success: true, stage: 'auth_ok', authCode: authCode.slice(0, 8) + '...' });
  } catch (err) {
    return res.json({ success: false, stage: 'auth_failed', error: err.message });
  }
});

module.exports = { router, validateLiveEtdsConfig };
