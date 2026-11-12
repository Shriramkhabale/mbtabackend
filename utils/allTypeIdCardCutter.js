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
  A4_HEIGHT_PT,
  mmToPoints
} = require('./toolHelpers');

/**
 * Local All Type ID Card PDF Crop/Cutter
 * Universal identity card cutter for multi-page or single-page PDF cards
 * without calling any external paid APIs.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function callAllTypeIdCardCutterAi(options = {}) {
  const {
    file_url,
    fileData,
    password = '',
    pdfPassword = '',
    userId = 'retailer',
    card_size_mode = 'none',
    quality = 'high',
    cropBox,
    settings,
    ...rest
  } = options;

  // 1. Obtain and validate PDF buffer locally (decrypting if password-protected)
  const docPassword = password || pdfPassword;
  const pdfBuffer = await parseIncomingPdf(fileData, file_url, docPassword);

  // 2. Load PDF with pdf-lib
  let srcDoc;
  try {
    srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('password')) {
      throw new Error('This ID Card PDF is password-protected. Please upload an unlocked/decrypted PDF.');
    }
    throw new Error(`Failed to read PDF document: ${err.message}`);
  }

  const pageCount = srcDoc.getPageCount();
  if (pageCount === 0) {
    throw new Error('The uploaded PDF does not contain any pages.');
  }

  // Determine target dimensions from settings or CR-80 defaults
  const resolvedDim = resolveOutputDimensions(settings, options.preset || rest.preset || card_size_mode);
  const targetWidthPt = resolvedDim.widthPt;
  const targetHeightPt = resolvedDim.heightPt;

  const destDoc = await PDFDocument.create();

  if (pageCount >= 2 && (!cropBox || !cropBox.singlePageOnly)) {
    // Multi-page card: Page 1 = Front, Page 2 = Back
    const p1 = srcDoc.getPage(0);
    const p2 = srcDoc.getPage(1);

    const p1Width = p1.getWidth();
    const p1Height = p1.getHeight();
    const p2Width = p2.getWidth();
    const p2Height = p2.getHeight();

    // Use full page or central card box
    const box1 = cropBox?.front || {
      left: 0,
      bottom: 0,
      right: p1Width,
      top: p1Height
    };
    const box2 = cropBox?.back || {
      left: 0,
      bottom: 0,
      right: p2Width,
      top: p2Height
    };

    const embeddedFront = await destDoc.embedPage(p1, box1);
    const embeddedBack = await destDoc.embedPage(p2, box2);

    if (resolvedDim.isA4Grid) {
      await generateA4CardGridLayout(destDoc, embeddedFront, embeddedBack, targetWidthPt, targetHeightPt);
    } else {
      // Page 1: Front
      const outPage1 = destDoc.addPage([targetWidthPt, targetHeightPt]);
      outPage1.drawPage(embeddedFront, {
        x: 0,
        y: 0,
        width: targetWidthPt,
        height: targetHeightPt
      });

      // Page 2: Back
      const outPage2 = destDoc.addPage([targetWidthPt, targetHeightPt]);
      outPage2.drawPage(embeddedBack, {
        x: 0,
        y: 0,
        width: targetWidthPt,
        height: targetHeightPt
      });

      // Page 3: Side-by-side printable layout
      const sheetWidth = targetWidthPt * 2 + 30;
      const sheetHeight = targetHeightPt + 20;
      const printPage = destDoc.addPage([sheetWidth, sheetHeight]);

      printPage.drawPage(embeddedFront, {
        x: 10,
        y: 10,
        width: targetWidthPt,
        height: targetHeightPt
      });

      printPage.drawPage(embeddedBack, {
        x: targetWidthPt + 20,
        y: 10,
        width: targetWidthPt,
        height: targetHeightPt
      });
    }
  } else {
    // Single-page PDF
    const srcPage = srcDoc.getPage(0);
    const srcWidth = srcPage.getWidth();
    const srcHeight = srcPage.getHeight();

    let targetBox;
    if (cropBox && typeof cropBox === 'object') {
      targetBox = {
        left: parseFloat(cropBox.left || cropBox.x || 0),
        bottom: parseFloat(cropBox.bottom || cropBox.y || 0),
        right: parseFloat(cropBox.right || (cropBox.x + cropBox.width) || srcWidth),
        top: parseFloat(cropBox.top || (cropBox.y + cropBox.height) || srcHeight)
      };
    } else {
      // If no custom crop, check if page is already card-sized or full A4
      const isAlreadyCard = srcWidth < 350 && srcHeight < 250;
      if (isAlreadyCard) {
        targetBox = { left: 0, bottom: 0, right: srcWidth, top: srcHeight };
      } else {
        // Center-crop or lower third card default
        const scaleX = srcWidth / A4_WIDTH_PT;
        const scaleY = srcHeight / A4_HEIGHT_PT;
        targetBox = {
          left: Math.max(0, 35 * scaleX),
          bottom: Math.max(0, 40 * scaleY),
          right: Math.min(srcWidth, 555 * scaleX),
          top: Math.min(srcHeight, 260 * scaleY)
        };
      }
    }

    const boxWidth = targetBox.right - targetBox.left;
    const boxHeight = targetBox.top - targetBox.bottom;
    const embeddedPage = await destDoc.embedPage(srcPage, targetBox);

    const outPage = destDoc.addPage([targetWidthPt, targetHeightPt]);
    outPage.drawPage(embeddedPage, {
      x: 0,
      y: 0,
      width: targetWidthPt,
      height: targetHeightPt
    });
  }

  // 6. Save output PDF
  const outputPdfBytes = await destDoc.save();
  const tempFile = saveTempOutput(outputPdfBytes, 'pdf', 'all_id_card_cutter', userId);

  return {
    status: 'Success',
    code: 200,
    message: 'Identity Card PDF cropped successfully into high-resolution layout.',
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
    pageCount
  };
}

module.exports = {
  callAllTypeIdCardCutterAi
};
