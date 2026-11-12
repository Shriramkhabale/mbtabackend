'use strict';
/**
 * MB Mitra — Local Background Remover (Phase 2 & 3)
 * Calls local_bg_remover.py via portable child process.
 * No external API calls. No user data leaves the server.
 * 
 * Input: image buffer (PNG/JPG/WebP)
 * Output: { pngBuffer: Buffer } with transparent background
 */

const path = require('path');
const fs = require('fs');
const { saveTempOutput, runPythonWorker, resolveOutputDimensions } = require('./toolHelpers');

const PY_SCRIPT = path.join(__dirname, 'local_bg_remover.py');

/**
 * Remove background from an image buffer using local AI (rembg/GrabCut).
 * @param {Buffer} imageBuffer  — raw image bytes
 * @param {string} userId       — requesting user ID for file ownership
 * @returns {Promise<{ success: true, pngBuffer: Buffer, fileUrl: string, downloadToken: string, fileName: string }>}
 */
async function removeBackgroundLocal(imageBuffer, options = {}, userId = 'retailer') {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    throw new Error('A valid image buffer is required for background removal.');
  }

  // Handle options if second arg is userId (for backward compatibility)
  let user = userId;
  let opts = options;
  if (typeof options === 'string') {
    user = options;
    opts = {};
  }

  const resolvedDim = resolveOutputDimensions(opts.settings || opts, opts.preset);
  const bgColor = (opts.bgColor || opts.settings?.bgColor || opts.background || opts.bg_color || 'transparent').toLowerCase();
  const model = opts.model || opts.settings?.model || opts.rembgModel || 'u2net_human_seg';
  const format = (opts.format || opts.settings?.format || 'png').toLowerCase();
  const outputExt = (format === 'jpg' || format === 'jpeg') ? 'jpg' : 'png';

  const env = {
    BG_COLOR: bgColor,
    REMBG_MODEL: model,
    OUTPUT_DPI: String(resolvedDim.dpi),
    OUTPUT_FORMAT: outputExt.toUpperCase()
  };

  const isPreCropped = Boolean(opts.isPreCropped || opts.settings?.isPreCropped);
  let resolvedCropBox = null;
  if (isPreCropped) {
    env.IS_PRE_CROPPED = 'true';
  } else {
    const cropBox = opts.cropBox || opts.settings?.cropBox;
    if (cropBox && typeof cropBox === 'object') {
      const cx = Math.round(parseFloat(cropBox.x || cropBox.left || 0));
      const cy = Math.round(parseFloat(cropBox.y || cropBox.top || 0));
      const cw = Math.round(parseFloat(cropBox.width || cropBox.w || 0));
      const ch = Math.round(parseFloat(cropBox.height || cropBox.h || 0));
      if (cw > 0 && ch > 0) {
        env.CROP_BOX = `${cx},${cy},${cw},${ch}`;
        resolvedCropBox = cropBox;
      }
    }
  }

  const rot = parseInt(opts.rotation || opts.settings?.rotation, 10);
  if (rot && [90, 180, 270].includes(rot)) {
    env.ROTATE_DEGREES = String(rot);
  }

  const subjPos = opts.subjectPosition || opts.settings?.subjectPosition;
  if (subjPos && typeof subjPos === 'object') {
    if (subjPos.scale) env.SUBJECT_SCALE = String(subjPos.scale);
    if (subjPos.offsetX) env.SUBJECT_OFFSET_X = String(subjPos.offsetX);
    if (subjPos.offsetY) env.SUBJECT_OFFSET_Y = String(subjPos.offsetY);
  }

  // For standard background removal, the user's original image dimensions and shape
  // MUST be strictly preserved 1:1. Only force-resize if explicitly requested by a passport preset.
  const isPassportPreset = String(opts.preset || opts.settings?.preset || '').toLowerCase().includes('passport');
  const shouldForceResize = Boolean(opts.forceResize || opts.settings?.forceResize || isPassportPreset);

  if (shouldForceResize) {
    if (opts.targetWidth && opts.targetHeight) {
      const dpi = resolvedDim.dpi || 300;
      env.TARGET_WIDTH_PX = String(Math.round((parseFloat(opts.targetWidth) / 25.4) * dpi));
      env.TARGET_HEIGHT_PX = String(Math.round((parseFloat(opts.targetHeight) / 25.4) * dpi));
    } else if (opts.settings && (opts.settings.widthMm || opts.settings.width_mm)) {
      env.TARGET_WIDTH_PX = String(resolvedDim.widthPx);
      env.TARGET_HEIGHT_PX = String(resolvedDim.heightPx);
    }
  }

  const outBuffer = await runPythonWorker(PY_SCRIPT, imageBuffer, {
    env,
    timeoutMs: 300000,
    maxBuffer: 50 * 1024 * 1024,
    description: 'Background remover'
  });

  if (!outBuffer || outBuffer.length < 8) {
    throw new Error('Background removal produced no output. The image may be too small or corrupted.');
  }

  // Validate output bytes
  const isPng = outBuffer[0] === 0x89 && outBuffer[1] === 0x50;
  const isJpg = outBuffer[0] === 0xFF && outBuffer[1] === 0xD8;
  if (!isPng && !isJpg) {
    throw new Error('Background removal output is not a valid PNG or JPEG image.');
  }

  // Extract actual native output dimensions from PNG header
  let actualWidthPx = resolvedDim.widthPx;
  let actualHeightPx = resolvedDim.heightPx;
  if (isPng && outBuffer.length >= 24) {
    actualWidthPx = outBuffer.readUInt32BE(16);
    actualHeightPx = outBuffer.readUInt32BE(20);
  }

  // Save to temp output with secure HMAC token
  const saved = saveTempOutput(outBuffer, outputExt, 'bg_removed', user);

  return {
    success: true,
    pngBuffer: outBuffer,
    outputBuffer: outBuffer,
    filePath: saved.filePath,
    fileUrl: saved.fileUrl,
    relativeUrl: saved.relativeUrl,
    downloadToken: saved.downloadToken,
    fileName: saved.fileName,
    format: outputExt,
    dimensions: {
      widthMm: Number(((actualWidthPx / resolvedDim.dpi) * 25.4).toFixed(1)),
      heightMm: Number(((actualHeightPx / resolvedDim.dpi) * 25.4).toFixed(1)),
      dpi: resolvedDim.dpi,
      widthPx: actualWidthPx,
      heightPx: actualHeightPx
    },
    cropBox: resolvedCropBox,
    bgColor,
    message: 'Background removed successfully using local AI processing.'
  };
}

/**
 * Parse incoming image from base64/buffer and run background removal.
 * Matches the contract of Phase 1 tools for use in toolRoutes.js /process endpoint.
 * 
 * @param {Object} opts
 * @param {string|Buffer} opts.fileData — Buffer, base64 data URL, or raw base64
 * @param {string} [opts.fileUrl]       — Optional transfer reference URL
 * @param {string} [opts.userId]        — Requesting user ID
 * @returns {Promise<Object>}
 */
async function callBackgroundRemoverLocal(opts = {}) {
  const {
    fileData,
    fileUrl,
    settings,
    preset,
    bgColor,
    model,
    format,
    cropBox,
    rotation,
    subjectPosition,
    targetWidth,
    targetHeight,
    userId = 'retailer'
  } = opts;

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
    throw new Error('A valid image file is required for background removal.');
  }

  return removeBackgroundLocal(imageBuffer, {
    settings,
    preset,
    bgColor,
    model,
    format,
    cropBox,
    rotation,
    subjectPosition,
    targetWidth,
    targetHeight,
    isPreCropped: opts.isPreCropped || opts.settings?.isPreCropped
  }, userId);
}

module.exports = {
  removeBackgroundLocal,
  callBackgroundRemoverLocal
};
