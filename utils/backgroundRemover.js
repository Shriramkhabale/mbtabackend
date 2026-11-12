'use strict';
/**
 * MB Mitra — Background Remover Image AI
 * Fully local processing using rembg (U²-Net) and OpenCV GrabCut fallback.
 * No external API dependencies. No external data transmission.
 */

const { callBackgroundRemoverLocal, removeBackgroundLocal } = require('./localBackgroundRemover');
const { parseIncomingImage } = require('./toolHelpers');

/**
 * Call Background Remover Image AI (Local)
 * @param {Object} options - { fileData, file_url, image_url, userId }
 * @returns {Promise<Object>} API response data
 */
async function callBackgroundRemoverAi(options = {}) {
  const {
    fileData,
    file_url,
    image_url,
    userId = 'retailer'
  } = options;

  const inputData = fileData || file_url || image_url;
  if (!inputData) {
    throw new Error('A file_url, image_url, or fileData is required for background removal');
  }

  // If already base64 or data URL, pass directly to local processor
  if (typeof inputData === 'string' && (inputData.startsWith('data:') || !inputData.startsWith('http'))) {
    return callBackgroundRemoverLocal({ fileData: inputData, userId });
  }

  // If it's a URL or buffer, parse to buffer then run local processor
  const imageBuffer = await parseIncomingImage(inputData);
  return removeBackgroundLocal(imageBuffer, userId);
}

module.exports = {
  callBackgroundRemoverAi,
  callBackgroundRemoverLocal,
  removeBackgroundLocal
};
