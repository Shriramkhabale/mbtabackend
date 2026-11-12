'use strict';
/**
 * MB Mitra — All Identity Card Automatic Cropping Tools
 * Fully local contour and edge detection using OpenCV.
 * No external API dependencies. No external data transmission.
 */

const {
  callIdentityCardAutoCropLocal,
  cropCardLocal
} = require('./localAutoCrop');
const { parseIncomingImage } = require('./toolHelpers');

/**
 * Call Identity Card Auto Crop AI (Local)
 * @param {Object} options - { fileData, file_url, croptype, cropType, userId }
 * @returns {Promise<Object>} Cropped result
 */
async function callIdentityCardAutoCropAi(options = {}) {
  const {
    fileData,
    file_url,
    croptype,
    cropType,
    userId = 'retailer',
    ...rest
  } = options;

  const inputData = fileData || file_url;
  if (!inputData) {
    throw new Error('file_url or fileData is required for Identity Card Auto Crop');
  }

  const selectedCropType = croptype || cropType || 'generic';

  if (typeof inputData === 'string' && (inputData.startsWith('data:') || !inputData.startsWith('http'))) {
    return callIdentityCardAutoCropLocal({
      fileData: inputData,
      croptype: selectedCropType,
      userId
    });
  }

  const imageBuffer = await parseIncomingImage(inputData);
  return cropCardLocal(imageBuffer, { cropType: selectedCropType }, userId);
}

module.exports = {
  callIdentityCardAutoCropAi,
  callIdentityCardAutoCropLocal,
  cropCardLocal
};
