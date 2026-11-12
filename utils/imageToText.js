'use strict';
/**
 * MB Mitra — Image to Text Converter (OCR)
 * Fully local text extraction using EasyOCR and pytesseract fallback.
 * No external API dependencies. No external data transmission.
 */

const {
  callImageToTextLocal,
  extractTextLocal
} = require('./localOcr');
const { parseIncomingImage } = require('./toolHelpers');

/**
 * Call Image to Text AI (Local)
 * @param {Object} options - { fileData, file_url, image_url, extraLangs }
 * @returns {Promise<Object>} Extracted text
 */
async function callImageToTextAi(options = {}) {
  const {
    fileData,
    file_url,
    image_url,
    extraLangs,
    extra_langs
  } = options;

  const inputData = fileData || file_url || image_url;
  if (!inputData) {
    throw new Error('A file_url, image_url, or fileData is required for Image to Text');
  }

  const langs = extraLangs || extra_langs || '';

  if (typeof inputData === 'string' && (inputData.startsWith('data:') || !inputData.startsWith('http'))) {
    return callImageToTextLocal({
      fileData: inputData,
      extraLangs: langs
    });
  }

  const imageBuffer = await parseIncomingImage(inputData);
  const text = await extractTextLocal(imageBuffer, { extraLangs: langs });
  return {
    success: true,
    text,
    extracted_text: text
  };
}

module.exports = {
  callImageToTextAi,
  callImageToTextLocal,
  extractTextLocal
};
