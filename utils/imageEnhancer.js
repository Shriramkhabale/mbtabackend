'use strict';
/**
 * MB Mitra — AI Image Enhancer
 * Fully local image quality enhancement using CLAHE contrast enhancement,
 * unsharp masking, and edge-preserving denoising via OpenCV.
 * No external API dependencies. No external data transmission.
 */

const {
  callImageEnhancerLocal,
  enhanceImageLocal
} = require('./localImageEnhancer');
const { parseIncomingImage } = require('./toolHelpers');

/**
 * Call AI Image Enhancer (Local)
 * @param {Object} options - { fileData, file_url, image_url, level, format, userId }
 * @returns {Promise<Object>} Enhanced result
 */
async function callImageEnhancerAi(options = {}) {
  const {
    fileData,
    file_url,
    image_url,
    level = 'standard',
    format = 'png',
    userId = 'retailer'
  } = options;

  const inputData = fileData || file_url || image_url;
  if (!inputData) {
    throw new Error('A file_url, image_url, or fileData is required for Image Enhancement');
  }

  if (typeof inputData === 'string' && (inputData.startsWith('data:') || !inputData.startsWith('http'))) {
    return callImageEnhancerLocal({
      fileData: inputData,
      level,
      format,
      userId
    });
  }

  const imageBuffer = await parseIncomingImage(inputData);
  return enhanceImageLocal(imageBuffer, { level, format }, userId);
}

module.exports = {
  callImageEnhancerAi,
  callImageEnhancerLocal,
  enhanceImageLocal
};
