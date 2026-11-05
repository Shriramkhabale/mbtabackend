const BACKGROUND_REMOVER_API_URL = "https://api.dhboss.com/apicall/background_remover_image/";

async function getPublicImageUrl(imageInput) {
  if (typeof imageInput !== "string" || !imageInput.trim()) {
    throw new Error("An image_url is required for background removal");
  }

  const image = imageInput.trim();
  if (image.startsWith("data:image/")) {
    const { cloudinary } = require("../cloudinaryConfig");
    const uploadResult = await cloudinary.uploader.upload(image, {
      folder: "background-remover-inputs",
      resource_type: "image"
    });
    return uploadResult.secure_url;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(image);
  } catch {
    throw new Error("image_url must be a public HTTP or HTTPS URL");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("image_url must be a public HTTP or HTTPS URL");
  }

  return parsedUrl.toString();
}

async function callBackgroundRemoverAi(options = {}) {
  const apiKey = process.env.DHBOSS_BG_REMOVER_API_KEY;
  if (!apiKey) {
    throw new Error("DHBOSS_BG_REMOVER_API_KEY is not configured on the server");
  }

  const imageUrl = await getPublicImageUrl(options.image_url || options.file_url || options.fileData);
  const formData = new URLSearchParams({
    image_url: imageUrl,
    apikeyfill: apiKey
  });

  let response;
  try {
    response = await fetch(BACKGROUND_REMOVER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formData,
      signal: AbortSignal.timeout(120000)
    });
  } catch (error) {
    throw new Error(`Could not reach the Background Remover API: ${error.message}`);
  }

  const responseText = await response.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = responseText;
  }

  if (!response.ok) {
    const apiMessage = typeof responseData === "object" && responseData !== null
      ? responseData.message || responseData.error
      : responseData;
    throw new Error(`Background Remover API returned HTTP ${response.status}${apiMessage ? `: ${apiMessage}` : ""}`);
  }

  if (responseData && typeof responseData === "object"
    && (responseData.success === false || ["error", "failed"].includes(String(responseData.status || "").toLowerCase()))) {
    throw new Error(responseData.message || responseData.error || "Background Remover API reported a processing failure");
  }

  return responseData;
}

module.exports = {
  callBackgroundRemoverAi
};
