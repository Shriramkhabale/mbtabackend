const axios = require("axios");
const qs = require("qs");

// Default configuration for ALL IDENTITY CARD AUTOMATIC CROPPING TOOLS API
const IDENTITY_CARD_AUTO_CROP_API_URL = "https://api.dhboss.com/apicall/identity_card_auto_cropping_tools_api/";

/**
 * Call ALL IDENTITY CARD AUTOMATIC CROPPING TOOLS API
 * @param {Object} options - API Parameters
 * @returns {Promise<Object>} API response data
 */
async function callIdentityCardAutoCropAi({
  croptype = "aadhaar",
  file_url = "https://example.com/idcardpdf.pdf",
  apikeyfill = process.env.DHBOSS_IDENTITY_AUTO_CROP_API_KEY || "AAyi7ZEO953rXd1GKQFcyjgWUq0BZIiaIzffVQduPN03Yrx3tATbONLU8RB8NIakW7XMP3",
  ...rest
} = {}) {
  // Prepare data
  const data = qs.stringify({
    croptype,
    file_url,
    apikeyfill,
    ...rest
  });

  // API call
  try {
    const res = await axios.post(IDENTITY_CARD_AUTO_CROP_API_URL, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    console.log("Identity Card Auto Crop API Success:", res.data);
    return res.data;
  } catch (err) {
    console.error("API Error:", err.response?.data || err.message);
    throw err;
  }
}

// Standalone test runner matching the provided snippet
function runSampleApiRequest() {
  const data = qs.stringify({
    "croptype": "aadhaar",
    "file_url": "https://example.com/idcardpdf.pdf",
    "apikeyfill": process.env.DHBOSS_IDENTITY_AUTO_CROP_API_KEY || "AAyi7ZEO953rXd1GKQFcyjgWUq0BZIiaIzffVQduPN03Yrx3tATbONLU8RB8NIakW7XMP3"
  });

  return axios.post("https://api.dhboss.com/apicall/identity_card_auto_cropping_tools_api/", data, {
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
  callIdentityCardAutoCropAi,
  runSampleApiRequest
};
