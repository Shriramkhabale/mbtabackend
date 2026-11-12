'use strict';
/**
 * MB Mitra — Digital Signature PDF Validation AI Tool
 * Fully local structural and cryptographic inspection of PDF digital signatures.
 * No external API dependencies. No external data transmission.
 */

const {
  validatePdfDigitalSignatureLocal,
  callDigitalSignatureValidatorLocal
} = require('./localDigitalSignatureValidator');
const { parseIncomingPdf } = require('./toolHelpers');

/**
 * Call Digital Signature PDF Validation AI (Local)
 * @param {Object} options - { fileData, file_url, fileName, password }
 * @returns {Promise<Object>} Verification details
 */
async function callDigitalSignatureValidationAi(options = {}) {
  const {
    fileData,
    file_url,
    fileName = 'document.pdf',
    password = '',
    pdfPassword = ''
  } = options;

  const inputData = fileData || file_url;
  if (!inputData) {
    throw new Error('file_url or fileData is required for Digital Signature PDF Validation');
  }

  return callDigitalSignatureValidatorLocal({
    fileData: inputData,
    fileName,
    password: password || pdfPassword
  });
}

module.exports = {
  callDigitalSignatureValidationAi,
  callDigitalSignatureValidatorLocal,
  validatePdfDigitalSignatureLocal
};
