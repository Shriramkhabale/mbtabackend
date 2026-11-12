/**
 * Comprehensive Automated Verification Suite for:
 * Bug A: Download PDF / Output Binary Integrity & Security
 * Bug B: Direct Print Document Isolation
 * Bug C: Send to Tool Workflow, Real File Transfer & Destination Presets
 * Across All 12 Document & AI Tools
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const { PDFDocument } = require('pdf-lib');

const {
  ensureTempDir,
  saveTempOutput,
  generateDownloadToken,
  verifyDownloadToken,
  verifyFileOwnership,
  TEMP_DIR
} = require('./utils/toolHelpers');

const { callAadharCardPdfCutterAi } = require('./utils/aadharCutter');
const { callAllTypeIdCardCutterAi } = require('./utils/allTypeIdCardCutter');
const { callPanCardCutterAi } = require('./utils/panCardCutter');
const { createSessionToken } = require('./utils/sessionToken');
const { validateLiveEtdsConfig } = require('./routes/etdsRoutes');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} - ${detail}`);
  }
}

function makeHttpRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          buffer,
          text: buffer.toString('utf8')
        });
      });
    });
    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('MB MITRA — 12 TOOLS FIX VERIFICATION (BUGS A, B, C & REGRESSION)');
  console.log('===============================================================\n');

  const testUser = { userId: 'MBTA_RETAILER_VERIFY_101', role: 'retailer' };
  const sessionToken = createSessionToken(testUser);

  // -------------------------------------------------------------------------
  // SECTION 1: BUG A — DOWNLOAD PDF & OUTPUT INTEGRITY
  // -------------------------------------------------------------------------
  console.log('--- SECTION 1: BUG A — Download Output & Binary Integrity Tests ---');

  // Test 1.1: Generate a real processed PDF using Aadhaar Cutter
  let testAadhaarResult = null;
  try {
    const doc = await PDFDocument.create();
    const p = doc.addPage([595.28, 841.89]);
    p.drawText('Sample Aadhaar Document For Download Test', { x: 50, y: 700 });
    const sampleBytes = await doc.save();

    testAadhaarResult = await callAadharCardPdfCutterAi({
      fileData: Buffer.from(sampleBytes).toString('base64'),
      aadhar_type: 'normal',
      userId: testUser.userId
    });

    assert(testAadhaarResult && testAadhaarResult.file_url, 'Test 1.1: Backend generates real output file');
  } catch (err) {
    assert(false, 'Test 1.1: Backend generates real output file', err.message);
  }

  // Test 1.2: Download output via /api/tools/download/:filename using signed token
  try {
    const downloadPath = testAadhaarResult.file_url;
    const downloadRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 5000,
      path: downloadPath,
      method: 'GET'
    });

    assert(downloadRes.statusCode === 200, 'Test 1.2: Download endpoint returns HTTP 200 OK');
    assert(downloadRes.headers['content-type'] === 'application/pdf', 'Test 1.2: Content-Type is true application/pdf');
    assert(downloadRes.headers['content-disposition'] && downloadRes.headers['content-disposition'].includes('attachment;'), 'Test 1.2: Content-Disposition sets attachment header');
    
    // Verify binary PDF magic bytes (%PDF-)
    const headerBytes = downloadRes.buffer.subarray(0, 5).toString('ascii');
    assert(headerBytes.startsWith('%PDF-'), 'Test 1.2: Downloaded file starts with valid %PDF- magic bytes (NOT HTML/JSON)', `Header: ${headerBytes}`);

    // Verify downloaded buffer opens in PDFDocument parser
    const parsedPdf = await PDFDocument.load(downloadRes.buffer);
    assert(parsedPdf.getPageCount() === 3, 'Test 1.2: Downloaded PDF document is structurally valid and opens without error');
  } catch (err) {
    assert(false, 'Test 1.2: Download output via signed token', err.message);
  }

  // Test 1.3: Download output using Bearer session token
  try {
    const fileNameOnly = testAadhaarResult.outputFileName;
    const bearerDownloadRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/tools/download/${fileNameOnly}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionToken}`
      }
    });

    assert(bearerDownloadRes.statusCode === 200, 'Test 1.3: Download succeeds using Bearer session token');
    const headerBytes = bearerDownloadRes.buffer.subarray(0, 5).toString('ascii');
    assert(headerBytes.startsWith('%PDF-'), 'Test 1.3: Bearer download yields binary PDF stream');
  } catch (err) {
    assert(false, 'Test 1.3: Download using Bearer token', err.message);
  }

  // Test 1.4: Image Output MIME Type (PNG / JPEG)
  try {
    const dummyImgBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]); // PNG signature
    const imgOutput = saveTempOutput(dummyImgBuf, 'png', 'image_enhancer_test', testUser.userId);
    const imgRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 5000,
      path: imgOutput.fileUrl,
      method: 'GET'
    });

    assert(imgRes.statusCode === 200, 'Test 1.4: Image download returns HTTP 200');
    assert(imgRes.headers['content-type'] === 'image/png', 'Test 1.4: Image download sets Content-Type: image/png');
  } catch (err) {
    assert(false, 'Test 1.4: Image Output MIME Type', err.message);
  }

  // Test 1.5: Missing / Expired file produces clear HTTP 404 (NOT 200 with disguised error)
  try {
    const missingFileName = `document_${testUser.userId}_missing_12345.pdf`;
    const validTokenForMissing = generateDownloadToken(missingFileName, testUser.userId);
    const missingRes = await makeHttpRequest({
      hostname: 'localhost',
      port: 5000,
      path: `/api/tools/download/${missingFileName}?token=${validTokenForMissing}`,
      method: 'GET'
    });

    assert(missingRes.statusCode === 404, 'Test 1.5: Missing/expired file returns HTTP 404 Not Found (not disguised 200)');
    assert(missingRes.text.includes('File not found') || missingRes.text.includes('expired'), 'Test 1.5: Missing file returns clear JSON error message');
  } catch (err) {
    assert(false, 'Test 1.5: Missing file error handling', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 2: BUG B — DIRECT PRINT ISOLATION
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 2: BUG B — Direct Print Isolation & Stylesheet Tests ---');

  // Test 2.1: Verify ToolsView.css contains isolated @media print rules
  try {
    const cssContent = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'pages', 'tools', 'ToolsView.css'), 'utf8');
    assert(cssContent.includes('@media print'), 'Test 2.1: ToolsView.css includes dedicated @media print stylesheet');
    assert(cssContent.includes('.tools-workflow-header') && cssContent.includes('display: none !important'), 'Test 2.1: Print styles hide workflow stepper track');
    assert(cssContent.includes('.dashboard-sidebar') || cssContent.includes('sidebar'), 'Test 2.1: Print styles hide dashboard sidebar navigation');
    assert(cssContent.includes('.export-action-grid') && cssContent.includes('display: none !important'), 'Test 2.1: Print styles hide export action buttons and cards');
  } catch (err) {
    assert(false, 'Test 2.1: Print CSS verification', err.message);
  }

  // Test 2.2: Verify ToolsView.jsx implements isolated iframe printing
  try {
    const jsxContent = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'pages', 'tools', 'ToolsView.jsx'), 'utf8');
    assert(jsxContent.includes('mbta-print-iframe'), 'Test 2.2: ToolsView.jsx creates isolated #mbta-print-iframe for pure document printing');
    assert(!jsxContent.includes('const handlePrintOutput = () => {\n    window.print();\n  };'), 'Test 2.2: Naked window.print() on full website DOM has been completely removed');
    assert(jsxContent.includes('iframe.contentWindow.print()'), 'Test 2.2: Print dialog is targeted strictly to isolated iframe document');
  } catch (err) {
    assert(false, 'Test 2.2: ToolsView.jsx isolated print logic', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 3: BUG C — SEND TO TOOL TRANSFER & DESTINATION SETTINGS
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 3: BUG C — Send to Tool Workflow & Real File Transfer ---');

  // Test 3.1: Verify destination options mapping in ToolsView.jsx
  try {
    const jsxContent = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'pages', 'tools', 'ToolsView.jsx'), 'utf8');
    assert(jsxContent.includes("selectedKey === 'bg'"), 'Test 3.1: Dropdown option "bg" maps correctly to Background Remover');
    assert(jsxContent.includes("selectedKey === 'enhance'"), 'Test 3.1: Dropdown option "enhance" maps correctly to AI Image Enhancer');
    assert(jsxContent.includes("selectedKey === 'sign'"), 'Test 3.1: Dropdown option "sign" maps correctly to Digital Signature Validation');
    assert(jsxContent.includes("selectedKey === 'pdf'"), 'Test 3.1: Dropdown option "pdf" maps correctly to PDF to HTML Converter');
  } catch (err) {
    assert(false, 'Test 3.1: Destination options mapping', err.message);
  }

  // Test 3.2: Verify file transfer skips Step 2 and opens Step 3 (Settings)
  try {
    const jsxContent = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'pages', 'tools', 'ToolsView.jsx'), 'utf8');
    assert(jsxContent.includes('setCurrentStep(3); // Open Step 3: Settings!'), 'Test 3.2: handleSendToTool advances directly to Step 3 (Settings), skipping redundant re-upload');
    assert(jsxContent.includes('sessionStorage.setItem(\'mbta_active_tool_transfer\''), 'Test 3.2: Transferred file is securely persisted in sessionStorage to survive unmounts/refreshes');
    assert(jsxContent.includes('checkPendingTransfer'), 'Test 3.2: checkPendingTransfer restores active transfer upon navigation or reload');
    assert(jsxContent.includes('settings-active-file-pill'), 'Test 3.2: Step 3 UI renders active loaded document badge');
  } catch (err) {
    assert(false, 'Test 3.2: Step 3 advance and state persistence', err.message);
  }

  // Test 3.3: Verify format compatibility enforcement in handleSendToTool
  try {
    const jsxContent = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'pages', 'tools', 'ToolsView.jsx'), 'utf8');
    assert(jsxContent.includes('isDestPdfOnly && !isSourcePdf'), 'Test 3.3: PDF-only tools reject non-PDF source files with clear warning');
    assert(jsxContent.includes('isDestImageOnly && !isSourceImage && isSourcePdf'), 'Test 3.3: Image-only tools reject PDF source files with clear warning');
  } catch (err) {
    assert(false, 'Test 3.3: Format compatibility check', err.message);
  }

  // Test 3.4: Backend pipe compatibility: parseIncomingPdf directly supports transferred /api/tools/download/ URLs
  try {
    const { parseIncomingPdf } = require('./utils/toolHelpers');
    const dummyTransferredDoc = saveTempOutput(Buffer.from('%PDF-1.4\nTest Transferred Pipe Content\n%%EOF'), 'pdf', 'pipe_transfer_test', testUser.userId);
    const parsedBuf = await parseIncomingPdf(null, dummyTransferredDoc.fileUrl);

    assert(parsedBuf && parsedBuf.length > 0, 'Test 3.4: Backend parseIncomingPdf resolves /api/tools/download/ URLs seamlessly from temp storage');
    assert(parsedBuf.toString('ascii').includes('Test Transferred Pipe Content'), 'Test 3.4: Transferred file content is faithfully read without re-upload');
  } catch (err) {
    assert(false, 'Test 3.4: Backend pipe compatibility', err.message);
  }

  // -------------------------------------------------------------------------
  // SECTION 4: REGRESSION CHECKS (PAN, ETDS, PAYMENTS, AUTH)
  // -------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Regression Checks (PAN, ETDS, Payments, Auth) ---');

  // Test 4.1: ETDS Live Config is intact
  try {
    validateLiveEtdsConfig();
    assert(true, 'Test 4.1: Live ETDS config validator executes cleanly');
  } catch (err) {
    assert(false, 'Test 4.1: Live ETDS config validator', err.message);
  }

  // Test 4.2: PAN routes intact
  try {
    const panRoutes = require('./routes/panCardRoutes');
    assert(typeof panRoutes === 'function', 'Test 4.2: panCardRoutes module intact');
  } catch (err) {
    assert(false, 'Test 4.2: panCardRoutes check', err.message);
  }

  // Test 4.3: Session token generation and validation intact
  try {
    const { verifySessionToken } = require('./utils/sessionToken');
    const decoded = verifySessionToken(sessionToken);
    assert(decoded && decoded.userId === testUser.userId, 'Test 4.3: Session token verification remains fully compatible');
  } catch (err) {
    assert(false, 'Test 4.3: Session token check', err.message);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`TEST SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
