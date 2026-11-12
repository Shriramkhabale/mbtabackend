'use strict';
/**
 * MB Mitra — Automated Settings & Processing Engine Verification Suite
 * Verifies that dynamic settings passed from the frontend produce real,
 * measurably different outputs across ALL 12 Document & AI Tools.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawnSync } = require('child_process');
const { PDFDocument } = require('pdf-lib');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Import utilities
const { callAadharCardPdfCutterAi } = require('./utils/aadharCutter');
const { callAllTypeIdCardCutterAi } = require('./utils/allTypeIdCardCutter');
const { callPanCardCutterAi } = require('./utils/panCardCutter');
const { callMeraRationCutterAi } = require('./utils/meraRationCutter');
const { callVoterIdCutterAi } = require('./utils/voterIdCutter');
const { callPmjayCardCutterAi } = require('./utils/pmjayCardCutter');
const { callIdentityCardAutoCropLocal } = require('./utils/localAutoCrop');
const { callBackgroundRemoverLocal } = require('./utils/localBackgroundRemover');
const { callImageEnhancerLocal } = require('./utils/localImageEnhancer');
const { callPdfToHtmlAi } = require('./utils/pdfToHtmlConverter');
const { callImageToTextLocal } = require('./utils/localOcr');
const { callDigitalSignatureValidatorLocal } = require('./utils/localDigitalSignatureValidator');
const { createSessionToken } = require('./utils/sessionToken');

let passCount = 0;
let failCount = 0;

function resolveOutputFilePath(res) {
  if (res.filePath && fs.existsSync(res.filePath)) {
    return res.filePath;
  }
  const fName = res.fileName || res.outputFileName || (res.file_url ? res.file_url.split('/').pop().split('?')[0] : '');
  const candidate1 = path.join(__dirname, 'uploads', 'temp', fName);
  if (fs.existsSync(candidate1)) return candidate1;
  const candidate2 = path.join(__dirname, 'temp_tools', fName);
  if (fs.existsSync(candidate2)) return candidate2;
  return res.filePath || candidate1;
}

function getImageInfoViaPython(filePath) {
  const code = `
from PIL import Image
import json
img = Image.open(r'''${filePath}''')
p = img.getpixel((0, 0))
print(json.dumps({
  "width": img.size[0],
  "height": img.size[1],
  "pixel": list(p) if isinstance(p, (tuple, list)) else [p],
  "dpi": img.info.get("dpi")
}))
`;
  const res = spawnSync('python', ['-c', code], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error('Python image check error: ' + (res.stderr || res.stdout));
  }
  return JSON.parse(res.stdout.trim());
}

async function runAsyncTest(testName, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${testName}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}: ${err.message}`);
    failCount++;
  }
}

function makeHttpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (postData) {
      if (typeof postData === 'object' && !Buffer.isBuffer(postData)) {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(postData));
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
}

// Helpers: Generate test PDF and test image buffers
async function createTestPdf(pageCount = 1) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595.28, 841.89]); // A4
    page.drawText(`MB Mitra Test Document Page ${i + 1}`, { x: 50, y: 800, size: 14 });
    page.drawRectangle({ x: 50, y: 600, width: 242.65, height: 153.07 }); // Mock ID card front
    page.drawRectangle({ x: 50, y: 400, width: 242.65, height: 153.07 }); // Mock ID card back
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function createTestImage() {
  const pyCode = `
from PIL import Image, ImageDraw
import io, sys
img = Image.new('RGB', (400, 300), (220, 220, 220))
draw = ImageDraw.Draw(img)
draw.rectangle([50, 40, 350, 260], fill=(255, 255, 255), outline=(0, 0, 0), width=2)
draw.rectangle([70, 70, 150, 170], fill=(70, 130, 180))
b = io.BytesIO()
img.save(b, format='PNG')
sys.stdout.buffer.write(b.getvalue())
`;
  const res = spawnSync('python', ['-c', pyCode]);
  if (res.status !== 0) {
    throw new Error('Failed to create test image: ' + res.stderr.toString());
  }
  return res.stdout;
}

function createTestOcrImage() {
  const pyCode = `
from PIL import Image, ImageDraw
import io, sys
img = Image.new('RGB', (400, 150), (255, 255, 255))
draw = ImageDraw.Draw(img)
draw.text((20, 30), "GOVERNMENT OF INDIA", fill=(0, 0, 0))
draw.text((20, 70), "INCOME TAX DEPARTMENT", fill=(0, 0, 0))
b = io.BytesIO()
img.save(b, format='PNG')
sys.stdout.buffer.write(b.getvalue())
`;
  const res = spawnSync('python', ['-c', pyCode]);
  if (res.status !== 0) {
    throw new Error('Failed to create test OCR image: ' + res.stderr.toString());
  }
  return res.stdout;
}

async function main() {
  console.log('\n=============================================================');
  console.log('  MB MITRA — FUNCTIONAL SETTINGS INTEGRATION VERIFICATION');
  console.log('=============================================================\n');

  const testPdfBuf = await createTestPdf(2);
  const testImgBuf = createTestImage();
  const testOcrBuf = createTestOcrImage();

  // ------------------------------------------------------------------------
  // Suite 1: Aadhaar Card PDF Cutter — Dynamic Page Dimensions & Layout
  // ------------------------------------------------------------------------
  console.log('--- Suite 1: Aadhaar Card PDF Cutter Dynamic Settings ---');

  await runAsyncTest('Aadhaar Cutter: CR-80 Standard preset produces 85.6 × 54.0 mm pages', async () => {
    const res = await callAadharCardPdfCutterAi({
      fileData: testPdfBuf,
      userId: 'test_user',
      settings: { widthMm: 85.6, heightMm: 54.0, dpi: 300 }
    });

    assert(res.file_url, 'Must return a file URL');
    const outputPath = resolveOutputFilePath(res);
    const pdfBytes = fs.readFileSync(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    assert(pages.length >= 1, 'PDF must contain pages');
    const { width, height } = pages[0].getSize();
    // 85.6 mm = 242.65 pt, 54.0 mm = 153.07 pt
    assert(Math.abs(width - 242.65) < 1.0, `Width expected ~242.65 pt, got ${width}`);
    assert(Math.abs(height - 153.07) < 1.0, `Height expected ~153.07 pt, got ${height}`);
    assert.strictEqual(parseFloat(res.dimensions?.widthMm), 85.6);
    assert.strictEqual(parseFloat(res.dimensions?.heightMm), 54.0);
  });

  await runAsyncTest('Aadhaar Cutter: Custom Passport preset changes page dimensions to 35.0 × 45.0 mm', async () => {
    const res = await callAadharCardPdfCutterAi({
      fileData: testPdfBuf,
      userId: 'test_user',
      settings: { widthMm: 35.0, heightMm: 45.0, dpi: 300 }
    });

    const outputPath = resolveOutputFilePath(res);
    const pdfBytes = fs.readFileSync(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    const { width, height } = pages[0].getSize();
    // 35.0 mm = 99.21 pt, 45.0 mm = 127.56 pt
    assert(Math.abs(width - 99.21) < 1.0, `Width expected ~99.21 pt, got ${width}`);
    assert(Math.abs(height - 127.56) < 1.0, `Height expected ~127.56 pt, got ${height}`);
  });

  await runAsyncTest('Aadhaar Cutter: A4 Multi-Card 4-Grid generates a single A4 page with 4 cards', async () => {
    const res = await callAadharCardPdfCutterAi({
      fileData: testPdfBuf,
      userId: 'test_user',
      settings: { layoutMode: 'a4_multi_4' }
    });

    const outputPath = resolveOutputFilePath(res);
    const pdfBytes = fs.readFileSync(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    assert.strictEqual(pages.length, 1, 'Multi-card grid must produce 1 consolidated sheet');
    const { width, height } = pages[0].getSize();
    // A4 = 595.28 x 841.89 pt
    assert(Math.abs(width - 595.28) < 1.0, `Width expected ~595.28 pt, got ${width}`);
    assert(Math.abs(height - 841.89) < 1.0, `Height expected ~841.89 pt, got ${height}`);
  });

  // ------------------------------------------------------------------------
  // Suite 2: All Type ID, PAN, Ration, Voter ID & PMJAY Card Cutters
  // ------------------------------------------------------------------------
  console.log('\n--- Suite 2: All Type ID, PAN, Ration, Voter & PMJAY Card Cutters ---');

  await runAsyncTest('All Type ID Cutter: Custom dimensions 70 × 100 mm applied to output', async () => {
    const res = await callAllTypeIdCardCutterAi({
      fileData: testPdfBuf,
      userId: 'test_user',
      settings: { widthMm: 70.0, heightMm: 100.0, dpi: 300 }
    });

    const outputPath = resolveOutputFilePath(res);
    const pdfBytes = fs.readFileSync(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    const { width, height } = pages[0].getSize();
    // 70 mm = 198.43 pt, 100 mm = 283.46 pt
    assert(Math.abs(width - 198.43) < 1.0, `Width expected ~198.43 pt, got ${width}`);
    assert(Math.abs(height - 283.46) < 1.0, `Height expected ~283.46 pt, got ${height}`);
  });

  await runAsyncTest('PAN Card Cutter: Custom dimensions 50 × 80 mm applied to output', async () => {
    const res = await callPanCardCutterAi({
      fileData: testPdfBuf,
      userId: 'test_user',
      settings: { widthMm: 50.0, heightMm: 80.0, dpi: 300 }
    });

    const outputPath = resolveOutputFilePath(res);
    const pdfBytes = fs.readFileSync(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    const { width, height } = pages[0].getSize();
    // 50 mm = 141.73 pt, 80 mm = 226.77 pt
    assert(Math.abs(width - 141.73) < 1.0, `Width expected ~141.73 pt, got ${width}`);
    assert(Math.abs(height - 226.77) < 1.0, `Height expected ~226.77 pt, got ${height}`);
  });

  await runAsyncTest('Mera Ration Card Cutter: Custom dimensions 60 × 90 mm applied to output', async () => {
    const res = await callMeraRationCutterAi({
      fileData: testPdfBuf,
      userId: 'test_user',
      settings: { widthMm: 60.0, heightMm: 90.0, dpi: 300 }
    });

    const outputPath = resolveOutputFilePath(res);
    const pdfBytes = fs.readFileSync(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    const { width, height } = pages[0].getSize();
    // 60 mm = 170.08 pt, 90 mm = 255.12 pt
    assert(Math.abs(width - 170.08) < 1.0, `Width expected ~170.08 pt, got ${width}`);
    assert(Math.abs(height - 255.12) < 1.0, `Height expected ~255.12 pt, got ${height}`);
  });

  await runAsyncTest('Voter ID Card Cutter: Custom dimensions 35 × 45 mm applied to output', async () => {
    const res = await callVoterIdCutterAi({
      fileData: testPdfBuf,
      userId: 'test_user',
      settings: { widthMm: 35.0, heightMm: 45.0, dpi: 300 }
    });

    const outputPath = resolveOutputFilePath(res);
    const pdfBytes = fs.readFileSync(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    const { width, height } = pages[0].getSize();
    // 35 mm = 99.21 pt, 45 mm = 127.56 pt
    assert(Math.abs(width - 99.21) < 1.0, `Width expected ~99.21 pt, got ${width}`);
    assert(Math.abs(height - 127.56) < 1.0, `Height expected ~127.56 pt, got ${height}`);
  });

  await runAsyncTest('PMJAY Ayushman Card Cutter: A4 Multi-Card 4-Grid generates a single A4 sheet', async () => {
    const res = await callPmjayCardCutterAi({
      fileData: testPdfBuf,
      userId: 'test_user',
      settings: { layoutMode: 'a4_multi_4' }
    });

    const outputPath = resolveOutputFilePath(res);
    const pdfBytes = fs.readFileSync(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    assert.strictEqual(pages.length, 1, 'Multi-card grid must produce 1 consolidated sheet');
    const { width, height } = pages[0].getSize();
    assert(Math.abs(width - 595.28) < 1.0, `Width expected ~595.28 pt, got ${width}`);
    assert(Math.abs(height - 841.89) < 1.0, `Height expected ~841.89 pt, got ${height}`);
  });

  // ------------------------------------------------------------------------
  // Suite 3: Local Image AI Tools — Resolution, Upscale, and Background Color
  // ------------------------------------------------------------------------
  console.log('\n--- Suite 3: Local Image AI Dynamic Customization ---');

  await runAsyncTest('Auto Crop: Custom Target Width/Height and DPI applied to output image', async () => {
    const res = await callIdentityCardAutoCropLocal({
      fileData: testImgBuf,
      userId: 'test_user',
      settings: { widthMm: 50.8, heightMm: 50.8, dpi: 300 } // 2x2 inches = 600x600 px
    });

    const outputPath = resolveOutputFilePath(res);
    const info = getImageInfoViaPython(outputPath);

    // 50.8 mm / 25.4 * 300 = 600 px
    assert.strictEqual(info.width, 600, `Expected width 600px, got ${info.width}`);
    assert.strictEqual(info.height, 600, `Expected height 600px, got ${info.height}`);
  });

  await runAsyncTest('Image Enhancer: 1x vs 2x upscale factor dynamically changes output dimensions', async () => {
    const res1x = await callImageEnhancerLocal({
      fileData: testImgBuf,
      userId: 'test_user',
      settings: { upscaleFactor: 1 }
    });
    const info1x = getImageInfoViaPython(resolveOutputFilePath(res1x));

    const res2x = await callImageEnhancerLocal({
      fileData: testImgBuf,
      userId: 'test_user',
      settings: { upscaleFactor: 2 }
    });
    const info2x = getImageInfoViaPython(resolveOutputFilePath(res2x));

    assert.strictEqual(info2x.width, info1x.width * 2, '2x upscale must have 2x width');
    assert.strictEqual(info2x.height, info1x.height * 2, '2x upscale must have 2x height');
  });

  await runAsyncTest('Background Remover: Replacement solid background applied to output', async () => {
    const resBlue = await callBackgroundRemoverLocal({
      fileData: testImgBuf,
      userId: 'test_user',
      bgColor: 'blue'
    });

    const outputPath = resolveOutputFilePath(resBlue);
    const info = getImageInfoViaPython(outputPath);
    const p = info.pixel;
    assert(p.length >= 3, 'Must have at least 3 color channels');
    assert(p[2] > p[0] && p[2] > 150, `Expected blue background pixel, got ${JSON.stringify(p)}`);
  });

  // ------------------------------------------------------------------------
  // Suite 4: PDF to HTML, OCR & Digital Signature
  // ------------------------------------------------------------------------
  console.log('\n--- Suite 4: PDF to HTML, OCR & Digital Signature ---');

  await runAsyncTest('PDF to HTML: Theme "dark" applies dark mode CSS variables', async () => {
    const res = await callPdfToHtmlAi({
      fileData: testPdfBuf,
      userId: 'test_user',
      theme: 'dark',
      fontSize: 'large'
    });

    assert(res.html.includes('--bg-color: #0f172a'), 'Dark theme must set dark bg color');
    assert(res.html.includes('--base-font-size: 16px'), 'Large font size must set 16px');
  });

  await runAsyncTest('PDF to HTML: Page range "1" isolates only first page in generated HTML', async () => {
    const res = await callPdfToHtmlAi({
      fileData: testPdfBuf,
      userId: 'test_user',
      pageRange: '1'
    });

    assert(res.html.includes('id="page-1"'), 'Must include page 1');
    assert(!res.html.includes('id="page-2"'), 'Must NOT include page 2 when pageRange is "1"');
  });

  await runAsyncTest('Image to Text (OCR): Accepts language options without error', async () => {
    const res = await callImageToTextLocal({
      fileData: testOcrBuf,
      languages: 'en,hi',
      preprocess: 'high_contrast'
    });
    assert(res.success === true, 'OCR must return success true');
  });

  await runAsyncTest('Digital Signature: Validates PDF structure and reports certificate status', async () => {
    const res = await callDigitalSignatureValidatorLocal({
      fileData: testPdfBuf,
      fileName: 'test_document.pdf'
    });
    assert(res.success === true, 'Must return success true');
    assert(res.validationStatus !== undefined, 'Must return validationStatus');
  });

  // ------------------------------------------------------------------------
  // Suite 5: HTTP /api/tools/process Dynamic Settings Forwarding
  // ------------------------------------------------------------------------
  console.log('\n--- Suite 5: HTTP End-to-End Dynamic Settings Forwarding ---');

  const token = createSessionToken({ userId: 'MBTAR000010101', role: 'retailer' });
  const authHeaders = {
    'Authorization': `Bearer ${token}`
  };

  await runAsyncTest('HTTP /api/tools/process: Passes custom settings and returns measured dimensions', async () => {
    const payload = {
      toolTitle: 'Aadhaar Card PDF Cutter',
      preset: 'Indian Passport Photo',
      settings: { widthMm: 35.0, heightMm: 45.0, dpi: 300 },
      fileName: 'test_aadhaar.pdf',
      fileData: `data:application/pdf;base64,${testPdfBuf.toString('base64')}`
    };

    const res = await makeHttpRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/tools/process',
      method: 'POST',
      headers: authHeaders
    }, payload);

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.success === true, 'Response must indicate success');
    assert(res.body.outputUrl, 'Must return an output URL');
    assert.strictEqual(parseFloat(res.body.dimensions?.widthMm), 35.0, `Width must match 35.0 mm`);
    assert.strictEqual(parseFloat(res.body.dimensions?.heightMm), 45.0, `Height must match 45.0 mm`);
  });

  await runAsyncTest('HTTP /api/tools/process: Auto Crop applies custom resolution and dimensions', async () => {
    const payload = {
      toolTitle: 'Automatic Identity Card Cropping',
      settings: { widthMm: 50.8, heightMm: 50.8, dpi: 300 },
      fileName: 'test_crop.png',
      fileData: `data:image/png;base64,${testImgBuf.toString('base64')}`
    };

    const res = await makeHttpRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/tools/process',
      method: 'POST',
      headers: authHeaders
    }, payload);

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert(res.body.success === true, 'Response must indicate success');
    assert.strictEqual(res.body.dimensions?.widthPx, 600, 'Width px must match 600');
    assert.strictEqual(res.body.dimensions?.heightPx, 600, 'Height px must match 600');
  });

  // ------------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------------
  console.log('\n=============================================================');
  console.log(`  SETTINGS VERIFICATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=============================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
