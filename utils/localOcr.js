'use strict';
/**
 * MB Mitra — Local OCR: Image to Text Converter (Phase 2)
 * Calls local_ocr.py (EasyOCR / pytesseract) via portable child process.
 * No external API calls. No user data leaves the server.
 * 
 * Input: image buffer (PNG/JPG/WebP)
 * Output: extracted text string
 */

const path = require('path');
const fs = require('fs');
const { runPythonWorker } = require('./toolHelpers');

const PY_SCRIPT = path.join(__dirname, 'local_ocr.py');

/**
 * Extract text from an image buffer using local OCR.
 * @param {Buffer} imageBuffer  — raw image bytes
 * @param {Object} options      — { extraLangs: 'ta,te', languages: 'en,hi', preprocess: 'high_contrast' }
 * @returns {Promise<string>}   — extracted text
 */
async function extractTextLocal(imageBuffer, options = {}) {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    throw new Error('A valid image buffer is required for OCR.');
  }

  const env = {};
  if (options.languages) {
    const langStr = Array.isArray(options.languages) ? options.languages.join(',') : String(options.languages);
    env.OCR_LANGS = langStr;
  }
  if (options.extraLangs) {
    env.OCR_EXTRA_LANGS = options.extraLangs;
  }
  if (options.preprocess) {
    env.OCR_PREPROCESS = options.preprocess;
  }

  const rawOut = await runPythonWorker(PY_SCRIPT, imageBuffer, {
    env,
    timeoutMs: 120000, // OCR deep models need up to 120s on CPU
    maxBuffer: 10 * 1024 * 1024,
    description: 'OCR engine'
  });

  const text = rawOut.toString('utf8').trim();

  if (!text) {
    throw new Error('No readable text was detected in the image. Please ensure the image is clear and well-lit.');
  }

  return text;
}

/**
 * Parse incoming image from base64/buffer/fileUrl and run OCR.
 * Compatible with the /process route interface in toolRoutes.js.
 * 
 * @param {Object} opts
 * @param {string|Buffer}  opts.fileData    — base64 data URL, raw base64, or Buffer
 * @param {string}         [opts.fileUrl]    — optional file reference URL
 * @param {string}         [opts.extraLangs] — extra EasyOCR/Tesseract lang codes
 * @param {string|Array}   [opts.languages]  — custom language list e.g. 'en,hi'
 * @param {string}         [opts.preprocess] — 'standard' | 'high_contrast' | 'grayscale'
 * @returns {Promise<{ success: true, text: string }>}
 */
async function callImageToTextLocal(opts = {}) {
  const { fileData, fileUrl, extraLangs, languages, preprocess } = opts;

  let imageBuffer = null;

  if (Buffer.isBuffer(fileData)) {
    imageBuffer = fileData;
  } else if (fileData && typeof fileData === 'string') {
    if (fileData.startsWith('data:')) {
      const comma = fileData.indexOf(',');
      const b64 = comma !== -1 ? fileData.slice(comma + 1) : fileData;
      imageBuffer = Buffer.from(b64, 'base64');
    } else {
      imageBuffer = Buffer.from(fileData, 'base64');
    }
  } else if (fileUrl) {
    const { resolveIncomingDocument } = require('./toolHelpers');
    const resolved = await resolveIncomingDocument({ fileUrl, expectedType: 'image' });
    imageBuffer = resolved.buffer;
  }

  if (!imageBuffer) {
    throw new Error('A valid image file is required for text extraction.');
  }

  const text = await extractTextLocal(imageBuffer, { extraLangs, languages, preprocess });

  return {
    success: true,
    text,
    extracted_text: text,
    message: 'Text extracted successfully using local OCR engine.'
  };
}

module.exports = {
  extractTextLocal,
  callImageToTextLocal
};
