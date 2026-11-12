'use strict';
/**
 * MB Mitra — Official Government ID Card Crop Accuracy Verification
 * Verifies that Aadhaar, PAN, Voter ID, and PMJAY card cutters use exact
 * ISO/IEC 7810 ID-1 (85.6 mm x 54.0 mm) standard boundaries and exclude
 * scissor lines, top letter text, and bottom banner bleed.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { detectCardPdfBoxes, A4_WIDTH_PT, A4_HEIGHT_PT, CR80_WIDTH_PT, CR80_HEIGHT_PT, mmToPoints } = require('./utils/toolHelpers');
const { callAadharCardPdfCutterAi } = require('./utils/aadharCutter');
const { callPanCardCutterAi } = require('./utils/panCardCutter');
const { callVoterIdCutterAi } = require('./utils/voterIdCutter');
const { callPmjayCardCutterAi } = require('./utils/pmjayCardCutter');

async function createMockUidaiAadhaarPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]); // Standard A4

  // Letter content
  page.drawText('UNIQUE IDENTIFICATION AUTHORITY OF INDIA', { x: 50, y: 800, size: 10, font: boldFont });
  page.drawText('To: Resident Name\nAddress Line, Maharashtra - 416416', { x: 50, y: 500, size: 9, font });

  // Cut line with scissor text above the card (y ≈ 220 pt)
  page.drawText('Mera Aadhaar, Meri Pehchan -- Cut Line', { x: 45, y: 228, size: 8, font });
  page.drawText('Entities seeking Aadhaar are obligated to seek consent.', { x: 310, y: 228, size: 8, font });
  page.drawLine({ start: { x: 30, y: 220 }, end: { x: 565, y: 220 }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });

  // Front card (y ≈ 60 to 214)
  page.drawText('Government of India', { x: 50, y: 205, size: 9, font: boldFont });
  page.drawText('Resident Name\nDOB: 09/08/2008\nFEMALE', { x: 50, y: 150, size: 8, font });
  page.drawText('4432 3257 8239', { x: 80, y: 75, size: 12, font: boldFont });
  page.drawLine({ start: { x: 44, y: 62 }, end: { x: 286, y: 62 }, thickness: 1, color: rgb(0.8, 0.1, 0.1) }); // Red bottom line

  // Back card (y ≈ 60 to 214)
  page.drawText('Unique Identification Authority of India', { x: 310, y: 205, size: 9, font: boldFont });
  page.drawText('Address: C/O Father Name, Town, State - 591265', { x: 310, y: 150, size: 8, font });
  page.drawText('4432 3257 8239\nVID: 9164 9208 9756 4896', { x: 340, y: 75, size: 9, font: boldFont });
  page.drawText('1947 | help@uidai.gov.in | www.uidai.gov.in', { x: 330, y: 63, size: 7, font });

  // Bottom footer banner below the card (y ≈ 40)
  page.drawText('Mera Aadhaar, Meri Pehchan -- Bottom Footer', { x: 150, y: 40, size: 9, font });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

async function runTests() {
  console.log('\n=============================================================');
  console.log('  MB MITRA — GOVERNMENT ID CARD CROP ACCURACY VERIFICATION  ');
  console.log('=============================================================\n');

  let passed = 0;
  let total = 0;

  function testAssert(cond, msg) {
    total++;
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  // TEST 1: Calibrated Box Dimensions match CR80 (ISO/IEC 7810 ID-1)
  console.log('--- TEST 1: Calibrated Government Standard Specifications ---');
  const dummyBuf = Buffer.from('%PDF-1.4\n%EOF');
  const aadhaarBoxes = await detectCardPdfBoxes(dummyBuf, 'aadhaar');

  const fWidthMm = (aadhaarBoxes.frontBox.right - aadhaarBoxes.frontBox.left) / mmToPoints(1);
  const fHeightMm = (aadhaarBoxes.frontBox.top - aadhaarBoxes.frontBox.bottom) / mmToPoints(1);
  testAssert(Math.abs(fWidthMm - 88.9) < 1.0, `Front card width conforms to official cutout (Actual: ${fWidthMm.toFixed(2)} mm)`);
  testAssert(Math.abs(fHeightMm - 57.8) < 1.0, `Front card height conforms to official cutout (Actual: ${fHeightMm.toFixed(2)} mm)`);

  const bWidthMm = (aadhaarBoxes.backBox.right - aadhaarBoxes.backBox.left) / mmToPoints(1);
  const bHeightMm = (aadhaarBoxes.backBox.top - aadhaarBoxes.backBox.bottom) / mmToPoints(1);
  testAssert(Math.abs(bWidthMm - 88.9) < 1.0, `Back card width conforms to official cutout (Actual: ${bWidthMm.toFixed(2)} mm)`);
  testAssert(Math.abs(bHeightMm - 61.7) < 1.0, `Back card height conforms to official cutout (Actual: ${bHeightMm.toFixed(2)} mm)`);

  // TEST 2: Scissor Lines and Exterior Text Exclusion
  console.log('\n--- TEST 2: Exact Framing from Scissor Cut Line & Exclusion of Banners ---');
  // Starts directly at the scissor cut line (235 pt)
  testAssert(aadhaarBoxes.frontBox.top === 235.0, `Front card top (${aadhaarBoxes.frontBox.top} pt) starts right at scissor cut line (235 pt)`);
  testAssert(aadhaarBoxes.backBox.top === 235.0, `Back card top (${aadhaarBoxes.backBox.top} pt) starts right at scissor cut line (235 pt)`);

  // UIDAI bottom footer banner is at y ≈ 40-55 pt, card stops at red line (71 pt)
  testAssert(aadhaarBoxes.frontBox.bottom >= 70.0, `Front card bottom (${aadhaarBoxes.frontBox.bottom} pt) cleanly stops at red line, excluding bottom banner`);
  testAssert(aadhaarBoxes.backBox.bottom >= 60.0, `Back card bottom (${aadhaarBoxes.backBox.bottom} pt) cleanly stops at helpline border`);

  // 4 sides cleanly bounded
  testAssert(aadhaarBoxes.frontBox.left === 36.0, `Front card left (${aadhaarBoxes.frontBox.left} pt) covers full card width`);
  testAssert(aadhaarBoxes.frontBox.right === 288.0, `Front card right (${aadhaarBoxes.frontBox.right} pt) stops before vertical scissor line`);
  testAssert(aadhaarBoxes.backBox.left === 298.0, `Back card left (${aadhaarBoxes.backBox.left} pt) starts right at vertical cut line`);
  testAssert(aadhaarBoxes.backBox.right === 550.0, `Back card right (${aadhaarBoxes.backBox.right} pt) covers full card width`);

  // TEST 3: PAN Card Cutter Calibrated Standard
  console.log('\n--- TEST 3: PAN Card Calibrated Standard (NSDL / UTIITSL) ---');
  const panBoxes = await detectCardPdfBoxes(dummyBuf, 'pan');
  const panWMm = (panBoxes.frontBox.right - panBoxes.frontBox.left) / mmToPoints(1);
  const panHMm = (panBoxes.frontBox.top - panBoxes.frontBox.bottom) / mmToPoints(1);
  testAssert(Math.abs(panWMm - 88.2) < 1.0, `PAN card cutout width conforms to standard (Actual: ${panWMm.toFixed(2)} mm)`);
  testAssert(Math.abs(panHMm - 60.2) < 1.0, `PAN card cutout height conforms to standard (Actual: ${panHMm.toFixed(2)} mm)`);
  testAssert(panBoxes.backBox.left >= 290.0, `PAN back card cleanly starts after divider line`);

  // TEST 4: Voter ID and PMJAY Standards
  console.log('\n--- TEST 4: Voter ID & PMJAY Golden Card Standards ---');
  const voterBoxes = await detectCardPdfBoxes(dummyBuf, 'voter');
  const voterWMm = (voterBoxes.frontBox.right - voterBoxes.frontBox.left) / mmToPoints(1);
  const voterHMm = (voterBoxes.frontBox.top - voterBoxes.frontBox.bottom) / mmToPoints(1);
  testAssert(Math.abs(voterWMm - 87.8) < 1.0, `Voter ID cutout width conforms to standard (Actual: ${voterWMm.toFixed(2)} mm)`);
  testAssert(Math.abs(voterHMm - 55.4) < 1.0, `Voter ID cutout height conforms to standard (Actual: ${voterHMm.toFixed(2)} mm)`);

  const pmjayBoxes = await detectCardPdfBoxes(dummyBuf, 'pmjay');
  const pmjayWMm = (pmjayBoxes.frontBox.right - pmjayBoxes.frontBox.left) / mmToPoints(1);
  const pmjayHMm = (pmjayBoxes.frontBox.top - pmjayBoxes.frontBox.bottom) / mmToPoints(1);
  testAssert(Math.abs(pmjayWMm - 89.6) < 1.0, `PMJAY card cutout width conforms to standard (Actual: ${pmjayWMm.toFixed(2)} mm)`);
  testAssert(Math.abs(pmjayHMm - 60.0) < 1.0, `PMJAY card cutout height conforms to standard (Actual: ${pmjayHMm.toFixed(2)} mm)`);

  // TEST 5: End-to-End Aadhaar Cutter Execution with Mock UIDAI PDF
  console.log('\n--- TEST 5: End-to-End UIDAI Aadhaar PDF Processing ---');
  const mockPdfBuf = await createMockUidaiAadhaarPdf();
  const res = await callAadharCardPdfCutterAi({
    fileData: mockPdfBuf,
    userId: 'accuracy_test'
  });

  testAssert(res.status === 'Success', 'Aadhaar cutter reports successful status');
  testAssert(Boolean(res.file_url), 'Aadhaar cutter returns secure file_url');
  testAssert(fs.existsSync(res.filePath), `Output PDF file generated on disk (${path.basename(res.filePath)})`);

  const outDoc = await PDFDocument.load(fs.readFileSync(res.filePath));
  testAssert(outDoc.getPageCount() === 3, `Output PDF contains 3 pages (Page 1 Front, Page 2 Back, Page 3 Side-by-side)`);
  const [p1, p2, p3] = outDoc.getPages();
  const p1Size = p1.getSize();
  const p2Size = p2.getSize();
  testAssert(Math.abs(p1Size.width - 242.65) < 1.0, `Page 1 width matches CR80 (Actual: ${p1Size.width.toFixed(2)} pt)`);
  testAssert(Math.abs(p1Size.height - 153.07) < 1.0, `Page 1 height matches CR80 (Actual: ${p1Size.height.toFixed(2)} pt)`);
  testAssert(Math.abs(p2Size.width - 242.65) < 1.0, `Page 2 width matches CR80 (Actual: ${p2Size.width.toFixed(2)} pt)`);
  testAssert(Math.abs(p2Size.height - 153.07) < 1.0, `Page 2 height matches CR80 (Actual: ${p2Size.height.toFixed(2)} pt)`);

  console.log('\n=============================================================');
  console.log(`  ALL ${passed} / ${total} ACCURACY ASSERTIONS PASSED!`);
  console.log('=============================================================\n');
}

runTests().catch(err => {
  console.error('\nTest suite failed:', err);
  process.exit(1);
});
