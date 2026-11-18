import React from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { PAN_CR_NON_INDIVIDUAL_TEMPLATE_BASE64 } from '../../assets/panCrNonIndividualTemplate';
import { PAN_CR_INDIVIDUAL_TEMPLATE_BASE64 } from '../../assets/panCrIndividualTemplate';

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


// Helper to render character grid boxes with exact sizing & crisp text
const renderLetterBoxes = (str = '', length = 25, boxWidth = '15.5px', boxHeight = '18.5px', fontSize = '11px') => {
  const chars = (str || '').toUpperCase().padEnd(length, ' ').slice(0, length).split('');
  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '0px' }}>
      {chars.map((ch, i) => (
        <div
          key={i}
          style={{
            width: boxWidth,
            height: boxHeight,
            border: '1.2px solid #000',
            borderLeft: i > 0 ? 'none' : '1.2px solid #000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: fontSize,
            fontWeight: 'bold',
            fontFamily: 'monospace',
            background: '#fff',
            color: '#000',
            boxSizing: 'border-box'
          }}
        >
          {ch !== ' ' ? ch : ''}
        </div>
      ))}
    </div>
  );
};

// Helper to render multi-row character grid boxes (e.g., 3 rows of 25 for Aadhaar Name)
const renderMultiRowLetterBoxes = (str = '', totalBoxes = 75, cols = 25, boxWidth = '18px', boxHeight = '16.5px', fontSize = '10px') => {
  const chars = (str || '').toUpperCase().padEnd(totalBoxes, ' ').slice(0, totalBoxes).split('');
  const rows = [];
  for (let i = 0; i < totalBoxes; i += cols) {
    rows.push(chars.slice(i, i + cols));
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {rows.map((rowChars, rIdx) => (
        <div key={rIdx} style={{ display: 'flex', flexWrap: 'nowrap' }}>
          {rowChars.map((ch, cIdx) => (
            <div
              key={cIdx}
              style={{
                width: boxWidth,
                height: boxHeight,
                border: '1.2px solid #000',
                borderLeft: cIdx > 0 ? 'none' : '1.2px solid #000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: fontSize,
                fontWeight: 'bold',
                fontFamily: 'monospace',
                background: '#fff',
                color: '#000',
                boxSizing: 'border-box'
              }}
            >
              {ch !== ' ' ? ch : ''}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// Helper to render DOB boxes with placeholder characters d d, m m, y y y y (Image 1 style)
const renderDobBoxes = (val = '', length = 2, placeholderChar = 'd', boxWidth = '16.5px', boxHeight = '16.5px') => {
  const chars = (val || '').padEnd(length, ' ').slice(0, length).split('');
  return (
    <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '0px' }}>
      {chars.map((ch, i) => {
        const isFilled = ch !== ' ';
        return (
          <div
            key={i}
            style={{
              width: boxWidth,
              height: boxHeight,
              border: '1.2px solid #000',
              borderLeft: i > 0 ? 'none' : '1.2px solid #000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isFilled ? '10px' : '8.5px',
              fontWeight: isFilled ? 'bold' : 'normal',
              color: isFilled ? '#000' : '#a0a0a0',
              fontFamily: 'Arial, sans-serif',
              background: '#fff',
              boxSizing: 'border-box'
            }}
          >
            {isFilled ? ch : placeholderChar}
          </div>
        );
      })}
    </div>
  );
};

// Helper for Table Tick Box cell (Image 2 style: white box with light "Tick" text or bold checkmark)
const TickBoxCell = ({ checked }) => (
  <div
    style={{
      width: '26px',
      height: '14px',
      border: '1px solid #777',
      background: '#fff',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: checked ? '11px' : '7.5px',
      fontWeight: checked ? 'bold' : 'normal',
      color: checked ? '#000' : '#a0a0a0',
      boxSizing: 'border-box',
      lineHeight: 1
    }}
  >
    {checked ? '✓' : 'Tick'}
  </div>
);

// Helper for Checkboxes with tick mark and readable font size
const BoxCheck = ({ checked, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
    <span
      style={{
        width: '13px',
        height: '13px',
        border: '1.2px solid #000',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '11px',
        fontWeight: 'bold',
        background: '#fff',
        lineHeight: 1,
        boxSizing: 'border-box'
      }}
    >
      {checked ? '✓' : ''}
    </span>
    {label && <span style={{ fontWeight: checked ? 'bold' : 'normal', color: '#000' }}>{label}</span>}
  </span>
);

export const generateForm49APdf = async (data = {}, elementId = 'pancr-pdf-container', existingWin = null) => {
  return generatePanCrPdf(data, elementId, existingWin);
};

// eslint-disable-next-line no-unused-vars
const _unused_generateForm49APdfHtml = async (data = {}, elementId = 'pancr-pdf-container', existingWin = null) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error('PAN CR container element not found');
    if (existingWin) existingWin.close();
    return false;
  }

  // Pre-open window synchronously to avoid browser pop-up blocking
  const newWin = existingWin || window.open('about:blank', '_blank');

  // Make container temporarily visible for capturing
  const originalDisplay = element.style.display;
  element.style.display = 'block';

  try {
    const page1 = document.getElementById(`${elementId}-page1`);
    const page2 = document.getElementById(`${elementId}-page2`);
    const docPages = Array.from(element.querySelectorAll(`[id^="${elementId}-doc-"]`));

    const allPages = [page1, page2, ...docPages].filter(Boolean);

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < allPages.length; i++) {
      const pageEl = allPages[i];
      const canvas = await html2canvas(pageEl, { scale: 2.5, useCORS: true, logging: false });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    }

    const fileName = `PAN_CR_01_${(data.lastName || data.nameAsPerAadhaar || 'Application').replace(/\s+/g, '_')}.pdf`;
    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);

    // Open blob PDF in pre-opened tab
    if (newWin && !newWin.closed) {
      newWin.location.href = blobUrl;
      try { newWin.focus(); } catch (e) {}
    } else {
      window.open(blobUrl, '_blank');
    }
    return true;
  } catch (err) {
    console.error('Error generating PDF:', err);
    if (newWin) newWin.close();
    return false;
  } finally {
    element.style.display = originalDisplay;
  }
};


const Form49APdfTemplate = ({ data = {} }) => {
  const today = new Date();
  const dayStr = String(today.getDate()).padStart(2, '0');
  const monthStr = String(today.getMonth() + 1).padStart(2, '0');
  const yearStr = String(today.getFullYear());

  // Format DOB string into DD MM YYYY.
  let dobDay = '', dobMonth = '', dobYear = '';
  if (data.dob) {
    const parts = String(data.dob).split('-');
    if (parts.length === 3) {
      dobYear = parts[0];
      dobMonth = parts[1];
      dobDay = parts[2];
    }
  }

  const fullNameStr = `${data.firstName || ''} ${data.middleName || ''} ${data.lastName || ''}`
    .replace(/\s+/g, ' ')
    .trim();

  const aadhaarName = (data.nameAsPerAadhaar || fullNameStr).toUpperCase();

  const address = data.address || data.residenceAddress || {};

  const field = (primary, fallback = '') => data[primary] ?? fallback;

  const text = {
    pan: field('panNumber', field('pan')),
    aadhaar: field('aadhaarNumber', field('aadhaar')),
    firstName: field('firstName'),
    middleName: field('middleName'),
    lastName: getCleanLastName(field('lastName'), field('firstName'), field('applicantName')),
    aadhaarName,
    fatherFirstName: field('fatherFirstName'),
    fatherMiddleName: field('fatherMiddleName'),
    fatherLastName: field('fatherLastName'),
    motherFirstName: field('motherFirstName'),
    motherMiddleName: field('motherMiddleName'),
    motherLastName: field('motherLastName'),
    passport: field('passportNumber'),
    tin: field('tin'),
    mobile: field('mobileNumber', field('mobile')),
    countryCode: field('countryCode', '91'),
    email: field('email'),
    isdCode: field('isdCode', field('countryCode', '91')),
    stdCode: field('stdCode'),
    landline: field('landlineNumber'),
    flat: field('flatDoorBuilding', address.flatDoorBuilding || address.flatNo),
    road: field('roadStreetBlock', address.roadStreetBlock || address.roadStreet),
    postOffice: field('postOffice', address.postOffice),
    area: field('areaLocality', address.areaLocality || address.areaTaluka),
    district: field('district', address.district),
    state: field('state', address.state),
    country: field('country', address.country || 'INDIA'),
    pincode: field('pincode', address.pincode),
  };

  const selected = {
    name: Boolean(data.nameCorrection ?? data.nameChanged ?? data.changeName),
    gender: Boolean(data.genderCorrection ?? data.changeGender),
    dob: Boolean(data.dobCorrection ?? data.changeDob),
    address: Boolean(data.addressCorrection ?? data.changeAddress),
    passport: Boolean(data.passportCorrection ?? data.changePassport),
    tin: Boolean(data.tinCorrection ?? data.changeTin),
    contact: Boolean(data.contactCorrection ?? data.changeContact),
    father: Boolean(data.fatherCorrection ?? data.changeFatherName),
    mother: Boolean(data.motherCorrection ?? data.changeMotherName),
    parentPrint: Boolean(data.parentNameCorrection ?? data.changeParentName),
    proofChange: Boolean(data.proofOfChange ?? data.documentaryProof),
    copyPan: Boolean(data.copyOfPan ?? data.panCopy),
  };

  const RowNumber = ({ children }) => (
    <div style={{
      width: '40px',
      flex: '0 0 40px',
      minHeight: '18px',
      background: '#e9e9e9',
      borderRight: '1px solid #aaa',
      display: 'flex',
      alignItems: 'center',
      paddingLeft: '5px',
      boxSizing: 'border-box',
      fontWeight: 'bold',
      fontSize: '8.5px'
    }}>
      {children}
    </div>
  );

  const TickColumn = ({ checked }) => (
    <div style={{
      width: '40px',
      flex: '0 0 40px',
      minHeight: '18px',
      background: '#e9e9e9',
      borderRight: '1px solid #aaa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box'
    }}>
      <TickBoxCell checked={checked} />
    </div>
  );

  const NameLine = ({ label, value }) => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '95px 1fr',
      alignItems: 'center',
      height: '18px',
      marginBottom: '1px'
    }}>
      <span style={{ fontSize: '8.5px' }}>{label}</span>
      {renderLetterBoxes(value, 25, '18px', '16.5px', '10px')}
    </div>
  );

  const AddressLine = ({ label, value }) => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '125px 1fr',
      alignItems: 'center',
      height: '18px',
      marginBottom: '1px'
    }}>
      <span style={{ fontSize: '8.5px' }}>{label}</span>
      {renderLetterBoxes(value, 25, '18px', '16.5px', '10px')}
    </div>
  );

  const SmallBoxes = ({ value = '', length = 2, width = '16px' }) =>
    renderLetterBoxes(value, length, width, '16px', '9.5px');

  const HeaderNumberBoxes = ({ value = '', length = 10 }) =>
    renderLetterBoxes(value, length, '17.5px', '17.5px', '10px');

  return (
    <div
      id="pancr-pdf-container"
      style={{
        display: 'none',
        position: 'absolute',
        left: '-9999px',
        top: '-9999px'
      }}
    >

      {/* =====================================================================
          PAGE 1 - PAN CR-01 / REQUEST FOR CHANGES OR CORRECTION IN PAN DATA
          ===================================================================== */}
      <div
        id="pancr-pdf-container-page1"
        style={{
          width: '794px',
          height: '1123px',
          padding: '12px 14px',
          background: '#fff',
          color: '#000',
          fontFamily: 'Arial, sans-serif',
          fontSize: '8.5px',
          boxSizing: 'border-box',
          lineHeight: '1.1',
          overflow: 'hidden'
        }}
      >
        <div style={{
          border: '2px solid #666',
          height: '1097px',
          padding: '5px',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}>

          {/* ------------------------------ HEADER -------------------------- */}
          <div style={{
            height: '150px',
            display: 'grid',
            gridTemplateColumns: '125px 1fr 125px',
            columnGap: '8px',
            alignItems: 'start',
            boxSizing: 'border-box'
          }}>

            {/* Left 4.5cm x 3.5cm photograph */}
            <div style={{
              width: '125px',
              height: '150px',
              border: '1.2px solid #555',
              boxSizing: 'border-box',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              overflow: 'visible'
            }}>
              {data.photoUrl ? (
                <img
                  src={data.photoUrl}
                  alt="Applicant"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
              ) : (
                <div style={{
                  width: '100px',
                  fontSize: '7.5px',
                  lineHeight: '1.4',
                  color: '#222'
                }}>
                  Recent colour<br/>
                  photograph of the applicant<br/>
                  (4.5 cm x 3.5 cm)<br/><br/>
                  with Sign/Left thumb<br/>
                  impression across the photo of<br/>
                  the applicant
                </div>
              )}
            </div>

            {/* Centre heading, PAN and Aadhaar */}
            <div style={{
              height: '148px',
              textAlign: 'center',
              paddingTop: '0px',
              boxSizing: 'border-box'
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 'bold',
                marginTop: '2px',
                marginBottom: '1px'
              }}>
                Request For Changes Or Correction in PAN Data
              </div>

              <div style={{
                fontSize: '10.5px',
                fontWeight: 'bold',
                marginBottom: '10px'
              }}>
                [For an Individual]
              </div>

              <div style={{
                fontSize: '8.5px',
                fontWeight: 'bold',
                marginBottom: '2px'
              }}>
                Permanent Account Number (PAN)
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: '10px'
              }}>
                {HeaderNumberBoxes({ value: text.pan, length: 10 })}
              </div>

              <div style={{
                display: 'inline-block',
                minWidth: '180px',
                background: '#e5e5e5',
                fontSize: '8.5px',
                fontWeight: 'bold',
                padding: '2px 6px',
                boxSizing: 'border-box',
                marginBottom: '2px'
              }}>
                Aadhaar Number
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'center'
              }}>
                {HeaderNumberBoxes({ value: text.aadhaar, length: 12 })}
              </div>
            </div>

            {/* Right photograph - must remain clean */}
            <div style={{
              width: '125px',
              height: '150px',
              border: '1.2px solid #555',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center'
            }}>
              {data.photoUrl ? (
                <img
                  src={data.photoUrl}
                  alt="Applicant"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
              ) : (
                <div style={{
                  width: '100px',
                  fontSize: '7.5px',
                  lineHeight: '1.4',
                  color: '#222'
                }}>
                  Recent colour<br/>
                  photograph of the applicant<br/>
                  (4.5 cm x 3.5 cm)
                </div>
              )}
            </div>
          </div>

          {/* ---------------------- PART A TABLE HEADER -------------------- */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            height: '22px',
            border: '1.2px solid #666',
            boxSizing: 'border-box',
            marginTop: '3px',
            fontWeight: 'bold',
            fontSize: '8.5px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRight: '1px solid #777'
            }}>
              Sr. No.
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRight: '1px solid #777',
              textAlign: 'center'
            }}>
              Tick<br/>Box
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              PART A - Personal Information
            </div>
          </div>

          {/* ------------------------------ 1A NAME ------------------------ */}
          <div style={{
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            boxSizing: 'border-box'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px 40px 1fr',
              height: '20px',
              background: '#e6e6e6',
              alignItems: 'center',
              boxSizing: 'border-box'
            }}>
              <RowNumber>1.</RowNumber>
              <TickColumn checked={selected.name} />
              <div style={{ paddingLeft: '5px', fontWeight: 'bold', fontSize: '8.5px' }}>
                A. Name
              </div>
            </div>

            <div style={{ padding: '3px 5px 3px 85px', boxSizing: 'border-box' }}>
              <NameLine label="First Name" value={text.firstName} />
              <NameLine label="Middle Name" value={text.middleName} />
              <NameLine label="Last Name" value={text.lastName} />
            </div>
          </div>

          {/* ------------------------------ 1B AADHAAR NAME ----------------- */}
          <div style={{
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            boxSizing: 'border-box'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px 40px 1fr',
              height: '20px',
              background: '#e6e6e6',
              alignItems: 'center',
              boxSizing: 'border-box'
            }}>
              <div style={{ width: '40px', background: '#e9e9e9', borderRight: '1px solid #aaa', height: '100%' }} />
              <TickColumn checked={selected.name} />
              <div style={{ paddingLeft: '5px', fontWeight: 'bold', fontSize: '8.5px' }}>
                B. Name (as per Aadhaar)
              </div>
            </div>

            <div style={{ padding: '3px 5px 3px 85px', boxSizing: 'border-box' }}>
              {renderMultiRowLetterBoxes(aadhaarName, 75, 25, '18px', '15.5px', '9.5px')}
            </div>
          </div>

          {/* ------------------------------ 2 GENDER ----------------------- */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            height: '23px',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            alignItems: 'center',
            boxSizing: 'border-box'
          }}>
            <RowNumber>2.</RowNumber>
            <TickColumn checked={selected.gender} />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              paddingLeft: '5px'
            }}>
              <strong>Gender <i>(select one)</i></strong>
              <BoxCheck checked={data.gender === 'MALE'} label="Male" />
              <BoxCheck checked={data.gender === 'FEMALE'} label="Female" />
              <BoxCheck checked={data.gender === 'TRANSGENDER'} label="Transgender" />
            </div>
          </div>

          {/* ------------------------------ 3 DOB -------------------------- */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            height: '23px',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            alignItems: 'center',
            boxSizing: 'border-box'
          }}>
            <RowNumber>3.</RowNumber>
            <TickColumn checked={selected.dob} />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '5px',
              gap: '20px'
            }}>
              <strong style={{ width: '85px' }}>Date of Birth</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {renderDobBoxes(dobDay, 2, 'd')}
                {renderDobBoxes(dobMonth, 2, 'm')}
                {renderDobBoxes(dobYear, 4, 'y')}
              </div>
            </div>
          </div>

          {/* ------------------------------ 4 ADDRESS ---------------------- */}
          <div style={{
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            boxSizing: 'border-box'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px 40px 1fr',
              height: '20px',
              background: '#e6e6e6',
              alignItems: 'center',
              boxSizing: 'border-box'
            }}>
              <RowNumber>4.</RowNumber>
              <TickColumn checked={selected.address} />
              <div style={{ paddingLeft: '5px', fontWeight: 'bold', fontSize: '8.5px' }}>
                Address
              </div>
            </div>

            <div style={{ padding: '3px 5px 3px 85px', boxSizing: 'border-box' }}>
              <div style={{
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: '2px',
                gap: '8px',
                marginBottom: '2px'
              }}>
                <BoxCheck checked={data.addressType === 'RESIDENCE' || !data.addressType} label="Residence" />
                <BoxCheck checked={data.addressType === 'OFFICE'} label="Office" />
                <i style={{ marginLeft: '4px', fontSize: '8px' }}>(select one)</i>
              </div>

              <AddressLine label="Flat/Door/Building" value={text.flat} />
              <AddressLine label="Road/Street/Block/Sector" value={text.road} />
              <AddressLine label="Post Office" value={text.postOffice} />
              <AddressLine label="Area/Locality/Town/City" value={text.area} />
              <AddressLine label="District" value={text.district} />

              <div style={{
                display: 'grid',
                gridTemplateColumns: '110px 95px 95px 105px 80px 1fr',
                alignItems: 'center',
                height: '18px'
              }}>
                <span style={{ fontSize: '8px' }}>State/Union Territory</span>
                <div style={{
                  border: '1px solid #888',
                  height: '16px',
                  boxSizing: 'border-box',
                  padding: '1px 3px',
                  overflow: 'hidden',
                  fontSize: '7.5px',
                  fontWeight: 'bold'
                }}>
                  {String(text.state || '').toUpperCase()}
                </div>
                <span style={{ fontSize: '8px', textAlign: 'center' }}>Country/Region</span>
                <div style={{
                  border: '1px solid #888',
                  height: '16px',
                  boxSizing: 'border-box',
                  padding: '1px 3px',
                  overflow: 'hidden',
                  fontSize: '7.5px',
                  fontWeight: 'bold'
                }}>
                  {String(text.country || 'INDIA').toUpperCase()}
                </div>
                <span style={{ fontSize: '8px', textAlign: 'center' }}>PIN / ZIP CODE</span>
                {renderLetterBoxes(text.pincode, 6, '15.5px', '15.5px', '9px')}
              </div>
            </div>
          </div>

          {/* ------------------------------ 5 PASSPORT --------------------- */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            height: '22px',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            alignItems: 'center',
            boxSizing: 'border-box'
          }}>
            <RowNumber>5.</RowNumber>
            <TickColumn checked={selected.passport} />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '5px',
              gap: '8px'
            }}>
              <strong style={{ width: '150px' }}>Passport Number</strong>
              {renderLetterBoxes(text.passport, 15, '16px', '16.5px', '9.5px')}
            </div>
          </div>

          {/* ------------------------------ 6 TIN -------------------------- */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            height: '22px',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            alignItems: 'center',
            boxSizing: 'border-box'
          }}>
            <RowNumber>6.</RowNumber>
            <TickColumn checked={selected.tin} />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '5px',
              gap: '6px'
            }}>
              <strong style={{ width: '250px', fontSize: '8px' }}>
                Taxpayer Identification Number in the Country of Residence
              </strong>
              {renderLetterBoxes(text.tin, 20, '16px', '16.5px', '9.5px')}
            </div>
          </div>

          {/* ------------------------------ 7 CONTACT ---------------------- */}
          <div style={{
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            boxSizing: 'border-box'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px 40px 1fr',
              height: '20px',
              background: '#e6e6e6',
              alignItems: 'center',
              boxSizing: 'border-box'
            }}>
              <RowNumber>7.</RowNumber>
              <TickColumn checked={selected.contact} />
              <div style={{ paddingLeft: '5px', fontWeight: 'bold', fontSize: '8.5px' }}>
                Contact Details
              </div>
            </div>

            <div style={{ padding: '3px 5px 3px 85px', boxSizing: 'border-box' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                height: '19px',
                gap: '5px'
              }}>
                <span style={{ width: '105px' }}>(i) Mobile Number</span>
                <span>Country Code</span>
                {renderLetterBoxes(text.countryCode, 2, '16px', '16.5px', '9.5px')}
                <span style={{ marginLeft: '8px' }}>Mobile Number</span>
                {renderLetterBoxes(text.mobile, 10, '16px', '16.5px', '9.5px')}
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                height: '19px',
                gap: '5px'
              }}>
                <span style={{ width: '105px' }}>(ii) Email ID</span>
                <div style={{
                  border: '1px solid #888',
                  width: '400px',
                  height: '16.5px',
                  boxSizing: 'border-box',
                  padding: '1px 3px',
                  fontSize: '8px',
                  overflow: 'hidden'
                }}>
                  {text.email}
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                height: '19px',
                gap: '4px'
              }}>
                <span style={{ width: '195px', fontSize: '7.8px' }}>
                  (iii) Landline No. with Country/ISD Code
                </span>
                <span style={{ fontSize: '7.8px' }}>Country/ISD Code</span>
                {renderLetterBoxes(text.isdCode || '91', 2, '15px', '16px', '9px')}
                <span style={{ fontSize: '7.8px', marginLeft: '8px' }}>Area/STD Code</span>
                {renderLetterBoxes(text.stdCode, 3, '15px', '16px', '9px')}
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                height: '19px',
                marginTop: '1px',
                gap: '4px'
              }}>
                <span style={{ width: '195px', fontSize: '7.8px', paddingLeft: '18px', boxSizing: 'border-box' }}>
                  and Area/STD Code <i>(if any)</i>
                </span>
                <span style={{ fontSize: '7.8px' }}>Landline Number</span>
                {renderLetterBoxes(text.landline, 8, '15px', '16px', '9px')}
              </div>
            </div>
          </div>

          {/* ---------------------- PART B HEADER -------------------------- */}
          <div style={{
            height: '21px',
            border: '1.2px solid #666',
            borderTop: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '8.5px',
            boxSizing: 'border-box'
          }}>
            PART B - Details of Parents
          </div>

          {/* ------------------------------ 8 FATHER ----------------------- */}
          <div style={{
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            boxSizing: 'border-box'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px 40px 1fr',
              height: '20px',
              background: '#e6e6e6',
              alignItems: 'center',
              boxSizing: 'border-box'
            }}>
              <RowNumber>8.</RowNumber>
              <TickColumn checked={selected.father} />
              <div style={{ paddingLeft: '5px', fontWeight: 'bold', fontSize: '8.5px' }}>
                Father's Name
              </div>
            </div>

            <div style={{ padding: '3px 5px 3px 85px', boxSizing: 'border-box' }}>
              <NameLine label="Father's First Name" value={text.fatherFirstName} />
              <NameLine label="Father's Middle Name" value={text.fatherMiddleName} />
              <NameLine label="Father's Last Name" value={text.fatherLastName} />
            </div>
          </div>

          {/* ------------------------------ 9 MOTHER ----------------------- */}
          <div style={{
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            boxSizing: 'border-box'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px 40px 1fr',
              height: '20px',
              background: '#e6e6e6',
              alignItems: 'center',
              boxSizing: 'border-box'
            }}>
              <RowNumber>9.</RowNumber>
              <TickColumn checked={selected.mother} />
              <div style={{ paddingLeft: '5px', fontWeight: 'bold', fontSize: '8.5px' }}>
                Mother's Name
              </div>
            </div>

            <div style={{ padding: '3px 5px 3px 85px', boxSizing: 'border-box' }}>
              <NameLine label="Mother's First Name" value={text.motherFirstName} />
              <NameLine label="Mother's Middle Name" value={text.motherMiddleName} />
              <NameLine label="Mother's Last Name" value={text.motherLastName} />
            </div>
          </div>

          {/* ------------------------- 10 PARENT TO PRINT ------------------ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            height: '22px',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            alignItems: 'center',
            boxSizing: 'border-box'
          }}>
            <RowNumber>10.</RowNumber>
            <TickColumn checked={selected.parentPrint} />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '5px',
              gap: '12px'
            }}>
              <strong>Name of parent to be printed on Permanent Account Number card <i>(select one)</i></strong>
              <BoxCheck checked={data.parentNameToPrint === 'FATHER' || !data.parentNameToPrint} label="Father" />
              <BoxCheck checked={data.parentNameToPrint === 'MOTHER'} label="Mother" />
            </div>
          </div>

          {/* ---------------------- PART C HEADER -------------------------- */}
          <div style={{
            height: '21px',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1.2px solid #666',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '8.5px',
            boxSizing: 'border-box'
          }}>
            Part C: Declaration by Applicant or by Representative Assessee on behalf of the Applicant
          </div>

          {/* ------------------------------ 11 DOCUMENTS ------------------- */}
          <div style={{
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1.2px solid #666',
            boxSizing: 'border-box'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px 40px 1fr',
              minHeight: '22px',
              background: '#e6e6e6',
              alignItems: 'center'
            }}>
              <RowNumber>11.</RowNumber>
              <TickColumn checked={selected.proofChange || selected.copyPan} />
              <div style={{
                padding: '2px 4px',
                fontWeight: 'bold',
                fontSize: '7.8px',
                boxSizing: 'border-box'
              }}>
                Documents submitted as Proof of Identity, Proof of Address, Proof of Date of Birth of the Applicant &amp; Proof of Change in support of proposed changes / corrections requested by the Applicant
              </div>
            </div>

            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '14px',
              padding: '3px 8px 2px 85px',
              boxSizing: 'border-box',
              fontSize: '8px'
            }}>
              <BoxCheck checked={Boolean(data.proofOfIdentity) || true} label="(i) Proof of Identity" />
              <BoxCheck checked={Boolean(data.proofOfAddress) || true} label="(ii) Proof of Address" />
              <BoxCheck checked={Boolean(data.proofOfDob) || true} label="(iii) Proof of Date of Birth" />
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              padding: '1px 8px 3px 85px',
              boxSizing: 'border-box',
              fontSize: '8px'
            }}>
              <BoxCheck checked={selected.proofChange} label="(iv) Documentary proof in support of other changes" />
              <BoxCheck checked={selected.copyPan || true} label="(v) Copy of PAN" />
            </div>
          </div>

          {/* Page number */}
          <div style={{
            textAlign: 'right',
            fontSize: '8px',
            marginTop: '3px',
            paddingRight: '4px'
          }}>
            1 of 2
          </div>
        </div>
      </div>

      {/* =====================================================================
          PAGE 2 - VERIFICATION & DECLARATION
          ===================================================================== */}
      <div
        id="pancr-pdf-container-page2"
        style={{
          width: '794px',
          height: '1123px',
          padding: '12px 14px',
          background: '#fff',
          color: '#000',
          fontFamily: 'Arial, sans-serif',
          fontSize: '9px',
          boxSizing: 'border-box',
          lineHeight: '1.2',
          overflow: 'hidden'
        }}
      >
        <div style={{
          border: '2px solid #666',
          height: '1097px',
          padding: '8px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{
            border: '1.2px solid #666',
            minHeight: '260px',
            boxSizing: 'border-box'
          }}>
            <div style={{
              height: '25px',
              borderBottom: '1.2px solid #666',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '10px',
              fontStyle: 'italic',
              boxSizing: 'border-box'
            }}>
              Verification &amp; Declaration
            </div>

            <div style={{
              padding: '25px 25px 0',
              fontSize: '9px',
              lineHeight: '1.4',
              boxSizing: 'border-box'
            }}>
              <div>
                a. I , <span style={{
                  display: 'inline-block',
                  minWidth: '240px',
                  borderBottom: '1px dotted #555',
                  fontWeight: 'bold',
                  paddingLeft: '5px'
                }}>
                  {(fullNameStr || text.lastName || '').toUpperCase()}
                </span>
                , in the capacity of <span style={{
                  display: 'inline-block',
                  minWidth: '180px',
                  borderBottom: '1px dotted #555',
                  paddingLeft: '5px',
                  fontWeight: 'bold'
                }}>
                  {getIndividualCapacity(data, false)}
                </span>
                (Self/Representative Assessee) do hereby declare that
              </div>

              <div style={{ marginTop: '4px' }}>
                what is stated above is true to the best of my knowledge and belief.
              </div>

              <div style={{ marginTop: '6px' }}>
                b. I declare that the applicant does not possess Permanent Account Number and shall be liable for legal consequences under Income-Tax Act, 2025 if this declaration is found to be incorrect
              </div>

              <div style={{
                marginTop: '16px',
                fontSize: '9px'
              }}>
                Place<span style={{ marginLeft: '5px' }}>………</span>
                <span style={{
                  marginLeft: '10px',
                  fontWeight: 'bold'
                }}>
                  {data.district ? String(data.district).toUpperCase() : ''}
                </span>
              </div>

              <div style={{
                marginTop: '16px',
                fontSize: '9px'
              }}>
                Date<span style={{ marginLeft: '5px' }}>….........</span>
                <span style={{ marginLeft: '10px', fontWeight: 'bold' }}>
                  {dayStr}/{monthStr}/{yearStr}
                </span>
              </div>

              <div style={{
                position: 'relative',
                marginTop: '-20px',
                marginLeft: '380px',
                width: '240px',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '240px',
                  height: '85px',
                  border: '1.2px solid #777',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#fff'
                }}>
                  {data.signatureUrl ? (
                    <img
                      src={data.signatureUrl}
                      alt="Signature"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain'
                      }}
                    />
                  ) : null}
                </div>

                <div style={{
                  fontSize: '8px',
                  marginTop: '10px',
                  lineHeight: '1.2'
                }}>
                  (Signature /Left Hand Thumb Impression of Applicant or Representative Assessee)
                </div>
                <div style={{ marginTop: '6px', textAlign: 'left', fontSize: '8px' }}>
                  <div><strong>Name:</strong> {(data.verifierName || fullNameStr || '').toUpperCase() || '____________________________'}</div>
                  <div style={{ marginTop: '2px' }}><strong>Designation:</strong> Authorized Person</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{
            textAlign: 'right',
            fontSize: '8px',
            marginTop: '4px',
            paddingRight: '4px'
          }}>
            2 of 2
          </div>
        </div>
      </div>

    </div>
  );
};

/* =====================================================================
   PAGE 1 ONLY - NON-INDIVIDUAL PAN CORRECTION FORM
   (Firm, Trust, Company, HUF, BOI, AOP, Local Authority, AJP, Govt, LLP)
   ===================================================================== */
const FormPanCrNonIndividualPdfTemplate = ({ data = {} }) => {
  const today = new Date();
  const dayStr = String(today.getDate()).padStart(2, '0');
  const monthStr = String(today.getMonth() + 1).padStart(2, '0');
  const yearStr = String(today.getFullYear());

  // Date of Incorporation parsing
  const targetDob = data.dateOfIncorporation || data.dob;
  let dobDay = '', dobMonth = '', dobYear = '';
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

  const entityName = (data.entityName || data.applicantName || data.lastName || data.nameAsPerAadhaar || '').toUpperCase();
  const address = data.officeAddress || data.address || data.residenceAddress || {};
  const panNo = (data.panNumber || data.pan || '').toUpperCase();
  const regNo = (data.registrationNumber || data.cin || data.llpin || '').toUpperCase();

  const selected = {
    name: Boolean(data.nameCorrection ?? data.changeName),
    dob: Boolean(data.dobCorrection ?? data.changeDob),
    address: Boolean(data.addressCorrection ?? data.changeAddress),
    tin: Boolean(data.tinCorrection ?? data.changeTin),
    contact: Boolean(data.contactCorrection ?? data.changeContact),
  };

  const RowNumber = ({ children }) => (
    <div style={{
      width: '40px',
      flex: '0 0 40px',
      minHeight: '20px',
      background: '#e9e9e9',
      borderRight: '1px solid #aaa',
      display: 'flex',
      alignItems: 'center',
      paddingLeft: '5px',
      boxSizing: 'border-box',
      fontWeight: 'bold',
      fontSize: '8.5px'
    }}>
      {children}
    </div>
  );

  const TickColumn = ({ checked }) => (
    <div style={{
      width: '40px',
      flex: '0 0 40px',
      minHeight: '20px',
      background: '#e9e9e9',
      borderRight: '1px solid #aaa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box'
    }}>
      <TickBoxCell checked={checked} />
    </div>
  );

  const AddressLine = ({ label, value }) => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '125px 1fr',
      alignItems: 'center',
      height: '18px',
      marginBottom: '1px'
    }}>
      <span style={{ fontSize: '8.5px' }}>{label}</span>
      {renderLetterBoxes(value, 25, '18px', '16.5px', '10px')}
    </div>
  );

  const SmallBoxes = ({ value = '', length = 2, width = '16px' }) =>
    renderLetterBoxes(value, length, width, '16px', '9.5px');

  return (
    <div
      id="pancr-pdf-container"
      style={{
        display: 'none',
        position: 'absolute',
        left: '-9999px',
        top: '-9999px'
      }}
    >
      {/* 1 PAGE ONLY FOR NON-INDIVIDUAL CORRECTION FORM */}
      <div
        id="pancr-pdf-container-page1"
        style={{
          width: '794px',
          height: '1123px',
          padding: '12px 14px',
          background: '#fff',
          color: '#000',
          fontFamily: 'Arial, sans-serif',
          fontSize: '8.5px',
          boxSizing: 'border-box',
          lineHeight: '1.15',
          overflow: 'hidden'
        }}
      >
        <div style={{
          border: '2px solid #666',
          height: '1097px',
          padding: '6px',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}>

          {/* HEADER */}
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 'bold', marginBottom: '2px' }}>
              Request For Changes Or Correction in PAN Data
            </div>
            <div style={{ fontSize: '9.5px', fontWeight: 'bold', marginBottom: '6px' }}>
              [For Non-Individual]
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div>
                <span style={{ fontSize: '8px', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>
                  Permanent Account Number (PAN)
                </span>
                {renderLetterBoxes(panNo, 10, '18px', '18px', '10px')}
              </div>

              <div style={{ marginTop: '2px' }}>
                <span style={{ fontSize: '8px', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>
                  Registration Number
                </span>
                {renderLetterBoxes(regNo, 16, '17px', '17px', '9.5px')}
              </div>
            </div>
          </div>

          {/* TABLE HEADER */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            height: '22px',
            border: '1.2px solid #666',
            boxSizing: 'border-box',
            fontWeight: 'bold',
            fontSize: '8.5px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #777' }}>
              Sr. No.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid #777', textAlign: 'center' }}>
              Tick<br/>Box
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Part A - Personal Information
            </div>
          </div>

          {/* 1. Name */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            minHeight: '55px',
            boxSizing: 'border-box'
          }}>
            <RowNumber>1.</RowNumber>
            <TickColumn checked={selected.name} />
            <div style={{ padding: '3px 4px', boxSizing: 'border-box' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>Name</div>
              {renderLetterBoxes(entityName.slice(0, 30), 30, '15.5px', '16.5px', '9.5px')}
              {entityName.length > 30 && (
                <div style={{ marginTop: '2px' }}>
                  {renderLetterBoxes(entityName.slice(30, 60), 30, '15.5px', '16.5px', '9.5px')}
                </div>
              )}
            </div>
          </div>

          {/* 2. Date of Incorporation */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            minHeight: '24px',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            boxSizing: 'border-box'
          }}>
            <RowNumber>2.</RowNumber>
            <TickColumn checked={selected.dob} />
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', gap: '4px', fontSize: '7.5px' }}>
              <strong style={{ width: '330px', lineHeight: '1.1' }}>
                Date of Incorporation/Agreement/Partnership or Trust Deed/Formation of Body of Individuals or Association of Persons
              </strong>
              <span>DD</span>
              {SmallBoxes({ value: dobDay, length: 2 })}
              <span style={{ marginLeft: '3px' }}>MM</span>
              {SmallBoxes({ value: dobMonth, length: 2 })}
              <span style={{ marginLeft: '3px' }}>YYYY</span>
              {SmallBoxes({ value: dobYear, length: 4 })}
            </div>
          </div>

          {/* 3. Office Address */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            minHeight: '135px',
            boxSizing: 'border-box'
          }}>
            <RowNumber>3.</RowNumber>
            <TickColumn checked={selected.address} />
            <div style={{ padding: '3px 4px', boxSizing: 'border-box' }}>
              <strong style={{ display: 'block', marginBottom: '2px' }}>Office Address</strong>
              <AddressLine label="Flat/Door/Building" value={address.flatDoorBuilding || address.flatNo || ''} />
              <AddressLine label="Road/Street/Block/Sector" value={address.roadStreetBlock || address.roadStreet || ''} />
              <AddressLine label="Post Office" value={address.postOffice || ''} />
              <AddressLine label="Area/Locality/Town/City" value={address.areaLocality || address.areaTaluka || ''} />
              <AddressLine label="District" value={address.district || ''} />

              <div style={{
                display: 'grid',
                gridTemplateColumns: '120px 100px 100px 110px 85px 1fr',
                alignItems: 'center',
                height: '19px'
              }}>
                <span style={{ fontSize: '8px' }}>State/Union Territory</span>
                <div style={{ border: '1px solid #888', height: '17px', padding: '1px 3px', fontSize: '7.5px', fontWeight: 'bold' }}>
                  {String(address.state || '').toUpperCase()}
                </div>
                <span style={{ fontSize: '8px', textAlign: 'center' }}>Country/Region</span>
                <div style={{ border: '1px solid #888', height: '17px', padding: '1px 3px', fontSize: '7.5px', fontWeight: 'bold' }}>
                  {String(address.country || 'INDIA').toUpperCase()}
                </div>
                <span style={{ fontSize: '8px', textAlign: 'center' }}>PIN / ZIP CODE</span>
                {renderLetterBoxes(address.pincode || '', 6, '16px', '16.5px', '9.5px')}
              </div>
            </div>
          </div>

          {/* 4. TIN */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            minHeight: '23px',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            boxSizing: 'border-box'
          }}>
            <RowNumber>4.</RowNumber>
            <TickColumn checked={selected.tin} />
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', gap: '6px' }}>
              <strong style={{ width: '250px', fontSize: '7.8px' }}>
                Taxpayer Identification Number in the country of residence
              </strong>
              {renderLetterBoxes(data.tin || '', 20, '16px', '16.5px', '9.5px')}
            </div>
          </div>

          {/* 5. Contact Details */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 40px 1fr',
            minHeight: '72px',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1px solid #aaa',
            boxSizing: 'border-box'
          }}>
            <RowNumber>5.</RowNumber>
            <TickColumn checked={selected.contact} />
            <div style={{ padding: '2px 6px', boxSizing: 'border-box' }}>
              <strong style={{ display: 'block', marginBottom: '2px' }}>Contact Details</strong>

              <div style={{ display: 'flex', alignItems: 'center', height: '20px', gap: '5px' }}>
                <span style={{ width: '105px' }}>(i) Mobile Number</span>
                <span>Country Code</span>
                {renderLetterBoxes(data.countryCode || '91', 2, '16px', '16.5px', '9.5px')}
                <span style={{ marginLeft: '8px' }}>Mobile Number</span>
                {renderLetterBoxes(data.mobileNumber || data.mobile || '', 10, '16px', '16.5px', '9.5px')}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', height: '20px', gap: '5px' }}>
                <span style={{ width: '105px' }}>(ii) Email ID</span>
                <div style={{ border: '1px solid #888', width: '420px', height: '16.5px', padding: '1px 3px', fontSize: '8px' }}>
                  {data.email || ''}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', height: '19px', gap: '4px' }}>
                <span style={{ width: '195px', fontSize: '7.8px' }}>
                  (iii) Landline No. with Country/ISD Code
                </span>
                <span style={{ fontSize: '7.8px' }}>Country/ISD Code</span>
                {renderLetterBoxes(data.countryCode || '91', 2, '15px', '16px', '9px')}
                <span style={{ fontSize: '7.8px', marginLeft: '8px' }}>Area/STD Code</span>
                {renderLetterBoxes(data.stdCode || '', 4, '15px', '16px', '9px')}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', height: '19px', marginTop: '1px', gap: '4px' }}>
                <span style={{ width: '195px', fontSize: '7.8px', paddingLeft: '18px', boxSizing: 'border-box' }}>
                  and Area/STD Code <i>(if any)</i>
                </span>
                <span style={{ fontSize: '7.8px' }}>Landline Number</span>
                {renderLetterBoxes(data.landlineNumber || '', 8, '15px', '16px', '9px')}
              </div>
            </div>
          </div>

          {/* PART B - Declaration by Applicant */}
          <div style={{
            height: '22px',
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1.2px solid #666',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '8.5px',
            boxSizing: 'border-box'
          }}>
            PART B - Declaration by Applicant
          </div>

          {/* 6. Documents submitted */}
          <div style={{
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1.2px solid #666',
            padding: '5px 7px',
            boxSizing: 'border-box'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '7.8px', marginBottom: '5px' }}>
              6. Documents submitted as Proof of Identity, Proof of Address, Proof of Date of Incorporation/Agreement/Partnership or Trust Deed/Formation of Body of Individuals or Association of Persons of the Applicant
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', paddingLeft: '16px', fontSize: '8px' }}>
              <BoxCheck checked={Boolean(data.proofOfIdentity) || true} label="(i) Proof of Identity" />
              <BoxCheck checked={Boolean(data.proofOfAddress) || true} label="(ii) Proof of Address" />
              <BoxCheck checked={Boolean(data.proofOfDob || data.proofOfIncorporation) || true} label="(iii) Proof of Date of Incorporation/Agreement/Partnership or Trust Deed/Formation of Body of Individuals or Association of Persons" />
              <BoxCheck checked={Boolean(data.copyOfPan || data.panCopy) || true} label="(iv) Proof of PAN" />
            </div>
          </div>

          {/* VERIFICATION & DECLARATION BOX */}
          <div style={{
            borderLeft: '1.2px solid #666',
            borderRight: '1.2px solid #666',
            borderBottom: '1.2px solid #666',
            height: '195px',
            boxSizing: 'border-box',
            padding: '8px 12px'
          }}>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '9.5px', fontStyle: 'italic', marginBottom: '8px' }}>
              Verification &amp; Declaration
            </div>

            <div style={{ fontSize: '8.5px', lineHeight: '1.35' }}>
              <div>
                a. I, <span style={{ display: 'inline-block', minWidth: '180px', borderBottom: '1px dotted #555', fontWeight: 'bold', paddingLeft: '4px' }}>
                  {(data.verifierName || data.raName || entityName).toUpperCase()}
                </span>
                , in the capacity of <span style={{ display: 'inline-block', minWidth: '140px', borderBottom: '1px dotted #555', fontWeight: 'bold', paddingLeft: '4px' }}>
                  {data.representativeCapacity || 'Authorized Representative'}
                </span> do hereby declare that what is stated above is true to the best of my knowledge and belief.
              </div>

              <div style={{ marginTop: '12px' }}>
                Designation <span style={{ borderBottom: '1px dotted #555', paddingRight: '100px' }}>{data.designation || ''}</span>
              </div>
              <div style={{ marginTop: '6px' }}>
                Place <span style={{ borderBottom: '1px dotted #555', paddingRight: '120px' }}>{data.district ? String(data.district).toUpperCase() : ''}</span>
              </div>
              <div style={{ marginTop: '6px' }}>
                Date <span style={{ borderBottom: '1px dotted #555', paddingRight: '90px' }}>{dayStr}/{monthStr}/{yearStr}</span>
              </div>

              <div style={{
                position: 'relative',
                marginTop: '-50px',
                marginLeft: '370px',
                width: '220px',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '220px',
                  height: '70px',
                  border: '1.2px solid #777',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#fff'
                }}>
                  {data.signatureUrl ? (
                    <img
                      src={data.signatureUrl}
                      alt="Signature"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain'
                      }}
                    />
                  ) : null}
                </div>

                <div style={{ fontSize: '7px', marginTop: '5px', lineHeight: '1.1' }}>
                  (Signature / Left Hand Thumb Impression of Applicant or Representative Assessee or Authorized Representative)
                </div>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right', fontSize: '8px', marginTop: '3px', paddingRight: '4px' }}>
            1 of 2
          </div>

        </div>
      </div>

      {/* Uploaded Document Proof Pages (Appended Below Main PDF) */}
      {[
        { title: 'Identity Proof', url: data.proofOfIdentityUrl || data.identityProofUrl },
        { title: 'Address Proof', url: data.proofOfAddressUrl || data.addressProofUrl },
        { title: 'Date of Birth Proof', url: data.proofOfDobUrl || data.dobProofUrl },
        { title: 'Supporting Document / Other Proof', url: data.proofOfOtherUrl || data.otherProofUrl || data.supportingProofUrl }
      ].filter(d => Boolean(d.url)).map((doc, idx) => (
        <div key={idx} id={`pancr-pdf-container-doc-${idx}`} style={{ width: '794px', minHeight: '1123px', background: '#ffffff', boxSizing: 'border-box', padding: '0px', display: 'flex', alignItems: 'center', justifyContent: 'center', pageBreakBefore: 'always' }}>
          <div style={{ width: '100%', height: '1050px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {typeof doc.url === 'string' && doc.url.startsWith('data:application/pdf') ? (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '10px' }}>📄 PDF Document Attached</div>
                <div style={{ fontSize: '14px', color: '#475569' }}>{doc.title} (PDF File)</div>
              </div>
            ) : (
              <img src={doc.url} alt={doc.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export const isNonIndividualApplicant = (data = {}) => {
  const details = data.details || {};
  const cat = String(
    data.category || details.category || data.applicantStatus || details.applicantStatus || ''
  ).toUpperCase();
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
  return nonIndTypes.some(t => cat.includes(t));
};

export const generatePanCrIndividualPdf = async (rawData = {}, existingWin = null) => {
  try {
    const data = { ...(rawData.details || {}), ...rawData };
    const templateBytes = base64ToUint8Array(PAN_CR_INDIVIDUAL_TEMPLATE_BASE64);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const pages = pdfDoc.getPages();
    const page1 = pages[0];
    const page2 = pages[1];

    const drawCenteredCells = (text, startX, yBase, cellWidth = 15.34, maxLen = 25, fontSize = 7.5) => {
      const clean = String(text || '').toUpperCase().slice(0, maxLen);
      for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (ch && ch !== ' ') {
          const chW = fontBold.widthOfTextAtSize(ch, fontSize);
          const chX = startX + i * cellWidth + (cellWidth - chW) / 2;
          page1.drawText(ch, {
            x: chX,
            y: yBase,
            size: fontSize,
            font: fontBold,
            color: rgb(0, 0, 0),
          });
        }
      }
    };

    const drawCleanTick = (page, boxX, boxY, boxW = 16.0, boxH = 12.0) => {
      page.drawRectangle({
        x: boxX + 1.0,
        y: boxY + 1.0,
        width: boxW - 2.0,
        height: boxH - 2.0,
        color: rgb(1, 1, 1),
      });
      const cx = boxX + boxW / 2.0;
      const cy = boxY + boxH / 2.0;
      page.drawLine({
        start: { x: cx - 4.0, y: cy + 0.5 },
        end: { x: cx - 1.2, y: cy - 2.8 },
        thickness: 1.3,
        color: rgb(0, 0, 0),
      });
      page.drawLine({
        start: { x: cx - 1.2, y: cy - 2.8 },
        end: { x: cx + 4.5, y: cy + 4.0 },
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
        console.warn('Image embed failed in PAN CR Individual:', e);
      }
      return null;
    };

    // Embed applicant photo in left and right photo boxes on Page 1 (photo only, no signature across left photo)
    const photoImg = await embedImageHelper(data.photoUrl);
    if (photoImg) {
      page1.drawImage(photoImg, {
        x: 35.15,
        y: 691.05,
        width: 99.28,
        height: 127.63,
      });
      page1.drawImage(photoImg, {
        x: 460.82,
        y: 690.91,
        width: 99.28,
        height: 127.63,
      });
    }

    // Embed applicant signature (Page 2 signature box only)
    const sigImg = await embedImageHelper(data.signatureUrl);
    if (sigImg) {
      const dims = sigImg.scaleToFit(201.30, 61.50);
      page2.drawImage(sigImg, {
        x: 328.61 + (201.30 - dims.width) / 2,
        y: 638.52 + (61.50 - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
    }

    // Header: Existing PAN (10 boxes)
    const panNum = String(data.panNumber || data.pan || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    drawCenteredCells(panNum, 227.02, 746.5, 14.74, 10);

    // Header: Aadhaar Number (12 boxes)
    const aadhaarNum = String(data.aadhaarNumber || data.aadhaar || '').replace(/\D/g, '');
    drawCenteredCells(aadhaarNum, 212.27, 705.7, 14.74, 12);

    // Left Column Correction Tick Boxes
    const selected = {
      name: Boolean(data.nameCorrection ?? data.nameChanged ?? data.changeName ?? data.correctName),
      nameAsPerAadhaar: Boolean(data.nameAsPerAadhaarCorrection ?? data.changeNameAsPerAadhaar ?? data.changeAadhaarName),
      gender: Boolean(data.genderCorrection ?? data.changeGender),
      dob: Boolean(data.dobCorrection ?? data.changeDob),
      address: Boolean(data.addressCorrection ?? data.changeAddress),
      passport: Boolean(data.passportCorrection ?? data.changePassport),
      tin: Boolean(data.tinCorrection ?? data.changeTin),
      contact: Boolean(data.contactCorrection ?? data.changeContact),
      father: Boolean(data.fatherCorrection ?? data.changeFatherName),
      mother: Boolean(data.motherCorrection ?? data.changeMotherName),
      parentPrint: Boolean(data.parentNameCorrection ?? data.changeParentName),
      proofChange: Boolean(data.proofOfChange ?? data.documentaryProof),
      copyPan: Boolean(data.copyOfPan ?? data.panCopy ?? true),
    };

    if (selected.name) drawCleanTick(page1, 74.07, 639.89, 16.58, 13.1);
    if (selected.nameAsPerAadhaar) drawCleanTick(page1, 74.05, 581.53, 16.94, 13.09);
    if (selected.gender) drawCleanTick(page1, 74.10, 527.88, 16.55, 11.5);
    if (selected.dob) drawCleanTick(page1, 74.15, 514.47, 16.5, 11.49);
    if (selected.address) drawCleanTick(page1, 74.13, 496.87, 16.52, 13.1);
    if (selected.passport) drawCleanTick(page1, 74.15, 385.54, 16.56, 11.5);
    if (selected.tin) drawCleanTick(page1, 74.10, 372.13, 16.52, 11.49);
    if (selected.contact) drawCleanTick(page1, 74.10, 341.12, 16.55, 13.1);
    if (selected.father) drawCleanTick(page1, 75.46, 226.54, 16.55, 11.49);
    if (selected.mother) drawCleanTick(page1, 75.51, 186.30, 16.5, 11.5);

    // Item 1A: Name
    const cleanLName = getCleanLastName(data.lastName, data.firstName, data.applicantName);
    drawCenteredCells(data.firstName || '', 176.60, 629.28, 15.34, 25);
    drawCenteredCells(data.middleName || '', 176.60, 615.87, 15.34, 25);
    drawCenteredCells(cleanLName, 176.53, 601.92, 15.34, 25);

    // Item 1B: Name as per Aadhaar
    const aadhaarName = String(
      data.aadhaarName || data.nameAsPerAadhaar ||
      (data.firstName ? [data.firstName, data.middleName, data.lastName].filter(Boolean).join(' ') : '')
    ).toUpperCase();
    drawCenteredCells(aadhaarName.slice(0, 25), 176.60, 570.92, 15.34, 25);
    if (aadhaarName.length > 25) {
      drawCenteredCells(aadhaarName.slice(25, 50), 176.60, 557.50, 15.34, 25);
    }
    if (aadhaarName.length > 50) {
      drawCenteredCells(aadhaarName.slice(50, 75), 176.60, 544.09, 15.34, 25);
    }

    // Item 2: Gender
    const g = String(data.gender || '').toUpperCase();
    if (g === 'MALE' || g === 'M') {
      drawCleanTick(page1, 176.60, 527.88, 15.77, 11.5);
    } else if (g === 'FEMALE' || g === 'F') {
      drawCleanTick(page1, 222.76, 527.88, 15.77, 11.5);
    } else if (g === 'TRANSGENDER' || g === 'T') {
      drawCleanTick(page1, 283.84, 527.88, 15.78, 11.5);
    }

    // Item 3: Date of Birth (D D M M Y Y Y Y)
    let dobStr = String(data.dob || data.dateOfBirth || '').replace(/\D/g, '');
    const rawDob = String(data.dob || data.dateOfBirth || '');
    if (rawDob.includes('-')) {
      const parts = rawDob.split('-');
      if (parts[0].length === 4 && parts.length === 3) {
        dobStr = (parts[2].padStart(2, '0') + parts[1].padStart(2, '0') + parts[0]).slice(0, 8);
      }
    } else if (rawDob.includes('/')) {
      const parts = rawDob.split('/');
      if (parts[0].length === 4 && parts.length === 3) {
        dobStr = (parts[2].padStart(2, '0') + parts[1].padStart(2, '0') + parts[0]).slice(0, 8);
      }
    }
    const dobIntervals = [
      [176.60, 191.51], [191.51, 207.78],
      [222.44, 238.72], [238.72, 253.63],
      [268.53, 283.44], [283.44, 298.35], [298.35, 313.26], [313.26, 328.16]
    ];
    for (let i = 0; i < Math.min(dobStr.length, 8); i++) {
      const ch = dobStr[i];
      const [x0, x1] = dobIntervals[i];
      const chW = fontBold.widthOfTextAtSize(ch, 7.5);
      const chX = x0 + (x1 - x0 - chW) / 2;
      page1.drawText(ch, {
        x: chX,
        y: 517.27,
        size: 7.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }

    // Item 4: Address
    const isOffice = String(data.addressType || data.addressForCommunication || '').toUpperCase() === 'OFFICE';
    if (isOffice) {
      drawCleanTick(page1, 258.87, 479.42, 19.14, 13.1);
    } else {
      drawCleanTick(page1, 176.67, 479.42, 19.13, 13.1);
    }

    const flat = data.flatDoorBlock || data.flat || data.building || '';
    const road = data.premisesBuildingVillage || data.roadStreet || data.road || '';
    const post = data.postOffice || data.post || '';
    const area = data.areaLocality || data.areaTaluka || data.subDivision || data.area || '';
    const dist = data.district || data.townCityDistrict || '';
    const state = data.state || '';
    const country = data.country || 'INDIA';
    const pin = String(data.pincode || data.pin || '').replace(/\D/g, '').slice(0, 6);

    drawCenteredCells(flat, 176.67, 468.81, 15.34, 25);
    drawCenteredCells(road, 176.65, 455.40, 15.34, 25);
    drawCenteredCells(post, 176.60, 441.99, 15.34, 25);
    drawCenteredCells(area, 176.60, 428.58, 15.34, 25);
    drawCenteredCells(dist, 176.65, 415.16, 15.34, 25);

    if (state) {
      page1.drawText(String(state).toUpperCase().slice(0, 16), {
        x: 135.0,
        y: 401.75,
        size: 7.0,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }
    if (country) {
      page1.drawText(String(country).toUpperCase().slice(0, 18), {
        x: 292.0,
        y: 401.75,
        size: 7.0,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }
    drawCenteredCells(pin, 452.98, 401.75, 15.35, 6);

    // Item 5: Passport Number
    if (data.passportNumber || data.passport) {
      drawCenteredCells(data.passportNumber || data.passport, 383.24, 388.34, 14.74, 12);
    }

    // Item 6: Taxpayer Identification Number (TIN)
    if (data.tin || data.taxpayerIdentificationNumber) {
      drawCenteredCells(data.tin || data.taxpayerIdentificationNumber, 264.90, 361.52, 14.74, 20);
    }

    // Item 7: Contact Details
    const isdCode = String(data.countryCode || data.isdCode || '91').replace(/\D/g, '').slice(0, 3);
    drawCenteredCells(isdCode, 279.21, 324.91, 14.74, 3);

    const mobNum = String(data.mobileNumber || data.mobile || data.phone || '').replace(/\D/g, '').slice(-10);
    drawCenteredCells(mobNum, 413.01, 324.91, 14.74, 10);

    if (data.email || data.emailId) {
      page1.drawText(String(data.email || data.emailId).slice(0, 48), {
        x: 282.0,
        y: 311.50,
        size: 7.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }

    if (data.landlineIsd) {
      drawCenteredCells(String(data.landlineIsd).replace(/\D/g, ''), 278.93, 298.09, 14.74, 3);
    }
    if (data.stdCode || data.landlineStd) {
      drawCenteredCells(String(data.stdCode || data.landlineStd).replace(/\D/g, ''), 416.31, 298.09, 14.91, 4);
    }
    if (data.landlineNumber || data.landline) {
      drawCenteredCells(String(data.landlineNumber || data.landline).replace(/\D/g, ''), 279.68, 275.07, 14.74, 8);
    }

    // Item 8: Father's Name
    drawCenteredCells(data.fatherFirstName || '', 176.77, 229.34, 15.34, 25);
    drawCenteredCells(data.fatherMiddleName || '', 177.02, 215.93, 15.34, 25);
    drawCenteredCells(data.fatherLastName || data.fatherName || '', 176.95, 202.51, 15.34, 25);

    // Item 9: Mother's Name
    drawCenteredCells(data.motherFirstName || '', 176.74, 189.10, 15.34, 25);
    drawCenteredCells(data.motherMiddleName || '', 176.74, 175.69, 15.34, 25);
    drawCenteredCells(data.motherLastName || data.motherName || '', 176.88, 162.28, 15.34, 25);

    // Item 10: Parent name to print
    const parentCard = String(data.parentNameOnCard || data.cardParentName || '').toUpperCase();
    if (parentCard === 'MOTHER') {
      drawCleanTick(page1, 409.61, 141.88, 19.84, 13.1);
    } else {
      drawCleanTick(page1, 340.87, 141.88, 20.55, 13.1);
    }

    // Item 11: Documents submitted
    // (i) Proof of Identity
    if (data.proofOfIdentity || data.proofOfIdentityUrl || data.poi || true) {
      drawCleanTick(page1, 68.45, 81.47, 14.87, 11.49);
    }
    // (ii) Proof of Address
    if (data.proofOfAddress || data.proofOfAddressUrl || data.poa || true) {
      drawCleanTick(page1, 167.08, 81.47, 14.87, 11.49);
    }
    // (iii) Proof of Date of Birth
    if (data.proofOfDob || data.proofOfDobUrl || data.dobProof || true) {
      drawCleanTick(page1, 267.99, 81.47, 14.87, 11.49);
    }
    // (iv) Documentary proof in support of other changes
    if (selected.proofChange || data.proofOfOtherUrl) {
      drawCleanTick(page1, 68.45, 57.47, 14.87, 11.5);
    }
    // (v) Copy of PAN
    if (selected.copyPan || data.proofOfPanUrl || data.panCopy || true) {
      drawCleanTick(page1, 267.87, 57.47, 14.87, 11.5);
    }

    // Page 2: Verification & Declaration
    const vName = [data.firstName, data.middleName, cleanLName].filter(Boolean).join(' ') || data.applicantName || 'APPLICANT';
    const vCap = getIndividualCapacity(data, false);
    const vPlace = String(data.verifierPlace || data.place || dist || 'DELHI').toUpperCase();
    const rawDate = data.verifierDate || data.date || new Date().toISOString().split('T')[0];
    const vDateFmt = rawDate.includes('-') ? rawDate.split('-').reverse().join('/') : rawDate;

    // Clear line a dotted area
    page2.drawRectangle({
      x: 57.0,
      y: 777.0,
      width: 475.0,
      height: 13.0,
      color: rgb(1, 1, 1),
    });

    const prefix = 'a. I , ';
    const mid = ', in the capacity of ';
    const suffix = ' (Self/Representative Assessee) do hereby declare that';

    let declFontSize = 7.5;
    const maxDeclWidth = 470.0;
    let w1 = fontRegular.widthOfTextAtSize(prefix, declFontSize);
    let w2 = fontBold.widthOfTextAtSize(vName, declFontSize);
    let w3 = fontRegular.widthOfTextAtSize(mid, declFontSize);
    let w4 = fontBold.widthOfTextAtSize(vCap, declFontSize);
    let w5 = fontRegular.widthOfTextAtSize(suffix, declFontSize);
    let totalW = w1 + w2 + w3 + w4 + w5 + 2.0;

    if (totalW > maxDeclWidth) {
      const scale = maxDeclWidth / totalW;
      declFontSize = Math.max(5.8, +(declFontSize * scale).toFixed(2));
      w1 = fontRegular.widthOfTextAtSize(prefix, declFontSize);
      w2 = fontBold.widthOfTextAtSize(vName, declFontSize);
      w3 = fontRegular.widthOfTextAtSize(mid, declFontSize);
      w4 = fontBold.widthOfTextAtSize(vCap, declFontSize);
      w5 = fontRegular.widthOfTextAtSize(suffix, declFontSize);
    }

    let curX = 57.4;
    const lineAY = 780.0;
    page2.drawText(prefix, { x: curX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });
    curX += w1;
    page2.drawText(vName, { x: curX, y: lineAY, size: declFontSize, font: fontBold, color: rgb(0, 0, 0) });
    curX += w2;
    page2.drawText(mid, { x: curX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });
    curX += w3;
    page2.drawText(vCap, { x: curX, y: lineAY, size: declFontSize, font: fontBold, color: rgb(0, 0, 0) });
    curX += w4 + 2.0;
    page2.drawText(suffix, { x: curX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });

    // Place line: erase dots cleanly after 'Place'
    page2.drawRectangle({
      x: 75.5,
      y: 737.0,
      width: 170.0,
      height: 12.0,
      color: rgb(1, 1, 1),
    });
    page2.drawText(': ' + vPlace.slice(0, 24), {
      x: 77.0,
      y: 739.5,
      size: 7.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    // Date line: erase dots cleanly after 'Date'
    page2.drawRectangle({
      x: 72.8,
      y: 712.0,
      width: 170.0,
      height: 12.0,
      color: rgb(1, 1, 1),
    });
    page2.drawText(': ' + vDateFmt, {
      x: 74.5,
      y: 714.5,
      size: 7.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    // Under signature box: Name:
    page2.drawText('Name: ' + vName.slice(0, 30), {
      x: 330.0,
      y: 595.0,
      size: 7.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    // Under signature box: Designation:
    page2.drawText('Designation: Authorized Person', {
      x: 330.0,
      y: 580.0,
      size: 7.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    // Appending uploaded documents
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
      if (src.proofOfPanUrl) addDoc(src.proofOfPanUrl);
      if (src.proofOfOtherUrl) addDoc(src.proofOfOtherUrl);

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
            let pBytes;
            if (docUrl.startsWith('data:')) {
              pBytes = base64ToUint8Array(docUrl);
            } else {
              const res = await fetch(docUrl);
              const buf = await res.arrayBuffer();
              pBytes = new Uint8Array(buf);
            }
            const donorDoc = await PDFDocument.load(pBytes);
            const donorIndices = donorDoc.getPageIndices();
            const copiedPages = await pdfDoc.copyPages(donorDoc, donorIndices);
            copiedPages.forEach(p => pdfDoc.addPage(p));
          } else {
            let imgBytes;
            if (docUrl.startsWith('data:')) {
              imgBytes = base64ToUint8Array(docUrl);
            } else {
              const res = await fetch(docUrl);
              const buf = await res.arrayBuffer();
              imgBytes = new Uint8Array(buf);
            }
            let embeddedImg;
            try {
              embeddedImg = await pdfDoc.embedJpg(imgBytes);
            } catch {
              try {
                embeddedImg = await pdfDoc.embedPng(imgBytes);
              } catch {
                if (typeof window !== 'undefined' && typeof document !== 'undefined') {
                  const jpegDataUrl = await new Promise((resolve) => {
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
                      resolve(canvas.toDataURL('image/jpeg', 0.95));
                    };
                    img.onerror = () => resolve(null);
                    img.src = docUrl;
                  });
                  if (jpegDataUrl) {
                    embeddedImg = await pdfDoc.embedJpg(base64ToUint8Array(jpegDataUrl));
                  }
                }
              }
            }
            if (embeddedImg) {
              const newPage = pdfDoc.addPage([595.28, 841.89]);
              const dims = embeddedImg.scaleToFit(555.28, 801.89);
              newPage.drawImage(embeddedImg, {
                x: (595.28 - dims.width) / 2,
                y: (841.89 - dims.height) / 2,
                width: dims.width,
                height: dims.height,
              });
            }
          }
        } catch (singleDocErr) {
          console.warn('Could not append document to PAN CR Individual PDF:', singleDocErr);
        }
      }
    } catch (docsErr) {
      console.warn('Error in appending uploaded documents:', docsErr);
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const safeName = (
      [data.firstName, data.middleName, data.lastName].filter(Boolean).join('_') ||
      data.applicantName || data.lastName || 'Individual_PAN_CR'
    ).toString().replace(/[^\w-]+/g, '_');
    const fileName = `PAN_CR_Individual_${safeName}.pdf`;

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
    console.error('Error generating Individual PAN CR PDF:', err);
    if (existingWin && !existingWin.closed) existingWin.close();
    return false;
  }
};

export const generatePanCrNonIndividualPdf = async (rawData = {}, existingWin = null) => {
  try {
    const data = { ...(rawData.details || {}), ...rawData };
    const templateBytes = base64ToUint8Array(PAN_CR_NON_INDIVIDUAL_TEMPLATE_BASE64);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const page = pdfDoc.getPages()[0];
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const cleanDist = (val) => {
      const s = String(val || '').trim();
      return (s.toUpperCase() === 'SELECT' || s.toUpperCase().startsWith('SELECT') || s.toUpperCase() === 'PLEASE SELECT' || s.toUpperCase().startsWith('PLEASE')) ? '' : s;
    };

    const drawCenteredCells = (text, startX, yBase, cellWidth = 15.345, maxLen = 25, fontSize = 7.5) => {
      const str = String(text || '').trim();
      if (!str || str.toUpperCase() === 'SELECT' || str.toUpperCase().startsWith('SELECT') || str.toUpperCase() === 'PLEASE SELECT' || str.toUpperCase().startsWith('PLEASE')) {
        return;
      }
      const clean = str.toUpperCase().slice(0, maxLen);
      for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (ch && ch !== ' ') {
          const chW = fontBold.widthOfTextAtSize(ch, fontSize);
          const chX = startX + i * cellWidth + (cellWidth - chW) / 2;
          page.drawText(ch, {
            x: chX,
            y: yBase,
            size: fontSize,
            font: fontBold,
            color: rgb(0, 0, 0),
          });
        }
      }
    };

    const drawCleanTick = (boxX, boxY, boxW = 12.0, boxH = 10.5) => {
      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        color: rgb(1, 1, 1),
      });
      const tX = boxX + 2.0;
      const tY = boxY + 2.0;
      page.drawLine({
        start: { x: tX + 1, y: tY + 3.8 },
        end: { x: tX + 3.5, y: tY + 0.8 },
        thickness: 1.3,
        color: rgb(0, 0, 0),
      });
      page.drawLine({
        start: { x: tX + 3.5, y: tY + 0.8 },
        end: { x: tX + 8, y: tY + 7.8 },
        thickness: 1.3,
        color: rgb(0, 0, 0),
      });
    };

    // Header: Existing PAN (10 boxes)
    drawCenteredCells(data.panNumber || data.pan || '', 227.02, 841.89 - 95.7, 14.74, 10);

    // Header: Registration Number (13 boxes)
    drawCenteredCells(data.registrationNumber || data.cin || data.llpin || '', 204.90, 841.89 - 136.5, 14.74, 13);

    // Left Column Ticks (Corrections)
    if (data.nameCorrection || data.correctName) drawCleanTick(81.8, 841.89 - 201.0, 12.0, 11.0);
    if (data.dobCorrection || data.dateOfIncorporationCorrection) drawCleanTick(81.8, 841.89 - 255.5, 12.0, 10.5);
    if (data.addressCorrection || data.officeAddressCorrection) drawCleanTick(81.8, 841.89 - 286.0, 12.0, 11.0);
    if (data.tinCorrection) drawCleanTick(81.8, 841.89 - 380.0, 12.0, 10.0);
    if (data.contactCorrection) drawCleanTick(81.8, 841.89 - 411.0, 12.0, 11.0);

    // Item 1: Name (3 rows of 25 boxes)
    const entityName = String(data.entityName || data.applicantName || data.lastName || '').toUpperCase();
    drawCenteredCells(entityName.slice(0, 25), 176.03, 841.89 - 212.5, 15.345, 25);
    drawCenteredCells(entityName.slice(25, 50), 176.03, 841.89 - 226.0, 15.345, 25);
    drawCenteredCells(entityName.slice(50, 75), 175.97, 841.89 - 239.5, 15.345, 25);

    // Item 2: Date of Incorporation (DD MM YYYY)
    let dobStr = String(data.dateOfIncorporation || data.dob || '').replace(/[^\d]/g, '');
    const rawDob = String(data.dateOfIncorporation || data.dob || '');
    if (rawDob.includes('-')) {
      const parts = rawDob.split('-');
      if (parts[0].length === 4 && parts.length === 3) {
        dobStr = (parts[2].padStart(2, '0') + parts[1].padStart(2, '0') + parts[0]).slice(0, 8);
      }
    } else if (rawDob.includes('/')) {
      const parts = rawDob.split('/');
      if (parts[0].length === 4 && parts.length === 3) {
        dobStr = (parts[2].padStart(2, '0') + parts[1].padStart(2, '0') + parts[0]).slice(0, 8);
      }
    }
    const dateIntervals = [
      [176.03, 190.94],
      [190.94, 207.21],
      [221.88, 238.15],
      [238.15, 253.06],
      [267.97, 282.87],
      [282.87, 297.78],
      [297.78, 312.69],
      [312.69, 327.60]
    ];
    for (let i = 0; i < Math.min(dobStr.length, 8); i++) {
      const ch = dobStr[i];
      const [x0, x1] = dateIntervals[i];
      const chW = fontBold.widthOfTextAtSize(ch, 7.5);
      const chX = x0 + (x1 - x0 - chW) / 2;
      page.drawText(ch, {
        x: chX,
        y: 841.89 - 266.5,
        size: 7.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }

    // Item 3: Office Address
    const off = data.officeAddress || data;
    drawCenteredCells(cleanDist(off.flatNo || off.flatDoorBuilding || data.flatNo), 176.03, 841.89 - 297.5, 15.34, 25);
    drawCenteredCells(cleanDist(off.roadStreet || off.roadStreetBlock || data.roadStreet), 176.03, 841.89 - 311.0, 15.34, 25);
    drawCenteredCells(cleanDist(off.premises || off.postOffice || data.premises || data.postOffice), 175.97, 841.89 - 324.5, 15.34, 25);
    drawCenteredCells(cleanDist(off.areaTaluka || off.areaLocality || data.areaTaluka), 176.03, 841.89 - 338.0, 15.34, 25);
    drawCenteredCells(cleanDist(off.district || data.district), 176.03, 841.89 - 351.5, 15.34, 25);

    const offState = cleanDist(off.state || data.state);
    if (offState) {
      page.drawText(String(offState).toUpperCase().slice(0, 15), {
        x: 136.44,
        y: 841.89 - 364.5,
        size: 6.5,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }
    page.drawText(String(cleanDist(off.country || data.country) || 'INDIA').toUpperCase(), {
      x: 286.63,
      y: 841.89 - 364.5,
      size: 6.5,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    drawCenteredCells(cleanDist(off.pincode || data.pincode), 452.13, 841.89 - 364.5, 15.355, 7);

    // Item 4: Taxpayer Identification Number (TIN)
    drawCenteredCells(data.tin || data.taxpayerId || '', 265.04, 841.89 - 391.5, 14.74, 20);

    // Item 5: Contact Details
    const cc = String(data.countryCode || '91').replace(/[^\d]/g, '');
    if (cc.length >= 2) {
      drawCenteredCells(cc, 274.96, 841.89 - 422.5, 14.74, 2);
    }
    drawCenteredCells(data.mobileNumber || '', 412.16, 841.89 - 422.5, 14.74, 10);

    if (data.email) {
      page.drawText(String(data.email).toUpperCase().slice(0, 42), {
        x: 215.0,
        y: 841.89 - 435.5,
        size: 7.0,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
    }

    if (cc.length >= 2) {
      drawCenteredCells(cc, 274.39, 841.89 - 449.0, 14.74, 4);
    }
    drawCenteredCells(data.stdCode || '', 411.77, 841.89 - 449.0, 14.91, 4);
    drawCenteredCells(data.landlineNumber || '', 274.96, 841.89 - 472.0, 14.74, 8);

    // Part B - Item 6: Proof Documents Ticks
    if (data.proofOfIdentity) drawCleanTick(185.0, 841.89 - 542.0, 13.8, 10.5);
    if (data.proofOfAddress) drawCleanTick(389.0, 841.89 - 542.0, 13.8, 10.5);
    if (data.proofOfIncorporation || data.proofOfDob) drawCleanTick(185.0, 841.89 - 558.0, 13.8, 10.5);
    if (data.copyOfPan && data.copyOfPan !== 'NO') drawCleanTick(388.0, 841.89 - 558.0, 13.8, 10.5);

    // Verification & Declaration - Dynamic Continuous Flow
    const verName = String(data.verifierName || data.raName || entityName).toUpperCase();
    const capacity = String(data.designation || data.verifierCapacity || 'DIRECTOR').toUpperCase();
    const place = String(data.verifierPlace || data.place || data.district || 'MUMBAI').toUpperCase();
    const verDate = data.verifierDate || data.date || new Date().toISOString().split('T')[0];
    const verDateFmt = verDate.includes('-') ? verDate.split('-').reverse().join('/') : verDate;

    page.drawRectangle({
      x: 58.0,
      y: 841.89 - 631.5,
      width: 497.0,
      height: 12.5,
      color: rgb(1, 1, 1),
    });

    const prefix = 'a. I, ';
    const mid = ', in the capacity of ';
    const suffix = ' do hereby declare that what is stated above is true to the best';

    let declFontSize = 7.5;
    const maxDeclWidth = 492.0;

    let w1 = fontRegular.widthOfTextAtSize(prefix, declFontSize);
    let w2 = fontBold.widthOfTextAtSize(verName, declFontSize);
    let w3 = fontRegular.widthOfTextAtSize(mid, declFontSize);
    let w4 = fontBold.widthOfTextAtSize(capacity, declFontSize);
    let w5 = fontRegular.widthOfTextAtSize(suffix, declFontSize);
    let totalW = w1 + w2 + w3 + w4 + w5 + 2.0;

    if (totalW > maxDeclWidth) {
      const scale = maxDeclWidth / totalW;
      declFontSize = Math.max(5.8, +(declFontSize * scale).toFixed(2));
      w1 = fontRegular.widthOfTextAtSize(prefix, declFontSize);
      w2 = fontBold.widthOfTextAtSize(verName, declFontSize);
      w3 = fontRegular.widthOfTextAtSize(mid, declFontSize);
      w4 = fontBold.widthOfTextAtSize(capacity, declFontSize);
      w5 = fontRegular.widthOfTextAtSize(suffix, declFontSize);
    }

    let curX = 59.6;
    const lineAY = 841.89 - 628.0;

    page.drawText(prefix, { x: curX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });
    curX += w1;
    page.drawText(verName, { x: curX, y: lineAY, size: declFontSize, font: fontBold, color: rgb(0, 0, 0) });
    curX += w2;
    page.drawText(mid, { x: curX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });
    curX += w3;
    page.drawText(capacity, { x: curX, y: lineAY, size: declFontSize, font: fontBold, color: rgb(0, 0, 0) });
    curX += w4 + 2.0;
    page.drawText(suffix, { x: curX, y: lineAY, size: declFontSize, font: fontRegular, color: rgb(0, 0, 0) });

    page.drawRectangle({
      x: 58.0,
      y: 841.89 - 666.0,
      width: 250.0,
      height: 12.0,
      color: rgb(1, 1, 1),
    });
    const desLbl = 'Designation: ';
    page.drawText(desLbl, { x: 59.6, y: 841.89 - 663.0, size: 7.5, font: fontRegular, color: rgb(0, 0, 0) });
    const dlw = fontRegular.widthOfTextAtSize(desLbl, 7.5);
    page.drawText(capacity.slice(0, 28), { x: 59.6 + dlw, y: 841.89 - 663.0, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    page.drawRectangle({
      x: 58.0,
      y: 841.89 - 681.0,
      width: 200.0,
      height: 12.0,
      color: rgb(1, 1, 1),
    });
    const plcLbl = 'Place: ';
    page.drawText(plcLbl, { x: 59.6, y: 841.89 - 678.0, size: 7.5, font: fontRegular, color: rgb(0, 0, 0) });
    const plw = fontRegular.widthOfTextAtSize(plcLbl, 7.5);
    page.drawText(place.slice(0, 24), { x: 59.6 + plw, y: 841.89 - 678.0, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    page.drawRectangle({
      x: 58.0,
      y: 841.89 - 696.0,
      width: 200.0,
      height: 12.0,
      color: rgb(1, 1, 1),
    });
    const dtLbl = 'Date: ';
    page.drawText(dtLbl, { x: 59.6, y: 841.89 - 693.0, size: 7.5, font: fontRegular, color: rgb(0, 0, 0) });
    const dtw = fontRegular.widthOfTextAtSize(dtLbl, 7.5);
    page.drawText(verDateFmt, { x: 59.6 + dtw, y: 841.89 - 693.0, size: 7.5, font: fontBold, color: rgb(0, 0, 0) });

    if (data.signatureUrl) {
      try {
        let sigImage;
        if (data.signatureUrl.startsWith('data:image')) {
          const sigBytes = base64ToUint8Array(data.signatureUrl);
          try {
            sigImage = await pdfDoc.embedPng(sigBytes);
          } catch {
            sigImage = await pdfDoc.embedJpg(sigBytes);
          }
        } else if (data.signatureUrl.startsWith('http')) {
          const res = await fetch(data.signatureUrl);
          const buf = await res.arrayBuffer();
          const sigBytes = new Uint8Array(buf);
          try {
            sigImage = await pdfDoc.embedPng(sigBytes);
          } catch {
            sigImage = await pdfDoc.embedJpg(sigBytes);
          }
        }

        if (sigImage) {
          const dims = sigImage.scaleToFit(201.31, 57.91);
          page.drawImage(sigImage, {
            x: 330.88 + (201.31 - dims.width) / 2,
            y: 75.23 + (57.91 - dims.height) / 2,
            width: dims.width,
            height: dims.height,
          });
        }
      } catch (sigErr) {
        console.warn('Signature image embed error in PAN CR Non-Individual:', sigErr);
      }
    }

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
      if (src.proofOfPanUrl) addDoc(src.proofOfPanUrl);
      if (src.proofOfOtherUrl) addDoc(src.proofOfOtherUrl);

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
            let imgBytes;
            if (docUrl.startsWith('data:')) {
              imgBytes = base64ToUint8Array(docUrl);
            } else {
              const res = await fetch(docUrl);
              const buf = await res.arrayBuffer();
              imgBytes = new Uint8Array(buf);
            }

            let embeddedImg = null;
            try {
              embeddedImg = await pdfDoc.embedPng(imgBytes);
            } catch {
              try {
                embeddedImg = await pdfDoc.embedJpg(imgBytes);
              } catch {
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
                      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
                      resolve(base64ToUint8Array(jpegDataUrl));
                    };
                    img.onerror = () => resolve(null);
                    img.src = docUrl;
                  });
                  if (convertedBytes) {
                    embeddedImg = await pdfDoc.embedJpg(convertedBytes);
                  }
                }
              }
            }

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
          console.warn('Could not append document to PAN CR Non-Individual PDF:', singleDocErr);
        }
      }
    } catch (docsErr) {
      console.warn('Error in appending uploaded documents:', docsErr);
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    const safeName = (data.entityName || data.applicantName || data.lastName || 'Non_Individual_PAN_CR')
      .toString()
      .replace(/[^\w-]+/g, '_');
    const fileName = `PAN_CR_Non_Individual_${safeName}.pdf`;

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
    console.error('Error generating Non-Individual PAN CR PDF:', err);
    if (existingWin && !existingWin.closed) existingWin.close();
    return false;
  }
};

const MainPanCrPdfTemplate = ({ data = {} }) => {
  const isIndividual = !isNonIndividualApplicant(data);
  if (isIndividual) {
    return <Form49APdfTemplate data={data} />;
  }
  return <FormPanCrNonIndividualPdfTemplate data={data} />;
};

export default MainPanCrPdfTemplate;

export const generatePanCrPdf = async (data = {}, elementIdOrWin = 'pancr-pdf-container', existingWin = null) => {
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
  if (isNonIndividualApplicant(flatData)) {
    return generatePanCrNonIndividualPdf(flatData, targetWin);
  }
  return generatePanCrIndividualPdf(flatData, targetWin);
};

export const generatePANCR01Pdf = generatePanCrPdf;

