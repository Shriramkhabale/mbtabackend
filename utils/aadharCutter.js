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
  A4_HEIGHT_PT,
  mmToPoints
} = require('./toolHelpers');

/**
 * Local Aadhaar Card PDF Cutter
 * Extracts Front and Back of the Aadhaar card from e-Aadhaar PDF
 * without calling any external paid APIs.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function callAadharCardPdfCutterAi(options = {}) {
  const {
    file_url,
    fileData,
    password = '',
    pdfPassword = '',
    userId = 'retailer',
    aadhar_type = 'normal',
    quality = 'high',
    cropBox,
    settings,
    ...rest
  } = options;

  // 1. Obtain and validate PDF buffer locally (decrypting if password-protected)
  const docPassword = password || pdfPassword;
  const pdfBuffer = await parseIncomingPdf(fileData, file_url, docPassword);

  // 2. Inspect text content to verify e-Aadhaar & detect orientation
  let isAadhaarDoc = false;
  let textSample = '';
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    const parsedText = await parser.getText();
    textSample = parsedText?.text || '';
    if (
      /unique identification|uidai|aadhaar|मेरा आधार|आम आदमी का अधिकार|1947/i.test(textSample) ||
      /\b\d{4}\s\d{4}\s\d{4}\b/.test(textSample)
    ) {
      isAadhaarDoc = true;
    }
    await parser.destroy();
  } catch (err) {
    // If text extraction fails, proceed with visual/coordinate cropping
  }

  // 3. Load PDF with pdf-lib
  let srcDoc;
  try {
    srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('password')) {
      throw new Error('This Aadhaar PDF is password-protected. Please upload an unlocked/decrypted PDF.');
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

  // Scale factor relative to standard A4 (595.28 x 841.89 pt)
  const scaleX = srcWidth / A4_WIDTH_PT;
  const scaleY = srcHeight / A4_HEIGHT_PT;

  // 4. Determine crop coordinates
  // Standard UIDAI e-Aadhaar card cutout is in the bottom ~220 pt of the A4 page
  let frontBox;
  let backBox;

  if (cropBox && typeof cropBox === 'object') {
    // Custom user crop coordinates if supplied
    frontBox = {
      left: parseFloat(cropBox.left || cropBox.x || 0),
      bottom: parseFloat(cropBox.bottom || cropBox.y || 0),
      right: parseFloat(cropBox.right || (cropBox.x + cropBox.width) || srcWidth),
      top: parseFloat(cropBox.top || (cropBox.y + cropBox.height) || srcHeight)
    };
  } else {
    // Official UIDAI standard layout with smart detection:
    // ISO/IEC 7810 ID-1 standard: 85.6 mm x 54.0 mm
    // Cleanly removes scissor cut lines, top banner ("माझे आधार", "Entities seeking..."), and bottom bleed
    const detected = await detectCardPdfBoxes(pdfBuffer, 'aadhaar', srcWidth, srcHeight);
    frontBox = detected.frontBox;
    backBox = detected.backBox;
  }

  // 5. Build output PDF using dynamic resolved settings
  const resolvedDim = resolveOutputDimensions(settings, options.preset || rest.preset || aadhar_type);
  const cardWidthPt = resolvedDim.widthPt;
  const cardHeightPt = resolvedDim.heightPt;
  const destDoc = await PDFDocument.create();

  const embeddedFront = await destDoc.embedPage(srcPage, frontBox);
  const embeddedBack = backBox ? await destDoc.embedPage(srcPage, backBox) : null;

  if (resolvedDim.isA4Grid) {
    // A4 Printable 4-Card Grid preset
    await generateA4CardGridLayout(destDoc, embeddedFront, embeddedBack, cardWidthPt, cardHeightPt);
  } else if (aadhar_type === 'front_only' || !embeddedBack) {
    // Single card: Front only
    const cardPage = destDoc.addPage([cardWidthPt, cardHeightPt]);
    cardPage.drawPage(embeddedFront, {
      x: 0,
      y: 0,
      width: cardWidthPt,
      height: cardHeightPt
    });
  } else if (aadhar_type === 'back_only') {
    // Single card: Back only
    const cardPage = destDoc.addPage([cardWidthPt, cardHeightPt]);
    cardPage.drawPage(embeddedBack, {
      x: 0,
      y: 0,
      width: cardWidthPt,
      height: cardHeightPt
    });
  } else if (aadhar_type === 'full_strip') {
    // Full horizontal bottom strip
    const stripBox = {
      left: frontBox.left,
      bottom: frontBox.bottom,
      right: backBox.right,
      top: Math.max(frontBox.top, backBox.top)
    };
    const stripWidth = stripBox.right - stripBox.left;
    const stripHeight = stripBox.top - stripBox.bottom;
    const embeddedStrip = await destDoc.embedPage(srcPage, stripBox);
    const stripPage = destDoc.addPage([stripWidth, stripHeight]);
    stripPage.drawPage(embeddedStrip, {
      x: 0,
      y: 0,
      width: stripWidth,
      height: stripHeight
    });
  } else {
    // Standard Multi-page ID Card Format:
    // Page 1: Front Card (dimensioned to user settings)
    const pageFront = destDoc.addPage([cardWidthPt, cardHeightPt]);
    pageFront.drawPage(embeddedFront, {
      x: 0,
      y: 0,
      width: cardWidthPt,
      height: cardHeightPt
    });

    // Page 2: Back Card (dimensioned to user settings)
    const pageBack = destDoc.addPage([cardWidthPt, cardHeightPt]);
    pageBack.drawPage(embeddedBack, {
      x: 0,
      y: 0,
      width: cardWidthPt,
      height: cardHeightPt
    });

    // Page 3: Side-by-side print sheet (Width: 2 cards + spacing)
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

  // 6. Save output PDF
  const outputPdfBytes = await destDoc.save();
  const tempFile = saveTempOutput(outputPdfBytes, 'pdf', 'aadhaar_card_cutter', userId);

  return {
    status: 'Success',
    code: 200,
    message: 'Aadhaar Card PDF cropped successfully into high-resolution printable cards.',
    file_url: tempFile.fileUrl,
    download_url: tempFile.fileUrl,
    output_url: tempFile.fileUrl,
    outputFileName: tempFile.fileName,
    filePath: tempFile.filePath,
    dimensions: {
      widthMm: resolvedDim.widthMm,
      heightMm: resolvedDim.heightMm,
      dpi: resolvedDim.dpi,
      widthPx: resolvedDim.widthPx,
      heightPx: resolvedDim.heightPx,
      pageCount: destDoc.getPageCount()
    },
    detection: {
      isAadhaarDoc,
      frontBox,
      backBox,
      pageCount
    }
  };
}

module.exports = {
  callAadharCardPdfCutterAi
};
