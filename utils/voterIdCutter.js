const { PDFDocument } = require('pdf-lib');
const { PDFParse } = require('pdf-parse');
const {
  parseIncomingPdf,
  saveTempOutput,
  resolveOutputDimensions,
  generateA4CardGridLayout,
  detectCardPdfBoxes,
  CR80_WIDTH_PT,
  CR80_HEIGHT_PT,
  A4_WIDTH_PT,
  A4_HEIGHT_PT
} = require('./toolHelpers');

/**
 * Local Voter ID / e-EPIC Card PDF Crop/Cutter
 * Extracts Front and Back of the voter card from ECI e-EPIC PDF
 * without calling any external paid APIs.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function callVoterIdCutterAi(options = {}) {
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

  // 2. Inspect text content to verify e-EPIC
  let isVoterDoc = false;
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    const parsedText = await parser.getText();
    const textSample = parsedText?.text || '';
    if (
      /election commission of india|भारत निर्वाचन आयोग|e-epic|epic no|voter identity/i.test(textSample) ||
      /\b[A-Z]{3}[0-9]{7}\b/.test(textSample)
    ) {
      isVoterDoc = true;
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
      throw new Error('This Voter ID PDF is password-protected. Please upload an unlocked/decrypted PDF.');
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
  let frontBox;
  let backBox;

  if (cropBox && typeof cropBox === 'object') {
    frontBox = {
      left: parseFloat(cropBox.left || cropBox.x || 0),
      bottom: parseFloat(cropBox.bottom || cropBox.y || 0),
      right: parseFloat(cropBox.right || (cropBox.x + cropBox.width) || srcWidth),
      top: parseFloat(cropBox.top || (cropBox.y + cropBox.height) || srcHeight)
    };
  } else {
    // Official ECI e-EPIC standard layout:
    // ISO/IEC 7810 ID-1 standard: 85.6 mm x 54.0 mm
    const detected = await detectCardPdfBoxes(pdfBuffer, 'voter', srcWidth, srcHeight);
    frontBox = detected.frontBox;
    backBox = detected.backBox;
  }

  // 5. Build output PDF using dynamic resolved settings
  const resolvedDim = resolveOutputDimensions(settings, options.preset || rest.preset || 'voter');
  const cardWidthPt = resolvedDim.widthPt;
  const cardHeightPt = resolvedDim.heightPt;
  const destDoc = await PDFDocument.create();
  const embeddedFront = await destDoc.embedPage(srcPage, frontBox);
  const embeddedBack = backBox ? await destDoc.embedPage(srcPage, backBox) : null;

  if (resolvedDim.isA4Grid) {
    await generateA4CardGridLayout(destDoc, embeddedFront, embeddedBack, cardWidthPt, cardHeightPt);
  } else {
    // Page 1: Front
    const pageFront = destDoc.addPage([cardWidthPt, cardHeightPt]);
    pageFront.drawPage(embeddedFront, {
      x: 0,
      y: 0,
      width: cardWidthPt,
      height: cardHeightPt
    });

    if (embeddedBack) {
      // Page 2: Back
      const pageBack = destDoc.addPage([cardWidthPt, cardHeightPt]);
      pageBack.drawPage(embeddedBack, {
        x: 0,
        y: 0,
        width: cardWidthPt,
        height: cardHeightPt
      });

      // Page 3: Side-by-side print sheet
      const sheetWidth = cardWidthPt * 2 + 30;
      const sheetHeight = cardHeightPt + 20;
      const printPage = destDoc.addPage([sheetWidth, sheetHeight]);

      printPage.drawPage(embeddedFront, {
        x: 10,
        y: 10,
        width: cardWidthPt,
        height: cardHeightPt
      });

      printPage.drawPage(embeddedBack, {
        x: cardWidthPt + 20,
        y: 10,
        width: cardWidthPt,
        height: cardHeightPt
      });
    }
  }

  // 6. Save output PDF
  const outputPdfBytes = await destDoc.save();
  const tempFile = saveTempOutput(outputPdfBytes, 'pdf', 'voter_id_cutter', userId);

  return {
    status: 'Success',
    code: 200,
    message: 'Voter ID / e-EPIC Card PDF cropped successfully into high-resolution printable cards.',
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
      isVoterDoc,
      frontBox,
      backBox,
      pageCount
    }
  };
}

module.exports = {
  callVoterIdCutterAi
};
