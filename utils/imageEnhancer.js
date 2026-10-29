const axios = require("axios");
const qs = require("qs");

// Default configuration for AI Image Enhancer API
const IMAGE_ENHANCER_API_URL = "https://api.dhboss.com/apicall/image_enhancer_ai/";

/**
 * Call AI Image Enhancer API
 * @param {Object} options - API Parameters
 * @returns {Promise<Object>} API response data
 */
async function callImageEnhancerAi(options = {}) {
  const {
    task_id,
    file_url,
    image_url,
    apikeyfill = process.env.DHBOSS_IMAGE_ENHANCER_API_KEY || "",
    ...rest
  } = options;

  // Prepare data
  const data = qs.stringify({
    ...(task_id ? { task_id } : {}),
    ...((file_url || image_url) ? { file_url: file_url || image_url, image_url: file_url || image_url } : {}),
    ...(apikeyfill ? { apikeyfill } : {}),
    ...rest
  });

  // API call
  try {
    const res = await axios.post(IMAGE_ENHANCER_API_URL, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    console.log("Image Enhancer API Success:", res.data);
    return res.data;
  } catch (err) {
    console.error("API Error:", err.response?.data || err.message);
    throw err;
  }
}

// Standalone test runner matching the provided snippet
function runSampleApiRequest() {
  const data = qs.stringify({});

  return axios.post("https://api.dhboss.com/apicall/image_enhancer_ai/", data, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  })
  .then(res => {
    console.log(res.data);
    return res.data;
  })
  .catch(err => {
    console.error("API Error:", err.response?.data || err.message);
    throw err;
  });
}

module.exports = {
  callImageEnhancerAi,
  runSampleApiRequest
};
