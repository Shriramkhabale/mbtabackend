const axios = require("axios");
const qs = require("qs");

// Default configuration for Background Remover Image AI API
const BACKGROUND_REMOVER_API_URL = "https://api.dhboss.com/apicall/background_remover_image/";

/**
 * Call Background Remover Image AI API
 * @param {Object} options - API Parameters
 * @returns {Promise<Object>} API response data
 */
async function callBackgroundRemoverAi(options = {}) {
  const {
    task_id,
    file_url,
    image_url,
    apikeyfill = process.env.DHBOSS_BG_REMOVER_API_KEY || "",
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
    const res = await axios.post(BACKGROUND_REMOVER_API_URL, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    console.log("Background Remover API Success:", res.data);
    return res.data;
  } catch (err) {
    console.error("API Error:", err.response?.data || err.message);
    throw err;
  }
}

// Standalone test runner matching the provided snippet
function runSampleApiRequest() {
  const data = qs.stringify({});

  return axios.post("https://api.dhboss.com/apicall/background_remover_image/", data, {
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
  callBackgroundRemoverAi,
  runSampleApiRequest
};
