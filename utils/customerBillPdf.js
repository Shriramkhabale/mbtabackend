const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const BILLS_DIR = path.join(__dirname, '..', 'uploads', 'customer_bills');
if (!fs.existsSync(BILLS_DIR)) {
  fs.mkdirSync(BILLS_DIR, { recursive: true });
}

/**
 * Generate a high quality, professional A4 customer bill PDF using pdf-lib
 * @param {Object} billData 
 * @returns {Promise<{ filePath: string, relativeUrl: string, buffer: Buffer }>}
 */
async function generateCustomerBillPdf(billData) {
  const {
    billNumber,
    customerUid,
    customerName,
    customerMobile = '',
    customerEmail = '',
    workDescription = 'Customer Service Work',
    amount = 0,
    totalAmount = 0,
    billDate = new Date(),
    companyDetails = {}
  } = billData;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // Standard A4 points
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Color palette
  const navyDark = rgb(15 / 255, 23 / 255, 42 / 255);    // #0f172a
  const orangeBrand = rgb(234 / 255, 88 / 255, 12 / 255); // #ea580c
  const orangeSoft = rgb(254 / 255, 243 / 255, 199 / 255); // #fef3c7
  const slateLight = rgb(241 / 255, 245 / 255, 249 / 255); // #f1f5f9
  const textMuted = rgb(100 / 255, 116 / 255, 139 / 255);  // #64748b
  const borderGray = rgb(203 / 255, 213 / 255, 225 / 255); // #cbd5e1

  // 1. Top Decorative Brand Strip
  page.drawRectangle({
    x: 0,
    y: height - 10,
    width: width,
    height: 10,
    color: orangeBrand
  });

  // 2. Header Section
  const companyName = companyDetails.name || 'MB MITRA (MBTA Athani)';
  const companyTagline = companyDetails.tagline || 'Multi-Services & Retailer Digital Portal';
  const companyAddress = companyDetails.address || 'Main Road, Athani, Belagavi, Karnataka - 591304';
  const companyContact = companyDetails.contact || '+91 98765 43210 / support@mbmitra.com';

  page.drawText(companyName, {
    x: 40,
    y: height - 48,
    size: 20,
    font: fontBold,
    color: navyDark
  });

  page.drawText(companyTagline, {
    x: 40,
    y: height - 64,
    size: 10,
    font: fontRegular,
    color: orangeBrand
  });

  page.drawText(companyAddress, {
    x: 40,
    y: height - 78,
    size: 8.5,
    font: fontRegular,
    color: textMuted
  });

  page.drawText(`Contact: ${companyContact}`, {
    x: 40,
    y: height - 90,
    size: 8.5,
    font: fontRegular,
    color: textMuted
  });

  // Right Header: INVOICE / BILL badge
  page.drawRectangle({
    x: width - 210,
    y: height - 90,
    width: 170,
    height: 52,
    color: slateLight,
    borderColor: borderGray,
    borderWidth: 1
  });

  page.drawText('CUSTOMER WORK BILL', {
    x: width - 200,
    y: height - 56,
    size: 12,
    font: fontBold,
    color: orangeBrand
  });

  const formattedDate = new Date(billDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  page.drawText(`Bill No:  ${billNumber}`, {
    x: width - 200,
    y: height - 72,
    size: 9.5,
    font: fontBold,
    color: navyDark
  });

  page.drawText(`Date:      ${formattedDate}`, {
    x: width - 200,
    y: height - 84,
    size: 9,
    font: fontRegular,
    color: textMuted
  });

  // Divider Line
  page.drawLine({
    start: { x: 40, y: height - 110 },
    end: { x: width - 40, y: height - 110 },
    thickness: 1,
    color: borderGray
  });

  // 3. Customer Details Box
  const custBoxY = height - 200;
  page.drawRectangle({
    x: 40,
    y: custBoxY,
    width: width - 80,
    height: 75,
    color: slateLight,
    borderColor: borderGray,
    borderWidth: 1
  });

  // Customer Box Header
  page.drawRectangle({
    x: 40,
    y: custBoxY + 52,
    width: width - 80,
    height: 23,
    color: navyDark
  });

  page.drawText('CUSTOMER & BILLING INFORMATION', {
    x: 52,
    y: custBoxY + 59,
    size: 9.5,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  // Customer UID Badge
  page.drawText('Customer UID:', {
    x: 52,
    y: custBoxY + 34,
    size: 9.5,
    font: fontBold,
    color: textMuted
  });
  page.drawText(customerUid, {
    x: 140,
    y: custBoxY + 34,
    size: 10,
    font: fontBold,
    color: orangeBrand
  });

  page.drawText('Customer Name:', {
    x: 52,
    y: custBoxY + 16,
    size: 9.5,
    font: fontBold,
    color: textMuted
  });
  page.drawText(customerName || 'N/A', {
    x: 140,
    y: custBoxY + 16,
    size: 10,
    font: fontBold,
    color: navyDark
  });

  // Right column of customer details
  page.drawText('Mobile Number:', {
    x: 320,
    y: custBoxY + 34,
    size: 9.5,
    font: fontBold,
    color: textMuted
  });
  page.drawText(customerMobile || 'Not provided', {
    x: 410,
    y: custBoxY + 34,
    size: 9.5,
    font: fontRegular,
    color: navyDark
  });

  page.drawText('Email Address:', {
    x: 320,
    y: custBoxY + 16,
    size: 9.5,
    font: fontBold,
    color: textMuted
  });
  page.drawText(customerEmail || 'Not provided', {
    x: 410,
    y: custBoxY + 16,
    size: 9.5,
    font: fontRegular,
    color: navyDark
  });

  // 4. Work Details Table
  const tableY = custBoxY - 40;
  
  // Table Header
  page.drawRectangle({
    x: 40,
    y: tableY - 26,
    width: width - 80,
    height: 26,
    color: navyDark
  });

  page.drawText('#', { x: 55, y: tableY - 17, size: 9.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('WORK / SERVICE DESCRIPTION', { x: 90, y: tableY - 17, size: 9.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('STATUS', { x: 380, y: tableY - 17, size: 9.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('AMOUNT (INR)', { x: 475, y: tableY - 17, size: 9.5, font: fontBold, color: rgb(1, 1, 1) });

  // Table Row 1 (Work Item)
  const row1Y = tableY - 70;
  page.drawRectangle({
    x: 40,
    y: row1Y,
    width: width - 80,
    height: 44,
    color: rgb(1, 1, 1),
    borderColor: borderGray,
    borderWidth: 1
  });

  page.drawText('1', { x: 55, y: row1Y + 22, size: 10, font: fontBold, color: navyDark });
  
  // Truncate or fit work description
  const safeWorkDesc = workDescription.length > 55 ? workDescription.substring(0, 52) + '...' : workDescription;
  page.drawText(safeWorkDesc, { x: 90, y: row1Y + 24, size: 10, font: fontBold, color: navyDark });
  page.drawText('Customer Service Completed Execution', { x: 90, y: row1Y + 11, size: 8, font: fontRegular, color: textMuted });

  // Status Badge
  page.drawRectangle({
    x: 375,
    y: row1Y + 15,
    width: 70,
    height: 18,
    color: rgb(220 / 255, 252 / 255, 231 / 255),
    borderColor: rgb(134 / 255, 239 / 255, 172 / 255),
    borderWidth: 1
  });
  page.drawText('COMPLETED', { x: 382, y: row1Y + 20, size: 7.5, font: fontBold, color: rgb(21 / 255, 128 / 255, 61 / 255) });

  const formattedAmount = Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  page.drawText(`Rs. ${formattedAmount}`, { x: 475, y: row1Y + 22, size: 10, font: fontBold, color: navyDark });

  // Total Summary Row
  const totalRowY = row1Y - 36;
  page.drawRectangle({
    x: 40,
    y: totalRowY,
    width: width - 80,
    height: 36,
    color: orangeSoft,
    borderColor: rgb(253 / 255, 186 / 255, 116 / 255),
    borderWidth: 1.5
  });

  page.drawText('TOTAL PAYABLE AMOUNT:', {
    x: 280,
    y: totalRowY + 12,
    size: 11,
    font: fontBold,
    color: navyDark
  });

  const formattedTotal = Number(totalAmount || amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  page.drawText(`Rs. ${formattedTotal}`, {
    x: 465,
    y: totalRowY + 12,
    size: 13,
    font: fontBold,
    color: orangeBrand
  });

  // 5. Notes & Instructions
  const notesY = totalRowY - 60;
  page.drawText('Important Information:', {
    x: 40,
    y: notesY,
    size: 9.5,
    font: fontBold,
    color: navyDark
  });
  page.drawText('• This bill is generated for the exact completed service amount entered and verified.', {
    x: 40,
    y: notesY - 14,
    size: 8.5,
    font: fontRegular,
    color: textMuted
  });
  page.drawText('• All service documents and receipts are permanently archived under Customer UID: ' + customerUid, {
    x: 40,
    y: notesY - 26,
    size: 8.5,
    font: fontRegular,
    color: textMuted
  });
  page.drawText('• Computer-generated document issued by MB MITRA (MBTA Athani) Multi-Services Portal.', {
    x: 40,
    y: notesY - 38,
    size: 8.5,
    font: fontRegular,
    color: textMuted
  });

  // 6. Signature Block
  const sigY = notesY - 110;
  page.drawLine({
    start: { x: width - 200, y: sigY },
    end: { x: width - 40, y: sigY },
    thickness: 1,
    color: borderGray
  });

  page.drawText('Authorised Signatory / Seal', {
    x: width - 180,
    y: sigY - 14,
    size: 9,
    font: fontBold,
    color: navyDark
  });
  page.drawText(companyName, {
    x: width - 180,
    y: sigY - 26,
    size: 8,
    font: fontRegular,
    color: textMuted
  });

  // Bottom Footer
  page.drawRectangle({
    x: 0,
    y: 0,
    width: width,
    height: 28,
    color: navyDark
  });

  page.drawText('MB MITRA — Digital Multi-Services Portal  •  Powered by MBTA  •  Customer Bill', {
    x: 130,
    y: 10,
    size: 8.5,
    font: fontRegular,
    color: rgb(1, 1, 1)
  });

  const pdfBytes = await pdfDoc.save();
  const fileName = `bill_${billNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  const filePath = path.join(BILLS_DIR, fileName);
  fs.writeFileSync(filePath, Buffer.from(pdfBytes));

  return {
    filePath,
    fileName,
    relativeUrl: `/uploads/customer_bills/${fileName}`,
    buffer: Buffer.from(pdfBytes)
  };
}

module.exports = {
  generateCustomerBillPdf
};
