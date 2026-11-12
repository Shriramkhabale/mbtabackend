/**
 * Test Suite for Phase 1 Document Tools
 * Tests local execution of all 7 PDF tools without external APIs or Cloudinary uploads.
 */
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createSessionToken } = require('./utils/sessionToken');
const { callAadharCardPdfCutterAi } = require('./utils/aadharCutter');
const { callAllTypeIdCardCutterAi } = require('./utils/allTypeIdCardCutter');
const { callMeraRationCutterAi } = require('./utils/meraRationCutter');
const { callPanCardCutterAi } = require('./utils/panCardCutter');
const { callVoterIdCutterAi } = require('./utils/voterIdCutter');
const { callPmjayCardCutterAi } = require('./utils/pmjayCardCutter');
const { callPdfToHtmlAi } = require('./utils/pdfToHtmlConverter');
const { validateLiveEtdsConfig } = require('./routes/etdsRoutes');

// Helper to create synthetic test PDFs with clean vector boxes & text
async function createSyntheticAadhaarPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  
  // Header section
  page.drawText('GOVERNMENT OF INDIA - UNIQUE IDENTIFICATION AUTHORITY OF INDIA', { x: 50, y: 800, size: 10, font });
  page.drawText('To: Resident Name\nAddress Line 1, City, State 123456', { x: 50, y: 550, size: 9, font });
  
  // Bottom Card Cutout (Front and Back)
  // Front Card
  page.drawRectangle({ x: 35, y: 40, width: 255, height: 215, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText('Bharat Sarkar / Government of India', { x: 45, y: 235, size: 9, font });
  page.drawText('Resident Name\nDOB: 01/01/1990\nMALE\n1234 5678 9012', { x: 45, y: 150, size: 10, font });
  
  // Back Card
  page.drawRectangle({ x: 295, y: 40, width: 255, height: 215, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText('Address: House No 123, Town, District, State - 560001\nHelpline: 1947', { x: 305, y: 150, size: 9, font });
  
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function createSyntheticPanPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  
  page.drawText('INCOME TAX DEPARTMENT - GOVT OF INDIA', { x: 50, y: 800, size: 11, font });
  page.drawText('Permanent Account Number Card e-PAN', { x: 50, y: 780, size: 10, font });
  
  // Bottom cutout (Front & Back)
  page.drawRectangle({ x: 40, y: 38, width: 252, height: 174, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText('INCOME TAX DEPARTMENT\nABCDE1234F\nApplicant Name\nFather Name\n01/01/1985', { x: 50, y: 160, size: 9, font });
  
  page.drawRectangle({ x: 298, y: 38, width: 252, height: 174, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText('QR Code & Verification Details', { x: 310, y: 160, size: 9, font });
  
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function createSyntheticVoterPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  
  page.drawText('ELECTION COMMISSION OF INDIA - e-EPIC', { x: 50, y: 800, size: 11, font });
  page.drawText('EPIC NO: XYZ1234567', { x: 50, y: 780, size: 10, font });
  
  page.drawRectangle({ x: 42, y: 42, width: 252, height: 190, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText('Bharat Nirvachan Aayog\nELECTION COMMISSION OF INDIA\nXYZ1234567\nVoter Name\nFather Name', { x: 52, y: 180, size: 9, font });
  
  page.drawRectangle({ x: 298, y: 42, width: 252, height: 190, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText('Address & Assembly Constituency Details', { x: 308, y: 180, size: 9, font });
  
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function createSyntheticPmjayPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  
  page.drawText('National Health Authority - Ayushman Bharat PM-JAY', { x: 50, y: 800, size: 11, font });
  page.drawText('AB-PMJAY ID: PMJAY12345678', { x: 50, y: 780, size: 10, font });
  
  page.drawRectangle({ x: 38, y: 42, width: 254, height: 198, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText('Ayushman Bharat Golden Card\nBeneficiary Name\nFamily ID', { x: 48, y: 180, size: 9, font });
  
  page.drawRectangle({ x: 298, y: 42, width: 254, height: 198, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText('Hospital Helpline: 14555\n5 Lakh Rupee Coverage', { x: 308, y: 180, size: 9, font });
  
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function createSyntheticRationPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  
  page.drawText('Food and Civil Supplies Department - Ration Card', { x: 50, y: 800, size: 11, font });
  page.drawText('NFSA Ration Card No: 123456789012', { x: 50, y: 780, size: 10, font });
  
  page.drawRectangle({ x: 35, y: 480, width: 525, height: 300, borderColor: rgb(0,0,0), borderWidth: 1 });
  page.drawText('Ration Card Family Slip\nHead of Family: Test User\nFPS ID: 45678', { x: 45, y: 740, size: 10, font });
  
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function createSyntheticMultiPageIdPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  
  // Page 1: Front
  const p1 = doc.addPage([242.65, 153.07]);
  p1.drawRectangle({ x: 5, y: 5, width: 232.65, height: 143.07, borderColor: rgb(0,0,1), borderWidth: 1 });
  p1.drawText('STUDENT ID CARD (FRONT)\nName: Alice Smith\nDept: Computer Science', { x: 15, y: 110, size: 10, font });
  
  // Page 2: Back
  const p2 = doc.addPage([242.65, 153.07]);
  p2.drawRectangle({ x: 5, y: 5, width: 232.65, height: 143.07, borderColor: rgb(0,0,1), borderWidth: 1 });
  p2.drawText('STUDENT ID CARD (BACK)\nBlood Group: O+\nEmergency: 9876543210', { x: 15, y: 110, size: 10, font });
  
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

const { TEMP_DIR } = require('./utils/toolHelpers');

async function verifyGeneratedOutput(assert, toolName, res, expectedExt, expectedMime, expectedMagic) {
  const fileUrl = res.file_url || '';
  const urlObj = new URL(fileUrl, 'http://localhost:5000');
  const filename = res.outputFileName || decodeURIComponent(urlObj.pathname.split('/download/')[1] || '');
  
  assert(filename && filename.endsWith(expectedExt), `${toolName}: Output filename returned (${filename})`);
  assert(fileUrl.includes('/api/tools/download/') && fileUrl.includes('?token='), `${toolName}: Tokenized secure download URL returned`);
  
  const filePath = path.join(TEMP_DIR, filename);
  assert(fs.existsSync(filePath), `${toolName}: Output file exists in temp_uploads directory`);
  
  // Verify HTTP download and token validation
  try {
    const downloadRes = await fetch(`http://localhost:5000${fileUrl}`);
    assert(downloadRes.status === 200, `${toolName}: HTTP GET with token returns 200 OK`);
    const cType = downloadRes.headers.get('content-type') || '';
    assert(cType.includes(expectedMime) || cType.includes('octet-stream'), `${toolName}: Correct Content-Type (${cType})`);
    const buf = Buffer.from(await downloadRes.arrayBuffer());
    assert(buf.toString('utf8', 0, expectedMagic.length) === expectedMagic, `${toolName}: Header matches expected format (${expectedMagic})`);
    
    // Test that tampered token is rejected
    const tamperedRes = await fetch(`http://localhost:5000/api/tools/download/${encodeURIComponent(filename)}?token=invalid_tampered_token`);
    assert(tamperedRes.status === 401 || tamperedRes.status === 403, `${toolName}: Tampered token rejected with 401/403`);
  } catch (err) {
    const fileBytes = fs.readFileSync(filePath);
    assert(fileBytes.toString('utf8', 0, expectedMagic.length) === expectedMagic, `${toolName}: Direct file header matches expected format (${expectedMagic})`);
  }
}

async function runPhase1Tests() {
  console.log('====================================================');
  console.log('   MBTA PHASE 1 TOOLS - LOCAL VERIFICATION TEST   ');
  console.log('====================================================\n');
  
  let passedCount = 0;
  let failedCount = 0;
  
  const assert = (condition, message) => {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${message}`);
      failedCount++;
    }
  };

  // Regression check: ETDS configuration
  try {
    validateLiveEtdsConfig();
    assert(true, 'Regression Safety: ETDS configuration validated without error');
  } catch (err) {
    assert(false, `Regression Safety: ETDS config failed: ${err.message}`);
  }

  // 1. Aadhaar Card PDF Cutter
  try {
    const aadhaarBuffer = await createSyntheticAadhaarPdf();
    const res = await callAadharCardPdfCutterAi({
      fileData: `data:application/pdf;base64,${aadhaarBuffer.toString('base64')}`,
      aadhar_type: 'normal'
    });
    assert(res.status === 'Success', 'Tool 1 (Aadhaar): Successful status returned');
    await verifyGeneratedOutput(assert, 'Tool 1 (Aadhaar)', res, '.pdf', 'application/pdf', '%PDF-');
  } catch (err) {
    assert(false, `Tool 1 (Aadhaar) threw error: ${err.message}`);
  }

  // 2. All Type ID Card PDF Cutter
  try {
    const multiPageBuffer = await createSyntheticMultiPageIdPdf();
    const res = await callAllTypeIdCardCutterAi({
      fileData: `data:application/pdf;base64,${multiPageBuffer.toString('base64')}`,
      card_size_mode: 'cr80'
    });
    assert(res.status === 'Success', 'Tool 2 (All Type ID): Successful status returned');
    await verifyGeneratedOutput(assert, 'Tool 2 (All Type ID)', res, '.pdf', 'application/pdf', '%PDF-');
  } catch (err) {
    assert(false, `Tool 2 (All Type ID) threw error: ${err.message}`);
  }

  // 3. Mera Ration Card PDF Cutter
  try {
    const rationBuffer = await createSyntheticRationPdf();
    const res = await callMeraRationCutterAi({
      fileData: `data:application/pdf;base64,${rationBuffer.toString('base64')}`
    });
    assert(res.status === 'Success', 'Tool 3 (Mera Ration): Successful status returned');
    await verifyGeneratedOutput(assert, 'Tool 3 (Mera Ration)', res, '.pdf', 'application/pdf', '%PDF-');
  } catch (err) {
    assert(false, `Tool 3 (Mera Ration) threw error: ${err.message}`);
  }

  // 4. PAN Card PDF Cutter
  try {
    const panBuffer = await createSyntheticPanPdf();
    const res = await callPanCardCutterAi({
      fileData: `data:application/pdf;base64,${panBuffer.toString('base64')}`
    });
    assert(res.status === 'Success', 'Tool 4 (PAN Card): Successful status returned');
    await verifyGeneratedOutput(assert, 'Tool 4 (PAN Card)', res, '.pdf', 'application/pdf', '%PDF-');
  } catch (err) {
    assert(false, `Tool 4 (PAN Card) threw error: ${err.message}`);
  }

  // 5. Voter ID / e-EPIC Card PDF Cutter
  try {
    const voterBuffer = await createSyntheticVoterPdf();
    const res = await callVoterIdCutterAi({
      fileData: `data:application/pdf;base64,${voterBuffer.toString('base64')}`
    });
    assert(res.status === 'Success', 'Tool 5 (Voter ID): Successful status returned');
    await verifyGeneratedOutput(assert, 'Tool 5 (Voter ID)', res, '.pdf', 'application/pdf', '%PDF-');
  } catch (err) {
    assert(false, `Tool 5 (Voter ID) threw error: ${err.message}`);
  }

  // 6. PMJAY Ayushman Card Cutter
  try {
    const pmjayBuffer = await createSyntheticPmjayPdf();
    const res = await callPmjayCardCutterAi({
      fileData: `data:application/pdf;base64,${pmjayBuffer.toString('base64')}`
    });
    assert(res.status === 'Success', 'Tool 6 (PMJAY Ayushman): Successful status returned');
    await verifyGeneratedOutput(assert, 'Tool 6 (PMJAY Ayushman)', res, '.pdf', 'application/pdf', '%PDF-');
  } catch (err) {
    assert(false, `Tool 6 (PMJAY Ayushman) threw error: ${err.message}`);
  }

  // 7. PDF to HTML Converter
  try {
    const sampleBuffer = await createSyntheticAadhaarPdf();
    const res = await callPdfToHtmlAi({
      fileData: `data:application/pdf;base64,${sampleBuffer.toString('base64')}`,
      title: 'Aadhaar Information Sheet'
    });
    assert(res.status === 'Success', 'Tool 7 (PDF to HTML): Successful status returned');
    assert(res.html && res.html.includes('<!DOCTYPE html>'), 'Tool 7 (PDF to HTML): HTML5 markup generated');
    assert(res.html.includes('GOVERNMENT OF INDIA'), 'Tool 7 (PDF to HTML): Text content preserved in HTML');
    await verifyGeneratedOutput(assert, 'Tool 7 (PDF to HTML)', res, '.html', 'text/html', '<!DOCTYPE html>');
  } catch (err) {
    assert(false, `Tool 7 (PDF to HTML) threw error: ${err.message}`);
  }

  // Negative Tests:
  // Corrupted / Non-PDF file
  try {
    const fakeData = 'data:application/pdf;base64,' + Buffer.from('NOT A PDF FILE CONTENT').toString('base64');
    await callAadharCardPdfCutterAi({ fileData: fakeData });
    assert(false, 'Negative Test: Corrupted file was expected to fail but succeeded');
  } catch (err) {
    assert(err.message.includes('header does not begin with %PDF') || err.message.includes('Invalid'),
      `Negative Test: Non-PDF file rejected with clear error ("${err.message}")`);
  }

  // Empty buffer
  try {
    await callPanCardCutterAi({ fileData: '' });
    assert(false, 'Negative Test: Empty file was expected to fail but succeeded');
  } catch (err) {
    assert(true, `Negative Test: Empty file rejected with error ("${err.message}")`);
  }

  console.log(`\n====================================================`);
  console.log(`Test Execution Summary: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log(`====================================================\n`);

  process.exit(failedCount > 0 ? 1 : 0);
}

runPhase1Tests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
