'use strict';
/**
 * MB Mitra — Local Auto ID Card Crop (Phase 2)
 * Calls local_auto_crop.py (OpenCV) via portable child process.
 * No external API calls. No user data leaves the server.
 * 
 * Supports: Aadhaar, PAN, Voter ID, Ration Card, PMJAY, Driving Licence
 * Input: image buffer (PNG/JPG/WebP)
 * Output: cropped PNG of the ID card
 */

const path = require('path');
const fs = require('fs');
const { saveTempOutput, runPythonWorker, resolveOutputDimensions } = require('./toolHelpers');

const PY_SCRIPT = path.join(__dirname, 'local_auto_crop.py');

// Supported crop type aliases
const CROP_TYPE_MAP = {
  'aadhaar': 'aadhaar',
  'aadhar': 'aadhaar',
  'pan': 'pan',
  'voter': 'voter',
  'epic': 'voter',
  'ration': 'ration',
  'pmjay': 'pmjay',
  'ayushman': 'pmjay',
  'driving': 'driving',
  'dl': 'driving',
  'generic': 'generic'
};

/**
 * Crop an ID card from an image buffer.
 * @param {Buffer} imageBuffer  — raw image bytes (PNG/JPG)
 * @param {Object} options      — { cropType: 'aadhaar', paddingPct: 0.015 }
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function cropCardLocal(imageBuffer, options = {}, userId = 'retailer') {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    throw new Error('A valid image buffer is required for auto-cropping.');
  }

  const rawCropType = (options.cropType || options.croptype || 'generic').toLowerCase();
  const cropType = CROP_TYPE_MAP[rawCropType] || 'generic';
  const paddingPct = parseFloat(options.paddingPct || options.padding_pct || 0.015);
  const resolvedDim = resolveOutputDimensions(options.settings || options, options.preset);

  const env = {
    CROP_TYPE: cropType,
    CROP_PADDING_PCT: String(paddingPct),
    OUTPUT_DPI: String(resolvedDim.dpi)
  };

  if (options.settings && (options.settings.widthMm || options.settings.width_mm)) {
    env.TARGET_WIDTH_PX = String(resolvedDim.widthPx);
    env.TARGET_HEIGHT_PX = String(resolvedDim.heightPx);
  }

  if (options.format || options.settings?.format) {
    env.OUTPUT_FORMAT = String(options.format || options.settings?.format).toUpperCase();
  }

  const pngBuffer = await runPythonWorker(PY_SCRIPT, imageBuffer, {
    env,
    timeoutMs: 45000,
    maxBuffer: 50 * 1024 * 1024,
    description: 'Auto-crop'
  });

  if (!pngBuffer || pngBuffer.length < 8) {
    throw new Error('Auto-crop produced no output. The image may not contain a detectable ID card.');
  }

  const outputExt = (options.format || options.settings?.format || 'png').toLowerCase().replace('jpeg', 'jpg');
  const saved = saveTempOutput(pngBuffer, outputExt, `id_crop_${cropType}`, userId);

  return {
    success: true,
    pngBuffer,
    cropType,
    fileUrl: saved.fileUrl,
    relativeUrl: saved.relativeUrl,
    downloadToken: saved.downloadToken,
    fileName: saved.fileName,
    dimensions: {
      widthMm: resolvedDim.widthMm,
      heightMm: resolvedDim.heightMm,
      dpi: resolvedDim.dpi,
      widthPx: resolvedDim.widthPx,
      heightPx: resolvedDim.heightPx
    },
    message: `ID card detected and cropped successfully (type: ${cropType}).`
  };
}

/**
 * Parse incoming image from base64/buffer/fileUrl and run auto-crop.
 * Compatible with toolRoutes.js /process interface.
 * 
 * @param {Object} opts
 * @param {string|Buffer} opts.fileData   — base64 data URL, raw base64, or Buffer
 * @param {string} [opts.fileUrl]        — optional file reference URL
 * @param {string} [opts.croptype]       — aadhaar, pan, voter, ration, pmjay, generic
 * @param {string} [opts.userId]
 * @returns {Promise<Object>}
 */
async function callIdentityCardAutoCropLocal(opts = {}) {
  const { fileData, fileUrl, croptype, cropType, settings, preset, format, userId = 'retailer' } = opts;

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
    const resolved = await resolveIncomingDocument({ fileUrl, expectedType: 'image', userId });
    imageBuffer = resolved.buffer;
  }

  if (!imageBuffer) {
    throw new Error('A valid image file is required for ID card auto-crop.');
  }

  return cropCardLocal(imageBuffer, { cropType: croptype || cropType || 'generic', settings, preset, format }, userId);
}

module.exports = {
  cropCardLocal,
  callIdentityCardAutoCropLocal
};
