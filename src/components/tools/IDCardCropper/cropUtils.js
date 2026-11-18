import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

/**
 * Solves the 3x3 homography matrix mapping srcPts -> dstPts.
 * Each array has 4 points: [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]
 */
export function solveHomography(srcPts, dstPts) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [sx, sy] = srcPts[i];
    const [dx, dy] = dstPts[i];
    A.push([sx, sy, 1, 0, 0, 0, -sx * dx, -sy * dx]);
    b.push(dx);
    A.push([0, 0, 0, sx, sy, 1, -sx * dy, -sy * dy]);
    b.push(dy);
  }

  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];

    if (Math.abs(A[i][i]) < 1e-12) continue;

    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) A[k][j] = 0;
        else A[k][j] += c * A[i][j];
      }
      b[k] += c * b[i];
    }
  }

  const h = new Array(8);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * h[j];
    h[i] = A[i][i] !== 0 ? s / A[i][i] : 0;
  }

  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1]
  ];
}

/**
 * Calculates Euclidean distance between two points
 */
export function distance(p1, p2) {
  return Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
}

/**
 * Applies color and light adjustments to an HTML5 Canvas in place
 */
export function applyAdjustmentsToCanvas(canvas, adjustments = {}) {
  const {
    brightness = 0,
    contrast = 0,
    black = 0,
    red = 0,
    yellow = 0,
    blue = 0
  } = adjustments;

  // If all default (0), no pixel manipulation needed
  if (
    brightness === 0 &&
    contrast === 0 &&
    black === 0 &&
    red === 0 &&
    yellow === 0 &&
    blue === 0
  ) {
    return canvas;
  }

  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Pre-calculate contrast factor
  // Contrast range: -100 to 100
  const cFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const bShift = brightness * 2.55;
  const kShift = black * 1.5;
  const rShift = red * 2.55;
  const yShift = yellow * 2.55 * 0.7;
  const blShift = blue * 2.55;

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // 1. Contrast
    if (contrast !== 0) {
      r = cFactor * (r - 128) + 128;
      g = cFactor * (g - 128) + 128;
      b = cFactor * (b - 128) + 128;
    }

    // 2. Brightness
    if (brightness !== 0) {
      r += bShift;
      g += bShift;
      b += bShift;
    }

    // 3. Black level (shadows adjustment)
    if (black !== 0) {
      r += kShift * (1 - r / 255);
      g += kShift * (1 - g / 255);
      b += kShift * (1 - b / 255);
    }

    // 4. Color channel adjustments
    if (red !== 0) r += rShift;
    if (yellow !== 0) {
      r += yShift;
      g += yShift;
    }
    if (blue !== 0) b += blShift;

    // Clamp 0..255
    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Rotates an image element or canvas by specified angle (degrees: 0, 90, 180, 270)
 * Returns a new Canvas containing the rotated image.
 */
export function rotateImageSource(source, angleDeg) {
  const normDeg = ((angleDeg % 360) + 360) % 360;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;

  if (normDeg === 90 || normDeg === 270) {
    canvas.width = sh;
    canvas.height = sw;
  } else {
    canvas.width = sw;
    canvas.height = sh;
  }

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normDeg * Math.PI) / 180);
  ctx.drawImage(source, -sw / 2, -sh / 2);
  ctx.restore();

  return canvas;
}

/**
 * Performs high-precision bilinear perspective warp from 4 source quad corners to a rectangular canvas.
 * corners = [topLeft, topRight, bottomRight, bottomLeft], each [x, y] in source coordinates.
 */
export function warpPerspectiveCanvas(sourceImg, corners, adjustments = {}) {
  const [tl, tr, br, bl] = corners;

  // Calculate target dimensions
  const wTop = distance(tl, tr);
  const wBot = distance(bl, br);
  const hLeft = distance(tl, bl);
  const hRight = distance(tr, br);

  const targetW = Math.max(100, Math.round(Math.max(wTop, wBot)));
  const targetH = Math.max(60, Math.round(Math.max(hLeft, hRight)));

  // Destination rectangle points: (0,0), (targetW,0), (targetW,targetH), (0,targetH)
  const dstPts = [
    [0, 0],
    [targetW, 0],
    [targetW, targetH],
    [0, targetH]
  ];

  // Inverse homography: maps each (u, v) in destination back to (x, y) in source
  const H = solveHomography(dstPts, [tl, tr, br, bl]);

  // Read source pixels
  const srcCanvas = document.createElement('canvas');
  const srcW = sourceImg.naturalWidth || sourceImg.width;
  const srcH = sourceImg.naturalHeight || sourceImg.height;
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(sourceImg, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH);
  const srcPixels = srcData.data;

  // Create destination canvas
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = targetW;
  dstCanvas.height = targetH;
  const dstCtx = dstCanvas.getContext('2d');
  const dstImgData = dstCtx.createImageData(targetW, targetH);
  const dstPixels = dstImgData.data;

  const h00 = H[0][0], h01 = H[0][1], h02 = H[0][2];
  const h10 = H[1][0], h11 = H[1][1], h12 = H[1][2];
  const h20 = H[2][0], h21 = H[2][1], h22 = H[2][2];

  let dstIdx = 0;
  for (let v = 0; v < targetH; v++) {
    for (let u = 0; u < targetW; u++) {
      const wNorm = h20 * u + h21 * v + h22;
      const x = (h00 * u + h01 * v + h02) / wNorm;
      const y = (h10 * u + h11 * v + h12) / wNorm;

      if (x >= 0 && x < srcW - 1 && y >= 0 && y < srcH - 1) {
        // Bilinear interpolation
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = x0 + 1;
        const y1 = y0 + 1;

        const dx = x - x0;
        const dy = y - y0;
        const w00 = (1 - dx) * (1 - dy);
        const w10 = dx * (1 - dy);
        const w01 = (1 - dx) * dy;
        const w11 = dx * dy;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        dstPixels[dstIdx] = Math.round(
          w00 * srcPixels[idx00] +
          w10 * srcPixels[idx10] +
          w01 * srcPixels[idx01] +
          w11 * srcPixels[idx11]
        );
        dstPixels[dstIdx + 1] = Math.round(
          w00 * srcPixels[idx00 + 1] +
          w10 * srcPixels[idx10 + 1] +
          w01 * srcPixels[idx01 + 1] +
          w11 * srcPixels[idx11 + 1]
        );
        dstPixels[dstIdx + 2] = Math.round(
          w00 * srcPixels[idx00 + 2] +
          w10 * srcPixels[idx10 + 2] +
          w01 * srcPixels[idx01 + 2] +
          w11 * srcPixels[idx11 + 2]
        );
        dstPixels[dstIdx + 3] = 255;
      } else {
        dstPixels[dstIdx + 3] = 0; // Transparent if out of bounds
      }
      dstIdx += 4;
    }
  }

  dstCtx.putImageData(dstImgData, 0, 0);

  // Apply Light & Colour adjustments
  applyAdjustmentsToCanvas(dstCanvas, adjustments);

  return dstCanvas;
}

/**
 * Performs straight rectangular crop
 * rect = { x, y, width, height } in source coordinates
 */
export function straightCropCanvas(sourceImg, rect, adjustments = {}) {
  const canvas = document.createElement('canvas');
  const cropW = Math.max(10, Math.round(rect.width));
  const cropH = Math.max(10, Math.round(rect.height));
  canvas.width = cropW;
  canvas.height = cropH;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    sourceImg,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    cropW,
    cropH
  );

  applyAdjustmentsToCanvas(canvas, adjustments);
  return canvas;
}

/**
 * Converts a Canvas to a Blob
 */
export function canvasToBlob(canvas, type = 'image/png', quality = 0.95) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Downloads a Blob or DataURL to the user's filesystem
 */
export function downloadFile(dataOrBlob, filename) {
  const link = document.createElement('a');
  let url = dataOrBlob;
  let isBlobUrl = false;

  if (dataOrBlob instanceof Blob) {
    url = URL.createObjectURL(dataOrBlob);
    isBlobUrl = true;
  }

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (isBlobUrl) {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

/**
 * Generates and downloads a ZIP file containing front-side.png and back-side.png
 */
export async function downloadBothSidesAsZip(frontBlobOrData, backBlobOrData, zipFilename = 'id-card-cropped.zip') {
  const zip = new JSZip();

  // Helper to get arrayBuffer from blob or dataUrl
  const getBuffer = async (item) => {
    if (item instanceof Blob) {
      return await item.arrayBuffer();
    }
    if (typeof item === 'string' && item.startsWith('data:')) {
      const commaIdx = item.indexOf(',');
      const base64 = item.slice(commaIdx + 1);
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }
    throw new Error('Unsupported image data type for ZIP');
  };

  const frontBuf = await getBuffer(frontBlobOrData);
  const backBuf = await getBuffer(backBlobOrData);

  zip.file('front-side.png', frontBuf);
  zip.file('back-side.png', backBuf);

  const zipContent = await zip.generateAsync({ type: 'blob' });
  downloadFile(zipContent, zipFilename);
}



/**
 * Generates and downloads a print-ready A4 PDF containing Front & Back sides
 */
export async function downloadBothSidesAsPdf(frontDataUrl, backDataUrl, filename = 'id-card-both-sides.pdf') {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const getImageDims = (src) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 856, height: 540 });
      img.src = src;
    });
  };

  const frontDims = await getImageDims(frontDataUrl);
  const backDims = await getImageDims(backDataUrl);

  // Standard Indian CR80 ID Card dimensions (mm): 85.6 x 54.0
  const targetCardW = 86;
  const targetCardH = 54;

  // Aspect-correct front
  const frontAspect = frontDims.width / frontDims.height;
  let fW = targetCardW;
  let fH = targetCardW / frontAspect;
  if (fH > targetCardH + 4) {
    fH = targetCardH;
    fW = targetCardH * frontAspect;
  }

  // Aspect-correct back
  const backAspect = backDims.width / backDims.height;
  let bW = targetCardW;
  let bH = targetCardW / backAspect;
  if (bH > targetCardH + 4) {
    bH = targetCardH;
    bW = targetCardH * backAspect;
  }

  // --- SECTION 1: SIDE-BY-SIDE LAMINATION READY LAYOUT (TOP OF A4) ---
  const gap = 6;
  const totalW = fW + gap + bW;
  const startX = (210 - totalW) / 2;
  const startY = 24;

  // Header banner on PDF
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('MB MITRA — ID CARD PRINT STUDIO', 105, 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Standard CR80 Size (86mm × 54mm) • Ready for Color PVC / Lamination Printing', 105, 18.5, { align: 'center' });

  // Light dashed border / cut guide for Front Side
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([2, 1.5], 0);
  doc.setLineWidth(0.3);
  doc.rect(startX - 0.5, startY - 0.5, fW + 1, fH + 1);

  // Add Front Card Image
  doc.addImage(frontDataUrl, 'PNG', startX, startY, fW, fH, undefined, 'FAST');

  // Label above front
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(2, 132, 199);
  doc.text('FRONT SIDE', startX + fW / 2, startY - 2, { align: 'center' });

  // Center vertical fold/cut guide line
  const foldLineX = startX + fW + gap / 2;
  doc.setDrawColor(148, 163, 184);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.line(foldLineX, startY - 4, foldLineX, startY + Math.max(fH, bH) + 4);

  // Light dashed border / cut guide for Back Side
  const backX = startX + fW + gap;
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([2, 1.5], 0);
  doc.rect(backX - 0.5, startY - 0.5, bW + 1, bH + 1);

  // Add Back Card Image
  doc.addImage(backDataUrl, 'PNG', backX, startY, bW, bH, undefined, 'FAST');

  // Label above back
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(2, 132, 199);
  doc.text('BACK SIDE', backX + bW / 2, startY - 2, { align: 'center' });

  // Cutting guidelines instruction note
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Cut along the outer dashed guides and fold along the center line for dual-sided lamination.', 105, startY + Math.max(fH, bH) + 8, { align: 'center' });

  // Divider Line
  doc.setDrawColor(226, 232, 240);
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(0.4);
  doc.line(20, startY + Math.max(fH, bH) + 14, 190, startY + Math.max(fH, bH) + 14);

  // --- SECTION 2: VERTICAL STACKED VIEW (FOR INDIVIDUAL CUTOUTS) ---
  const stackStartY = startY + Math.max(fH, bH) + 22;
  const stackCenterX = (210 - fW) / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('INDIVIDUAL CUTOUT VIEW', 105, stackStartY - 2, { align: 'center' });

  // Front Stacked
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([2, 1.5], 0);
  doc.rect(stackCenterX - 0.5, stackStartY + 2 - 0.5, fW + 1, fH + 1);
  doc.addImage(frontDataUrl, 'PNG', stackCenterX, stackStartY + 2, fW, fH, undefined, 'FAST');

  // Back Stacked
  const backStackY = stackStartY + fH + 10;
  const backStackCenterX = (210 - bW) / 2;
  doc.rect(backStackCenterX - 0.5, backStackY - 0.5, bW + 1, bH + 1);
  doc.addImage(backDataUrl, 'PNG', backStackCenterX, backStackY, bW, bH, undefined, 'FAST');

  // Footer metadata
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  const printDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.text(`Generated via MB Mitra Document Studio • Date: ${printDate} • Print Scale: 100% (Actual Size)`, 105, 290, { align: 'center' });

  doc.save(filename);
}
