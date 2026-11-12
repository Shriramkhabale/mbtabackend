const { PDFDocument } = require('pdf-lib');
const { PDFParse } = require('pdf-parse');
const {
  parseIncomingPdf,
  saveTempOutput,
  resolveOutputDimensions,
  generateA4CardGridLayout,
  CR80_WIDTH_PT,
  CR80_HEIGHT_PT,
  A4_WIDTH_PT,
  A4_HEIGHT_PT
} = require('./toolHelpers');

/**
 * Local Mera Ration Card PDF Crop/Cutter
 * Extracts the Ration Card / NFSA family slip from Food & Civil Supplies PDF
 * without calling any external paid APIs.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function callMeraRationCutterAi(options = {}) {
  const {
    file_url,
    fileData,
    password = '',
    pdfPassword = '',
    userId = 'retailer',
    quality = 'high',
    cropBox,
    settings,
    ...rest
  } = options;

  // 1. Obtain and validate PDF buffer locally (decrypting if password-protected)
  const docPassword = password || pdfPassword;
  const pdfBuffer = await parseIncomingPdf(fileData, file_url, docPassword);

  // 2. Inspect text content to verify Ration Card
  let isRationDoc = false;
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    const parsedText = await parser.getText();
    const textSample = parsedText?.text || '';
    if (
      /ration card|mera ration|nfsa|राष्ट्रीय खाद्य सुरक्षा|खाद्य एवं नागरिक आपूर्ति|rcms|food and civil supplies/i.test(textSample) ||
      /\b\d{10,12}\b/.test(textSample)
    ) {
      isRationDoc = true;
    }
    await parser.destroy();
  } catch (err) {
    // Non-fatal text inspection error
  }

  // 3. Load PDF with pdf-lib
  let srcDoc;
  try {
    srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('password')) {
      throw new Error('This Ration Card PDF is password-protected. Please upload an unlocked/decrypted PDF.');
    }
    throw new Error(`Failed to read PDF document: ${err.message}`);
  }

  const pageCount = srcDoc.getPageCount();
  if (pageCount === 0) {
    throw new Error('The uploaded PDF does not contain any pages.');
  }

  const srcPage = srcDoc.getPage(0);
  const srcWidth = srcPage.getWidth();
  const srcHeight = srcPage.getHeight();

  const scaleX = srcWidth / A4_WIDTH_PT;
  const scaleY = srcHeight / A4_HEIGHT_PT;

  // 4. Crop coordinates
  let cardBox;

  if (cropBox && typeof cropBox === 'object') {
    cardBox = {
      left: parseFloat(cropBox.left || cropBox.x || 0),
      bottom: parseFloat(cropBox.bottom || cropBox.y || 0),
      right: parseFloat(cropBox.right || (cropBox.x + cropBox.width) || srcWidth),
      top: parseFloat(cropBox.top || (cropBox.y + cropBox.height) || srcHeight)
    };
  } else {
    // Standard DigiLocker / State RCMS Ration Card layout:
    // Typically in upper-mid section or formatted certificate:
    // Left: 35 pt, Bottom: 480 pt, Right: 560 pt, Top: 780 pt (Height ≈ 300 pt)
    cardBox = {
      left: Math.max(0, 35 * scaleX),
      bottom: Math.max(0, 480 * scaleY),
      right: Math.min(srcWidth, 560 * scaleX),
      top: Math.min(srcHeight, 780 * scaleY)
    };
  }

  // 5. Build output PDF using dynamic resolved settings
  const resolvedDim = resolveOutputDimensions(settings, options.preset || rest.preset || 'ration');
  const destDoc = await PDFDocument.create();
  const boxWidth = cardBox.right - cardBox.left;
  const boxHeight = cardBox.top - cardBox.bottom;

  const embeddedCard = await destDoc.embedPage(srcPage, cardBox);

  if (resolvedDim.isA4Grid) {
    await generateA4CardGridLayout(destDoc, embeddedCard, null, resolvedDim.widthPt, resolvedDim.heightPt);
  } else {
    // If user explicitly passed custom dimensions, use them; otherwise use extracted slip dimensions
    const outWidth = (settings && (settings.widthMm || settings.width_mm)) ? resolvedDim.widthPt : boxWidth;
    const outHeight = (settings && (settings.heightMm || settings.height_mm)) ? resolvedDim.heightPt : boxHeight;

    const outPage = destDoc.addPage([outWidth, outHeight]);
    outPage.drawPage(embeddedCard, {
      x: 0,
      y: 0,
      width: outWidth,
      height: outHeight
    });
  }

  // 6. Save output PDF
  const outputPdfBytes = await destDoc.save();
  const tempFile = saveTempOutput(outputPdfBytes, 'pdf', 'mera_ration_cutter', userId);

  return {
    status: 'Success',
    code: 200,
    message: 'Mera Ration Card PDF cropped successfully into high-resolution printable document.',
    file_url: tempFile.fileUrl,
    download_url: tempFile.fileUrl,
    output_url: tempFile.fileUrl,
    outputFileName: tempFile.fileName,
    dimensions: {
      widthMm: resolvedDim.widthMm,
      heightMm: resolvedDim.heightMm,
      dpi: resolvedDim.dpi,
      widthPx: resolvedDim.widthPx,
      heightPx: resolvedDim.heightPx,
      pageCount: destDoc.getPageCount()
    },
    detection: {
      isRationDoc,
      cardBox,
      pageCount
    }
  };
}

module.exports = {
  callMeraRationCutterAi
};
