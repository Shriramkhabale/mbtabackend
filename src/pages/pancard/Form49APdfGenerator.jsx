import React from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { FORM_93_TEMPLATE_BASE64 } from '../../assets/form93Template';
import { FORM_94_TEMPLATE_BASE64 } from '../../assets/form94Template';

function base64ToUint8Array(base64) {
  const cleanBase64 = String(base64 || '').replace(/^data:.*?base64,/, '').replace(/\s/g, '');
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export const getCleanLastName = (lastName, firstName, applicantName) => {
  let l = String(lastName || '').trim();
  const f = String(firstName || '').trim();
  const app = String(applicantName || '').trim();

  // If no lastName provided, extract last word of applicantName
  if (!l && app) {
    const parts = app.split(/\s+/).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
  }

  // If lastName contains multiple words (e.g. full name was mistakenly stored)
  const parts = l.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    const titles = ['SHRI', 'SMT', 'KUMARI', 'MS', 'MRS', 'MR', 'DR', 'M/S'];
    const fUpper = f.toUpperCase();
    const lUpper = l.toUpperCase();
    const appUpper = app.toUpperCase();

    const startsWithTitle = titles.includes(parts[0].toUpperCase());
    const containsFirstName = Boolean(fUpper && parts.map(p => p.toUpperCase()).includes(fUpper));
    const equalsApplicantName = Boolean(appUpper && lUpper === appUpper);

    if (startsWithTitle || containsFirstName || equalsApplicantName) {
      let remaining = startsWithTitle ? parts.slice(1) : [...parts];
      if (fUpper) {
        remaining = remaining.filter(p => p.toUpperCase() !== fUpper);
      }
      if (remaining.length > 0) {
        return remaining.join(' ');
      }
      return parts[parts.length - 1];
    }
  }
  return l;
};

export const getIndividualCapacity = (data = {}, isMinor = false) => {
  if (isMinor || data.isMinor === true) return 'REPRESENTATIVE ASSESSEE';
  const g = String(data.gender || '').toUpperCase();
  const t = String(data.title || '').toUpperCase();
  const isFemale = g === 'FEMALE' || g === 'F' || ['SMT', 'KUMARI', 'MS', 'MRS'].includes(t);
  return isFemale ? 'HERSELF' : 'HIMSELF';
};


/*
 * FORM NO. 93 - Individual / Citizen of India
 * --------------------------------------------
 * This version keeps the same generation approach as the old code:
 * React HTML -> html2canvas -> jsPDF.
 *
 * Important:
 * - The page is built in millimetres, not arbitrary browser pixels.
 * - A4 = 210mm x 297mm.
 * - The layout below is based on the supplied Form No. 93 first two pages.
 * - Character cells are sized in mm so their position does not depend on
 *   the browser/device pixel density.
 */

const A4 = {
  width: 210,
  height: 297,
  border: 1.1,
};

const OUTER = {
  left: 5.2,
  right: 5.2,
  top: 4.8,
  bottom: 4.8,
};

const BoxGrid = ({
  value = '',
  length = 25,
  width = 5.45,
  height = 4.25,
  fontSize = 6.8,
  uppercase = true,
}) => {
  const text = String(value ?? '');
  const chars = (uppercase ? text.toUpperCase() : text)
    .padEnd(length, ' ')
    .slice(0, length)
    .split('');

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'nowrap',
        width: `${width * length}mm`,
        height: `${height}mm`,
        overflow: 'hidden',
      }}
    >
      {chars.map((ch, i) => (
        <div
          key={i}
          style={{
            flex: `0 0 ${width}mm`,
            width: `${width}mm`,
            height: `${height}mm`,
            border: '0.28mm solid #777',
            borderLeft: i === 0 ? '0.28mm solid #777' : 'none',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Arial, sans-serif',
            fontSize: `${fontSize}pt`,
            fontWeight: 'bold',
            lineHeight: 1,
            color: '#111',
            background: '#fff',
          }}
        >
          {ch !== ' ' ? ch : ''}
        </div>
      ))}
    </div>
  );
};

const Check = ({ checked = false, label = '', italic = false, showTickLabel = false }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '1.1mm',
      whiteSpace: 'nowrap',
      fontSize: '7.1pt',
      fontStyle: italic ? 'italic' : 'normal',
    }}
  >
    <span
      style={{
        width: '4.5mm',
        height: '4.2mm',
        border: '0.3mm solid #555',
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: showTickLabel && !checked ? '5.2pt' : '7pt',
        fontWeight: 'bold',
        lineHeight: 1,
        color: checked ? '#000' : '#777',
        background: '#fff'
      }}
    >
      {checked ? '✓' : (showTickLabel ? 'Tick' : '')}
    </span>
    {label}
  </span>
);

const GreyBar = ({ children, style = {} }) => (
  <div
    style={{
      background: '#e7e7e7',
      borderTop: '0.25mm solid #d1d1d1',
      borderBottom: '0.25mm solid #d1d1d1',
      minHeight: '4.8mm',
      padding: '0.5mm 2mm',
      boxSizing: 'border-box',
      fontWeight: 'bold',
      fontSize: '7.2pt',
      ...style,
    }}
  >
    {children}
  </div>
);

const CellRow = ({
  label,
  value = '',
  length = 25,
  labelWidth = 53,
  boxWidth = 5.45,
  boxHeight = 4.25,
  labelFont = 7.1,
  marginBottom = 0.25,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      marginBottom: `${marginBottom}mm`,
      minHeight: `${boxHeight}mm`,
    }}
  >
    <div
      style={{
        width: `${labelWidth}mm`,
        flex: `0 0 ${labelWidth}mm`,
        paddingLeft: '2mm',
        fontSize: `${labelFont}pt`,
        lineHeight: 1.05,
        boxSizing: 'border-box',
      }}
    >
      {label}
    </div>
    <BoxGrid
      value={value}
      length={length}
      width={boxWidth}
      height={boxHeight}
    />
  </div>
);

const FullWidthLine = ({ children, style = {} }) => (
  <div
    style={{
      borderTop: '0.25mm solid #777',
      ...style,
    }}
  >
    {children}
  </div>
);

const SectionTitle = ({ children, style = {} }) => (
  <div
    style={{
      height: '6mm',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '0.3mm solid #444',
      background: '#fff',
      fontSize: '8.1pt',
      fontWeight: 'bold',
      boxSizing: 'border-box',
      textAlign: 'center',
      position: 'relative',
      ...style
    }}
  >
    {children}
  </div>
);

const Page = ({ id, children }) => (
  <div
    id={id}
    style={{
      width: `${A4.width}mm`,
      height: `${A4.height}mm`,
      background: '#fff',
      color: '#111',
      fontFamily: 'Arial, Helvetica, sans-serif',
      boxSizing: 'border-box',
      overflow: 'hidden',
      position: 'relative',
      fontSize: '7.5pt',
      lineHeight: 1.12,
    }}
  >
    <div
      style={{
        position: 'absolute',
        left: `${OUTER.left}mm`,
        top: `${OUTER.top}mm`,
        width: `${A4.width - OUTER.left - OUTER.right}mm`,
        height: `${A4.height - OUTER.top - OUTER.bottom}mm`,
        border: '1.05mm solid #555',
        boxSizing: 'border-box',
        padding: '1.8mm',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
    <div
      style={{
        position: 'absolute',
        right: '8mm',
        bottom: '6mm',
        fontSize: '6.5pt',
      }}
    >
      {id.endsWith('page1') ? '1 of 2' : '2 of 2'}
    </div>
  </div>
);

export const generateForm93Pdf = async (
  rawData = {},
  winOrElement = null,
  maybeWin = null
) => {
  let existingWin = null;
  if (winOrElement && typeof winOrElement === 'object' && ('location' in winOrElement || 'document' in winOrElement)) {
    existingWin = winOrElement;
  } else if (maybeWin && typeof maybeWin === 'object' && ('location' in maybeWin || 'document' in maybeWin)) {
    existingWin = maybeWin;
  }

  try {
    const data = { ...(rawData.details || {}), ...rawData };
    const templateBytes = base64ToUint8Array(FORM_93_TEMPLATE_BASE64);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const pages = pdfDoc.getPages();
    const page1 = pages[0];
    const page2 = pages[1];

    const drawCells = (page, text, startX, yBase, stepX = 15.34, maxLen = 25, fontSize = 7.5) => {
      const clean = String(text || '').toUpperCase().slice(0, maxLen);
      for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (ch !== ' ') {
          page.drawText(ch, {
            x: startX + i * stepX + 3.8,
            y: yBase,
            size: fontSize,
            font: fontBold,
            color: rgb(0, 0, 0),
          });
        }
      }
    };

    const drawTick = (page, x, y) => {
      page.drawLine({
        start: { x: x + 1, y: y + 3.8 },
        end: { x: x + 3.5, y: y + 0.8 },
        thickness: 1.3,
        color: rgb(0, 0, 0),
      });
      page.drawLine({
        start: { x: x + 3.5, y: y + 0.8 },
        end: { x: x + 8, y: y + 7.8 },
        thickness: 1.3,
        color: rgb(0, 0, 0),
      });
    };

    const embedImageHelper = async (url) => {
      if (!url || typeof url !== 'string' || url.length < 15) return null;
      try {
        let bytes = null;
        if (url.startsWith('data:')) {
          bytes = base64ToUint8Array(url);
        } else if (url.startsWith('http')) {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          bytes = new Uint8Array(buf);
        }
        if (bytes) {
          try { return await pdfDoc.embedPng(bytes); } catch (_) {}
          try { return await pdfDoc.embedJpg(bytes); } catch (_) {}
        }
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const convertedBytes = await new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || img.width;
              canvas.height = img.naturalHeight || img.height;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0);
              resolve(base64ToUint8Array(canvas.toDataURL('image/jpeg', 0.95)));
            };
            img.onerror = () => resolve(null);
            img.src = url;
          });
          if (convertedBytes) {
            return await pdfDoc.embedJpg(convertedBytes);
          }
        }
      } catch (e) {
        console.warn('Image embed failed:', e);
      }
      return null;
    };

    // Embed applicant photo in left and right photo boxes on Page 1
    const photoImg = await embedImageHelper(data.photoUrl);
    if (photoImg) {
      // Left Photo Box: x: 45.66, y: 691.05, w: 99.28, h: 127.63
      page1.drawImage(photoImg, {
        x: 45.66,
        y: 691.05,
        width: 99.28,
        height: 127.63,
      });
      // Right Photo Box: x: 443.30, y: 690.91, w: 99.28, h: 127.63
      page1.drawImage(photoImg, {
        x: 443.30,
        y: 690.91,
        width: 99.28,
        height: 127.63,
      });
    }

    // Embed applicant signature (Page 2 signature box only; no signature across left photo)
    const sigImg = await embedImageHelper(data.signatureUrl);
    if (sigImg) {
      // Signature box on Page 2: x=328.61, y=125.10, w=201.30, h=62.90
      const dims = sigImg.scaleToFit(201.30, 62.90);
      page2.drawImage(sigImg, {
        x: 328.61 + (201.30 - dims.width) / 2,
        y: 125.10 + (62.90 - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
    }

    // 1. A. Applicant Name
    const nameParts = String(data.applicantName || '').trim().split(/\s+/).filter(Boolean);
    const fName = (data.firstName !== undefined && data.firstName !== '') ? data.firstName : (nameParts.length > 1 ? nameParts[0] : (nameParts[0] || ''));
    const rawLName = (data.lastName !== undefined && data.lastName !== '') ? data.lastName : (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '');
    const lName = getCleanLastName(rawLName, fName, data.applicantName);
    const mName = (data.middleName !== undefined && data.middleName !== '') ? data.middleName : (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '');
    const fullName = `${fName} ${mName} ${lName}`.replace(/\s+/g, ' ').trim() || (data.applicantName || lName || '');

    drawCells(page1, fName, 180.6, 638.1, 15.34, 25);
    drawCells(page1, mName, 180.6, 624.7, 15.34, 25);
    drawCells(page1, lName, 180.6, 611.3, 15.34, 25);

    // 1. B. Name (as per Aadhaar)
    const rawAadhaarName = String(data.nameAsPerAadhaar || fullName).toUpperCase().trim();
    const aadhWords = rawAadhaarName.split(/\s+/).filter(Boolean);
    const aadhLines = ['', '', ''];
    let aadhIdx = 0;
    for (const word of aadhWords) {
      if (!aadhLines[aadhIdx]) {
        aadhLines[aadhIdx] = word.slice(0, 25);
      } else if ((aadhLines[aadhIdx] + ' ' + word).length <= 25) {
        aadhLines[aadhIdx] += ' ' + word;
      } else if (aadhIdx < 2) {
        aadhIdx++;
        aadhLines[aadhIdx] = word.slice(0, 25);
      }
    }
    drawCells(page1, aadhLines[0], 180.6, 580.3, 15.34, 25);
    drawCells(page1, aadhLines[1], 180.6, 566.9, 15.34, 25);
    drawCells(page1, aadhLines[2], 180.6, 553.5, 15.34, 25);

    // 2. Gender
    const genderStr = String(data.gender || '').toUpperCase();
    if (genderStr === 'MALE') {
      drawTick(page1, 180.6, 540.0);
    } else if (genderStr === 'FEMALE') {
      drawTick(page1, 226.8, 540.0);
    } else if (genderStr === 'TRANSGENDER') {
      drawTick(page1, 287.9, 540.0);
    }

    // 3. Date of Birth
    const targetDob = String(data.dob || '').trim();
    let dobDay = '', dobMonth = '', dobYear = '';
    if (targetDob) {
      if (targetDob.includes('-')) {
        const parts = targetDob.split('-');
        if (parts[0].length === 4) {
          dobYear = parts[0]; dobMonth = parts[1]; dobDay = parts[2];
        } else {
          dobDay = parts[0]; dobMonth = parts[1]; dobYear = parts[2];
        }
      } else if (targetDob.includes('/')) {
        const parts = targetDob.split('/');
        if (parts[0].length === 4) {
          dobYear = parts[0]; dobMonth = parts[1]; dobDay = parts[2];
        } else {
          dobDay = parts[0]; dobMonth = parts[1]; dobYear = parts[2];
        }
      }
    }
    if (dobDay || dobMonth || dobYear) {
      page1.drawRectangle({ x: 181.5, y: 524.9, width: 29.5, height: 10.0, color: rgb(1, 1, 1) });
      page1.drawRectangle({ x: 227.0, y: 524.9, width: 29.5, height: 10.0, color: rgb(1, 1, 1) });
      page1.drawRectangle({ x: 272.5, y: 524.9, width: 59.5, height: 10.0, color: rgb(1, 1, 1) });

      drawCells(page1, dobDay, 180.8, 526.6, 14.9, 2);
      drawCells(page1, dobMonth, 226.6, 526.6, 15.3, 2);
      drawCells(page1, dobYear, 272.5, 526.6, 15.0, 4);
    }

    // 4. Aadhaar Number
    const aadhClean = String(data.aadhaarNumber || data.aadhaar || '').replace(/\D/g, '').slice(0, 12);
    if (aadhClean) {
      drawCells(page1, aadhClean, 180.6, 513.2, 15.13, 12);
    }

    // 5. Residence Address
    const res = data.residenceAddress || data.address || data || {};
    const resFlat = res.flatNo || res.flatDoorBuilding || '';
    const resRoad = res.roadStreet || res.roadStreetBlock || '';
    const resPost = res.postOffice || res.premises || '';
    const resArea = res.areaTaluka || res.areaLocality || '';
    const resDist = (res.district && res.district !== 'SELECT') ? res.district : '';
    const resState = (res.state && res.state !== 'PLEASE SELECT') ? res.state : '';
    const resPin = String(res.pincode || '').replace(/\D/g, '').slice(0, 6);

    drawCells(page1, resFlat, 180.6, 482.7, 15.34, 25);
    drawCells(page1, resRoad, 180.6, 469.3, 15.34, 25);
    drawCells(page1, resPost, 180.6, 455.9, 15.34, 25);
    drawCells(page1, resArea, 180.6, 442.5, 15.34, 25);
    drawCells(page1, resDist, 180.6, 429.1, 15.34, 25);
    if (resState) {
      page1.drawText(String(resState).toUpperCase().slice(0, 16), {
        x: 135.0, y: 415.7, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
      });
    }
    page1.drawText('INDIA', {
      x: 295.0, y: 415.7, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
    });
    if (resPin) {
      drawCells(page1, resPin, 457.0, 415.7, 15.35, 6);
    }

    // 6. Office Address
    const off = data.officeAddress || {};
    const offFlat = off.flatNo || off.flatDoorBuilding || '';
    const offRoad = off.roadStreet || off.roadStreetBlock || '';
    const offPost = off.postOffice || off.premises || '';
    const offArea = off.areaTaluka || off.areaLocality || '';
    const offDist = (off.district && off.district !== 'SELECT') ? off.district : '';
    const offState = (off.state && off.state !== 'PLEASE SELECT') ? off.state : '';
    const offPin = String(off.pincode || '').replace(/\D/g, '').slice(0, 6);

    if (offFlat || offRoad || offPost || offDist) {
      drawCells(page1, offFlat, 180.6, 385.1, 15.34, 25);
      drawCells(page1, offRoad, 180.6, 371.7, 15.34, 25);
      drawCells(page1, offPost, 180.6, 358.3, 15.34, 25);
      drawCells(page1, offArea, 180.6, 344.9, 15.34, 25);
      drawCells(page1, offDist, 180.6, 331.5, 15.34, 25);
      if (offState) {
        page1.drawText(String(offState).toUpperCase().slice(0, 16), {
          x: 135.0, y: 318.1, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
        });
      }
      page1.drawText('INDIA', {
        x: 295.0, y: 318.1, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
      });
      if (offPin) {
        drawCells(page1, offPin, 457.0, 318.1, 15.35, 6);
      }
    }

    // 7. Residential Status
    const resStatus = String(data.residentialStatus || '').toUpperCase();
    if (resStatus === 'NON_RESIDENT' || resStatus === 'NRI') {
      drawTick(page1, 273.0, 301.2);
    } else if (resStatus === 'RESIDENT_BUT_NOT_ORDINARILY_RESIDENT' || resStatus === 'RNOR') {
      drawTick(page1, 350.2, 301.2);
    } else {
      drawTick(page1, 210.9, 301.2); // Resident (default)
    }

    // 8. Passport Number
    if (data.passportNumber || data.passportNo) {
      drawCells(page1, data.passportNumber || data.passportNo, 328.8, 281.4, 14.74, 12);
    }

    // 9. TIN
    if (data.tinNumber || data.tin) {
      drawCells(page1, data.tinNumber || data.tin, 270.0, 261.3, 14.74, 20);
    }

    // 10. Contact Details
    drawCells(page1, data.countryCode || '91', 240.3, 230.8, 14.8, 2);
    drawCells(page1, String(data.mobileNumber || '').replace(/\D/g, '').slice(-10), 373.0, 230.8, 15.1, 10);
    if (data.email) {
      page1.drawText(String(data.email).slice(0, 48), {
        x: 245.0, y: 217.4, size: 7.5, font: fontBold, color: rgb(0, 0, 0),
      });
    }
    if (data.stdCode) {
      drawCells(page1, data.stdCode, 240.4, 204.0, 15.0, 3);
    }
    if (data.landlineNumber) {
      drawCells(page1, data.landlineNumber, 373.0, 204.0, 15.5, 8);
    }

    // 11. Source of Income
    const inc = String(data.sourceofincome || data.sourceOfIncome || data.incomeSource || data.incomeSources || '').toUpperCase();
    if (inc.includes('SALARY') || data.salaryIncome || data.salary) {
      drawTick(page1, 179.4, 164.2);
    } else if (inc.includes('BUSINESS') || inc.includes('PROFESSION') || data.businessIncome) {
      drawTick(page1, 256.1, 164.2);
    } else if (inc.includes('HOUSE') || inc.includes('PROPERTY') || data.housePropertyIncome) {
      drawTick(page1, 410.5, 164.2);
    } else if (inc.includes('CAPITAL') || inc.includes('GAINS') || data.capitalGainsIncome || data.capitalGains) {
      drawTick(page1, 179.4, 148.0);
    } else if (inc.includes('NO INCOME') || inc.includes('NONE') || data.noIncome) {
      drawTick(page1, 410.5, 148.0);
    } else if (inc.includes('OTHER') || data.otherIncome) {
      drawTick(page1, 256.1, 148.0);
    } else if (inc) {
      drawTick(page1, 256.1, 148.0); // Income from Other Sources (fallback if unknown non-empty)
    }

    // 12. Whether mother/father is a single parent?
    if (data.isSingleParent === 'YES' || data.isSingleParent === 'Yes') {
      drawTick(page1, 240.7, 109.0);
    } else {
      drawTick(page1, 302.2, 109.0); // No
    }

    // 13. Father's Name
    const fatherParts = String(data.fatherName || '').trim().split(/\s+/).filter(Boolean);
    const fatherFirst = (data.fatherFirstName !== undefined && data.fatherFirstName !== '') ? data.fatherFirstName : (fatherParts.length > 1 ? fatherParts[0] : (fatherParts[0] || ''));
    const fatherLast = (data.fatherLastName !== undefined && data.fatherLastName !== '') ? data.fatherLastName : (fatherParts.length > 1 ? fatherParts[fatherParts.length - 1] : '');
    const fatherMiddle = (data.fatherMiddleName !== undefined && data.fatherMiddleName !== '') ? data.fatherMiddleName : (fatherParts.length > 2 ? fatherParts.slice(1, -1).join(' ') : '');

    drawCells(page1, fatherFirst, 180.6, 94.2, 15.34, 25);
    drawCells(page1, fatherMiddle, 180.6, 80.7, 15.34, 25);
    drawCells(page1, fatherLast, 180.6, 67.3, 15.34, 25);

    // PAGE 2:
    // 14. Mother's Name
    const motherParts = String(data.motherName || '').trim().split(/\s+/).filter(Boolean);
    const motherFirst = (data.motherFirstName !== undefined && data.motherFirstName !== '') ? data.motherFirstName : (motherParts.length > 1 ? motherParts[0] : (motherParts[0] || ''));
    const motherLast = (data.motherLastName !== undefined && data.motherLastName !== '') ? data.motherLastName : (motherParts.length > 1 ? motherParts[motherParts.length - 1] : '');
    const motherMiddle = (data.motherMiddleName !== undefined && data.motherMiddleName !== '') ? data.motherMiddleName : (motherParts.length > 2 ? motherParts.slice(1, -1).join(' ') : '');

    drawCells(page2, motherFirst, 180.6, 811.3, 15.34, 25);
    drawCells(page2, motherMiddle, 180.6, 797.9, 15.34, 25);
    drawCells(page2, motherLast, 180.6, 784.5, 15.34, 25);

    // 15. Name of parent to be printed
    if (String(data.parentNameToPrint || '').toUpperCase() === 'MOTHER') {
      drawTick(page2, 394.6, 768.5);
    } else {
      drawTick(page2, 333.1, 768.5); // Father
    }

    // 16. Assessing Officer (AO Code)
    drawCells(page2, data.aoAreaCode || '', 237.58, 726.5, 15.34, 3);
    drawCells(page2, data.aoType || '', 397.45, 726.5, 15.34, 2);
    drawCells(page2, data.aoRangeCode || '', 238.00, 713.0, 15.34, 3);
    drawCells(page2, data.aoNo || '', 397.42, 713.0, 15.34, 2);

    // Minor / Representative Assessee check
    const calculateAge = (dobStr) => {
      if (!dobStr || typeof dobStr !== 'string') return 99;
      const trimmed = dobStr.trim();
      let year = 0, month = 0, day = 0;
      if (trimmed.includes('-')) {
        const p = trimmed.split('-');
        if (p[0].length === 4) { year = +p[0]; month = +p[1]; day = +p[2]; }
        else { day = +p[0]; month = +p[1]; year = +p[2]; }
      } else if (trimmed.includes('/')) {
        const p = trimmed.split('/');
        if (p[0].length === 4) { year = +p[0]; month = +p[1]; day = +p[2]; }
        else { day = +p[0]; month = +p[1]; year = +p[2]; }
      }
      if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) return 99;
      const bDate = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let age = today.getFullYear() - bDate.getFullYear();
      const m = today.getMonth() - bDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) age--;
      return age;
    };
    const appAge = calculateAge(data.dob);
    const isMinor = data.isMinor === true || (appAge >= 0 && appAge < 18);

    // 17-21. Part E: Representative Assessee
    const raFirst = isMinor ? (data.raFirstName || data.guardianFirstName || fatherFirst || '') : '';
    const raMiddle = isMinor ? (data.raMiddleName || data.guardianMiddleName || fatherMiddle || '') : '';
    const raLast = isMinor ? (data.raLastName || data.guardianLastName || fatherLast || '') : '';

    if (isMinor || raFirst || raLast) {
      drawCells(page2, raFirst, 180.6, 669.5, 15.34, 25);
      drawCells(page2, raMiddle, 180.6, 656.1, 15.34, 25);
      drawCells(page2, raLast, 180.6, 642.7, 15.34, 25);

      if (data.raPan || data.raPanNumber || data.guardianPan) {
        drawCells(page2, data.raPan || data.raPanNumber || data.guardianPan, 178.4, 627.4, 15.34, 10);
      }
      if (data.raAadhaarNumber || data.raAadhaar || data.guardianAadhaarNumber) {
        drawCells(page2, String(data.raAadhaarNumber || data.raAadhaar || data.guardianAadhaarNumber).replace(/\D/g, ''), 281.3, 611.0, 15.35, 12);
      }

      const raAddr = data.representativeAddress || data.raAddress || res || {};
      drawCells(page2, raAddr.flatNo || raAddr.flatDoorBuilding || resFlat, 180.6, 579.4, 15.34, 25);
      drawCells(page2, raAddr.roadStreet || raAddr.roadStreetBlock || resRoad, 180.6, 566.0, 15.34, 25);
      drawCells(page2, raAddr.postOffice || raAddr.premises || resPost, 180.6, 552.6, 15.34, 25);
      drawCells(page2, raAddr.areaTaluka || raAddr.areaLocality || resArea, 180.6, 539.2, 15.34, 25);
      drawCells(page2, raAddr.district || resDist, 180.6, 525.8, 15.34, 25);
      if (raAddr.state || resState) {
        page2.drawText(String(raAddr.state || resState).toUpperCase().slice(0, 16), {
          x: 135.0, y: 512.4, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
        });
      }
      page2.drawText('INDIA', {
        x: 295.0, y: 512.4, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
      });
      const raPin = String(raAddr.pincode || resPin).replace(/\D/g, '').slice(0, 6);
      if (raPin) {
        drawCells(page2, raPin, 454.1, 512.4, 15.35, 6);
      }

      // RA Contact
      drawCells(page2, data.raCountryCode || data.countryCode || '91', 240.3, 481.3, 14.8, 2);
      drawCells(page2, String(data.raMobileNumber || data.mobileNumber || '').replace(/\D/g, '').slice(-10), 373.0, 481.3, 15.1, 10);
      if (data.raEmail || data.email) {
        page2.drawText(String(data.raEmail || data.email).slice(0, 48), {
          x: 245.0, y: 467.3, size: 7.5, font: fontBold, color: rgb(0, 0, 0),
        });
      }
      if (data.raStdCode || data.stdCode) {
        drawCells(page2, data.raStdCode || data.stdCode, 240.4, 453.4, 15.0, 3);
      }
      if (data.raLandlineNumber || data.landlineNumber) {
        drawCells(page2, data.raLandlineNumber || data.landlineNumber, 373.0, 453.4, 15.5, 8);
      }
    }

    // 22. Address for Communication
    const commAddr = String(data.addressForCommunication || '').toUpperCase();
    if (commAddr === 'OFFICE') {
      drawTick(page2, 445.8, 417.6);
    } else if (commAddr === 'REPRESENTATIVE_ASSESSEE' || commAddr === 'RA') {
      drawTick(page2, 299.8, 417.6);
    } else {
      drawTick(page2, 213.8, 417.6); // Residence Address
    }

    // 23. Documents Submitted (Applicant)
    drawTick(page2, 68.5, 360.5); // (i) Proof of Identity
    drawTick(page2, 167.1, 360.5); // (ii) Proof of Address
    drawTick(page2, 268.0, 360.5); // (iii) Proof of Date of Birth

    // 24. Documents Submitted (Representative Assessee)
    if (isMinor || raFirst || raLast) {
      drawTick(page2, 68.5, 323.4); // RA PoI
      drawTick(page2, 167.1, 323.4); // RA PoA
    }

    // Verification & Declaration
    const vName = (data.verifierName || (isMinor ? `${raFirst} ${raMiddle} ${raLast}`.trim() : fullName) || fullName).toUpperCase();
    const vCap = getIndividualCapacity(data, isMinor);
    const vPlace = (data.verifierPlace || data.place || resDist || 'DELHI').toUpperCase();
    const vDate = data.verifierDate || data.date || new Date().toISOString().split('T')[0];
    const vDateFmt = vDate.includes('-') ? vDate.split('-').reverse().join('/') : vDate;

    // Line a dynamic flow
    page2.drawRectangle({ x: 55.0, y: 268.0, width: 485.0, height: 14.0, color: rgb(1, 1, 1) });
    const prefix = 'a. I, ';
    const mid = ', in the capacity of ';
    const suffix = ' (Self/ Representative Assessee) do hereby declare that';

    let declFontSize = 7.4;
    const maxDeclWidth = 472.0;

    let w1 = fontRegular.widthOfTextAtSize(prefix, declFontSize);
    let w2 = fontBold.widthOfTextAtSize(vName, declFontSize);
    let w3 = fontRegular.widthOfTextAtSize(mid, declFontSize);
    let w4 = fontBold.widthOfTextAtSize(vCap, declFontSize);
    let w5 = fontRegular.widthOfTextAtSize(suffix, declFontSize);
    let totalDeclW = w1 + w2 + w3 + w4 + w5 + 3.0;

    if (totalDeclW > maxDeclWidth) {
      const scale = maxDeclWidth / totalDeclW;
      declFontSize = Math.max(5.8, +(declFontSize * scale).toFixed(2));
      w1 = fontRegular.widthOfTextAtSize(prefix, declFontSize);
      w2 = fontBold.widthOfTextAtSize(vName, declFontSize);
      w3 = fontRegular.widthOfTextAtSize(mid, declFontSize);
      w4 = fontBold.widthOfTextAtSize(vCap, declFontSize);
      w5 = fontRegular.widthOfTextAtSize(suffix, declFontSize);
    }

    let currX = 57.37;
    const lineAY = 271.5;

    page2.drawText(prefix, { x: currX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });
    currX += w1;
    page2.drawText(vName, { x: currX, y: lineAY, size: declFontSize, font: fontBold, color: rgb(0, 0, 0) });
    currX += w2;
    page2.drawText(mid, { x: currX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });
    currX += w3;
    page2.drawText(vCap, { x: currX, y: lineAY, size: declFontSize, font: fontBold, color: rgb(0, 0, 0) });
    currX += w4 + 2.5;
    page2.drawText(suffix, { x: currX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });

    // Place line
    page2.drawRectangle({ x: 76.0, y: 206.0, width: 174.0, height: 12.0, color: rgb(1, 1, 1) });
    page2.drawText(': ' + vPlace.slice(0, 24), { x: 78.0, y: 209.5, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    // Date line
    page2.drawRectangle({ x: 76.0, y: 191.0, width: 174.0, height: 12.0, color: rgb(1, 1, 1) });
    page2.drawText(': ' + vDateFmt, { x: 78.0, y: 194.5, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    // Under signature box: Name:
    page2.drawRectangle({ x: 395.0, y: 64.0, width: 140.0, height: 13.0, color: rgb(1, 1, 1) });
    page2.drawText(': ' + vName.slice(0, 30), { x: 396.0, y: 67.0, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    // Under signature box: Designation:
    page2.drawRectangle({ x: 420.0, y: 37.0, width: 115.0, height: 13.0, color: rgb(1, 1, 1) });
    page2.drawText(': Authorized Person', { x: 421.0, y: 40.0, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    // Append all uploaded documents after the first 2 pages
    try {
      const src = { ...(data.details || {}), ...data };
      const docsToAppend = [];
      const seenUrls = new Set();

      const addDoc = (url) => {
        if (!url || typeof url !== 'string' || url.length < 15) return;
        if (url === src.signatureUrl || url === data.signatureUrl) return;
        if (url === src.receiptUrl || url === src.adminReceiptUrl) return;
        if (seenUrls.has(url)) return;
        seenUrls.add(url);
        docsToAppend.push(url);
      };

      if (src.proofOfIdentityUrl) addDoc(src.proofOfIdentityUrl);
      if (src.proofOfAddressUrl) addDoc(src.proofOfAddressUrl);
      if (src.proofOfDobUrl) addDoc(src.proofOfDobUrl);
      if (src.proofOfOtherUrl) addDoc(src.proofOfOtherUrl);
      if (src.raPhotoUrl) addDoc(src.raPhotoUrl);

      if (Array.isArray(src.documents)) {
        src.documents.forEach(d => {
          const u = typeof d === 'string' ? d : (d?.url || d?.dataUrl || d?.fileUrl || d?.src);
          addDoc(u);
        });
      }

      Object.keys(src).forEach(key => {
        if (key === 'signatureUrl' || key === 'photoUrl' || key === 'receiptUrl' || key === 'adminReceiptUrl') return;
        const val = src[key];
        if (typeof val === 'string' && (
          val.startsWith('data:image/') ||
          val.startsWith('data:application/pdf') ||
          (val.startsWith('http') && /\.(pdf|png|jpe?g|webp)($|\?)/i.test(val))
        )) {
          addDoc(val);
        }
      });

      for (const docUrl of docsToAppend) {
        try {
          const isPdf = docUrl.startsWith('data:application/pdf') ||
            (docUrl.startsWith('http') && docUrl.toLowerCase().includes('.pdf'));

          if (isPdf) {
            let pdfBytes;
            if (docUrl.startsWith('data:')) {
              pdfBytes = base64ToUint8Array(docUrl);
            } else {
              const res = await fetch(docUrl);
              const buf = await res.arrayBuffer();
              pdfBytes = new Uint8Array(buf);
            }
            const donorDoc = await PDFDocument.load(pdfBytes);
            const donorIndices = donorDoc.getPageIndices();
            const copiedPages = await pdfDoc.copyPages(donorDoc, donorIndices);
            copiedPages.forEach(p => pdfDoc.addPage(p));
          } else {
            const embeddedImg = await embedImageHelper(docUrl);
            if (embeddedImg) {
              const newPage = pdfDoc.addPage([595.28, 841.89]);
              const margin = 24.0;
              const maxW = 595.28 - (margin * 2);
              const maxH = 841.89 - (margin * 2);
              const dims = embeddedImg.scaleToFit(maxW, maxH);
              newPage.drawImage(embeddedImg, {
                x: (595.28 - dims.width) / 2,
                y: (841.89 - dims.height) / 2,
                width: dims.width,
                height: dims.height,
              });
            }
          }
        } catch (singleDocErr) {
          console.warn('Could not append single document to Form 93 PDF:', singleDocErr);
        }
      }
    } catch (docsErr) {
      console.warn('Error in appending uploaded documents:', docsErr);
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const safeName = (lName || fName || data.applicantName || 'Application')
      .toString().replace(/[^\w-]+/g, '_');
    const fileName = `PAN_Form_93_${safeName}.pdf`;

    if (existingWin && !existingWin.closed) {
      existingWin.location.href = blobUrl;
      try { existingWin.focus(); } catch (e) {}
    } else {
      try {
        const newWin = window.open(blobUrl, '_blank');
        if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          setTimeout(() => { document.body.removeChild(link); }, 100);
        }
      } catch {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { document.body.removeChild(link); }, 100);
      }
    }
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { document.body.removeChild(link); }, 100);
    return true;
  } catch (err) {
    console.error('Error generating Form 93 PDF:', err);
    if (existingWin && !existingWin.closed) existingWin.close();
    return false;
  }
};

const PhotoBox = ({ photoUrl, left = false }) => (
  <div
    style={{
      width: '35mm',
      height: '45mm',
      border: '0.35mm solid #555',
      boxSizing: 'border-box',
      position: 'relative',
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}
  >
    {photoUrl ? (
      <img
        src={photoUrl}
        alt="Applicant"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    ) : (
      <div
        style={{
          textAlign: 'center',
          width: '31mm',
          fontSize: '6.5pt',
          lineHeight: 1.25,
          color: '#222',
        }}
      >
        Recent colour
        <br />
        photograph of the applicant
        <br />
        (4.5 cm x 3.5 cm)
        {left && (
          <>
            <br />
            with Sign/Left thumb
            <br />
            impression across the photo of
            <br />
            the applicant
          </>
        )}
      </div>
    )}
  </div>
);

const NameRows = ({ firstName, middleName, lastName, aadhaar = false }) => (
  <div>
    <CellRow label="First Name" value={firstName} length={aadhaar ? 30 : 25} />
    <CellRow label="Middle Name" value={middleName} length={aadhaar ? 30 : 25} />
    <CellRow label="Last Name" value={lastName} length={aadhaar ? 30 : 25} />
  </div>
);

const AddressRows = ({ address = {}, prefix = '' }) => {
  const flat = address[`${prefix}flatDoorBuilding`] || address.flatDoorBuilding || address[`${prefix}flatNo`] || address.flatNo || '';
  const road = address[`${prefix}roadStreetBlock`] || address.roadStreetBlock || address[`${prefix}roadStreet`] || address.roadStreet || '';
  const post = address[`${prefix}postOffice`] || address.postOffice || address[`${prefix}premises`] || address.premises || '';
  const area = address[`${prefix}areaLocality`] || address.areaLocality || address[`${prefix}areaTaluka`] || address.areaTaluka || '';
  const dist = address[`${prefix}district`] || address.district || '';
  const st = address[`${prefix}state`] || address.state || '';
  const pin = address[`${prefix}pincode`] || address.pincode || '';
  const ctry = address[`${prefix}country`] || address.country || 'INDIA';

  return (
    <div>
      <CellRow
        label="Flat/Door/Building"
        value={flat}
        length={30}
        labelWidth={53}
        boxWidth={4.55}
      />
      <CellRow
        label="Road/Street/Block/Sector"
        value={road}
        length={30}
        labelWidth={53}
        boxWidth={4.55}
      />
      <CellRow
        label="Post Office"
        value={post}
        length={30}
        labelWidth={53}
        boxWidth={4.55}
      />
      <CellRow
        label="Area/Locality/Town/City"
        value={area}
        length={30}
        labelWidth={53}
        boxWidth={4.55}
      />
      <CellRow
        label="District"
        value={dist}
        length={30}
        labelWidth={53}
        boxWidth={4.55}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          minHeight: '4.25mm',
          marginBottom: '0.25mm',
          fontSize: '6.8pt',
        }}
      >
        <div
          style={{
            width: '38mm',
            flex: '0 0 38mm',
            paddingLeft: '2mm',
          }}
        >
          State/Union Territory
        </div>
        <div
          style={{
            width: '26mm',
            height: '4.25mm',
            border: '0.28mm solid #777',
            boxSizing: 'border-box',
            padding: '0.5mm 1mm',
            fontSize: '6.5pt',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          {st}
        </div>
        <div
          style={{
            marginLeft: '3mm',
            width: '23mm',
          }}
        >
          Country/Region
        </div>
        <div
          style={{
            width: '22mm',
            height: '4.25mm',
            border: '0.28mm solid #777',
            boxSizing: 'border-box',
            padding: '0.5mm 1mm',
            fontSize: '6.5pt',
            fontWeight: 'bold',
            textTransform: 'uppercase',
          }}
        >
          {ctry}
        </div>
        <div
          style={{
            marginLeft: '3mm',
            marginRight: '2mm',
            whiteSpace: 'nowrap',
          }}
        >
          PIN / ZIP CODE
        </div>
        <BoxGrid value={pin} length={6} width={4.4} height={4.25} />
      </div>
    </div>
  );
};

const Form93PdfTemplate = ({ data = {} }) => {
  const isIndividual = !data.category || data.category === 'INDIVIDUAL';
  const entityTitleName = data.entityName || (!isIndividual ? data.lastName : '');

  // 1. Name normalization
  const nameParts = (data.applicantName || data.nameAsPerAadhaar || '').trim().split(' ');
  const fName = isIndividual ? ((data.firstName !== undefined && data.firstName !== '') ? data.firstName : (nameParts.length > 1 ? nameParts[0] : nameParts[0] || '')) : '';
  const rawLName = isIndividual ? ((data.lastName !== undefined && data.lastName !== '') ? data.lastName : (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '') || '') : (entityTitleName || data.applicantName || '');
  const lName = isIndividual ? getCleanLastName(rawLName, fName, data.applicantName || data.nameAsPerAadhaar) : rawLName;
  const mName = isIndividual ? ((data.middleName !== undefined && data.middleName !== '') ? data.middleName : (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '') || '') : '';

  const fullName = isIndividual ? `${fName} ${mName} ${lName}`.replace(/\s+/g, ' ').trim() : lName;
  const aadhaarName = (data.nameAsPerAadhaar || fullName).toUpperCase();

  // Father & Mother name normalization
  const fatherParts = (data.fatherName || '').trim().split(' ');
  const fatherFirstNameVal = data.fatherFirstName !== undefined && data.fatherFirstName !== '' ? data.fatherFirstName : (fatherParts.length > 1 ? fatherParts[0] : (fatherParts[0] || ''));
  const fatherLastNameVal = data.fatherLastName !== undefined && data.fatherLastName !== '' ? data.fatherLastName : (fatherParts.length > 1 ? fatherParts[fatherParts.length - 1] : '');
  const fatherMiddleNameVal = data.fatherMiddleName !== undefined && data.fatherMiddleName !== '' ? data.fatherMiddleName : (fatherParts.length > 2 ? fatherParts.slice(1, -1).join(' ') : '');

  const motherParts = (data.motherName || '').trim().split(' ');
  const motherFirstNameVal = data.motherFirstName !== undefined && data.motherFirstName !== '' ? data.motherFirstName : (motherParts.length > 1 ? motherParts[0] : (motherParts[0] || ''));
  const motherLastNameVal = data.motherLastName !== undefined && data.motherLastName !== '' ? data.motherLastName : (motherParts.length > 1 ? motherParts[motherParts.length - 1] : '');
  const motherMiddleNameVal = data.motherMiddleName !== undefined && data.motherMiddleName !== '' ? data.motherMiddleName : (motherParts.length > 2 ? motherParts.slice(1, -1).join(' ') : '');

  // 2. Date of Birth / Incorporation robust parser
  const targetDob = data.dateOfIncorporation || data.dob;
  let dobDay = '';
  let dobMonth = '';
  let dobYear = '';
  if (targetDob) {
    const str = String(targetDob).trim();
    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts[0].length === 4) {
        dobYear = parts[0];
        dobMonth = parts[1];
        dobDay = parts[2];
      } else {
        dobDay = parts[0];
        dobMonth = parts[1];
        dobYear = parts[2];
      }
    } else if (str.includes('/')) {
      const parts = str.split('/');
      if (parts[0].length === 4) {
        dobYear = parts[0];
        dobMonth = parts[1];
        dobDay = parts[2];
      } else {
        dobDay = parts[0];
        dobMonth = parts[1];
        dobYear = parts[2];
      }
    }
  }

  // 3. Addresses
  const residence = data.residenceAddress || data.address || {
    flatNo: data.flatNo || data.residenceFlatNo || '',
    premises: data.premises || data.residencePremises || '',
    roadStreet: data.roadStreet || data.residenceRoadStreet || '',
    areaTaluka: data.areaTaluka || data.residenceAreaTaluka || '',
    district: data.district || data.residenceDistrict || '',
    state: data.state || data.residenceState || '',
    pincode: data.pincode || data.residencePincode || '',
  };

  const hasOfficeAddressData = !!(
    data.officeAddress ||
    data.officeFlatNo ||
    data.officeRoadStreet ||
    data.officePremises ||
    data.officeAreaTaluka ||
    data.officeDistrict ||
    data.officeState ||
    data.officePincode ||
    data.commFlatNo ||
    data.commRoadStreet ||
    data.commPremises ||
    data.commAreaTaluka ||
    data.commDistrict ||
    data.commState ||
    data.commPincode ||
    data.officeName
  );

  const office = data.officeAddress
    ? data.officeAddress
    : (hasOfficeAddressData ? {
        nameOfOffice: data.officeName || data.nameOfOffice || '',
        flatNo: data.officeFlatNo || data.commFlatNo || '',
        premises: data.officePremises || data.commPremises || '',
        roadStreet: data.officeRoadStreet || data.commRoadStreet || '',
        areaTaluka: data.officeAreaTaluka || data.commAreaTaluka || '',
        district: data.officeDistrict || data.commDistrict || '',
        state: data.officeState || data.commState || '',
        pincode: data.officePincode || data.commPincode || '',
      } : {});

  // 7. Applicant Status
  const statusStr = String(data.category || data.applicantStatus || 'INDIVIDUAL').toUpperCase();

  // 8. Other Name
  const hasOtherName = (data.otherName || '').toUpperCase() === 'YES';

  // 9. Gender
  const genderStr = (data.gender || 'MALE').toUpperCase();

  // 10. Title
  const titleStr = (data.title || 'SHRI').toUpperCase();

  // Age calculation for Minor detection (< 18 years)
  const calculateAgeInPdf = (dobStr) => {
    if (!dobStr || typeof dobStr !== 'string') return 99;
    const trimmed = dobStr.trim();
    if (!trimmed) return 99;
    let year = 0, month = 0, day = 0;
    if (trimmed.includes('-')) {
      const p = trimmed.split('-');
      if (p[0].length === 4) { year = +p[0]; month = +p[1]; day = +p[2]; }
      else { day = +p[0]; month = +p[1]; year = +p[2]; }
    } else if (trimmed.includes('/')) {
      const p = trimmed.split('/');
      if (p[0].length === 4) { year = +p[0]; month = +p[1]; day = +p[2]; }
      else { day = +p[0]; month = +p[1]; year = +p[2]; }
    } else {
      const b = new Date(trimmed);
      if (isNaN(b.getTime())) return 99;
      year = b.getFullYear(); month = b.getMonth() + 1; day = b.getDate();
    }
    if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) return 99;
    const bDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let age = today.getFullYear() - bDate.getFullYear();
    const m = today.getMonth() - bDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) age--;
    return age;
  };
  const pdfAge = calculateAgeInPdf(data.dob || data.dateOfIncorporation);
  const isApplicantMinor = data.isMinor === true || (pdfAge >= 0 && pdfAge < 18);

  // Representative Assessee values (Mandatory ONLY for Minor Applicant < 18 Years)
  const raFirstNameVal = isApplicantMinor ? (data.raFirstName || data.guardianFirstName || fatherFirstNameVal || '') : '';
  const raMiddleNameVal = isApplicantMinor ? (data.raMiddleName || data.guardianMiddleName || fatherMiddleNameVal || '') : '';
  const raLastNameVal = isApplicantMinor ? (data.raLastName || data.guardianLastName || fatherLastNameVal || '') : '';
  const raPanVal = isApplicantMinor ? (data.raPan || data.raPanNumber || data.guardianPan || '') : '';
  const raAadhaarVal = isApplicantMinor ? (data.raAadhaarNumber || data.guardianAadhaarNumber || data.guardianAadhaar || '') : '';
  const raAddressVal = isApplicantMinor ? (data.representativeAddress || data.raAddress || residence || {}) : {};
  const raPhotoDisplay = isApplicantMinor ? (data.raPhotoUrl || data.proofOfOtherUrl || data.thirdPhotoUrl) : null;
  const vCap = getIndividualCapacity(data, isApplicantMinor);

  return (
    <div
      id="form93-pdf-container"
      style={{
        display: 'none',
        position: 'absolute',
        left: '-99999px',
        top: '-99999px',
      }}
    >
      {/* ================================================================
          PAGE 1
          ================================================================ */}
      <Page id="form93-pdf-container-page1">
        <div style={{ height: '48mm', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '2mm', top: '1mm' }}>
            <PhotoBox photoUrl={data.photoUrl} left />
          </div>

          <div
            style={{
              position: 'absolute',
              left: '41mm',
              right: '41mm',
              top: '1mm',
              height: '45mm',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              fontWeight: 'bold',
            }}
          >
            <div style={{ fontSize: '11.5pt', fontWeight: 'bold', marginBottom: '1mm' }}>
              {(data.category === 'INDIVIDUAL' || !data.category) ? 'FORM NO. 93' : 'FORM NO. 94'}
            </div>
            <div style={{ fontSize: '8.5pt', fontWeight: 'bold', marginBottom: '1.5mm' }}>
              {(data.category === 'INDIVIDUAL' || !data.category) ? '[See rule 158]' : '[See rule 114]'}
            </div>
            <div style={{ fontSize: '9pt', fontWeight: 'bold', marginBottom: '1mm', lineHeight: 1.2 }}>
              Application for Allotment of Permanent Account Number
            </div>
            <div style={{ fontSize: '7.8pt', fontWeight: 'bold', lineHeight: 1.2, color: '#111' }}>
              [{(data.category === 'INDIVIDUAL' || !data.category) ? 'For an Individual being a Citizen of India' : 'For Entities other than Individuals'}]
            </div>
          </div>

          <div style={{ position: 'absolute', right: '2mm', top: '1mm' }}>
            <PhotoBox photoUrl={data.photoUrl} />
          </div>
        </div>

        <SectionTitle>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '22mm', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '0.3mm solid #444' }}>
            Sr. No.
          </div>
          PART A - Personal Information
        </SectionTitle>

        {/* 1 */}
        <GreyBar style={{ marginTop: '1mm', height: '5.8mm' }}>
          1. A. Name
        </GreyBar>



        <div>
          <NameRows
            firstName={fName}
            middleName={mName}
            lastName={lName}
          />
        </div>        <div
          style={{
            background: '#e7e7e7',
            padding: '0.8mm 2mm',
            fontWeight: 'bold',
            fontSize: '7pt',
            marginTop: '0.6mm',
            marginBottom: '0.8mm',
          }}
        >
          B. Name (as per Aadhaar)
        </div>

        <CellRow
          label=""
          value={aadhaarName.slice(0, 30)}
          length={30}
          labelWidth={53}
          boxWidth={4.55}
        />
        <CellRow
          label=""
          value={aadhaarName.slice(30, 60)}
          length={30}
          labelWidth={53}
          boxWidth={4.55}
        />
        <CellRow
          label=""
          value={aadhaarName.slice(60, 90)}
          length={30}
          labelWidth={53}
          boxWidth={4.55}
        />

        {/* 2 Gender */}
        <FullWidthLine style={{ marginTop: '0.6mm' }}>
          <div
            style={{
              minHeight: '5.8mm',
              display: 'flex',
              alignItems: 'center',
              padding: '0 2mm',
              gap: '4mm',
            }}
          >
            <strong style={{ width: '45mm' }}>2. Gender:</strong>
            <Check checked={genderStr === 'MALE'} label="Male" />
            <Check checked={genderStr === 'FEMALE'} label="Female" />
            <Check checked={genderStr === 'TRANSGENDER'} label="Transgender" />
          </div>
        </FullWidthLine>

        {/* 3 DOB */}
        <FullWidthLine>
          <div
            style={{
              minHeight: '4.8mm',
              display: 'flex',
              alignItems: 'center',
              padding: '0 2mm',
            }}
          >
            <strong style={{ width: '45mm' }}>3. Date of Birth</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
              <BoxGrid value={dobDay ? String(dobDay).padStart(2, '0') : 'dd'} length={2} width={4.55} height={4.25} uppercase={false} />
              <BoxGrid value={dobMonth ? String(dobMonth).padStart(2, '0') : 'mm'} length={2} width={4.55} height={4.25} uppercase={false} />
              <BoxGrid value={dobYear ? String(dobYear).padStart(4, '0') : 'yyyy'} length={4} width={4.55} height={4.25} uppercase={false} />
            </div>
          </div>
        </FullWidthLine>

        {/* 4 Aadhaar */}
        <FullWidthLine>
          <div
            style={{
              minHeight: '4.8mm',
              display: 'flex',
              alignItems: 'center',
              padding: '0 2mm',
            }}
          >
            <strong style={{ width: '45mm' }}>4. Aadhaar Number</strong>
            <BoxGrid value={String(data.aadhaarNumber || '').replace(/\s+/g, '')} length={12} width={4.55} height={4.25} />
          </div>
        </FullWidthLine>

        {/* 5 Residence */}
        <GreyBar style={{ marginTop: '0.4mm' }}>5. Residence Address</GreyBar>
        <div style={{ paddingTop: '0.4mm' }}>
          <AddressRows address={residence} />
        </div>

        {/* 6 Office Address */}
        <GreyBar style={{ marginTop: '0.4mm' }}>6. Office Address</GreyBar>
        <div style={{ paddingTop: '0.4mm' }}>
          <AddressRows address={office} />
        </div>

        {/* 7 */}
        <FullWidthLine style={{ marginTop: '0.4mm' }}>
          <div
            style={{
              minHeight: '4.8mm',
              display: 'flex',
              alignItems: 'center',
              padding: '0',
            }}
          >
            <div
              style={{
                background: '#e7e7e7',
                padding: '0.5mm 2.5mm',
                fontWeight: 'bold',
                fontSize: '7.1pt',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                height: '100%',
              }}
            >
              7.&nbsp;&nbsp;Residential Status <i>(select one as applicable)</i>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4mm', paddingLeft: '3mm' }}>
              <Check checked={data.residentialStatus === 'RESIDENT'} label="Resident" />
              <Check checked={data.residentialStatus === 'NON_RESIDENT'} label="Non Resident" />
              <Check
                checked={data.residentialStatus === 'RNOR'}
                label="Resident but Not ordinarily Resident"
              />
            </div>
          </div>
        </FullWidthLine>

        {/* 8 */}
        <FullWidthLine>
          <div
            style={{
              minHeight: '4.8mm',
              display: 'flex',
              alignItems: 'center',
              padding: '0',
            }}
          >
            <div
              style={{
                background: '#e7e7e7',
                padding: '0.5mm 2.5mm',
                fontWeight: 'bold',
                fontSize: '6.8pt',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                height: '100%',
              }}
            >
              8.&nbsp;&nbsp;Passport Number <i>(mandatory for (i) Non Resident (ii) Resident but not ordinarily resident)</i>
            </div>
            <div style={{ paddingLeft: '2.5mm' }}>
              <BoxGrid value={data.passportNumber} length={12} width={4.55} height={4.25} />
            </div>
          </div>
        </FullWidthLine>

        {/* 9 */}
        <FullWidthLine>
          <div
            style={{
              minHeight: '4.8mm',
              display: 'flex',
              alignItems: 'center',
              padding: '0',
            }}
          >
            <div
              style={{
                background: '#e7e7e7',
                padding: '0.5mm 2.5mm',
                fontWeight: 'bold',
                fontSize: '6.8pt',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                height: '100%',
              }}
            >
              9.&nbsp;&nbsp;Taxpayer Identification Number <i>(TIN) in the Country of Residence (if any)</i>
            </div>
            <div style={{ paddingLeft: '2.5mm' }}>
              <BoxGrid value={data.tin} length={18} width={4.55} height={4.25} />
            </div>
          </div>
        </FullWidthLine>

        {/* 10 */}
        <GreyBar style={{ marginTop: '0.4mm' }}>10. Contact Details</GreyBar>
        <div style={{ padding: '0.5mm 2mm 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5mm' }}>
            <span style={{ width: '56mm' }}>(i) Mobile Number</span>
            <span style={{ marginRight: '2mm' }}>Country Code</span>
            <BoxGrid value={data.countryCode || '91'} length={2} width={4.55} height={4.25} />
            <span style={{ margin: '0 3mm' }}>Mobile Number</span>
            <BoxGrid value={data.mobileNumber} length={10} width={4.55} height={4.25} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5mm' }}>
            <span style={{ width: '56mm' }}>(ii) Email ID</span>
            <div
              style={{
                border: '0.28mm solid #777',
                height: '4.25mm',
                width: '127mm',
                boxSizing: 'border-box',
                padding: '0.4mm 1.5mm',
                fontFamily: 'Arial, sans-serif',
                fontSize: '6.8pt',
                fontWeight: 'bold',
              }}
            >
              {data.email || ''}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ width: '56mm', whiteSpace: 'nowrap' }}>(iii) Landline No. with STD Code <i>(if any)</i></span>
            <span style={{ marginRight: '2mm' }}>STD Code</span>
            <BoxGrid value={data.stdCode} length={5} width={4.55} height={4.25} />
            <span style={{ margin: '0 3mm' }}>Landline Number</span>
            <BoxGrid value={data.landlineNumber} length={10} width={4.55} height={4.25} />
          </div>
        </div>

        {/* Part B */}
        <SectionTitle style={{ marginTop: '0.8mm' }}>PART B - Source of Income</SectionTitle>
        <div
          style={{
            border: '0.3mm solid #444',
            borderTop: 'none',
            display: 'flex',
            minHeight: '13mm',
            boxSizing: 'border-box',
          }}
        >
          {/* Left Shaded Label Column */}
          <div
            style={{
              width: '56mm',
              background: '#e7e7e7',
              borderRight: '0.3mm solid #444',
              padding: '1.5mm 2mm',
              boxSizing: 'border-box',
              fontSize: '7.5pt',
              fontWeight: 'bold',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}
          >
            <div>
              11.&nbsp;&nbsp;&nbsp;Source of Income
            </div>
            <div style={{ fontStyle: 'italic', fontWeight: 'normal', fontSize: '6.8pt', marginTop: '0.5mm' }}>
              (select one or more)
            </div>
          </div>

          {/* Right Grid Column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Row 1 */}
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: '1fr 1.35fr 1.25fr',
                alignItems: 'center',
                padding: '0 2mm',
                borderBottom: '0.3mm solid #ddd'
              }}
            >
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('SALARY') || data.salary || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('salary'))} label="Salary" />
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('BUSINESS') || data.businessIncome || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('business') || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('profession'))} label="Income from Business/Profession" />
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('HOUSE_PROPERTY') || data.housePropertyIncome || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('house') || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('property'))} label="Income from House Property" />
            </div>

            {/* Row 2 */}
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: '1fr 1.35fr 1.25fr',
                alignItems: 'center',
                padding: '0 2mm'
              }}
            >
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('CAPITAL_GAINS') || data.capitalGains || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('capital') || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('gains'))} label="Capital Gains" />
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('OTHER') || data.otherIncome || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('other'))} label="Income from Other Sources" />
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('NONE') || data.noIncome || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('no income') || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase() === 'none')} label="No Income" />
            </div>
          </div>
        </div>

        {/* Part C - Items 12 & 13 on Page 1 */}
        <SectionTitle style={{ marginTop: '0.6mm' }}>PART C - Details of Parents</SectionTitle>
        <div style={{ border: '0.3mm solid #777', borderTop: 'none' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              minHeight: '5mm',
              padding: '0 2mm',
              gap: '4mm',
            }}
          >
            <strong style={{ width: '88mm' }}>
              12. Whether mother/father is a single parent? <i>(select one)</i>
            </strong>
            <Check checked={data.isSingleParent === 'YES' || data.isSingleParent === 'Yes'} label="Yes" />
            <Check checked={data.isSingleParent === 'NO' || data.isSingleParent === 'No' || !data.isSingleParent} label="No" />
          </div>

          <CellRow label={<strong style={{ fontWeight: 'bold' }}>13. Father's First Name</strong>} value={fatherFirstNameVal} length={25} marginBottom={0.3} />
          <CellRow label="Father's Middle Name" value={fatherMiddleNameVal} length={25} marginBottom={0.3} />
          <CellRow label="Father's Last Name" value={fatherLastNameVal} length={25} marginBottom={0.3} />
        </div>
      </Page>

      {/* ================================================================
          PAGE 2
          ================================================================ */}
      <Page id="form93-pdf-container-page2">
        <div style={{ border: '0.3mm solid #777' }}>
          <CellRow label={<strong style={{ fontWeight: 'bold' }}>14. Mother's First Name</strong>} value={motherFirstNameVal} length={25} marginBottom={0.3} />
          <CellRow label="Mother's Middle Name" value={motherMiddleNameVal} length={25} marginBottom={0.3} />
          <CellRow label="Mother's Last Name" value={motherLastNameVal} length={25} marginBottom={0.3} />

          <FullWidthLine style={{ marginTop: '0.4mm' }}>
            <div
              style={{
                minHeight: '5.5mm',
                display: 'flex',
                alignItems: 'center',
                padding: '0 2mm',
                gap: '5mm',
              }}
            >
              <strong style={{ width: '100mm' }}>
                15. Name of parent to be printed on Permanent Account Number card <i>(select one)</i>
              </strong>
              <Check checked={data.parentNameToPrint === 'FATHER' || data.parentNameToPrint === 'Father'} label="Father" />
              <Check checked={data.parentNameToPrint === 'MOTHER' || data.parentNameToPrint === 'Mother'} label="Mother" />
            </div>
          </FullWidthLine>
        </div>

        {/* Part D */}
        <SectionTitle style={{ marginTop: '0.8mm' }}>
          PART D - Assessing Officer (AO Code)
        </SectionTitle>

        <div
          style={{
            border: '0.3mm solid #777',
            borderTop: 'none',
            minHeight: '19mm',
            display: 'flex',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '55mm',
              background: '#e7e7e7',
              padding: '2mm',
              boxSizing: 'border-box',
              fontWeight: 'bold',
            }}
          >
            16. Assessing Officer
            <br />
            (AO Code)
          </div>

          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              padding: '2mm 4mm',
              rowGap: '2.5mm',
              columnGap: '8mm',
              boxSizing: 'border-box',
            }}
          >
            {[
              ['(i) Area Code', data.aoAreaCode, 3],
              ['(ii) AO Type', data.aoType, 2],
              ['(iii) Range Code', data.aoRangeCode, 3],
              ['(iv) AO No.', data.aoNo, 2],
            ].map(([label, value, len]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
                <span style={{ width: '28mm' }}>{label}</span>
                <BoxGrid value={value} length={len} width={5} height={5.2} />
              </div>
            ))}
          </div>
        </div>

        {/* Part E */}
        <SectionTitle style={{ marginTop: '0.8mm' }}>
          PART E - Representative Assessee, if applicable
        </SectionTitle>

        <div style={{ border: '0.3mm solid #777', borderTop: 'none', position: 'relative' }}>
          <CellRow label={<strong style={{ fontWeight: 'bold' }}>17. RA's First Name</strong>} value={raFirstNameVal} length={25} />
          <CellRow label="RA's Middle Name" value={raMiddleNameVal} length={25} />
          <CellRow label="RA's Last Name" value={raLastNameVal} length={25} />

          <FullWidthLine>
            <div
              style={{
                minHeight: '6mm',
                display: 'flex',
                alignItems: 'center',
                padding: '0 2mm',
              }}
            >
              <strong style={{ width: '78mm' }}>18. Permanent Account Number (if any)</strong>
              <BoxGrid value={raPanVal} length={10} width={5.45} height={5.05} />
            </div>
          </FullWidthLine>

          <FullWidthLine>
            <div
              style={{
                minHeight: '6mm',
                display: 'flex',
                alignItems: 'center',
                padding: '0 2mm',
              }}
            >
              <strong style={{ width: '78mm' }}>
                19. Aadhaar Number <i>(if Permanent Account Number is not available)</i>
              </strong>
              <BoxGrid value={raAadhaarVal} length={12} width={5.45} height={5.05} />
            </div>
          </FullWidthLine>

          <GreyBar style={{ marginTop: '0.5mm' }}>20. Representative Assessee Address</GreyBar>
          <div style={{ paddingTop: '1mm' }}>
            <AddressRows address={raAddressVal} />
          </div>

          <GreyBar style={{ marginTop: '0.7mm' }}>21. Contact Details</GreyBar>
          <div style={{ padding: '1mm 2mm' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1mm' }}>
              <span style={{ width: '56mm' }}>(i) Mobile Number</span>
              <span style={{ marginRight: '2mm' }}>Country Code</span>
              <BoxGrid value={isApplicantMinor ? (data.raCountryCode || '91') : ''} length={2} width={4.55} height={5.05} />
              <span style={{ margin: '0 3mm' }}>Mobile Number</span>
              <BoxGrid value={isApplicantMinor ? data.raMobileNumber : ''} length={10} width={4.55} height={5.05} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1mm' }}>
              <span style={{ width: '56mm' }}>(ii) Email ID</span>
              <div
                style={{
                  border: '0.28mm solid #777',
                  height: '5.05mm',
                  width: '127mm',
                  boxSizing: 'border-box',
                  padding: '0.7mm 1.5mm',
                  fontSize: '7pt',
                  fontWeight: 'bold',
                }}
              >
                {isApplicantMinor ? (data.raEmail || '') : ''}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ width: '56mm', whiteSpace: 'nowrap' }}>(iii) Landline No. with STD Code <i>(if any)</i></span>
              <span style={{ marginRight: '2mm' }}>STD Code</span>
              <BoxGrid value={isApplicantMinor ? data.raStdCode : ''} length={5} width={4.55} height={5.05} />
              <span style={{ margin: '0 3mm' }}>Landline Number</span>
              <BoxGrid value={isApplicantMinor ? data.raLandlineNumber : ''} length={10} width={4.55} height={5.05} />
            </div>
          </div>
        </div>

        {/* Part F */}
        <SectionTitle style={{ marginTop: '0.8mm' }}>
          Part F: Communication Address
        </SectionTitle>

        <div
          style={{
            border: '0.3mm solid #777',
            borderTop: 'none',
            minHeight: '8mm',
            display: 'flex',
            alignItems: 'center',
            padding: '0 2mm',
            gap: '7mm',
            boxSizing: 'border-box',
          }}
        >
          <strong style={{ width: '50mm' }}>
            22. Address for Communication <i>(select one)</i>
          </strong>
          <Check checked={data.communicationAddress === 'RESIDENCE'} label="Residence Address" />
          <Check checked={data.communicationAddress === 'RA'} label="Representative Assessee Address" />
          <Check checked={data.communicationAddress === 'OFFICE'} label="Office Address" />
        </div>

        {/* Part G */}
        <SectionTitle style={{ marginTop: '0.8mm' }}>
          Part G: Declaration by Applicant or by Representative Assessee on behalf of the Applicant
        </SectionTitle>

        <div style={{ border: '0.3mm solid #777', borderTop: 'none' }}>
          <div
            style={{
              padding: '1.5mm 2mm',
              fontWeight: 'bold',
              fontSize: '7.3pt',
            }}
          >
            23. Documents submitted as Proof of Identity, Proof of Address and Proof of Date of Birth of the Applicant
          </div>

          <div
            style={{
              padding: '1mm 8mm 1.5mm',
              display: 'flex',
              gap: '13mm',
            }}
          >
            <Check checked={data.proofOfIdentity} label="(i) Proof of Identity" />
            <Check checked={data.proofOfAddress} label="(ii) Proof of Address" />
            <Check checked={data.proofOfDob} label="(iii) Proof of Date of Birth" />
          </div>

          <div
            style={{
              borderTop: '0.25mm solid #aaa',
              padding: '1.5mm 2mm',
              fontWeight: 'bold',
              fontSize: '7.3pt',
            }}
          >
            24. Documents submitted as Proof of Identity, Proof of Address of Representative Assessee
          </div>

          <div
            style={{
              padding: '1mm 8mm 1.5mm',
              display: 'flex',
              gap: '13mm',
            }}
          >
            <Check checked={data.raProofOfIdentity} label="(i) Proof of Identity" />
            <Check checked={data.raProofOfAddress} label="(ii) Proof of Address" />
          </div>

          <div
            style={{
              borderTop: '0.3mm solid #555',
              textAlign: 'center',
              fontWeight: 'bold',
              padding: '1mm',
              fontSize: '8.2pt',
            }}
          >
            Verification & Declaration
          </div>

          <div
            style={{
              padding: '2.5mm 3mm 2.5mm',
              fontSize: '7.4pt',
              lineHeight: 1.4,
            }}
          >
            <div>
              a. I,{' '}
              <span style={{ textDecoration: 'underline', fontWeight: 'bold' }}>
                {(data.verifierName || fullName || '').trim() ? (data.verifierName || fullName).toUpperCase() : '...........................................'}
              </span>
              , in the capacity of{' '}
              <span style={{ textDecoration: 'underline', fontWeight: 'bold' }}>
                {vCap}
              </span>{' '}
              (Self/ Representative Assessee) do hereby declare that what is stated above is true to the best of my knowledge and belief.
            </div>

            <div style={{ marginTop: '1.5mm' }}>
              b. I declare that the applicant does not possess Permanent Account Number and shall be liable for legal consequences under Income-Tax Act, 2025 if this declaration is found to be incorrect
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginTop: '4mm',
              }}
            >
              <div style={{ width: '65mm', paddingTop: '2mm' }}>
                <div style={{ marginBottom: '5mm', fontSize: '7.5pt' }}>
                  Place: {data.verifierPlace || data.place || '................'}
                </div>
                <div style={{ fontSize: '7.5pt' }}>
                  Date: {data.verifierDate || data.date || '................'}
                </div>
              </div>

              <div
                style={{
                  width: '88mm',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: '80mm',
                    height: '25mm',
                    border: '0.3mm solid #555',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    background: '#fff',
                  }}
                >
                  {data.signatureUrl ? (
                    <img
                      src={data.signatureUrl}
                      alt="Signature"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                      }}
                    />
                  ) : null}
                </div>

                <div
                  style={{
                    fontSize: '6.8pt',
                    marginTop: '1.5mm',
                    lineHeight: 1.15,
                    width: '80mm',
                    textAlign: 'center',
                  }}
                >
                  (Signature /Left Hand Thumb Impression of Applicant or Representative Assessee)
                </div>

                <div
                  style={{
                    width: '80mm',
                    marginTop: '3.5mm',
                    textAlign: 'left',
                    fontSize: '7.4pt',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold' }}>Name:</span>&nbsp;
                    <span style={{ textDecoration: 'underline', fontWeight: 'bold' }}>
                      {(data.verifierName || fullName || '').trim() ? (data.verifierName || fullName).toUpperCase() : '____________________________'}
                    </span>
                  </div>
                  <div style={{ marginTop: '2.5mm', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold' }}>Designation:</span>&nbsp;
                    <span style={{ textDecoration: 'underline', fontWeight: 'bold' }}>
                      Authorized Person
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Page>

      {/* Uploaded Document Proof Pages (Appended Below Main PDF) */}
      {[
        { title: 'Representative Assessee / Guardian Photo (3rd Photo)', url: raPhotoDisplay },
        { title: 'Identity Proof', url: data.proofOfIdentityUrl || data.identityProofUrl },
        { title: 'Address Proof', url: data.proofOfAddressUrl || data.addressProofUrl },
        { title: 'Date of Birth Proof', url: data.proofOfDobUrl || data.dobProofUrl },
        { title: 'Supporting Document / Other Proof', url: data.proofOfOtherUrl || data.otherProofUrl || data.supportingProofUrl }
      ].filter(d => Boolean(d.url)).map((doc, idx) => (
        <Page key={idx} id={`form93-pdf-container-doc-${idx}`}>
          <div style={{ padding: '0mm', height: '100%', width: '100%', boxSizing: 'border-box', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', height: '280mm', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {typeof doc.url === 'string' && doc.url.startsWith('data:application/pdf') ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                  <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '10px' }}>📄 PDF Document Attached</div>
                  <div style={{ fontSize: '11pt', color: '#475569' }}>{doc.title} (PDF File)</div>
                </div>
              ) : (
                <img src={doc.url} alt={doc.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              )}
            </div>
          </div>
        </Page>
      ))}
    </div>
  );
};

/* ============================================================================
   FORM NO. 94 - Non-Individual Categories
   (Company, HUF, Firm, Trust, BOI, AOP, Local Authority, AJP, Government, LLP)
   ============================================================================ */
const Form94PdfTemplate = ({ data = {} }) => {
  const entityTitleName = (data.entityName || data.applicantName || data.lastName || data.nameAsPerAadhaar || '').toUpperCase();

  // Date of Incorporation parsing
  const targetDob = data.dateOfIncorporation || data.dob;
  let dobDay = '';
  let dobMonth = '';
  let dobYear = '';
  if (targetDob) {
    const str = String(targetDob).trim();
    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts[0].length === 4) {
        dobYear = parts[0];
        dobMonth = parts[1];
        dobDay = parts[2];
      } else {
        dobDay = parts[0];
        dobMonth = parts[1];
        dobYear = parts[2];
      }
    } else if (str.includes('/')) {
      const parts = str.split('/');
      if (parts[0].length === 4) {
        dobYear = parts[0];
        dobMonth = parts[1];
        dobDay = parts[2];
      } else {
        dobDay = parts[0];
        dobMonth = parts[1];
        dobYear = parts[2];
      }
    }
  }

  // Addresses
  const office = data.officeAddress || data || {};
  const comm = data.residenceAddress || data.address || data || {};

  // Category / Status string
  const statusStr = String(data.category || data.applicantStatus || 'COMPANY').toUpperCase();

  // Representative Assessee / Authorized Representative (RA / AR)
  const raFirstNameVal = data.raFirstName || '';
  const raMiddleNameVal = data.raMiddleName || '';
  const raLastNameVal = data.raLastName || '';
  const raFullName = `${raFirstNameVal} ${raMiddleNameVal} ${raLastNameVal}`.replace(/\s+/g, ' ').trim() || (data.verifierName || entityTitleName);

  return (
    <div
      id="form93-pdf-container"
      style={{
        display: 'none',
        position: 'absolute',
        left: '-99999px',
        top: '-99999px',
      }}
    >
      {/* ================================================================
          PAGE 1 (FORM NO. 94)
          ================================================================ */}
      <Page id="form93-pdf-container-page1">
        <div style={{ textAlign: 'center', paddingTop: '1mm', paddingBottom: '2mm' }}>
          <div style={{ fontSize: '11pt', fontWeight: 'bold', marginBottom: '0.5mm' }}>
            FORM NO. 94
          </div>
          <div style={{ fontSize: '7.5pt', fontWeight: 'bold' }}>[See rule 158]</div>
          <div style={{ fontSize: '8.5pt', fontWeight: 'bold', marginTop: '1mm', lineHeight: 1.2 }}>
            Application for Allotment of Permanent Account Number
          </div>
          <div style={{ fontSize: '7.2pt', fontWeight: 'bold', marginTop: '0.5mm', lineHeight: 1.2, color: '#111' }}>
            (For an Indian Company / an Entity incorporated in India / an Unincorporated Entity formed in India)
          </div>
        </div>

        <SectionTitle>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '22mm', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '0.3mm solid #444' }}>
            Sr. No.
          </div>
          Part A - Personal Information
        </SectionTitle>

        {/* 1. Name */}
        <GreyBar style={{ marginTop: '1mm', height: '5.8mm' }}>
          1. Name
        </GreyBar>
        <div style={{ padding: '1mm 0' }}>
          <CellRow label="" value={entityTitleName.slice(0, 30)} length={30} labelWidth={53} boxWidth={4.55} />
          <CellRow label="" value={entityTitleName.slice(30, 60)} length={30} labelWidth={53} boxWidth={4.55} />
          <CellRow label="" value={entityTitleName.slice(60, 90)} length={30} labelWidth={53} boxWidth={4.55} />
        </div>

        {/* 2. Date of Incorporation */}
        <FullWidthLine style={{ marginTop: '0.6mm' }}>
          <div
            style={{
              minHeight: '6.5mm',
              display: 'flex',
              alignItems: 'center',
              padding: '0 2mm',
              fontSize: '6.8pt',
            }}
          >
            <strong style={{ width: '105mm', lineHeight: 1.15 }}>
              2. Date of Incorporation/Agreement/Partnership or Trust Deed/Formation of Body of Individuals or Association of Persons
            </strong>
            <span style={{ margin: '0 2mm' }}>D D</span>
            <BoxGrid value={dobDay} length={2} width={4.55} height={5.05} />
            <span style={{ margin: '0 2mm' }}>M M</span>
            <BoxGrid value={dobMonth} length={2} width={4.55} height={5.05} />
            <span style={{ margin: '0 2mm' }}>Y Y Y Y</span>
            <BoxGrid value={dobYear} length={4} width={4.55} height={5.05} />
          </div>
        </FullWidthLine>

        {/* 3. Office Address */}
        <GreyBar style={{ marginTop: '0.6mm' }}>3. Office Address</GreyBar>
        <div style={{ paddingTop: '0.8mm' }}>
          <AddressRows address={office} />
        </div>

        {/* 4. Communication Address */}
        <GreyBar style={{ marginTop: '0.8mm' }}>4. Communication Address</GreyBar>
        <div style={{ paddingTop: '0.8mm' }}>
          <AddressRows address={comm} />
        </div>

        {/* 5. Status */}
        <FullWidthLine style={{ marginTop: '0.6mm' }}>
          <div style={{ padding: '1.2mm 2mm', fontSize: '6.8pt' }}>
            <strong style={{ display: 'block', marginBottom: '1.2mm' }}>
              5. Status <i>(select one as applicable)</i>:
            </strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', rowGap: '1.8mm', columnGap: '2mm' }}>
              <Check checked={statusStr === 'HUF' || statusStr.includes('HINDU')} label="Hindu Undivided Family" />
              <Check checked={statusStr === 'COMPANY'} label="Company" />
              <Check checked={statusStr === 'FIRM'} label="Firm" />
              <Check checked={statusStr === 'AOP' || statusStr.includes('ASSOCIATION')} label="Association of Persons" />
              <Check checked={statusStr === 'BOI' || statusStr.includes('BODY')} label="Body of Individuals" />
              <Check checked={statusStr === 'LOCAL_AUTHORITY' || statusStr.includes('LOCAL')} label="Local Authority" />
              <Check checked={statusStr === 'AJP' || statusStr.includes('ARTIFICIAL') || statusStr.includes('JUDICIAL') || statusStr.includes('JURIDICAL')} label="Artificial Juridical Person" />
              <Check checked={statusStr === 'GOVERNMENT'} label="Government" />
              <Check checked={statusStr === 'TRUST'} label="Trust" />
              <Check checked={statusStr === 'LLP' || statusStr.includes('LIMITED')} label="Limited Liability Partnership" />
            </div>
          </div>
        </FullWidthLine>

        {/* 6. Registration Number */}
        <FullWidthLine>
          <div
            style={{
              minHeight: '6.5mm',
              display: 'flex',
              alignItems: 'center',
              padding: '0 2mm',
              fontSize: '6.5pt',
            }}
          >
            <strong style={{ width: '105mm', lineHeight: 1.15 }}>
              6. Registration Number <i>(for Company, Firm, LLP, AOP, BOI, AJP and Trust)</i>
            </strong>
            <BoxGrid value={data.registrationNumber || data.cin || data.llpin || ''} length={16} width={4.55} height={5.05} />
          </div>
        </FullWidthLine>

        {/* 7. Contact Details */}
        <GreyBar style={{ marginTop: '0.6mm' }}>7. Contact Details</GreyBar>
        <div style={{ padding: '1mm 2mm 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1mm' }}>
            <span style={{ width: '56mm' }}>(i) Mobile Number</span>
            <span style={{ marginRight: '2mm' }}>Country Code</span>
            <BoxGrid value={data.countryCode || '91'} length={2} width={4.55} height={5.05} />
            <span style={{ margin: '0 3mm' }}>Mobile Number</span>
            <BoxGrid value={data.mobileNumber} length={10} width={4.55} height={5.05} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1mm' }}>
            <span style={{ width: '56mm' }}>(ii) Email ID</span>
            <div
              style={{
                border: '0.28mm solid #777',
                height: '5.05mm',
                width: '127mm',
                boxSizing: 'border-box',
                padding: '0.7mm 1.5mm',
                fontFamily: 'Arial, sans-serif',
                fontSize: '7pt',
                fontWeight: 'bold',
              }}
            >
              {data.email || ''}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ width: '56mm', whiteSpace: 'nowrap' }}>(iii) Landline No. with STD Code <i>(if any)</i></span>
            <span style={{ marginRight: '2mm' }}>STD Code</span>
            <BoxGrid value={data.stdCode} length={5} width={4.55} height={5.05} />
            <span style={{ margin: '0 3mm' }}>Landline Number</span>
            <BoxGrid value={data.landlineNumber} length={10} width={4.55} height={5.05} />
          </div>
        </div>

        {/* PART B */}
        <SectionTitle style={{ marginTop: '1.2mm' }}>PART B - Source of Income</SectionTitle>
        <div
          style={{
            border: '0.3mm solid #444',
            borderTop: 'none',
            display: 'flex',
            minHeight: '13mm',
            boxSizing: 'border-box',
          }}
        >
          {/* Left Shaded Label Column */}
          <div
            style={{
              width: '56mm',
              background: '#e7e7e7',
              borderRight: '0.3mm solid #444',
              padding: '1.5mm 2mm',
              boxSizing: 'border-box',
              fontSize: '7.5pt',
              fontWeight: 'bold',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}
          >
            <div>
              8.&nbsp;&nbsp;&nbsp;Source of Income
            </div>
            <div style={{ fontStyle: 'italic', fontWeight: 'normal', fontSize: '6.8pt', marginTop: '0.5mm' }}>
              (select one or more)
            </div>
          </div>

          {/* Right Grid Column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Row 1 */}
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: '1fr 1.35fr 1.25fr',
                alignItems: 'center',
                padding: '0 2mm',
                borderBottom: '0.3mm solid #ddd'
              }}
            >
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('SALARY') || data.salary || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('salary'))} label="Salary" />
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('BUSINESS') || data.businessIncome || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('business') || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('profession'))} label="Income from Business/Profession" />
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('HOUSE_PROPERTY') || data.housePropertyIncome || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('house') || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('property'))} label="Income from House Property" />
            </div>

            {/* Row 2 */}
            <div
              style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: '1fr 1.35fr 1.25fr',
                alignItems: 'center',
                padding: '0 2mm'
              }}
            >
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('CAPITAL_GAINS') || data.capitalGains || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('capital') || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('gains'))} label="Capital Gains" />
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('OTHER') || data.otherIncome || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('other'))} label="Income from Other Sources" />
              <Check showTickLabel checked={Boolean(data.incomeSources?.includes?.('NONE') || data.noIncome || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase().includes('no income') || (data.sourceofincome || data.sourceOfIncome || data.incomeSource || '').toLowerCase() === 'none')} label="No Income" />
            </div>
          </div>
        </div>

        {/* PART C */}
        <SectionTitle style={{ marginTop: '1.2mm' }}>
          PART C - Assessing Officer (AO Code)
        </SectionTitle>
        <div
          style={{
            border: '0.3mm solid #777',
            borderTop: 'none',
            minHeight: '18mm',
            display: 'flex',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '55mm',
              background: '#e7e7e7',
              padding: '2mm',
              boxSizing: 'border-box',
              fontWeight: 'bold',
            }}
          >
            9. Assessing Officer
            <br />
            (AO Code)
          </div>

          <div
            style={{
              flex: 1,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              padding: '2mm 4mm',
              rowGap: '2.5mm',
              columnGap: '8mm',
              boxSizing: 'border-box',
            }}
          >
            {[
              ['(i) Area Code', data.aoAreaCode, 3],
              ['(ii) AO Type', data.aoType, 2],
              ['(iii) Range Code', data.aoRangeCode, 3],
              ['(iv) AO No.', data.aoNo, 2],
            ].map(([label, value, len]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
                <span style={{ width: '28mm' }}>{label}</span>
                <BoxGrid value={value} length={len} width={5} height={5.2} />
              </div>
            ))}
          </div>
        </div>
      </Page>

      {/* ================================================================
          PAGE 2 (FORM NO. 94)
          ================================================================ */}
      <Page id="form93-pdf-container-page2">
        <SectionTitle style={{ marginTop: '0.5mm' }}>
          PART D - Representative Assessee (RA)/Authorized Representative (AR)
        </SectionTitle>
        <div style={{ border: '0.3mm solid #777', borderTop: 'none' }}>
          <CellRow label={<strong style={{ fontWeight: 'bold' }}>10. RA / AR First Name</strong>} value={raFirstNameVal} length={25} />
          <CellRow label="RA / AR Middle Name" value={raMiddleNameVal} length={25} />
          <CellRow label="RA / AR Last Name" value={raLastNameVal} length={25} />

          <FullWidthLine>
            <div
              style={{
                minHeight: '6mm',
                display: 'flex',
                alignItems: 'center',
                padding: '0 2mm',
              }}
            >
              <strong style={{ width: '78mm' }}>11. Permanent Account Number (if any)</strong>
              <BoxGrid value={data.raPan} length={10} width={5.45} height={5.05} />
            </div>
          </FullWidthLine>

          <FullWidthLine>
            <div
              style={{
                minHeight: '6mm',
                display: 'flex',
                alignItems: 'center',
                padding: '0 2mm',
              }}
            >
              <strong style={{ width: '78mm' }}>
                12. Aadhaar Number <i>(if Permanent Account Number is not available)</i>
              </strong>
              <BoxGrid value={data.raAadhaarNumber} length={12} width={5.45} height={5.05} />
            </div>
          </FullWidthLine>

          <GreyBar style={{ marginTop: '0.5mm' }}>13. RA / AR Address</GreyBar>
          <div style={{ paddingTop: '1mm' }}>
            <AddressRows address={data.representativeAddress || data.raAddress || {}} />
          </div>

          <GreyBar style={{ marginTop: '0.7mm' }}>14. Contact Details</GreyBar>
          <div style={{ padding: '1mm 2mm' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1mm' }}>
              <span style={{ width: '56mm' }}>(i) Mobile Number</span>
              <span style={{ marginRight: '2mm' }}>Country Code</span>
              <BoxGrid value={data.raCountryCode || '91'} length={2} width={4.55} height={5.05} />
              <span style={{ margin: '0 3mm' }}>Mobile Number</span>
              <BoxGrid value={data.raMobileNumber} length={10} width={4.55} height={5.05} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1mm' }}>
              <span style={{ width: '56mm' }}>(ii) Email ID</span>
              <div
                style={{
                  border: '0.28mm solid #777',
                  height: '5.05mm',
                  width: '127mm',
                  boxSizing: 'border-box',
                  padding: '0.7mm 1.5mm',
                  fontSize: '7pt',
                  fontWeight: 'bold',
                }}
              >
                {data.raEmail || ''}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ width: '56mm', whiteSpace: 'nowrap' }}>(iii) Landline No. with STD Code <i>(if any)</i></span>
              <span style={{ marginRight: '2mm' }}>STD Code</span>
              <BoxGrid value={data.raStdCode} length={5} width={4.55} height={5.05} />
              <span style={{ margin: '0 3mm' }}>Landline Number</span>
              <BoxGrid value={data.raLandlineNumber} length={10} width={4.55} height={5.05} />
            </div>
          </div>
        </div>

        {/* PART E */}
        <SectionTitle style={{ marginTop: '1.4mm' }}>
          PART E - Declaration by Applicant or by Representative Assessee/Authorized Representative on behalf of the Applicant
        </SectionTitle>

        <div style={{ border: '0.3mm solid #777', borderTop: 'none' }}>
          <div
            style={{
              padding: '1.8mm 2mm',
              fontWeight: 'bold',
              fontSize: '7.1pt',
            }}
          >
            15. Documents submitted as Proof of Identity, Proof of Address and Proof of Date of Incorporation/Agreement/Partnership or Trust Deed/Formation of Body of Individuals or Association of Persons of the Applicant
          </div>

          <div
            style={{
              padding: '1mm 8mm 2mm',
              display: 'flex',
              gap: '10mm',
              fontSize: '6.8pt'
            }}
          >
            <Check checked={data.proofOfIdentity} label="(i) Proof of Identity" />
            <Check checked={data.proofOfAddress} label="(ii) Proof of Address" />
            <Check checked={data.proofOfDob || data.proofOfIncorporation} label="(iii) Proof of Date of Incorporation/Agreement/Partnership or Trust Deed" />
          </div>

          <div
            style={{
              borderTop: '0.25mm solid #aaa',
              padding: '1.8mm 2mm',
              fontWeight: 'bold',
              fontSize: '7.1pt',
            }}
          >
            16. Documents submitted as Proof of Identity, Proof of Address of Representative Assessee/Authorized Representative
          </div>

          <div
            style={{
              padding: '1mm 8mm 2mm',
              display: 'flex',
              gap: '13mm',
            }}
          >
            <Check checked={data.raProofOfIdentity} label="(i) Proof of Identity" />
            <Check checked={data.raProofOfAddress} label="(ii) Proof of Address" />
          </div>

          <div
            style={{
              borderTop: '0.3mm solid #555',
              textAlign: 'center',
              fontWeight: 'bold',
              padding: '1.2mm',
              fontSize: '8.5pt',
            }}
          >
            Verification & Declaration
          </div>

          <div
            style={{
              padding: '2.5mm 3mm 1mm',
              fontSize: '7.6pt',
              lineHeight: 1.4,
            }}
          >
            <div>
              a. I,{' '}
              <span style={{ textDecoration: 'underline', fontWeight: 'bold' }}>
                {raFullName.toUpperCase()}
              </span>
              , in the capacity of{' '}
              <span style={{ textDecoration: 'underline' }}>
                {data.representativeCapacity || 'Authorized Representative'}
              </span>{' '}
              do hereby declare that what is stated above is true to the best of my knowledge and belief.
            </div>

            <div style={{ marginTop: '1.5mm' }}>
              b. I declare that the applicant does not possess Permanent Account Number and shall be liable for legal consequences under Income-Tax Act, 2025 if this declaration is found to be incorrect.
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '4mm',
              }}
            >
              <div style={{ width: '65mm' }}>
                <div style={{ marginBottom: '3mm' }}>
                  Designation..........
                </div>
                <div style={{ marginBottom: '3mm' }}>
                  Place..........
                </div>
                <div>Date..........</div>
              </div>

              <div
                style={{
                  width: '75mm',
                  height: '32mm',
                  border: '0.3mm solid #555',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {data.signatureUrl ? (
                  <img
                    src={data.signatureUrl}
                    alt="Signature"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <span style={{ fontSize: '7pt' }}>
                    Signature / Left Hand Thumb Impression
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                textAlign: 'right',
                paddingRight: '10mm',
                marginTop: '0.5mm',
                fontSize: '6.5pt',
              }}
            >
              (Signature / Left Hand Thumb Impression of Applicant or Representative Assessee or Authorized Representative)
            </div>

            <div
              style={{
                width: '75mm',
                marginLeft: 'auto',
                marginTop: '3mm',
                paddingRight: '10mm',
                boxSizing: 'border-box',
                fontSize: '7.5pt',
              }}
            >
              <div>Name: ____________________________</div>
              <div style={{ marginTop: '2.5mm' }}>
                Designation: ________________________
              </div>
            </div>
          </div>
        </div>
      </Page>

      {/* Uploaded Document Proof Pages (Appended Below Main PDF) */}
      {[
        { title: 'Identity Proof', url: data.proofOfIdentityUrl || data.identityProofUrl },
        { title: 'Address Proof', url: data.proofOfAddressUrl || data.addressProofUrl },
        { title: 'Date of Birth / Incorporation Proof', url: data.proofOfDobUrl || data.dobProofUrl },
        { title: 'Supporting Document / Other Proof', url: data.proofOfOtherUrl || data.otherProofUrl || data.supportingProofUrl }
      ].filter(d => Boolean(d.url)).map((doc, idx) => (
        <Page key={idx} id={`form94-pdf-container-doc-${idx}`}>
          <div style={{ padding: '0mm', height: '100%', width: '100%', boxSizing: 'border-box', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', height: '280mm', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {typeof doc.url === 'string' && doc.url.startsWith('data:application/pdf') ? (
                <div style={{ textAlign: 'center', padding: '30px' }}>
                  <div style={{ fontSize: '16pt', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '10px' }}>📄 PDF Document Attached</div>
                  <div style={{ fontSize: '11pt', color: '#475569' }}>{doc.title} (PDF File)</div>
                </div>
              ) : (
                <img src={doc.url} alt={doc.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              )}
            </div>
          </div>
        </Page>
      ))}
    </div>
  );
};

const MainPanPdfTemplate = ({ data = {} }) => {
  const isIndividual = !data.category || data.category === 'INDIVIDUAL';
  if (isIndividual) {
    return <Form93PdfTemplate data={data} />;
  }
  return <Form94PdfTemplate data={data} />;
};

export const generateForm94Pdf = async (rawData = {}, existingWin = null) => {
  try {
    const data = { ...(rawData.details || {}), ...rawData };
    const templateBytes = base64ToUint8Array(FORM_94_TEMPLATE_BASE64);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    // eslint-disable-next-line no-unused-vars
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const pages = pdfDoc.getPages();
    const page1 = pages[0];
    const page2 = pages[1];
    const H = page1.getHeight();

    const cleanDist = (val) => {
      const s = String(val || '').trim();
      return (s.toUpperCase() === 'SELECT' || s.toUpperCase().startsWith('SELECT') || s.toUpperCase() === 'PLEASE SELECT' || s.toUpperCase().startsWith('PLEASE')) ? '' : s;
    };

    const drawCells = (page, text, startX, yBase, stepX = 15.34, maxLen = 25, fontSize = 7.5) => {
      const str = String(text || '').trim();
      if (!str || str.toUpperCase() === 'SELECT' || str.toUpperCase().startsWith('SELECT') || str.toUpperCase() === 'PLEASE SELECT' || str.toUpperCase().startsWith('PLEASE')) {
        return;
      }
      const clean = str.toUpperCase().slice(0, maxLen);
      for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (ch !== ' ') {
          page.drawText(ch, {
            x: startX + i * stepX + 3.8,
            y: yBase,
            size: fontSize,
            font: fontBold,
            color: rgb(0, 0, 0),
          });
        }
      }
    };

    const drawTick = (page, x, y) => {
      page.drawLine({
        start: { x: x + 1, y: y + 3.8 },
        end: { x: x + 3.5, y: y + 0.8 },
        thickness: 1.3,
        color: rgb(0, 0, 0),
      });
      page.drawLine({
        start: { x: x + 3.5, y: y + 0.8 },
        end: { x: x + 8, y: y + 7.8 },
        thickness: 1.3,
        color: rgb(0, 0, 0),
      });
    };

    const embedImageHelper = async (url) => {
      if (!url || typeof url !== 'string' || url.length < 15) return null;
      try {
        let bytes = null;
        if (url.startsWith('data:')) {
          bytes = base64ToUint8Array(url);
        } else if (url.startsWith('http')) {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          bytes = new Uint8Array(buf);
        }
        if (bytes) {
          try { return await pdfDoc.embedPng(bytes); } catch (_) {}
          try { return await pdfDoc.embedJpg(bytes); } catch (_) {}
        }
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const convertedBytes = await new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || img.width;
              canvas.height = img.naturalHeight || img.height;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0);
              resolve(base64ToUint8Array(canvas.toDataURL('image/jpeg', 0.95)));
            };
            img.onerror = () => resolve(null);
            img.src = url;
          });
          if (convertedBytes) {
            return await pdfDoc.embedJpg(convertedBytes);
          }
        }
      } catch (e) {
        console.warn('Form 94 image embed failed:', e);
      }
      return null;
    };

    // 1. Name on Page 1 (3 rows of 25 boxes)
    const entityName = (data.entityName || data.applicantName || data.lastName || '').toUpperCase().trim();
    const nameWords = entityName.split(/\s+/).filter(Boolean);
    const nameLines = ['', '', ''];
    let lineIdx = 0;
    for (const word of nameWords) {
      if (!nameLines[lineIdx]) {
        nameLines[lineIdx] = word.slice(0, 25);
      } else if ((nameLines[lineIdx] + ' ' + word).length <= 25) {
        nameLines[lineIdx] += ' ' + word;
      } else if (lineIdx < 2) {
        lineIdx++;
        nameLines[lineIdx] = word.slice(0, 25);
      }
    }
    drawCells(page1, nameLines[0], 180.6, H - 154.4 + 2.5);
    drawCells(page1, nameLines[1], 180.7, H - 167.8 + 2.5);
    drawCells(page1, nameLines[2], 180.7, H - 181.2 + 2.5);

    // 2. Date of Incorporation (DD MM YYYY)
    const targetDob = String(data.dateOfIncorporation || data.dob || '').trim();
    let dobDay = '', dobMonth = '', dobYear = '';
    if (targetDob) {
      if (targetDob.includes('-')) {
        const parts = targetDob.split('-');
        if (parts[0].length === 4) {
          dobYear = parts[0]; dobMonth = parts[1]; dobDay = parts[2];
        } else {
          dobDay = parts[0]; dobMonth = parts[1]; dobYear = parts[2];
        }
      } else if (targetDob.includes('/')) {
        const parts = targetDob.split('/');
        if (parts[0].length === 4) {
          dobYear = parts[0]; dobMonth = parts[1]; dobDay = parts[2];
        } else {
          dobDay = parts[0]; dobMonth = parts[1]; dobYear = parts[2];
        }
      }
    }
    if (dobDay || dobMonth || dobYear) {
      page1.drawRectangle({ x: 181.5, y: H - 223.5, width: 29.5, height: 11.5, color: rgb(1, 1, 1) });
      page1.drawRectangle({ x: 227.4, y: H - 223.5, width: 29.5, height: 11.5, color: rgb(1, 1, 1) });
      page1.drawRectangle({ x: 273.5, y: H - 223.5, width: 59.5, height: 11.5, color: rgb(1, 1, 1) });
    }
    if (dobDay) drawCells(page1, dobDay.padStart(2, '0').slice(-2), 180.64, H - 222.26 + 2.5, 15.34, 2);
    if (dobMonth) drawCells(page1, dobMonth.padStart(2, '0').slice(-2), 226.54, H - 222.26 + 2.5, 15.34, 2);
    if (dobYear) drawCells(page1, dobYear.slice(0, 4), 272.60, H - 222.26 + 2.5, 15.34, 4);

    // 3. Office Address
    const off = data.officeAddress || data;
    drawCells(page1, cleanDist(off.flatNo || off.officeFlatNo), 180.6, H - 257.1 + 2.5);
    drawCells(page1, cleanDist(off.roadStreet || off.officeRoadStreet), 180.7, H - 270.5 + 2.5);
    drawCells(page1, cleanDist(off.premises || off.officePremises), 180.8, H - 283.9 + 2.5);
    drawCells(page1, cleanDist(off.areaTaluka || off.officeAreaTaluka), 181.0, H - 297.3 + 2.5);
    drawCells(page1, cleanDist(off.district || off.officeDistrict), 181.0, H - 310.7 + 2.5);
    const offState = cleanDist(off.state || off.officeState);
    if (offState) {
      page1.drawText(String(offState).toUpperCase().slice(0, 18), {
        x: 136, y: H - 324.1 + 2.5, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
      });
    }
    page1.drawText(String(cleanDist(off.country || off.officeCountry) || 'INDIA').toUpperCase().slice(0, 16), {
      x: 292, y: H - 324.1 + 2.5, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
    });
    drawCells(page1, cleanDist(off.pincode || off.officePincode), 457.52, H - 324.1 + 2.5, 15.35, 6);

    // 4. Communication Address
    const comm = (data.commFlatNo || data.commDistrict) ? data : off;
    drawCells(page1, cleanDist(comm.commFlatNo || off.flatNo), 180.8, H - 354.6 + 2.5);
    drawCells(page1, cleanDist(comm.commRoadStreet || off.roadStreet), 180.9, H - 368.0 + 2.5);
    drawCells(page1, cleanDist(comm.commPremises || off.premises), 180.9, H - 381.5 + 2.5);
    drawCells(page1, cleanDist(comm.commAreaTaluka || off.areaTaluka), 180.7, H - 394.9 + 2.5);
    drawCells(page1, cleanDist(comm.commDistrict || off.district), 180.6, H - 408.3 + 2.5);
    const commStateVal = cleanDist(comm.commState || off.state || off.officeState);
    if (commStateVal) {
      page1.drawText(String(commStateVal).toUpperCase().slice(0, 18), {
        x: 136, y: H - 421.7 + 2.5, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
      });
    }
    page1.drawText(String(cleanDist(comm.commCountry || off.country) || 'INDIA').toUpperCase().slice(0, 16), {
      x: 292, y: H - 421.7 + 2.5, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
    });
    drawCells(page1, cleanDist(comm.commPincode || off.pincode || off.officePincode), 457.52, H - 421.7 + 2.5, 15.35, 6);

    // 5. Status Checkbox (Item 5)
    const st = String(data.category || data.applicantStatus || 'COMPANY').toUpperCase();
    if (st.includes('HINDU') || st.includes('HUF')) drawTick(page1, 183.16, 382.62);
    else if (st.includes('COMPANY')) drawTick(page1, 290.45, 382.62);
    else if (st.includes('FIRM') && !st.includes('LLP') && !st.includes('LIMITED')) drawTick(page1, 367.27, 382.62);
    else if (st.includes('ASSOCIATION') || st === 'AOP') drawTick(page1, 447.35, 382.62);
    else if (st.includes('BODY') || st === 'BOI') drawTick(page1, 183.16, 357.13);
    else if (st.includes('LOCAL')) drawTick(page1, 290.45, 357.13);
    else if (st.includes('ARTIFICIAL') || st.includes('JUDICIAL') || st.includes('JURIDICAL') || st === 'AJP') drawTick(page1, 367.27, 357.13);
    else if (st.includes('GOVERNMENT')) drawTick(page1, 183.16, 332.10);
    else if (st.includes('TRUST')) drawTick(page1, 290.45, 332.10);
    else if (st.includes('LLP') || st.includes('LIMITED LIABILITY')) drawTick(page1, 367.16, 332.10);
    else drawTick(page1, 290.45, 382.62);

    // 6. Registration Number (Item 6)
    const regNum = String(data.registrationNumber || data.cin || data.llpin || '').toUpperCase();
    drawCells(page1, regNum, 254.55, H - 554.09 + 2.5, 14.74, 13);

    // 7. Contact Details (Item 7)
    drawCells(page1, data.countryCode || '91', 270.62, H - 590.72 + 2.5, 14.74, 2);
    drawCells(page1, data.mobileNumber || '', 392.74, H - 590.72 + 2.5, 14.74, 10);
    if (data.email) {
      page1.drawText(String(data.email).slice(0, 48), {
        x: 260, y: H - 604.13 + 3.0, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
      });
    }
    if (data.stdCode) {
      drawCells(page1, data.stdCode, 270.43, H - 617.54 + 2.5, 14.74, 3);
    }
    if (data.landlineNumber) {
      drawCells(page1, data.landlineNumber, 393.06, H - 617.54 + 2.5, 14.91, 8);
    }

    // 8. Source of Income (Item 8)
    const inc = String(data.incomeSource || data.incomeSources || 'BUSINESS').toUpperCase();
    if (inc.includes('SALARY')) drawTick(page1, 183.86, 175.84);
    else if (inc.includes('HOUSE') || inc.includes('PROPERTY')) drawTick(page1, 395.19, 175.84);
    else if (inc.includes('CAPITAL') || inc.includes('GAINS')) drawTick(page1, 183.86, 159.60);
    else if (inc.includes('OTHER')) drawTick(page1, 257.57, 159.60);
    else if (inc.includes('NO INCOME') || inc.includes('NONE')) drawTick(page1, 395.43, 159.60);
    else drawTick(page1, 257.31, 175.84);

    // 9. Assessing Officer (AO Code) (Item 9)
    if (data.aoAreaCode) drawCells(page1, data.aoAreaCode, 241.51, H - 742.97 + 2.5, 15.34, 3);
    if (data.aoType) drawCells(page1, data.aoType, 400.25, H - 742.97 + 2.5, 15.34, 2);
    if (data.aoRangeCode) drawCells(page1, data.aoRangeCode, 241.46, H - 756.39 + 2.5, 15.34, 3);
    if (data.aoNo) drawCells(page1, data.aoNo, 400.17, H - 756.39 + 2.5, 15.34, 2);

    // PAGE 2:
    // 10. RA / AR Name (Item 10)
    let raFirst = data.raFirstName || '';
    let raMiddle = data.raMiddleName || '';
    let raLast = data.raLastName || '';
    if (!raFirst && !raLast && data.verifierName) {
      const vParts = String(data.verifierName).trim().split(/\s+/);
      if (vParts.length === 1) {
        raLast = vParts[0];
      } else if (vParts.length === 2) {
        raFirst = vParts[0]; raLast = vParts[1];
      } else {
        raFirst = vParts[0]; raMiddle = vParts.slice(1, -1).join(' '); raLast = vParts[vParts.length - 1];
      }
    }
    drawCells(page2, raFirst, 180.85, H - 72.6 + 2.5, 15.34, 25);
    drawCells(page2, raMiddle, 180.85, H - 86.0 + 2.5, 15.34, 25);
    drawCells(page2, raLast, 181.13, H - 99.5 + 2.5, 15.34, 25);

    // 11. RA PAN (Item 11)
    drawCells(page2, data.raPanNumber || data.raPan || '', 280.17, H - 114.8 + 2.5, 15.34, 10);

    // 12. RA Aadhaar (Item 12)
    drawCells(page2, data.raAadhaarNumber || data.raAadhaar || '', 280.43, H - 134.0 + 2.5, 15.34, 12);

    // 13. RA Address (Item 13)
    const raAddr = data.representativeAddress || data.raAddress || {
      flatNo: data.raFlatNo || off.flatNo || '',
      roadStreet: data.raRoadStreet || off.roadStreet || '',
      premises: data.raPremises || off.premises || '',
      areaTaluka: data.raAreaTaluka || off.areaTaluka || '',
      district: (data.raDistrict && data.raDistrict !== 'SELECT') ? data.raDistrict : (off.district || ''),
      state: (data.raState && data.raState !== 'PLEASE SELECT') ? data.raState : (off.state || ''),
      pincode: data.raPincode || off.pincode || '',
      country: 'INDIA'
    };
    drawCells(page2, raAddr.flatNo || '', 179.15, H - 165.5 + 2.5);
    drawCells(page2, raAddr.roadStreet || '', 179.15, H - 179.0 + 2.5);
    drawCells(page2, raAddr.premises || '', 179.15, H - 192.4 + 2.5);
    drawCells(page2, raAddr.areaTaluka || '', 179.15, H - 205.8 + 2.5);
    drawCells(page2, raAddr.district || '', 179.15, H - 219.2 + 2.5);
    if (raAddr.state && raAddr.state !== 'PLEASE SELECT') {
      page2.drawText(String(raAddr.state).toUpperCase().slice(0, 16), {
        x: 128, y: H - 232.7 + 2.5, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
      });
    }
    page2.drawText('INDIA', {
      x: 290, y: H - 232.6 + 2.5, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
    });
    drawCells(page2, raAddr.pincode || '', 455.29, H - 232.6 + 2.5, 15.35, 6);

    // 14. RA Contact Details (Item 14)
    drawCells(page2, data.raCountryCode || data.countryCode || '91', 266.92, H - 263.11 + 2.5, 15.34, 2);
    drawCells(page2, data.raMobileNumber || data.mobileNumber || '', 387.64, H - 263.11 + 2.5, 15.34, 10);
    if (data.raEmail || data.email) {
      page2.drawText(String(data.raEmail || data.email).slice(0, 48), {
        x: 255, y: H - 276.53 + 3.0, size: 7.2, font: fontBold, color: rgb(0, 0, 0),
      });
    }
    if (data.raStdCode || data.stdCode) {
      drawCells(page2, data.raStdCode || data.stdCode, 266.78, H - 289.94 + 2.5, 15.34, 3);
    }
    if (data.raLandlineNumber || data.landlineNumber) {
      drawCells(page2, data.raLandlineNumber || data.landlineNumber, 387.50, H - 289.94 + 2.5, 14.91, 8);
    }

    // 15 & 16. Documents submitted
    drawTick(page2, 54.31, 491.23); // (i) Proof of Identity
    drawTick(page2, 159.18, 491.23); // (ii) Proof of Address
    drawTick(page2, 260.09, 491.23); // (iii) Proof of Date of Incorporation
    if (data.raProofOfIdentity || raLast || data.raPanNumber || data.raAadhaarNumber) {
      drawTick(page2, 54.24, 459.22); // RA PoI
    }
    if (data.raProofOfAddress || raLast || data.raPanNumber || data.raAadhaarNumber) {
      drawTick(page2, 152.86, 459.22); // RA PoA
    }

    // Verification & Declaration
    const vName = (data.verifierName || `${raFirst} ${raMiddle} ${raLast}`.trim() || entityName).toUpperCase();
    const vCap = (data.verifierCapacity || data.representativeCapacity || 'DIRECTOR / AUTHORIZED SIGNATORY').toUpperCase();
    const vPlace = (data.verifierPlace || data.place || off.district || 'DELHI').toUpperCase();
    const vDate = data.verifierDate || data.date || new Date().toISOString().split('T')[0];
    const vDateFmt = vDate.includes('-') ? vDate.split('-').reverse().join('/') : vDate;

    // 1. Dynamic Flow for Line a (No static blank gaps, no overlaps, auto-scales with text size)
    page2.drawRectangle({ x: 55.0, y: 395.5, width: 485.0, height: 12.0, color: rgb(1, 1, 1) });

    const prefix = 'a. I, ';
    const mid = ', in the capacity of ';
    const suffix = ' (Representative Assessee/Authorized Representative) do';

    let declFontSize = 7.4;
    const maxDeclWidth = 472.0;

    let w1 = fontRegular.widthOfTextAtSize(prefix, declFontSize);
    let w2 = fontBold.widthOfTextAtSize(vName, declFontSize);
    let w3 = fontRegular.widthOfTextAtSize(mid, declFontSize);
    let w4 = fontBold.widthOfTextAtSize(vCap, declFontSize);
    let w5 = fontRegular.widthOfTextAtSize(suffix, declFontSize);
    let totalDeclW = w1 + w2 + w3 + w4 + w5 + 3.0;

    if (totalDeclW > maxDeclWidth) {
      const scale = maxDeclWidth / totalDeclW;
      declFontSize = Math.max(5.8, +(declFontSize * scale).toFixed(2));
      w1 = fontRegular.widthOfTextAtSize(prefix, declFontSize);
      w2 = fontBold.widthOfTextAtSize(vName, declFontSize);
      w3 = fontRegular.widthOfTextAtSize(mid, declFontSize);
      w4 = fontBold.widthOfTextAtSize(vCap, declFontSize);
      w5 = fontRegular.widthOfTextAtSize(suffix, declFontSize);
    }

    let currX = 56.44;
    const lineAY = 398.5;

    page2.drawText(prefix, { x: currX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });
    currX += w1;

    page2.drawText(vName, { x: currX, y: lineAY, size: declFontSize, font: fontBold, color: rgb(0, 0, 0) });
    currX += w2;

    page2.drawText(mid, { x: currX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });
    currX += w3;

    page2.drawText(vCap, { x: currX, y: lineAY, size: declFontSize, font: fontBold, color: rgb(0, 0, 0) });
    currX += w4 + 2.5;

    page2.drawText(suffix, { x: currX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });

    // 2. Designation line
    page2.drawRectangle({ x: 94.5, y: 335.0, width: 170.0, height: 11.5, color: rgb(1, 1, 1) });
    page2.drawText(': ' + vCap.slice(0, 24), { x: 94.5, y: 337.5, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    // 3. Place line
    page2.drawRectangle({ x: 74.5, y: 320.0, width: 150.0, height: 11.5, color: rgb(1, 1, 1) });
    page2.drawText(': ' + vPlace.slice(0, 24), { x: 74.5, y: 322.5, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    // 4. Date line
    page2.drawRectangle({ x: 71.8, y: 304.5, width: 150.0, height: 11.5, color: rgb(1, 1, 1) });
    page2.drawText(': ' + vDateFmt, { x: 71.8, y: 307.0, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    // 5. Under signature box: Name:
    page2.drawRectangle({ x: 388.0, y: 165.0, width: 135.0, height: 12.0, color: rgb(1, 1, 1) });
    page2.drawText(vName.slice(0, 30), { x: 390.0, y: 167.5, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    // 6. Under signature box: Designation:
    page2.drawRectangle({ x: 407.0, y: 138.0, width: 120.0, height: 12.0, color: rgb(1, 1, 1) });
    page2.drawText(vCap.slice(0, 24), { x: 409.0, y: 140.5, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    // Embed signature image if provided
    if (data.signatureUrl) {
      try {
        const sigImage = await embedImageHelper(data.signatureUrl);
        if (sigImage) {
          const dims = sigImage.scaleToFit(201.31, 66.05);
          page2.drawImage(sigImage, {
            x: 327.68 + (201.31 - dims.width) / 2,
            y: 224.99 + (66.05 - dims.height) / 2,
            width: dims.width,
            height: dims.height,
          });
        }
      } catch (sigErr) {
        console.warn('Form 94 signature embed warning:', sigErr);
      }
    }

    // Append all uploaded documents after the first 2 pages of Form 94
    try {
      const src = { ...(data.details || {}), ...data };
      const docsToAppend = [];
      const seenUrls = new Set();

      const addDoc = (url) => {
        if (!url || typeof url !== 'string' || url.length < 15) return;
        if (url === src.signatureUrl || url === data.signatureUrl) return;
        if (url === src.receiptUrl || url === src.adminReceiptUrl) return;
        if (seenUrls.has(url)) return;
        seenUrls.add(url);
        docsToAppend.push(url);
      };

      if (src.proofOfIdentityUrl) addDoc(src.proofOfIdentityUrl);
      if (src.proofOfAddressUrl) addDoc(src.proofOfAddressUrl);
      if (src.proofOfDobUrl) addDoc(src.proofOfDobUrl);
      if (src.proofOfIncorporationUrl) addDoc(src.proofOfIncorporationUrl);
      if (src.proofOfOtherUrl) addDoc(src.proofOfOtherUrl);
      if (src.raPhotoUrl) addDoc(src.raPhotoUrl);

      if (Array.isArray(src.documents)) {
        src.documents.forEach(d => {
          const u = typeof d === 'string' ? d : (d?.url || d?.dataUrl || d?.fileUrl || d?.src);
          addDoc(u);
        });
      }

      Object.keys(src).forEach(key => {
        if (key === 'signatureUrl' || key === 'photoUrl' || key === 'receiptUrl' || key === 'adminReceiptUrl') return;
        const val = src[key];
        if (typeof val === 'string' && (
          val.startsWith('data:image/') ||
          val.startsWith('data:application/pdf') ||
          (val.startsWith('http') && /\.(pdf|png|jpe?g|webp)($|\?)/i.test(val))
        )) {
          addDoc(val);
        }
      });

      for (const docUrl of docsToAppend) {
        try {
          const isPdf = docUrl.startsWith('data:application/pdf') ||
            (docUrl.startsWith('http') && docUrl.toLowerCase().includes('.pdf'));

          if (isPdf) {
            let pdfBytes;
            if (docUrl.startsWith('data:')) {
              pdfBytes = base64ToUint8Array(docUrl);
            } else {
              const res = await fetch(docUrl);
              const buf = await res.arrayBuffer();
              pdfBytes = new Uint8Array(buf);
            }
            const donorDoc = await PDFDocument.load(pdfBytes);
            const donorIndices = donorDoc.getPageIndices();
            const copiedPages = await pdfDoc.copyPages(donorDoc, donorIndices);
            copiedPages.forEach(p => pdfDoc.addPage(p));
          } else {
            const embeddedImg = await embedImageHelper(docUrl);
            if (embeddedImg) {
              const newPage = pdfDoc.addPage([595.28, 841.89]);
              const margin = 24.0;
              const maxW = 595.28 - (margin * 2);
              const maxH = 841.89 - (margin * 2);
              const dims = embeddedImg.scaleToFit(maxW, maxH);
              newPage.drawImage(embeddedImg, {
                x: (595.28 - dims.width) / 2,
                y: (841.89 - dims.height) / 2,
                width: dims.width,
                height: dims.height,
              });
            }
          }
        } catch (singleDocErr) {
          console.warn('Could not append single document to Form 94 PDF:', singleDocErr);
        }
      }
    } catch (docsErr) {
      console.warn('Error in appending uploaded documents:', docsErr);
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const safeName = (data.entityName || data.applicantName || data.lastName || 'Application')
      .toString().replace(/[^\w-]+/g, '_');
    const fileName = `PAN_Form_94_${safeName}.pdf`;

    if (existingWin && !existingWin.closed) {
      existingWin.location.href = blobUrl;
      try { existingWin.focus(); } catch (e) {}
    } else {
      try {
        const newWin = window.open(blobUrl, '_blank');
        if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          setTimeout(() => { document.body.removeChild(link); }, 100);
        }
      } catch {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { document.body.removeChild(link); }, 100);
      }
    }
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { document.body.removeChild(link); }, 100);
    return true;
  } catch (err) {
    console.error('Error generating Form 94 PDF:', err);
    if (existingWin && !existingWin.closed) existingWin.close();
    return false;
  }
};

export const generateForm49APdf = async (
  data = {},
  elementIdOrWin = 'form93-pdf-container',
  existingWin = null
) => {
  let targetWin = null;
  if (elementIdOrWin && typeof elementIdOrWin === 'object' && ('location' in elementIdOrWin || 'document' in elementIdOrWin)) {
    targetWin = elementIdOrWin;
  } else if (existingWin && typeof existingWin === 'object' && ('location' in existingWin || 'document' in existingWin)) {
    targetWin = existingWin;
  }

  const details = data.details || {};
  const flatData = {
    ...details,
    ...data,
    category: data.category || details.category || data.applicantStatus || details.applicantStatus || '',
    applicantStatus: data.applicantStatus || details.applicantStatus || data.category || details.category || '',
    signatureUrl: data.signatureUrl || details.signatureUrl || '',
    photoUrl: data.photoUrl || details.photoUrl || '',
  };

  const cat = String(flatData.category || '').toUpperCase();
  const nonIndTypes = [
    'COMPANY',
    'FIRM',
    'TRUST',
    'HUF',
    'HINDU',
    'ASSOCIATION',
    'AOP',
    'BODY',
    'BOI',
    'LOCAL',
    'ARTIFICIAL',
    'AJP',
    'GOVERNMENT',
    'LIMITED',
    'LLP'
  ];
  const isNonInd = nonIndTypes.some(t => cat.includes(t)) || (cat !== '' && cat !== 'INDIVIDUAL');
  if (isNonInd) {
    return generateForm94Pdf(flatData, targetWin);
  }
  return generateForm93Pdf(flatData, targetWin);
};

export default MainPanPdfTemplate;

