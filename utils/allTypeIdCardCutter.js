const axios = require("axios");
const qs = require("qs");

// Default configuration for All Type ID Card PDF Crop/Cutter AI API
const ALL_TYPE_ID_CARD_CUTTER_API_URL = "https://api.dhboss.com/apicall/all_type_id_card_pdf_cutter_ai_v2_api/";

/**
 * Call All Type ID Card PDF Crop/Cutter AI API
 * @param {Object} options - API Parameters
 * @returns {Promise<Object>} API response data
 */
async function callAllTypeIdCardCutterAi({
  task_id = "ae6ad377-b91c-4f6d-bd5d-29d4f98f3744",
  file_url = "https://example.com/idcardpdf.pdf",
  card_size_mode = "none",
  quality = "high",
  apikeyfill = process.env.DHBOSS_ALL_TYPE_ID_CUTTER_API_KEY || "AAyi7ZEO953rXd1GKQFcyjgWUq0BZIiaIzffVQduPN03Yrx3tATbONLU8RB8NIakW7XMP3"
} = {}) {
  // Prepare data
  const data = qs.stringify({
    task_id,
    file_url,
    card_size_mode,
    quality,
    apikeyfill
  });

  // API call
  try {
    const res = await axios.post(ALL_TYPE_ID_CARD_CUTTER_API_URL, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    console.log("All Type ID Card Cutter API Success:", res.data);
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
    "file_url": "https://example.com/idcardpdf.pdf",
    "card_size_mode": "none",
    "quality": "high",
    "apikeyfill": process.env.DHBOSS_ALL_TYPE_ID_CUTTER_API_KEY || "AAyi7ZEO953rXd1GKQFcyjgWUq0BZIiaIzffVQduPN03Yrx3tATbONLU8RB8NIakW7XMP3"
  });

  return axios.post("https://api.dhboss.com/apicall/all_type_id_card_pdf_cutter_ai_v2_api/", data, {
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
  callAllTypeIdCardCutterAi,
  runSampleApiRequest
};
