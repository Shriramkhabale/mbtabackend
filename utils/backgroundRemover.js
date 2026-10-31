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

  const apiKey = apikeyfill || process.env.DHBOSS_BG_REMOVER_API_KEY || "";
  const imageInput = file_url || image_url;

  if (!apiKey) {
    throw new Error("DHBOSS_BG_REMOVER_API_KEY is not configured");
  }
  if (!imageInput) {
    throw new Error("A file_url or image_url is required for background removal");
  }

  const data = qs.stringify({
    ...(task_id ? { task_id } : {}),
    ...((file_url || image_url) ? { file_url: imageInput, image_url: imageInput } : {}),
    ...(apiKey ? { apikeyfill: apiKey } : {}),
    ...rest
  });

  try {
    const res = await axios.post(BACKGROUND_REMOVER_API_URL, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    return res.data;
  } catch (err) {
    console.error("Background Remover API Error:", err.response?.data || err.message);
    throw err;
  }
}

function runSampleApiRequest() {
  const data = qs.stringify({
    image_url: "https://example.com/sample-image.jpg",
    apikeyfill: process.env.DHBOSS_BG_REMOVER_API_KEY || ""
  });

  return axios.post(BACKGROUND_REMOVER_API_URL, data, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  })
    .then((res) => {
      console.log(res.data);
      return res.data;
    })
    .catch((err) => {
      console.error("Background Remover API Error:", err.response?.data || err.message);
      throw err;
    });
}

module.exports = {
  callBackgroundRemoverAi,
  runSampleApiRequest
};
