const axios = require("axios");
const qs = require("qs");

// Default configuration for Digital Signature PDF Validation AI Tool API
const DIGITAL_SIGNATURE_VALIDATION_API_URL = "https://api.dhboss.com/apicall/digital_signature_validation_ai_v2_api/";

/**
 * Call Digital Signature PDF Validation AI Tool API
 * @param {Object} options - API Parameters
 * @returns {Promise<Object>} API response data
 */
async function callDigitalSignatureValidationAi({
  task_id = "ae6ad377-b91c-4f6d-bd5d-29d4f98f3744",
  file_url = "https://example.com/digitalsignature.pdf",
  apikeyfill = process.env.DHBOSS_DIGITAL_SIGNATURE_API_KEY || "AAyi7ZEO953rXd1GKQFcyjgWUq0BZIiaIzffVQduPN03Yrx3tATbONLU8RB8NIakW7XMP3"
} = {}) {
  // Prepare data
  const data = qs.stringify({
    task_id,
    file_url,
    apikeyfill
  });

  // API call
  try {
    const res = await axios.post(DIGITAL_SIGNATURE_VALIDATION_API_URL, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    console.log("Digital Signature Validation API Success:", res.data);
    return res.data;
  } catch (err) {
    console.error("API Error:", err.response?.data || err.message);
    throw err;
  }
}

// Standalone test runner matching the provided snippet
function runSampleApiRequest() {
  const data = qs.stringify({
    "task_id": "ae6ad377-b91c-4f6d-bd5d-29d4f98f3744",
    "file_url": "https://example.com/digitalsignature.pdf",
    "apikeyfill": process.env.DHBOSS_DIGITAL_SIGNATURE_API_KEY || "AAyi7ZEO953rXd1GKQFcyjgWUq0BZIiaIzffVQduPN03Yrx3tATbONLU8RB8NIakW7XMP3"
  });

  return axios.post("https://api.dhboss.com/apicall/digital_signature_validation_ai_v2_api/", data, {
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
  callDigitalSignatureValidationAi,
  runSampleApiRequest
};
