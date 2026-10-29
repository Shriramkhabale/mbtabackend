const axios = require("axios");
const qs = require("qs");

// Default configuration for PDF 2 HTML Convert API
const PDF_TO_HTML_API_URL = "https://api.dhboss.com/apicall/pdf_2_html/";

/**
 * Call PDF 2 HTML Convert API
 * @param {Object} options - API Parameters
 * @returns {Promise<Object>} API response data
 */
async function callPdfToHtmlAi(options = {}) {
  const {
    task_id,
    file_url,
    apikeyfill = process.env.DHBOSS_PDF_TO_HTML_API_KEY || "",
    ...rest
  } = options;

  // Prepare data
  const data = qs.stringify({
    ...(task_id ? { task_id } : {}),
    ...(file_url ? { file_url } : {}),
    ...(apikeyfill ? { apikeyfill } : {}),
    ...rest
  });

  // API call
  try {
    const res = await axios.post(PDF_TO_HTML_API_URL, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    console.log("PDF to HTML API Success:", res.data);
    return res.data;
  } catch (err) {
    console.error("API Error:", err.response?.data || err.message);
    throw err;
  }
}

// Standalone test runner matching the provided snippet
function runSampleApiRequest() {
  const data = qs.stringify({});

  return axios.post("https://api.dhboss.com/apicall/pdf_2_html/", data, {
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
  callPdfToHtmlAi,
  runSampleApiRequest
};
