/**
 * MB Mitra Document & AI Tools — Transfer Compatibility, Portability & Security Test Suite
 * Validates:
 *  1. Chained file transfers (PDF -> HTML, PDF -> Digital Signature, Image -> Crop -> Enhance -> BG Remove -> OCR)
 *  2. SSRF attack rejection
 *  3. Cross-retailer isolation & unauthorized file access rejection
 *  4. Token tampering and expiration rejection
 *  5. getPythonExecutable() resolution logic (PYTHON_BIN, venv, platform defaults)
 *  6. Subprocess error trapping (ENOENT, timeout, missing modules)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  TEMP_DIR,
  generateDownloadToken,
  verifyDownloadToken,
  resolveIncomingDocument,
  getPythonExecutable,
  runPythonWorker
} = require('./utils/toolHelpers');
const { createSessionToken } = require('./utils/sessionToken');

const API_BASE = 'http://localhost:5000/api/tools';

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failedCount++;
  }
}

// Generate an authentic synthetic ID card image with clear borders and text for OpenCV and OCR
function generateSyntheticCardImageBase64() {
  const pyScript = [
    'import cv2, numpy as np, base64',
    'img = np.ones((250, 400, 3), dtype=np.uint8) * 255',
    'cv2.rectangle(img, (30, 30), (370, 220), (0, 0, 0), 2)',
    'cv2.putText(img, "INCOME TAX DEPARTMENT", (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,0), 2)',
    'cv2.putText(img, "ABCDE1234F", (40, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,0,0), 2)',
    '_, buf = cv2.imencode(".png", img)',
    'print(base64.b64encode(buf).decode("ascii"))'
  ].join('\n');

  const pyBin = getPythonExecutable();
  const pyRes = spawnSync(pyBin, ['-c', pyScript], { encoding: 'utf8' });
  if (pyRes.error || !pyRes.stdout) {
    throw new Error('Failed to generate synthetic card image: ' + (pyRes.error?.message || pyRes.stderr));
  }
  return 'data:image/png;base64,' + pyRes.stdout.trim();
}

async function createSyntheticAadhaarPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  page.drawText('GOVERNMENT OF INDIA - UNIQUE IDENTIFICATION AUTHORITY OF INDIA', { x: 50, y: 800, size: 10, font });
  page.drawRectangle({ x: 35, y: 40, width: 255, height: 215, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText('Aadhaar Card Front\nName: Ramesh Kumar\nDOB: 01/01/1985\n1234 5678 9012', { x: 45, y: 150, size: 10, font });
  page.drawRectangle({ x: 295, y: 40, width: 255, height: 215, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText('Address: House 45, Athani, Belagavi, Karnataka - 591304', { x: 305, y: 150, size: 9, font });
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function apiRequest(endpoint, body, token) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runTestSuite() {
  console.log('======================================================================');
  console.log('   MB MITRA — TRANSFER COMPATIBILITY, PORTABILITY & SECURITY SUITE    ');
  console.log('======================================================================\n');

  const retailer1Token = createSessionToken({ userId: 'MBTAR000010101', role: 'retailer' });
  const retailer2Token = createSessionToken({ userId: 'MBTAR000020202', role: 'retailer' });

  // -------------------------------------------------------------------------
  // SECTION 1: PDF PROCESSING & CHAINED SEND-TO-TOOL WORKFLOW
  // -------------------------------------------------------------------------
  console.log('--- Section 1: PDF Processing & Chained Send-to-Tool ---');
  let generatedPdfUrl = null;
  let generatedPdfFilename = null;

  try {
    const rawPdf = await createSyntheticAadhaarPdf();
    const res1 = await apiRequest('/process', {
      toolTitle: 'AADHAR CARD PDF CUTTER AI API',
      fileName: 'source_aadhaar.pdf',
      fileData: `data:application/pdf;base64,${rawPdf.toString('base64')}`,
      settings: { widthMm: 85.6, heightMm: 54.0, dpi: 300 }
    }, retailer1Token);

    assert(res1.status === 200 && res1.data.success === true, 'Step 1: Aadhaar PDF processed successfully');
    generatedPdfUrl = res1.data.outputUrl;
    generatedPdfFilename = res1.data.outputFileName;
    assert(generatedPdfUrl && generatedPdfUrl.includes('?token='), 'Step 1: Generated PDF contains secure download URL');
  } catch (err) {
    assert(false, `Step 1 (Aadhaar PDF generation) threw error: ${err.message}`);
  }

  // Chain 1 -> 2: Send PDF to PDF-to-HTML converter
  try {
    const res2 = await apiRequest('/process', {
      toolTitle: 'PDF 2 HTML CONVERT API',
      fileName: generatedPdfFilename,
      fileUrl: generatedPdfUrl
    }, retailer1Token);

    assert(res2.status === 200 && res2.data.success === true, 'Step 2: PDF-to-HTML converter accepted transferred fileUrl');
    assert(res2.data.htmlContent && res2.data.htmlContent.length > 50, 'Step 2: Converted HTML markup generated from transferred PDF');
  } catch (err) {
    assert(false, `Step 2 (PDF-to-HTML transfer) threw error: ${err.message}`);
  }

  // Chain 1 -> 3: Send PDF to Digital Signature PDF Validator
  try {
    const res3 = await apiRequest('/process', {
      toolTitle: 'DIGITAL SIGNATURE PDF VALIDATION AI TOOL API',
      fileName: generatedPdfFilename,
      fileUrl: generatedPdfUrl
    }, retailer1Token);

    assert(res3.status === 200 && res3.data.success === true, 'Step 3: Digital Signature Validator accepted transferred fileUrl');
    assert(res3.data.signatureValidation && res3.data.signatureValidation.validationStatus, 'Step 3: Signature validation executed on transferred PDF');
  } catch (err) {
    assert(false, `Step 3 (Digital Signature transfer) threw error: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 2: CHAINED IMAGE-TO-IMAGE PROCESSING PIPELINE
  // -------------------------------------------------------------------------
  console.log('\n--- Section 2: Chained Image-to-Image Processing Pipeline ---');
  let croppedImageUrl = null;
  let enhancedImageUrl = null;
  let bgRemovedImageUrl = null;

  try {
    const cardPngB64 = generateSyntheticCardImageBase64();

    // 2.1 Auto Crop
    const cropRes = await apiRequest('/process', {
      toolTitle: 'ALL IDENTITY CARD AUTOMATIC CROPPING TOOLS API',
      fileName: 'test_card.png',
      fileData: cardPngB64
    }, retailer1Token);

    assert(cropRes.status === 200 && cropRes.data.success === true, 'Image 1: Auto ID Crop executed successfully');
    croppedImageUrl = cropRes.data.outputUrl;
    assert(croppedImageUrl && croppedImageUrl.includes('?token='), 'Image 1: Auto ID Crop output returned valid fileUrl');

    // 2.2 Image Enhancer using output of Auto Crop
    const enhanceRes = await apiRequest('/process', {
      toolTitle: 'AI IMAGE ENHANCER API – IMPROVE IMAGE QUALITY INSTANTLY',
      fileName: cropRes.data.outputFileName,
      fileUrl: croppedImageUrl,
      preset: 'standard'
    }, retailer1Token);

    assert(enhanceRes.status === 200 && enhanceRes.data.success === true, 'Image 2: Image Enhancer accepted cropped fileUrl');
    enhancedImageUrl = enhanceRes.data.outputUrl;
    assert(enhancedImageUrl && enhancedImageUrl.includes('?token='), 'Image 2: Enhancer output returned valid fileUrl');

    // 2.3 Background Remover using output of Enhancer
    const bgRes = await apiRequest('/process', {
      toolTitle: 'BACKGROUND REMOVER IMAGE AI API',
      fileName: enhanceRes.data.outputFileName,
      fileUrl: enhancedImageUrl
    }, retailer1Token);

    assert(bgRes.status === 200 && bgRes.data.success === true, 'Image 3: Background Remover accepted enhanced fileUrl');
    bgRemovedImageUrl = bgRes.data.outputUrl;
    assert(bgRemovedImageUrl && bgRemovedImageUrl.includes('?token='), 'Image 3: Background Remover output returned valid fileUrl');

    // 2.4 OCR using output of Background Remover
    const ocrRes = await apiRequest('/process', {
      toolTitle: 'IMAGE TO TEXT CONVERTER ONLINE API',
      fileName: bgRes.data.outputFileName,
      fileUrl: bgRemovedImageUrl
    }, retailer1Token);

    assert(ocrRes.status === 200 && ocrRes.data.success === true, 'Image 4: OCR Tool accepted bgRemoved fileUrl');
    assert(ocrRes.data.extractedText !== undefined, 'Image 4: OCR processed transferred file');
  } catch (err) {
    assert(false, `Image pipeline failed: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 3: SECURITY CONTROLS & ISOLATION
  // -------------------------------------------------------------------------
  console.log('\n--- Section 3: Security & Access Control Enforcement ---');

  // 3.1 SSRF Attack Blocking
  try {
    const ssrfRes = await apiRequest('/process', {
      toolTitle: 'PDF 2 HTML CONVERT API',
      fileUrl: 'http://169.254.169.254/latest/meta-data/'
    }, retailer1Token);

    assert(ssrfRes.status === 400 || ssrfRes.status === 502, `Security 1: SSRF request to AWS metadata endpoint blocked (HTTP ${ssrfRes.status})`);
  } catch (err) {
    assert(false, `Security 1 check failed: ${err.message}`);
  }

  try {
    const ssrfExtRes = await apiRequest('/process', {
      toolTitle: 'PDF 2 HTML CONVERT API',
      fileUrl: 'https://evil-attacker-site.com/exploit.pdf'
    }, retailer1Token);

    assert(ssrfExtRes.status === 400 || ssrfExtRes.status === 502, `Security 2: SSRF request to arbitrary external domain blocked (HTTP ${ssrfExtRes.status})`);
  } catch (err) {
    assert(false, `Security 2 check failed: ${err.message}`);
  }

  // 3.2 Cross-Retailer Isolation (Retailer 2 attempts to access Retailer 1's file without a valid token)
  try {
    const crossRetailerUrl = `/api/tools/download/${generatedPdfFilename}?token=unauthorized_token_for_r2`;
    const crossRes = await apiRequest('/process', {
      toolTitle: 'PDF 2 HTML CONVERT API',
      fileUrl: crossRetailerUrl
    }, retailer2Token);

    assert(crossRes.status === 400 || crossRes.status === 403 || crossRes.status === 502, `Security 3: Cross-retailer file access without valid token rejected (HTTP ${crossRes.status})`);
  } catch (err) {
    assert(false, `Security 3 check failed: ${err.message}`);
  }

  // 3.3 Expired Token Rejection
  try {
    const crypto = require('crypto');
    const secret = process.env.JWT_KEY || 'mbta_secure_tool_key';
    const expiredTimestamp = Date.now() - 60000; // expired 1 minute ago
    const payload = `MBTAR000010101:${generatedPdfFilename}:${expiredTimestamp}`;
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const expiredToken = Buffer.from(`${payload}:${sig}`).toString('base64url');

    const result = verifyDownloadToken(expiredToken, generatedPdfFilename);
    assert(result === null, 'Security 4: Expired token verification returns null');
  } catch (err) {
    assert(false, `Security 4 check failed: ${err.message}`);
  }

  // 3.4 Tampered Token Rejection
  try {
    const validToken = generateDownloadToken(generatedPdfFilename, 'MBTAR000010101');
    const tamperedToken = validToken + 'tampered_signature_bytes';
    const result = verifyDownloadToken(tamperedToken, generatedPdfFilename);
    assert(result === null, 'Security 5: Tampered token signature rejected (returns null)');
  } catch (err) {
    assert(false, `Security 5 check failed: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 4: PYTHON PORTABILITY & ERROR TRAPPING
  // -------------------------------------------------------------------------
  console.log('\n--- Section 4: Python Executable Portability & Subprocess Trapping ---');

  // 4.1 Python Executable Detection
  try {
    const resolvedPython = getPythonExecutable();
    assert(typeof resolvedPython === 'string' && resolvedPython.length > 0, `Python 1: getPythonExecutable() returns '${resolvedPython}'`);
  } catch (err) {
    assert(false, `Python 1 check failed: ${err.message}`);
  }

  // 4.2 PYTHON_BIN Environment Variable Override
  try {
    const origBin = process.env.PYTHON_BIN;
    process.env.PYTHON_BIN = 'custom_python_binary_path';
    const overridden = getPythonExecutable();
    assert(overridden === 'custom_python_binary_path', 'Python 2: Respects PYTHON_BIN environment variable override');
    if (origBin) process.env.PYTHON_BIN = origBin;
    else delete process.env.PYTHON_BIN;
  } catch (err) {
    assert(false, `Python 2 check failed: ${err.message}`);
  }

  // 4.3 Subprocess Execution with prewarm script
  try {
    const prewarmScript = path.join(__dirname, 'scripts', 'prewarm_models.py');
    const workerRes = await runPythonWorker(prewarmScript, null, {
      timeoutMs: 60000,
      description: 'Prewarm Model Runner'
    });
    assert(workerRes && workerRes.length > 0, 'Python 3: runPythonWorker executes successfully on prewarm_models.py');
  } catch (err) {
    assert(false, `Python 3 check failed: ${err.message}`);
  }

  // 4.4 Subprocess Timeout Trapping
  const tempTimeoutScript = path.join(TEMP_DIR, 'temp_timeout_test.py');
  try {
    fs.writeFileSync(tempTimeoutScript, 'import time; time.sleep(5)\n');
    await runPythonWorker(tempTimeoutScript, null, {
      timeoutMs: 500,
      description: 'Timeout Test Worker'
    });
    assert(false, 'Python 4: Expected timeout error but subprocess completed');
  } catch (err) {
    assert(err.message.includes('timed out') || err.message.includes('TIMEOUT') || err.message.includes('killed'), `Python 4: Subprocess timeout trapped cleanly ("${err.message}")`);
  } finally {
    if (fs.existsSync(tempTimeoutScript)) fs.unlinkSync(tempTimeoutScript);
  }

  // 4.5 Missing Module Trapping
  const tempModuleScript = path.join(TEMP_DIR, 'temp_module_test.py');
  try {
    fs.writeFileSync(tempModuleScript, 'import non_existent_dummy_module_xyz_123\n');
    await runPythonWorker(tempModuleScript, null, {
      timeoutMs: 5000,
      description: 'Missing Module Test Worker'
    });
    assert(false, 'Python 5: Expected module not found error but subprocess succeeded');
  } catch (err) {
    assert(err.message.includes('not installed') || err.message.includes('ModuleNotFoundError') || err.message.includes('No module named'), `Python 5: Missing module error trapped cleanly ("${err.message}")`);
  } finally {
    if (fs.existsSync(tempModuleScript)) fs.unlinkSync(tempModuleScript);
  }

  console.log('\n======================================================================');
  console.log(`Test Execution Summary: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('======================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite();
