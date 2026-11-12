'use strict';
/**
 * MB Mitra — Local Image Enhancer (Phase 2 & 3)
 * Calls local_image_enhancer.py (CLAHE + Unsharp Mask) via portable child process.
 * No external API calls. No user data leaves the server.
 * 
 * Input: image buffer (PNG/JPG/WebP)
 * Output: enhanced image buffer (PNG by default)
 */

const path = require('path');
const fs = require('fs');
const { saveTempOutput, runPythonWorker, resolveOutputDimensions } = require('./toolHelpers');

const PY_SCRIPT = path.join(__dirname, 'local_image_enhancer.py');

/**
 * Enhance an image buffer using local CLAHE + unsharp masking pipeline.
 * @param {Buffer} imageBuffer   — raw image bytes
 * @param {Object} options       — { level: 'standard'|'advanced', format: 'png'|'jpg' }
 * @param {string} userId        — requesting user ID
 * @returns {Promise<Object>}
 */
async function enhanceImageLocal(imageBuffer, options = {}, userId = 'retailer') {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    throw new Error('A valid image buffer is required for enhancement.');
  }

  // Handle options if second arg is userId (for backward compatibility)
  let user = userId;
  let opts = options;
  if (typeof options === 'string') {
    user = options;
    opts = { level: options };
  }

  const level = (opts.level || opts.enhanceLevel || 'standard').toLowerCase();
  const resolvedDim = resolveOutputDimensions(opts.settings || opts, opts.preset);
  const fmt = (opts.format || opts.outputFormat || opts.settings?.format || 'png').toLowerCase();
  const extension = (fmt === 'jpg' || fmt === 'jpeg') ? 'jpg' : 'png';

  const env = {
    ENHANCE_LEVEL: level === 'advanced' ? 'advanced' : 'standard',
    ENHANCE_FORMAT: extension,
    OUTPUT_DPI: String(resolvedDim.dpi)
  };

  const effectiveUpscale = opts.upscaleFactor || opts.upscale || opts.settings?.upscaleFactor || opts.settings?.upscale;
  if (effectiveUpscale) {
    env.UPSCALE_FACTOR = String(effectiveUpscale);
  }

  const effectiveBrightness = opts.brightness || opts.settings?.brightness;
  if (effectiveBrightness) env.BRIGHTNESS = String(effectiveBrightness);

  const effectiveContrast = opts.contrast || opts.settings?.contrast;
  if (effectiveContrast) env.CONTRAST = String(effectiveContrast);

  const effectiveSharpness = opts.sharpness || opts.settings?.sharpness;
  if (effectiveSharpness) env.SHARPNESS = String(effectiveSharpness);

  const presetKey = (opts.preset || opts.settings?.preset || '').toLowerCase();
  const isExplicitPhotoPreset = presetKey.includes('passport') || presetKey.includes('square') || presetKey.includes('portrait') || presetKey.includes('pan_card_photo');
  const isExplicitCustomDim = Boolean(opts.settings && (opts.settings.isCustomDimensions || opts.settings.isCustomCrop || opts.targetWidth || opts.targetHeight));

  if (isExplicitPhotoPreset || isExplicitCustomDim) {
    env.TARGET_WIDTH_PX = String(resolvedDim.widthPx);
    env.TARGET_HEIGHT_PX = String(resolvedDim.heightPx);
  }

  const outBuffer = await runPythonWorker(PY_SCRIPT, imageBuffer, {
    env,
    timeoutMs: 60000,
    maxBuffer: 50 * 1024 * 1024,
    description: 'Image enhancer'
  });

  if (!outBuffer || outBuffer.length < 8) {
    throw new Error('Image enhancement produced no output.');
  }

  const saved = saveTempOutput(outBuffer, extension, 'enhanced_image', user);

  return {
    success: true,
    buffer: outBuffer,
    fileUrl: saved.fileUrl,
    relativeUrl: saved.relativeUrl,
    downloadToken: saved.downloadToken,
    fileName: saved.fileName,
    enhanced_image_url: saved.fileUrl,
    dimensions: {
      widthMm: resolvedDim.widthMm,
      heightMm: resolvedDim.heightMm,
      dpi: resolvedDim.dpi,
      widthPx: resolvedDim.widthPx,
      heightPx: resolvedDim.heightPx
    },
    message: 'Image enhanced successfully using local CLAHE + sharpening pipeline.'
  };
}

/**
 * Parse incoming image from base64/buffer/fileUrl and run enhancement.
 * Compatible with toolRoutes.js /process interface.
 * 
 * @param {Object} opts
 * @param {string|Buffer} opts.fileData — base64 data URL, raw base64, or Buffer
 * @param {string} [opts.fileUrl]       — optional file reference URL
 * @param {string} [opts.level]          — 'standard' (default) or 'advanced'
 * @param {string} [opts.format]         — 'png' (default) or 'jpg'
 * @param {string} [opts.userId]
 * @returns {Promise<Object>}
 */
async function callImageEnhancerLocal(opts = {}) {
  const { fileData, fileUrl, level, format, settings, preset, upscaleFactor, brightness, contrast, sharpness, userId = 'retailer' } = opts;

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
    throw new Error('A valid image file is required for enhancement.');
  }

  return enhanceImageLocal(imageBuffer, { level, format, settings, preset, upscaleFactor, brightness, contrast, sharpness }, userId);
}

module.exports = {
  enhanceImageLocal,
  callImageEnhancerLocal
};
