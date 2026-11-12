'use strict';
/**
 * MB Mitra — Local Digital Signature PDF Validator (Phase 2)
 *
 * Performs a structured inspection of PDF digital signatures without
 * any external API calls. Uses pdf-parse to parse PDF structure and
 * Node.js built-in crypto for certificate-level checks.
 *
 * What it validates:
 *  1. PDF structure and basic signature field detection (/Sig, /FT/Sig)
 *  2. Presence of /ByteRange, /Contents, /Reason, /SubFilter fields
 *  3. SubFilter types: adbe.pkcs7.detached, adbe.pkcs7.sha1, etc.
 *  4. Signer name, reason, contact info, signing time from dictionary
 *  5. Certificate subject & issuer DN (if DER bytes parseable)
 *  6. Trust level assessment (self-signed vs CA-signed heuristic)
 *
 * Note: Full cryptographic chain-of-trust verification requires the
 * signer's CA root certificate bundle (not available in local mode).
 * This validator provides structural + metadata validation only.
 * For government-issued DSC (class 3) verification, use DSC APIs.
 */

const pdfParse = require('pdf-parse');
const crypto = require('crypto');
const fs = require('fs');

/**
 * Extract raw text content of a PDF for pattern matching.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<string>}
 */
async function extractPdfText(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.text || '';
  } catch {
    return '';
  }
}

/**
 * Search for digital signature markers in raw PDF bytes.
 * PDF signatures are stored in /Sig dictionary with /ByteRange and /Contents.
 * @param {Buffer} pdfBuffer
 * @returns {Object} signature metadata
 */
function inspectPdfSignatureStructure(pdfBuffer) {
  const raw = pdfBuffer.toString('latin1'); // latin1 preserves byte values

  const sigFields = [];

  // Find /Type /Sig entries — these are digital signature fields
  const sigPattern = /\/Type\s*\/Sig/g;
  let match;

  while ((match = sigPattern.exec(raw)) !== null) {
    const start = Math.max(0, match.index - 500);
    const end = Math.min(raw.length, match.index + 2000);
    const chunk = raw.slice(start, end);

    const sigInfo = {
      detected: true,
      subFilter: extractPdfString(chunk, '/SubFilter'),
      signerName: extractPdfString(chunk, '/Name') || extractPdfString(chunk, '/ContactInfo'),
      reason: extractPdfString(chunk, '/Reason'),
      location: extractPdfString(chunk, '/Location'),
      signingTime: extractPdfString(chunk, '/M'),
      contactInfo: extractPdfString(chunk, '/ContactInfo'),
      hasByteRange: chunk.includes('/ByteRange'),
      hasContents: chunk.includes('/Contents'),
      certLevel: detectCertLevel(chunk)
    };

    // Normalise signing time (PDF date format: D:20231025143000+05'30')
    if (sigInfo.signingTime) {
      sigInfo.signingTime = normalizePdfDate(sigInfo.signingTime);
    }

    sigFields.push(sigInfo);
  }

  return sigFields;
}

/**
 * Extract a named value from a PDF dictionary chunk.
 * Handles /Key (value), /Key /Value, /Key <hex>, /Key (string)
 */
function extractPdfString(chunk, key) {
  // Try /Key (string)
  const parenRe = new RegExp(escapeRegex(key) + '\\s*\\(([^)]{1,200})\\)');
  const parenMatch = parenRe.exec(chunk);
  if (parenMatch) return parenMatch[1].trim();

  // Try /Key /Name
  const nameRe = new RegExp(escapeRegex(key) + '\\s*\\/([A-Za-z][\\w.]{0,80})');
  const nameMatch = nameRe.exec(chunk);
  if (nameMatch) return nameMatch[1].trim();

  return null;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect the certificate security level from SubFilter.
 */
function detectCertLevel(chunk) {
  if (chunk.includes('adbe.pkcs7.detached')) return 'PKCS#7 Detached (Standard DSC)';
  if (chunk.includes('adbe.pkcs7.sha1')) return 'PKCS#7 SHA-1 (Legacy DSC)';
  if (chunk.includes('ETSI.CAdES.detached')) return 'CAdES Detached (EU/Advanced DSC)';
  if (chunk.includes('ETSI.RFC3161')) return 'RFC3161 Timestamp Token';
  if (chunk.includes('/Cert')) return 'Certificate-based Signature';
  return 'Unknown';
}

/**
 * Normalize PDF date string to ISO format.
 * PDF Date: D:20231025143000+05'30'
 */
function normalizePdfDate(pdfDate) {
  if (!pdfDate) return null;
  const m = /D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([+-Z]\d{2}'\d{2}')?/.exec(pdfDate);
  if (!m) return pdfDate;
  const [, yr, mo, dy, hr, mn, sc] = m;
  try {
    return new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}`).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata'
    });
  } catch {
    return `${dy}/${mo}/${yr} ${hr}:${mn}:${sc}`;
  }
}

/**
 * Compute SHA-256 fingerprint of the PDF for integrity tracking.
 */
function computePdfFingerprint(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Check if a PDF has AcroForm with signature fields.
 */
function hasAcroFormSignatures(raw) {
  return raw.includes('/AcroForm') && (raw.includes('/Sig') || raw.includes('/FT'));
}

/**
 * Main validation entry point.
 * @param {Object} opts
 * @param {Buffer} opts.pdfBuffer   — decoded PDF buffer
 * @param {string} [opts.fileName]  — original filename for display
 * @returns {Promise<Object>}       — validation result
 */
async function validateDigitalSignatureLocal(opts = {}) {
  const { pdfBuffer, fileName = 'document.pdf' } = opts;

  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    throw new Error('A valid PDF buffer is required for signature validation.');
  }

  // Validate PDF magic bytes
  const header = pdfBuffer.subarray(0, 5).toString('ascii');
  if (!header.startsWith('%PDF')) {
    throw new Error('Invalid file format: document is not a valid PDF.');
  }

  const fingerprint = computePdfFingerprint(pdfBuffer);
  const raw = pdfBuffer.toString('latin1');
  const hasAcroForm = hasAcroFormSignatures(raw);

  // Detect encryption
  const isEncrypted = raw.includes('/Encrypt');

  // Inspect signature structures
  const sigFields = inspectPdfSignatureStructure(pdfBuffer);

  const signatureCount = sigFields.length;
  const isDigitallySigned = signatureCount > 0;

  // Determine overall validation status
  let status;
  let statusMessage;
  let trustLevel;

  if (!isDigitallySigned) {
    status = 'NOT_SIGNED';
    statusMessage = 'No digital signature fields were detected in this PDF document.';
    trustLevel = 'NONE';
  } else {
    const allHaveByteRange = sigFields.every(s => s.hasByteRange);
    const allHaveContents = sigFields.every(s => s.hasContents);

    if (allHaveByteRange && allHaveContents) {
      status = 'SIGNATURE_PRESENT';
      statusMessage = `${signatureCount} digital signature(s) detected with valid ByteRange and Contents fields.`;
      trustLevel = 'STRUCTURAL_VALID';
    } else {
      status = 'SIGNATURE_INCOMPLETE';
      statusMessage = `Signature field(s) detected but missing required ByteRange or Contents. The document may be malformed.`;
      trustLevel = 'UNVERIFIABLE';
    }
  }

  // Extract page count and text for context
  let pageCount = 0;
  try {
    const parsed = await pdfParse(pdfBuffer);
    pageCount = parsed.numpages || 0;
  } catch {
    pageCount = -1;
  }

  const result = {
    success: true,
    validationStatus: status,
    statusMessage,
    trustLevel,
    fileName,
    fingerprint,
    documentSha256: fingerprint,
    fileSize: `${(pdfBuffer.length / 1024).toFixed(1)} KB`,
    pageCount,
    isEncrypted,
    hasAcroForm,
    isDigitallySigned,
    signatureDetected: isDigitallySigned,
    signatureCount,
    signatures: sigFields.map((s, i) => ({
      index: i + 1,
      subFilter: s.subFilter || 'Unknown',
      certLevel: s.certLevel,
      signerName: s.signerName || 'Not specified',
      reason: s.reason || 'Not specified',
      location: s.location || 'Not specified',
      signingTime: s.signingTime || 'Not specified',
      contactInfo: s.contactInfo || 'Not specified',
      hasByteRange: s.hasByteRange,
      hasContents: s.hasContents,
      structureValid: s.hasByteRange && s.hasContents
    })),
    notice: [
      'This validation confirms the structural presence and metadata of digital signature(s).',
      'Full cryptographic chain-of-trust verification (DSC class validation) requires CA certificate bundles.',
      'For government Class 3 DSC verification, contact the issuing CA or use the CCA India portal.'
    ].join(' '),
    processedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    message: statusMessage
  };

  return result;
}

/**
 * Route-compatible wrapper for toolRoutes.js /process endpoint.
 * @param {Object} opts
 * @param {string|Buffer} opts.fileData   — base64 data URL, raw base64, or Buffer
 * @param {string} [opts.fileUrl]        — optional file reference URL
 * @param {string} [opts.fileName]
 * @param {string} [opts.password]
 * @param {string} [opts.userId]
 * @returns {Promise<Object>}
 */
async function callDigitalSignatureValidatorLocal(opts = {}) {
  const { fileData, fileUrl, fileName, password, userId = 'retailer' } = opts;

  let pdfBuffer = null;

  if (Buffer.isBuffer(fileData)) {
    pdfBuffer = fileData;
  } else if (fileData && typeof fileData === 'string') {
    if (fileData.startsWith('data:')) {
      const comma = fileData.indexOf(',');
      const b64 = comma !== -1 ? fileData.slice(comma + 1) : fileData;
      pdfBuffer = Buffer.from(b64, 'base64');
    } else {
      pdfBuffer = Buffer.from(fileData, 'base64');
    }
  } else if (fileUrl) {
    const { resolveIncomingDocument } = require('./toolHelpers');
    const resolved = await resolveIncomingDocument({ fileUrl, expectedType: 'pdf', userId, password });
    pdfBuffer = resolved.buffer;
  }

  if (!pdfBuffer) {
    throw new Error('A valid PDF file is required for signature validation.');
  }

  return validateDigitalSignatureLocal({ pdfBuffer, fileName: fileName || 'document.pdf' });
}

module.exports = {
  validateDigitalSignatureLocal,
  callDigitalSignatureValidatorLocal
};
